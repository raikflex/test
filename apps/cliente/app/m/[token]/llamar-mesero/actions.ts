'use server';

import { createServiceClient } from '@mesaya/database/service';

/**
 * Server actions para crear llamados al mesero.
 *
 * Reglas:
 *   - Solo se crea un llamado si NO hay otro pendiente del mismo motivo en la
 *     misma sesiÃ³n (evita spam).
 *   - Si ya hay uno pendiente, devolvemos ese mismo id para que la UI muestre
 *     "Ya estÃ¡ en camino".
 *
 * Motivos vÃ¡lidos en DB: 'campana' | 'pago' | 'otro'.
 *   - "Necesito ayuda" â†’ 'campana'
 *   - "Pedir la cuenta" â†’ 'pago'
 *   - "Otra cosa" â†’ 'otro'
 */

export type CrearLlamadoResultado =
  | { ok: true; llamadoId: string; yaExistia: boolean }
  | { ok: false; error: string };

type MotivoLlamado = 'campana' | 'pago' | 'otro';

async function obtenerSesionAbiertaMesa(qrToken: string): Promise<
  | { ok: true; sesionId: string; mesaId: string; restauranteId: string }
  | { ok: false; error: string }
> {
  const admin = createServiceClient();

  const { data: mesa } = await admin
    .from('mesas')
    .select('id, restaurante_id, activa, restaurantes(estado)')
    .eq('qr_token', qrToken)
    .maybeSingle();

  if (!mesa || !mesa.activa) {
    return { ok: false, error: 'Esta mesa ya no estÃ¡ disponible.' };
  }

  const restaurante = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as { estado: string } | null;

  if (!restaurante || restaurante.estado !== 'activo') {
    return {
      ok: false,
      error: 'El restaurante no estÃ¡ atendiendo en este momento.',
    };
  }

  const { data: sesion } = await admin
    .from('sesiones')
    .select('id')
    .eq('mesa_id', mesa.id as string)
    .eq('estado', 'abierta')
    .maybeSingle();

  if (!sesion) {
    return {
      ok: false,
      error:
        'AÃºn no has hecho ningÃºn pedido. Pide algo primero y luego puedes llamar al mesero.',
    };
  }

  return {
    ok: true,
    sesionId: sesion.id as string,
    mesaId: mesa.id as string,
    restauranteId: mesa.restaurante_id as string,
  };
}

export async function crearLlamado(input: {
  qrToken: string;
  motivo: MotivoLlamado;
  nota?: string | null;
}): Promise<CrearLlamadoResultado> {
  // Rate limit - max 10 llamados por minuto por mesa.
  const admin = createServiceClient();
  const { data: dentroLimite } = await admin.rpc('check_rate_limit', {
    p_key: input.qrToken,
    p_action_type: 'llamar_mesero',
    p_max_requests: 10,
    p_ventana_segundos: 60,
  });

  if (dentroLimite === false) {
    return {
      ok: false,
      error: 'Demasiados intentos. Espera un momento antes de volver a intentar.',
    };
  }

  const sesionInfo = await obtenerSesionAbiertaMesa(input.qrToken);
  if (!sesionInfo.ok) {
    return { ok: false, error: sesionInfo.error };
  }

  // Verificar si ya hay un llamado pendiente del mismo motivo.
  const { data: existente } = await admin
    .from('llamados_mesero')
    .select('id')
    .eq('sesion_id', sesionInfo.sesionId)
    .eq('motivo', input.motivo)
    .eq('estado', 'pendiente')
    .maybeSingle();

  if (existente) {
    return {
      ok: true,
      llamadoId: existente.id as string,
      yaExistia: true,
    };
  }

  // Persistir la nota del cliente. El mesero la verÃ¡ en su tablero para saber
  // quÃ© pidiÃ³ el cliente sin tener que ir fÃ­sicamente a preguntar (ej:
  // "necesito otra cuchara", "mÃ¡s servilletas", etc.).
  const notaLimpia = input.nota?.trim();
  const notaParaGuardar =
    notaLimpia && notaLimpia.length > 0
      ? notaLimpia.slice(0, 200)
      : null;

  const { data: nuevo, error } = await admin
    .from('llamados_mesero')
    .insert({
      restaurante_id: sesionInfo.restauranteId,
      sesion_id: sesionInfo.sesionId,
      mesa_id: sesionInfo.mesaId,
      motivo: input.motivo,
      estado: 'pendiente',
      nota: notaParaGuardar,
    })
    .select('id')
    .single();

  if (error || !nuevo) {
    return {
      ok: false,
      error: 'No pudimos avisar al mesero. ' + (error?.message ?? ''),
    };
  }

  return { ok: true, llamadoId: nuevo.id as string, yaExistia: false };
}

/**
 * Cancela un llamado pendiente. Solo se puede si sigue en 'pendiente'.
 * Si el mesero ya lo tomÃ³, no se puede cancelar.
 */
export async function cancelarLlamado(input: {
  qrToken: string;
  llamadoId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sesionInfo = await obtenerSesionAbiertaMesa(input.qrToken);
  if (!sesionInfo.ok) {
    return { ok: false, error: sesionInfo.error };
  }

  const admin = createServiceClient();

  const { data: llamado } = await admin
    .from('llamados_mesero')
    .select('id, estado')
    .eq('id', input.llamadoId)
    .eq('sesion_id', sesionInfo.sesionId)
    .maybeSingle();

  if (!llamado) {
    return { ok: false, error: 'No encontramos ese llamado.' };
  }

  if (llamado.estado !== 'pendiente') {
    return {
      ok: false,
      error: 'El mesero ya tomÃ³ este llamado. No se puede cancelar.',
    };
  }

  const { error } = await admin
    .from('llamados_mesero')
    .update({ estado: 'cancelado' })
    .eq('id', input.llamadoId);

  if (error) {
    return {
      ok: false,
      error: 'No pudimos cancelar el llamado. ' + error.message,
    };
  }

  return { ok: true };
}
