'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@mesaya/database/server';

const productoSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80, 'Máximo 80 caracteres'),
  precio: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Solo números, sin puntos ni comas')
    .transform((v) => parseInt(v, 10))
    .refine((n) => n > 0 && n <= 9_999_999, 'Precio fuera de rango'),
  categoria_id: z.string().uuid('Categoría inválida'),
  descripcion: z
    .string()
    .trim()
    .max(200, 'Máximo 200 caracteres')
    .transform((v) => (v === '' ? null : v))
    .nullable(),
});

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

export type AddProductoState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<'nombre' | 'precio' | 'categoria_id' | 'descripcion', string>>;
};

export async function agregarProducto(
  _prev: AddProductoState,
  formData: FormData,
): Promise<AddProductoState> {
  const parsed = productoSchema.safeParse({
    nombre: formData.get('nombre'),
    precio: formData.get('precio'),
    categoria_id: formData.get('categoria_id'),
    descripcion: formData.get('descripcion') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: AddProductoState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<AddProductoState['fieldErrors']>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return { ok: false, error: 'Tu sesión expiró.' };

  const { data: maxOrden } = await supabase
    .from('productos')
    .select('orden')
    .eq('restaurante_id', restauranteId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const siguienteOrden = (maxOrden?.orden ?? -1) + 1;

  const { error } = await supabase.from('productos').insert({
    restaurante_id: restauranteId,
    nombre: parsed.data.nombre,
    precio: parsed.data.precio,
    categoria_id: parsed.data.categoria_id,
    descripcion: parsed.data.descripcion,
    disponible: true,
    orden: siguienteOrden,
  });

  if (error) {
    return { ok: false, error: 'No pudimos agregar. Detalle: ' + error.message };
  }

  revalidatePath('/admin/onboarding/paso-5');
  return { ok: true };
}

export async function borrarProducto(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) return;

  // Hard delete acá porque productos no tiene FKs históricas en MVP.
  // Si después rastreamos pedidos que apuntan a productos, cambiar a soft delete.
  await supabase
    .from('productos')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', restauranteId);

  revalidatePath('/admin/onboarding/paso-5');
}

export async function avanzarAPaso6() {
  const { supabase, restauranteId } = await getRestauranteId();
  if (!restauranteId) redirect('/login');

  const { count } = await supabase
    .from('productos')
    .select('*', { count: 'exact', head: true })
    .eq('restaurante_id', restauranteId);

  if (!count || count < 1) return;

  redirect('/admin/onboarding/paso-6');
}
