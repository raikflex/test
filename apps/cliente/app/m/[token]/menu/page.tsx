import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { EstadoRestauranteScreen } from '../estado-restaurante';
import { MenuCliente } from './menu-cliente';
import { estaAbiertoAhora, type HorarioDia } from '../../../../lib/horarios';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

type CategoriaConProductos = {
  id: string;
  nombre: string;
  orden: number;
  productos: {
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: number;
    disponible: boolean;
  }[];
};

export default async function MenuPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: mesa } = await supabase
    .from('mesas')
    .select(
      `
      id,
      numero,
      activa,
      restaurante_id,
      restaurantes (
        id,
        nombre_publico,
        color_marca,
        estado
      )
    `,
    )
    .eq('qr_token', token)
    .is('borrada_en', null)
    .maybeSingle();

  if (!mesa) {
    notFound();
  }

  const restaurante = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as {
    id: string;
    nombre_publico: string;
    color_marca: string;
    estado: string;
  } | null;

  if (!restaurante) {
    notFound();
  }

  if (restaurante.estado === 'pausado') {
    return (
      <EstadoRestauranteScreen
        tipo="pausado"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
      />
    );
  }

  if (restaurante.estado !== 'activo' || !mesa.activa) {
    notFound();
  }

  const restauranteId = restaurante.id;

  // Defense in depth: chequear horario aqui tambien. Si entre que el cliente
  // entro al menu y ahora paso el horario de cierre, mostrar pantalla cerrada.
  const { data: horariosRaw } = await supabase
    .from('horarios_atencion')
    .select('dia_semana, abierto, hora_apertura, hora_cierre')
    .eq('restaurante_id', restauranteId)
    .order('dia_semana', { ascending: true });

  const horarios: HorarioDia[] = (horariosRaw ?? []).map((h) => ({
    dia_semana: h.dia_semana as number,
    abierto: h.abierto as boolean,
    hora_apertura: (h.hora_apertura as string | null) ?? null,
    hora_cierre: (h.hora_cierre as string | null) ?? null,
  }));

  const estadoApertura = estaAbiertoAhora(horarios);
  if (!estadoApertura.abierto) {
    return (
      <EstadoRestauranteScreen
        tipo="cerrado"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
        proximaApertura={estadoApertura.proximoTexto}
      />
    );
  }

  // Categorias activas en orden + productos en cada una.
  const [{ data: categorias }, { data: productos }] = await Promise.all([
    supabase
      .from('categorias')
      .select('id, nombre, orden')
      .eq('restaurante_id', restauranteId)
      .eq('activa', true)
      .order('orden', { ascending: true }),
    supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, disponible, categoria_id')
      .eq('restaurante_id', restauranteId)
      .order('nombre', { ascending: true }),
  ]);

  const grupos: CategoriaConProductos[] = (categorias ?? []).map((c) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    orden: c.orden as number,
    productos: ((productos ?? []) as {
      id: string;
      nombre: string;
      descripcion: string | null;
      precio: number;
      disponible: boolean;
      categoria_id: string;
    }[])
      .filter((p) => p.categoria_id === c.id)
      .map(({ id, nombre, descripcion, precio, disponible }) => ({
        id,
        nombre,
        descripcion,
        precio,
        disponible,
      })),
  }));

  const totalProductos = grupos.reduce((acc, g) => acc + g.productos.length, 0);

  return (
    <MenuCliente
      qrToken={token}
      numeroMesa={mesa.numero as string}
      nombreNegocio={restaurante.nombre_publico}
      colorMarca={restaurante.color_marca}
      grupos={grupos}
      totalProductos={totalProductos}
    />
  );
}
