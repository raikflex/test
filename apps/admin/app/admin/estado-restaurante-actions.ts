'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@mesaya/database/server';

/**
 * Cambia el estado del restaurante entre 'activo' (recibe pedidos) y 'pausado'
 * (rechaza pedidos nuevos pero no cierra sesiones abiertas).
 *
 * Cuando está 'pausado', los actions del cliente (pedirCuenta, crearLlamado,
 * confirmarPedido) ya rechazan operaciones porque verifican
 * `restaurante.estado === 'activo'`. Las sesiones que ya estaban abiertas
 * pueden seguir su curso normal hasta cobrarse.
 */
export async function alternarEstadoRestaurante(formData: FormData) {
  const accion = String(formData.get('accion') ?? '');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id || perfil.rol !== 'dueno') return;

  const nuevoEstado = accion === 'pausar' ? 'pausado' : 'activo';

  await supabase
    .from('restaurantes')
    .update({ estado: nuevoEstado })
    .eq('id', perfil.restaurante_id as string);

  revalidatePath('/admin');
  revalidatePath('/admin/configuracion');
}
