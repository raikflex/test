'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@mesaya/database/server';
import { createServiceClient } from '@mesaya/database/service';

export type AlternarEstadoResultado =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Cambia el estado del restaurante entre 'activo' (recibe pedidos) y 'pausado'
 * (rechaza pedidos nuevos pero no cierra sesiones abiertas).
 *
 * Cuando está 'pausado':
 *   - El landing del cliente (/m/[token]) muestra pantalla "Estamos en pausa"
 *   - El menu del cliente (/m/[token]/menu) también muestra esa pantalla
 *   - El action enviarComanda rechaza el insert con error visible
 *
 * Las sesiones que ya estaban abiertas pueden seguir su curso normal hasta cobrarse.
 *
 * Usa service client para el UPDATE porque las RLS policies sobre `restaurantes`
 * no permiten al rol `dueno` hacer UPDATE directo (ese era el bug). Como ya
 * verificamos manualmente que el usuario es dueño de ESTE restaurante en particular,
 * es seguro.
 */
export async function alternarEstadoRestaurante(
  formData: FormData,
): Promise<AlternarEstadoResultado> {
  const accion = String(formData.get('accion') ?? '');

  if (accion !== 'pausar' && accion !== 'reanudar') {
    return { ok: false, error: 'Acción inválida.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id || perfil.rol !== 'dueno') {
    return { ok: false, error: 'Solo el dueño puede pausar pedidos.' };
  }

  const nuevoEstado = accion === 'pausar' ? 'pausado' : 'activo';

  const admin = createServiceClient();
  const { error } = await admin
    .from('restaurantes')
    .update({ estado: nuevoEstado })
    .eq('id', perfil.restaurante_id as string);

  if (error) {
    return {
      ok: false,
      error: 'No pudimos guardar el cambio: ' + error.message,
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/configuracion');

  return { ok: true };
}