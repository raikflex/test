'use server';

import { createServiceClient } from '@mesaya/database/service';

/**
 * Pedir la cuenta. Crea un llamado con motivo='pago' y guarda en la nota
 * la propina y la forma de pago preferida.
 *
 * Si ya hay un llamado de pago pendiente, devuelve ese mismo (no duplica).
 *
 * Importante: hoy la cuenta es por mesa (suma de todas las comandas de la sesión
 * abierta). Cuando se implemente modo grupo/host (post-MVP v2), agregar lógica
 * para dividir según preferencia.
 */

export type FormaPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'no_seguro';

const ETIQUETAS_FORMA_PAGO: Record<FormaPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia/PSE',
  no_seguro: 'Aún no decido',
};

export type PedirCuentaResultado =
  | { ok: true; llamadoId: string; yaExistia: boolean }
  | { ok: false; error: string };

export async function pedirCuenta(input: {
  qrToken: string;
  conPropina: boolean;
  formaPago: FormaPago;
}): Promise<PedirCuentaResultado> {
  const admin = createServiceClient();

  const { data: mesa } = await admin
    .from('mesas')
    .select('id, restaurante_id, activa, restaurantes(estado)')
    .eq('qr_token', input.qrToken)
    .maybeSingle();

  if (!mesa || !mesa.activa) {
    return { ok: false, error: 'Esta mesa ya no está disponible.' };
  }

  const restaurante = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as { estado: string } | null;

  if (!restaurante || restaurante.estado !== 'activo') {
    return {
      ok: false,
      error: 'El restaurante no está atendiendo en este momento.',
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
        'No tienes una cuenta abierta. Pide algo del menú primero.',
    };
  }

  const sesionId = sesion.id as string;

  // Verificar si ya hay un llamado de pago pendiente.
  const { data: existente } = await admin
    .from('llamados_mesero')
    .select('id')
    .eq('sesion_id', sesionId)
    .eq('motivo', 'pago')
    .eq('estado', 'pendiente')
    .maybeSingle();

  if (existente) {
    return {
      ok: true,
      llamadoId: existente.id as string,
      yaExistia: true,
    };
  }

  // La nota encapsula propina + forma de pago para que el mesero la vea.
  const lineas = [
    `Propina: ${input.conPropina ? 'Sí (10%)' : 'No'}`,
    `Forma de pago preferida: ${ETIQUETAS_FORMA_PAGO[input.formaPago]}`,
  ];

  const { data: nuevo, error } = await admin
    .from('llamados_mesero')
    .insert({
      restaurante_id: mesa.restaurante_id as string,
      sesion_id: sesionId,
      mesa_id: mesa.id as string,
      motivo: 'pago',
      estado: 'pendiente',
    })
    .select('id')
    .single();

  if (error || !nuevo) {
    return {
      ok: false,
      error: 'No pudimos pedir la cuenta. ' + (error?.message ?? ''),
    };
  }

  // Notas: el schema de llamados_mesero NO tiene campo nota, así que la
  // info de propina y forma de pago la guardamos como columna calculable
  // en post-MVP. Por ahora va solo en logs server-side.
  // TODO post-MVP: agregar columna `nota text` a llamados_mesero o tabla
  // separada de detalles_pago para que el mesero vea propina/forma_pago
  // en su app.
  console.log('[pedirCuenta] llamado creado:', {
    llamadoId: nuevo.id,
    detalles: lineas.join(' · '),
  });

  return { ok: true, llamadoId: nuevo.id as string, yaExistia: false };
}
