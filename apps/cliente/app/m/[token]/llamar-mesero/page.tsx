import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { LlamarMeseroCliente } from './llamar-mesero-cliente';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function LlamarMeseroPage({ params }: PageProps) {
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

  // Buscar sesión abierta de la mesa.
  const { data: sesion } = await supabase
    .from('sesiones')
    .select('id')
    .eq('mesa_id', mesa.id as string)
    .eq('estado', 'abierta')
    .maybeSingle();

  // Si hay sesión, ver si ya hay llamados pendientes.
  let llamadosActivos: { id: string; motivo: string; creado_en: string }[] = [];
  if (sesion) {
    const { data } = await supabase
      .from('llamados_mesero')
      .select('id, motivo, creado_en')
      .eq('sesion_id', sesion.id as string)
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: false });

    llamadosActivos = (data ?? []).map((l) => ({
      id: l.id as string,
      motivo: l.motivo as string,
      creado_en: l.creado_en as string,
    }));
  }

  return (
    <LlamarMeseroCliente
      qrToken={token}
      numeroMesa={mesa.numero as string}
      nombreNegocio={restaurante.nombre_publico}
      colorMarca={restaurante.color_marca}
      tieneSesionAbierta={Boolean(sesion)}
      llamadosActivos={llamadosActivos}
    />
  );
}
