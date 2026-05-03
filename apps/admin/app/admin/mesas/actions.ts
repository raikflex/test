'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@mesaya/database/server';

async function getRestauranteId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, restauranteId: null as string | null };
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'dueno') return { supabase, restauranteId: null };
  return { supabase, restauranteId: perfil?.restaurante_id ?? null };
}

/* ============ AGREGAR MESAS (bulk) ============ */

const agregarSchema = z.object({
  cantidad: z.coerce
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 mesa')
    .max(50, 'Máximo 50 mesas a la vez'),
});

export type AgregarMesasState = {
  ok: boolean;
  error?: string;
  fieldErrors?: { cantidad?: string };
};

export async function agregarMesas(
  _prev: AgregarMesasState,
  formData: FormData,
): Promise<AgregarMesasState> {
  const parsed = agregarSchema.safeParse({ cantidad: formData.get('cantidad') });
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: { cantidad: parsed.error.issues[0]?.message },
    };
  }

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return { ok: false, error: 'Tu sesión expiró.' };

  // Buscar el número más alto actual (incluyendo las inactivas) para no duplicar.
  const { data: existentes } = await supabase
    .from('mesas')
    .select('numero')
    .eq('restaurante_id', restauranteId);

  const numerosExistentes = (existentes ?? [])
    .map((m) => parseInt(m.numero as string, 10))
    .filter((n) => !Number.isNaN(n));

  const ultimoNumero = numerosExistentes.length > 0 ? Math.max(...numerosExistentes) : 0;

  const filas = Array.from({ length: parsed.data.cantidad }, (_, i) => ({
    restaurante_id: restauranteId,
    numero: String(ultimoNumero + i + 1),
    capacidad: 4,
    activa: true,
  }));

  const { error } = await supabase.from('mesas').insert(filas);
  if (error) {
    return { ok: false, error: 'No pudimos agregar las mesas. ' + error.message };
  }

  revalidatePath('/admin/mesas');
  return { ok: true };
}

/* ============ ACTUALIZAR CAPACIDAD ============ */

export async function actualizarCapacidad(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const capacidad = parseInt(String(formData.get('capacidad') ?? ''), 10);
  if (!id || Number.isNaN(capacidad) || capacidad < 1 || capacidad > 30) return;

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return;

  await supabase
    .from('mesas')
    .update({ capacidad })
    .eq('id', id)
    .eq('restaurante_id', restauranteId);

  revalidatePath('/admin/mesas');
}

/* ============ TOGGLE ACTIVA ============ */

export async function toggleActiva(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const activarRaw = String(formData.get('activar') ?? '');
  const activar = activarRaw === 'true';
  if (!id) return;

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return;

  await supabase
    .from('mesas')
    .update({ activa: activar })
    .eq('id', id)
    .eq('restaurante_id', restauranteId);

  revalidatePath('/admin/mesas');
}

/* ============ ELIMINAR (soft delete: activa=false) ============ */

/**
 * Soft delete. La mesa queda como inactiva (oculta del panel principal),
 * pero se conserva en DB. Si un cliente escanea su QR viejo, verá
 * "Esta mesa no está disponible" (manejado en apps/cliente).
 */
export async function eliminarMesa(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return;

  await supabase
    .from('mesas')
    .update({ activa: false })
    .eq('id', id)
    .eq('restaurante_id', restauranteId);

  revalidatePath('/admin/mesas');
}

/* ============ ATAJO: DESCARGAR PDF ============ */

export async function descargarPDF() {
  redirect('/api/qrs-pdf');
}
