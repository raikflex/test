'use server';

import { createServiceClient } from '@mesaya/database/service';

/**
 * Pedir la cuenta. Crea un llamado con motivo='pago' y, si el cliente lo
 * pidiÃ³, guarda los datos de facturaciÃ³n (tipo doc, nÃºmero, nombre).
 *
 * Si ya hay un llamado de pago pendiente, devuelve ese mismo (no duplica).
 *
 * Importante: hoy la cuenta es por mesa (suma de todas las comandas de la sesiÃ³n
 * abierta). Cuando se implemente modo grupo/host (post-MVP v2), agregar lÃ³gica
 * para dividir segÃºn preferencia.
 */

export type FormaPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'no_seguro';
export type TipoDoc = 'CC' | 'NIT' | 'CE' | 'PA';

const ETIQUETAS_FORMA_PAGO: Record<FormaPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia/PSE',
  no_seguro: 'AÃºn no decido',
};

export type DatosFactura = {
  tipoDoc: TipoDoc;
  numero: string;
  nombre: string;
};

export type PedirCuentaResultado =
  | { ok: true; llamadoId: string; yaExistia: boolean }
  | { ok: false; error: string };

export async function pedirCuenta(input: {
  qrToken: string;
  conPropina: boolean;
  formaPago: FormaPago;
  factura?: DatosFactura | null;
}): Promise<PedirCuentaResultado> {
  const admin = createServiceClient();

  // Rate limit - max 5 pedidos de cuenta cada 5 minutos por mesa.
  const { data: dentroLimite } = await admin.rpc('check_rate_limit', {
    p_key: input.qrToken,
    p_action_type: 'pedir_cuenta',
    p_max_requests: 5,
    p_ventana_segundos: 300,
  });

  if (dentroLimite === false) {
    return {
      ok: false,
      error: 'Demasiados intentos. Espera un momento antes de volver a intentar.',
    };
  }

  const { data: mesa } = await admin
    .from('mesas')
    .select('id, restaurante_id, activa, restaurantes(estado)')
    .eq('qr_token', input.qrToken)
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
      error: 'No tienes una cuenta abierta. Pide algo del menÃº primero.',
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

  // Validar datos de factura si vienen
  const factura = input.factura;
  if (factura) {
    const num = factura.numero.trim();
    const nom = factura.nombre.trim();
    if (num.length < 3 || num.length > 30) {
      return {
        ok: false,
        error: 'El nÃºmero de documento es invÃ¡lido.',
      };
    }
    if (nom.length < 3 || nom.length > 120) {
      return {
        ok: false,
        error: 'El nombre o razÃ³n social es invÃ¡lido.',
      };
    }
    if (!['CC', 'NIT', 'CE', 'PA'].includes(factura.tipoDoc)) {
      return {
        ok: false,
        error: 'Tipo de documento invÃ¡lido.',
      };
    }
  }

  // Para que el mesero vea estos datos al cobrar, los guardamos en el llamado.
  // Cuando se confirma el pago, se denormalizan a la tabla `pagos`.
  const lineas = [
    `Propina: ${input.conPropina ? 'SÃ­ (10%)' : 'No'}`,
    `Forma de pago preferida: ${ETIQUETAS_FORMA_PAGO[input.formaPago]}`,
  ];
  if (factura) {
    lineas.push(`Factura: ${factura.tipoDoc} ${factura.numero} Â· ${factura.nombre}`);
  }

  const { data: nuevo, error } = await admin
    .from('llamados_mesero')
    .insert({
      restaurante_id: mesa.restaurante_id as string,
      sesion_id: sesionId,
      mesa_id: mesa.id as string,
      motivo: 'pago',
      estado: 'pendiente',
      forma_pago_preferida: input.formaPago,
      doc_tipo: factura?.tipoDoc ?? null,
      doc_numero: factura?.numero.trim() ?? null,
      doc_nombre: factura?.nombre.trim() ?? null,
    })
    .select('id')
    .single();

  if (error || !nuevo) {
    return {
      ok: false,
      error: 'No pudimos pedir la cuenta. ' + (error?.message ?? ''),
    };
  }

  console.log('[pedirCuenta] llamado creado:', {
    llamadoId: nuevo.id,
    detalles: lineas.join(' Â· '),
  });

  return { ok: true, llamadoId: nuevo.id as string, yaExistia: false };
}
