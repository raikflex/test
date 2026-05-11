import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { EstadoRestauranteScreen } from '../estado-restaurante';
import { MenuCliente } from './menu-cliente';

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

  // Categorías activas en orden + productos en cada una.
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
