import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { PedirCuentaCliente } from './pedir-cuenta-cliente';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

type ItemFila = {
  id: string;
  nombre_snapshot: string;
  precio_snapshot: number;
  cantidad: number;
  nota: string | null;
};

type ComandaPorCliente = {
  comandaId: string;
  numeroDiario: number;
  total: number;
  estado: string;
  items: ItemFila[];
  cliente: string;
};

export default async function PedirCuentaPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: mesa } = await supabase
    .from('mesas')
    .select(
      `
      id,
      numero,
      activa,
      restaurantes (nombre_publico, color_marca, estado)
    `,
    )
    .eq('qr_token', token)
    .maybeSingle();

  if (!mesa) notFound();

  const restaurante = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as {
    nombre_publico: string;
    color_marca: string;
    estado: string;
  } | null;

  if (!restaurante || restaurante.estado !== 'activo' || !mesa.activa) {
    notFound();
  }

  // Sesión abierta de la mesa (modelo "cuenta por mesa").
  // TODO post-MVP modo grupo: si el cliente eligió pagar individualmente,
  // filtrar por sesion_cliente_id en lugar de mostrar toda la mesa.
  const { data: sesion } = await supabase
    .from('sesiones')
    .select('id')
    .eq('mesa_id', mesa.id as string)
    .eq('estado', 'abierta')
    .maybeSingle();

  let comandas: ComandaPorCliente[] = [];
  let llamadoPagoPendiente: { id: string; creado_en: string } | null = null;

  if (sesion) {
    const sesionId = sesion.id as string;

    const { data: comandasRaw } = await supabase
      .from('comandas')
      .select(
        `
        id,
        numero_diario,
        total,
        estado,
        creada_en,
        sesion_cliente_id,
        sesion_clientes (nombre)
      `,
      )
      .eq('sesion_id', sesionId)
      .neq('estado', 'cancelada')
      .order('creada_en', { ascending: true });

    const comandasArr = (comandasRaw ?? []) as {
      id: string;
      numero_diario: number;
      total: number;
      estado: string;
      sesion_cliente_id: string;
      sesion_clientes: { nombre: string } | { nombre: string }[] | null;
    }[];

    if (comandasArr.length > 0) {
      const comandaIds = comandasArr.map((c) => c.id);
      const { data: itemsRaw } = await supabase
        .from('comanda_items')
        .select('id, comanda_id, nombre_snapshot, precio_snapshot, cantidad, nota')
        .in('comanda_id', comandaIds)
        .order('id', { ascending: true });

      const itemsPorComanda = new Map<string, ItemFila[]>();
      for (const c of comandasArr) {
        itemsPorComanda.set(c.id, []);
      }
      for (const it of itemsRaw ?? []) {
        const arr = itemsPorComanda.get(it.comanda_id as string);
        if (arr) {
          arr.push({
            id: it.id as string,
            nombre_snapshot: it.nombre_snapshot as string,
            precio_snapshot: it.precio_snapshot as number,
            cantidad: it.cantidad as number,
            nota: (it.nota as string) ?? null,
          });
        }
      }

      comandas = comandasArr.map((c) => {
        const sc = Array.isArray(c.sesion_clientes)
          ? c.sesion_clientes[0]
          : c.sesion_clientes;
        return {
          comandaId: c.id,
          numeroDiario: c.numero_diario,
          total: c.total,
          estado: c.estado,
          items: itemsPorComanda.get(c.id) ?? [],
          cliente: sc?.nombre ?? 'Cliente',
        };
      });
    }

    // Llamado de pago pendiente.
    const { data: llamado } = await supabase
      .from('llamados_mesero')
      .select('id, creado_en')
      .eq('sesion_id', sesionId)
      .eq('motivo', 'pago')
      .eq('estado', 'pendiente')
      .maybeSingle();

    if (llamado) {
      llamadoPagoPendiente = {
        id: llamado.id as string,
        creado_en: llamado.creado_en as string,
      };
    }
  }

  return (
    <PedirCuentaCliente
      qrToken={token}
      numeroMesa={mesa.numero as string}
      nombreNegocio={restaurante.nombre_publico}
      colorMarca={restaurante.color_marca}
      tieneSesionAbierta={Boolean(sesion)}
      comandas={comandas}
      llamadoPagoPendiente={llamadoPagoPendiente}
    />
  );
}
