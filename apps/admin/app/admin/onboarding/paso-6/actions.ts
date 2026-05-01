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
    .select('restaurante_id')
    .eq('id', user.id)
    .maybeSingle();
  return { supabase, restauranteId: perfil?.restaurante_id ?? null };
}

/* ============ BULK CREATE ============ */

const bulkSchema = z.object({
  cantidad: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Solo números')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n >= 1 && n <= 100, 'Entre 1 y 100 mesas'),
});

export type BulkState = {
  ok: boolean;
  error?: string;
  fieldError?: string;
};

export async function generarMesas(
  _prev: BulkState,
  formData: FormData,
): Promise<BulkState> {
  const parsed = bulkSchema.safeParse({ cantidad: formData.get('cantidad') });
  if (!parsed.success) {
    return { ok: false, fieldError: parsed.error.issues[0]?.message ?? 'Cantidad inválida' };
  }

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return { ok: false, error: 'Tu sesión expiró.' };

  // Cuántas mesas existen ya, para empezar a numerar desde la siguiente.
  const { data: existentes } = await supabase
    .from('mesas')
    .select('numero')
    .eq('restaurante_id', restauranteId);

  const numerosUsados = new Set((existentes ?? []).map((m) => String(m.numero)));

  // Generar mesas con números secuenciales que no choquen.
  const aInsertar: { restaurante_id: string; numero: string; capacidad: number; activa: boolean }[] = [];
  let n = 1;
  while (aInsertar.length < parsed.data.cantidad) {
    const numStr = String(n);
    if (!numerosUsados.has(numStr)) {
      aInsertar.push({
        restaurante_id: restauranteId,
        numero: numStr,
        capacidad: 4,
        activa: true,
      });
      numerosUsados.add(numStr);
    }
    n++;
    if (n > 1000) break; // Safety guard
  }

  const { error } = await supabase.from('mesas').insert(aInsertar);

  if (error) {
    return { ok: false, error: 'No pudimos generar. Detalle: ' + error.message };
  }

  revalidatePath('/admin/onboarding/paso-6');
  return { ok: true };
}

/* ============ EDIT CAPACIDAD ============ */

export async function actualizarCapacidad(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const capStr = String(formData.get('capacidad') ?? '');
  const capacidad = parseInt(capStr, 10);
  if (!id || !Number.isFinite(capacidad) || capacidad < 1 || capacidad > 50) return;

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return;

  await supabase
    .from('mesas')
    .update({ capacidad })
    .eq('id', id)
    .eq('restaurante_id', restauranteId);

  revalidatePath('/admin/onboarding/paso-6');
}

/* ============ DELETE ============ */

export async function borrarMesa(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return;

  await supabase.from('mesas').delete().eq('id', id).eq('restaurante_id', restauranteId);

  revalidatePath('/admin/onboarding/paso-6');
}

/* ============ ADVANCE ============ */

export async function avanzarAPaso7() {
  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) redirect('/login');

  const { count } = await supabase
    .from('mesas')
    .select('*', { count: 'exact', head: true })
    .eq('restaurante_id', restauranteId);

  if (!count || count < 1) return;

  redirect('/admin/onboarding/paso-7');
}
