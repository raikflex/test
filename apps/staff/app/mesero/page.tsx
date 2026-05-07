import { createClient } from '@mesaya/database/server';
import { obtenerPerfilStaff } from '../../lib/auth-server';
import { TableroMesero, type ColaMesero } from './tablero-mesero';

export const dynamic = 'force-dynamic';

/**
 * Tablero del mesero con cola unificada del restaurante.
 *
 * 3 secciones:
 *   1. Llamados activos (campana/otro/pago) en estado 'pendiente'.
 *   2. Comandas con estado='lista' (cocina ya las terminó, falta entregar).
 *   3. Pagos: derivados de los llamados motivo='pago' pendientes, enriquecidos
 *      con el detalle de comandas + total de la sesión + datos opcionales de
 *      facturación (doc_tipo, doc_numero, doc_nombre) que el cliente pasó al
 *      pedir cuenta.
 *
 * Modelo "free pickup": cualquier mesero puede tomar cualquier item via
 * `mesero_atendiendo_id`. Lock optimista en el server action (Bloque B.2).
 */
export default async function MeseroPage() {
  const perfil = await obtenerPerfilStaff('mesero');
  const supabase = await createClient();

  // --- Llamados activos (excluyendo motivo='pago' que va a sección de pagos) ---
  // Traemos también doc_tipo, doc_numero, doc_nombre, forma_pago_preferida y nota.
  // Las primeras 4 son para pagos; nota es para llamados normales (cliente
  // escribió detalles como "más servilletas"). Leerlas en todos no tiene costo.
  const { data: llamadosRaw } = await supabase
    .from('llamados_mesero')
    .select(
      `
      id,
      motivo,
      estado,
      creado_en,
      mesero_atendiendo_id,
      sesion_id,
      doc_tipo,
      doc_numero,
      doc_nombre,
      forma_pago_preferida,
      nota,
      sesiones (
        mesas (numero)
      )
    `,
    )
    .eq('restaurante_id', perfil.restauranteId)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true });

  const llamadosArr = (llamadosRaw ?? []) as {
    id: string;
    motivo: string;
    estado: string;
    creado_en: string;
    mesero_atendiendo_id: string | null;
    sesion_id: string;
    doc_tipo: string | null;
    doc_numero: string | null;
    doc_nombre: string | null;
    forma_pago_preferida: string | null;
    nota: string | null;
    sesiones: { mesas: { numero: string } | { numero: string }[] | null } | { mesas: { numero: string } | { numero: string }[] | null }[] | null;
  }[];

  const llamadosNoPago = llamadosArr.filter((l) => l.motivo !== 'pago');
  const llamadosPago = llamadosArr.filter((l) => l.motivo === 'pago');

  // --- Comandas listas para entregar ---
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);

  const { data: comandasListasRaw } = await supabase
    .from('comandas')
    .select(
      `
      id,
      numero_diario,
      estado,
      total,
      creada_en,
      mesero_atendiendo_id,
      sesion_id,
      sesion_clientes (nombre),
      sesiones (mesas (numero))
    `,
    )
    .eq('restaurante_id', perfil.restauranteId)
    .eq('estado', 'lista')
    .gte('creada_en', inicioDia.toISOString())
    .order('creada_en', { ascending: true });

  const comandasListasArr = (comandasListasRaw ?? []) as {
    id: string;
    numero_diario: number;
    estado: string;
    total: number;
    creada_en: string;
    mesero_atendiendo_id: string | null;
    sesion_id: string;
    sesion_clientes: { nombre: string } | { nombre: string }[] | null;
    sesiones: { mesas: { numero: string } | { numero: string }[] | null } | { mesas: { numero: string } | { numero: string }[] | null }[] | null;
  }[];

  const idsComandasListas = comandasListasArr.map((c) => c.id);
  const itemsComandasListas =
    idsComandasListas.length > 0
      ? (
          await supabase
            .from('comanda_items')
            .select('id, comanda_id, nombre_snapshot, cantidad, nota')
            .in('comanda_id', idsComandasListas)
            .order('id', { ascending: true })
        ).data ?? []
      : [];

  const itemsPorComanda = new Map<string, { id: string; nombre: string; cantidad: number; nota: string | null }[]>();
  for (const c of comandasListasArr) {
    itemsPorComanda.set(c.id, []);
  }
  for (const it of itemsComandasListas) {
    const arr = itemsPorComanda.get(it.comanda_id as string);
    if (arr) {
      arr.push({
        id: it.id as string,
        nombre: it.nombre_snapshot as string,
        cantidad: it.cantidad as number,
        nota: (it.nota as string) ?? null,
      });
    }
  }

  const sesionesPago = llamadosPago.map((l) => l.sesion_id);
  const comandasDeSesionesPago =
    sesionesPago.length > 0
      ? (
          await supabase
            .from('comandas')
            .select('id, sesion_id, total, estado')
            .in('sesion_id', sesionesPago)
            .neq('estado', 'cancelada')
        ).data ?? []
      : [];

  const totalPorSesion = new Map<string, number>();
  const countPorSesion = new Map<string, number>();
  for (const c of comandasDeSesionesPago) {
    const sid = c.sesion_id as string;
    totalPorSesion.set(sid, (totalPorSesion.get(sid) ?? 0) + (c.total as number));
    countPorSesion.set(sid, (countPorSesion.get(sid) ?? 0) + 1);
  }

  const cola: ColaMesero = {
    llamados: llamadosNoPago.map((l) => {
      const sesion = Array.isArray(l.sesiones) ? l.sesiones[0] : l.sesiones;
      const mesa = sesion ? (Array.isArray(sesion.mesas) ? sesion.mesas[0] : sesion.mesas) : null;
      return {
        id: l.id,
        motivo: l.motivo as 'campana' | 'otro',
        creadoEn: l.creado_en,
        mesaNumero: mesa?.numero ?? '?',
        meseroAtendiendoId: l.mesero_atendiendo_id,
        nota: l.nota,
      };
    }),
    comandasListas: comandasListasArr.map((c) => {
      const sc = Array.isArray(c.sesion_clientes) ? c.sesion_clientes[0] : c.sesion_clientes;
      const sesion = Array.isArray(c.sesiones) ? c.sesiones[0] : c.sesiones;
      const mesa = sesion ? (Array.isArray(sesion.mesas) ? sesion.mesas[0] : sesion.mesas) : null;
      return {
        id: c.id,
        numeroDiario: c.numero_diario,
        total: c.total,
        creadaEn: c.creada_en,
        clienteNombre: sc?.nombre ?? 'Cliente',
        mesaNumero: mesa?.numero ?? '?',
        meseroAtendiendoId: c.mesero_atendiendo_id,
        items: itemsPorComanda.get(c.id) ?? [],
      };
    }),
    pagos: llamadosPago.map((l) => {
      const sesion = Array.isArray(l.sesiones) ? l.sesiones[0] : l.sesiones;
      const mesa = sesion ? (Array.isArray(sesion.mesas) ? sesion.mesas[0] : sesion.mesas) : null;
      return {
        id: l.id,
        sesionId: l.sesion_id,
        creadoEn: l.creado_en,
        mesaNumero: mesa?.numero ?? '?',
        meseroAtendiendoId: l.mesero_atendiendo_id,
        totalAcumulado: totalPorSesion.get(l.sesion_id) ?? 0,
        cantidadComandas: countPorSesion.get(l.sesion_id) ?? 0,
        formaPagoPreferida: l.forma_pago_preferida,
        docTipo: l.doc_tipo,
        docNumero: l.doc_numero,
        docNombre: l.doc_nombre,
      };
    }),
  };

  return (
    <TableroMesero
      perfilId={perfil.id}
      perfilNombre={perfil.nombre}
      restauranteNombre={perfil.restauranteNombre}
      colorMarca={perfil.restauranteColor}
      restauranteId={perfil.restauranteId}
      colaInicial={cola}
    />
  );
}
