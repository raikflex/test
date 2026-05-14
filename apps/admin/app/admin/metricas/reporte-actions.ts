'use server';

import { createClient } from '@mesaya/database/server';

export type DatosReporte = {
  rango: { desde: string; hasta: string };
  restaurante: { nombre: string };
  resumen: {
    totalFacturado: number;
    propinasTotal: number;
    cantidadSesiones: number;
    cantidadComandas: number;
    ticketPromedio: number;
  };
  sesiones: Array<{
    fecha: string; // ISO datetime
    mesaNumero: string;
    cantidadComandas: number;
    total: number;
    propina: number;
    metodo: string;
  }>;
  comandas: Array<{
    fecha: string; // ISO datetime
    numeroDiario: number;
    mesaNumero: string;
    cliente: string;
    estado: string;
    total: number;
    sesionId: string;
    items: Array<{
      nombre: string;
      cantidad: number;
      precio: number;
      subtotal: number;
    }>;
  }>;
};

export type ResultadoReporte =
  | { ok: true; data: DatosReporte }
  | { ok: false; error: string };

const MAX_DIAS = 366; // 1 ano de tope para evitar queries gigantes

export async function obtenerDatosReporte(
  desde: string, // "YYYY-MM-DD"
  hasta: string,
): Promise<ResultadoReporte> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, error: 'Fecha invalida.' };
  }
  if (desde > hasta) {
    return { ok: false, error: 'La fecha inicial debe ser anterior a la final.' };
  }

  const diff =
    (new Date(hasta).getTime() - new Date(desde).getTime()) /
    (1000 * 60 * 60 * 24);
  if (diff > MAX_DIAS) {
    return {
      ok: false,
      error: `El rango maximo es de ${MAX_DIAS} dias.`,
    };
  }

  // Autenticacion y autorizacion
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, restaurante_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id || perfil.rol !== 'dueno') {
    return { ok: false, error: 'Solo el dueno puede exportar reportes.' };
  }

  const restauranteId = perfil.restaurante_id as string;

  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('nombre_publico')
    .eq('id', restauranteId)
    .maybeSingle();

  // Convertir fechas a ISO con limites del dia (Colombia UTC-5)
  // desde 00:00 inicio del dia local -> UTC = +5 horas
  // hasta 23:59:59 fin del dia local -> UTC = +5 horas
  const desdeIso = `${desde}T05:00:00.000Z`;
  const hastaIso = `${hasta}T28:59:59.999Z`.replace('T28', 'T04').replace(
    /(\d{4}-\d{2}-\d{2})T04/,
    (_m, fecha) => {
      // sumar 1 dia
      const d = new Date(fecha);
      d.setUTCDate(d.getUTCDate() + 1);
      return `${d.toISOString().slice(0, 10)}T04`;
    },
  );

  // Pagos confirmados en el rango (para calcular ingresos reales)
  const { data: pagosRaw } = await supabase
    .from('pagos')
    .select(
      `
      monto_total,
      propina,
      metodo,
      confirmado_en,
      sesion_id,
      sesiones!inner(restaurante_id, mesa_id, mesas(numero))
    `,
    )
    .eq('estado', 'confirmado')
    .gte('confirmado_en', desdeIso)
    .lte('confirmado_en', hastaIso);

  type PagoRow = {
    monto_total: number;
    propina: number;
    metodo: string;
    confirmado_en: string;
    sesion_id: string;
    sesiones:
      | {
          restaurante_id: string;
          mesa_id: string;
          mesas?: { numero: string } | { numero: string }[] | null;
        }
      | {
          restaurante_id: string;
          mesa_id: string;
          mesas?: { numero: string } | { numero: string }[] | null;
        }[]
      | null;
  };

  const pagos = ((pagosRaw ?? []) as PagoRow[]).filter((p) => {
    const ses = Array.isArray(p.sesiones) ? p.sesiones[0] : p.sesiones;
    return ses?.restaurante_id === restauranteId;
  });

  // Comandas no canceladas en el rango (con items)
  const { data: comandasRaw } = await supabase
    .from('comandas')
    .select(
      `
      id,
      numero_diario,
      estado,
      total,
      creada_en,
      sesion_id,
      sesiones!inner(mesa_id, mesas(numero)),
      sesion_clientes(nombre),
      comanda_items(nombre_snapshot, cantidad, precio_snapshot)
    `,
    )
    .eq('restaurante_id', restauranteId)
    .neq('estado', 'cancelada')
    .gte('creada_en', desdeIso)
    .lte('creada_en', hastaIso)
    .order('creada_en', { ascending: true });

  type ComandaRow = {
    id: string;
    numero_diario: number;
    estado: string;
    total: number;
    creada_en: string;
    sesion_id: string;
    sesiones:
      | { mesa_id: string; mesas?: { numero: string } | { numero: string }[] | null }
      | { mesa_id: string; mesas?: { numero: string } | { numero: string }[] | null }[]
      | null;
    sesion_clientes: { nombre: string } | { nombre: string }[] | null;
    comanda_items:
      | { nombre_snapshot: string; cantidad: number; precio_snapshot: number }[]
      | null;
  };

  const comandasFiltradas = (comandasRaw ?? []) as ComandaRow[];

  // Construir filas de sesiones (una por pago)
  const sesiones = pagos.map((p) => {
    const ses = Array.isArray(p.sesiones) ? p.sesiones[0] : p.sesiones;
    const mesa = ses?.mesas
      ? Array.isArray(ses.mesas)
        ? ses.mesas[0]
        : ses.mesas
      : null;
    // Contar comandas de esa sesion (no canceladas)
    const cantComandas = comandasFiltradas.filter(
      (c) => c.sesion_id === p.sesion_id,
    ).length;
    return {
      fecha: p.confirmado_en,
      mesaNumero: (mesa?.numero as string) ?? '?',
      cantidadComandas: cantComandas,
      total: p.monto_total,
      propina: p.propina,
      metodo: p.metodo,
    };
  });

  // Construir filas de comandas con items
  const comandas = comandasFiltradas.map((c) => {
    const ses = Array.isArray(c.sesiones) ? c.sesiones[0] : c.sesiones;
    const mesa = ses?.mesas
      ? Array.isArray(ses.mesas)
        ? ses.mesas[0]
        : ses.mesas
      : null;
    const sc = Array.isArray(c.sesion_clientes)
      ? c.sesion_clientes[0]
      : c.sesion_clientes;
    const items = (c.comanda_items ?? []).map((it) => ({
      nombre: it.nombre_snapshot,
      cantidad: it.cantidad,
      precio: it.precio_snapshot,
      subtotal: it.precio_snapshot * it.cantidad,
    }));
    return {
      fecha: c.creada_en,
      numeroDiario: c.numero_diario,
      mesaNumero: (mesa?.numero as string) ?? '?',
      cliente: sc?.nombre ?? '',
      estado: c.estado,
      total: c.total,
      sesionId: c.sesion_id,
      items,
    };
  });

  // Calcular resumen
  const totalFacturado = pagos.reduce((acc, p) => acc + (p.monto_total ?? 0), 0);
  const propinasTotal = pagos.reduce((acc, p) => acc + (p.propina ?? 0), 0);
  const cantidadSesiones = pagos.length;
  const cantidadComandas = comandas.length;
  const ticketPromedio =
    cantidadSesiones > 0 ? Math.round(totalFacturado / cantidadSesiones) : 0;

  return {
    ok: true,
    data: {
      rango: { desde, hasta },
      restaurante: {
        nombre: (restaurante?.nombre_publico as string) ?? 'Restaurante',
      },
      resumen: {
        totalFacturado,
        propinasTotal,
        cantidadSesiones,
        cantidadComandas,
        ticketPromedio,
      },
      sesiones,
      comandas,
    },
  };
}
