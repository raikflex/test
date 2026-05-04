import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';

export type PerfilStaff = {
  id: string;
  nombre: string;
  rol: 'cocina' | 'mesero' | 'dueno';
  restauranteId: string;
  restauranteNombre: string;
  restauranteColor: string;
};

/**
 * Lee el perfil del usuario logueado en apps/staff.
 * Si no hay sesión, redirige a /login.
 * Si el rol no coincide con `rolEsperado`, redirige a /login (caso raro,
 * el middleware ya filtra esto, esto es defensa en profundidad).
 */
export async function obtenerPerfilStaff(
  rolEsperado?: 'cocina' | 'mesero',
): Promise<PerfilStaff> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select(
      `
      id,
      nombre,
      rol,
      restaurante_id,
      restaurantes (
        nombre_publico,
        color_marca
      )
    `,
    )
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) {
    redirect('/login');
  }

  const rol = perfil.rol as 'cocina' | 'mesero' | 'dueno';
  const restaurante = (Array.isArray(perfil.restaurantes)
    ? perfil.restaurantes[0]
    : perfil.restaurantes) as {
    nombre_publico: string;
    color_marca: string;
  } | null;

  if (!restaurante) {
    redirect('/login');
  }

  if (
    rolEsperado &&
    rol !== rolEsperado &&
    rol !== 'dueno' // Dueño puede ver todo.
  ) {
    redirect('/login');
  }

  return {
    id: perfil.id as string,
    nombre: perfil.nombre as string,
    rol,
    restauranteId: perfil.restaurante_id as string,
    restauranteNombre: restaurante.nombre_publico,
    restauranteColor: restaurante.color_marca,
  };
}
