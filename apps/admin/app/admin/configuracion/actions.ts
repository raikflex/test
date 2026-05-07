'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@mesaya/database/server';

const configSchema = z.object({
  nombre_publico: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(80, 'Máximo 80 caracteres'),
  color_marca: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (debe ser hex como #9a3f6b)'),
});

export type GuardarConfigState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<'nombre_publico' | 'color_marca', string>>;
};

export async function guardarConfig(
  _prev: GuardarConfigState,
  formData: FormData,
): Promise<GuardarConfigState> {
  const parsed = configSchema.safeParse({
    nombre_publico: formData.get('nombre_publico'),
    color_marca: formData.get('color_marca'),
  });

  if (!parsed.success) {
    const fieldErrors: GuardarConfigState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<
        GuardarConfigState['fieldErrors']
      >;
      if (key) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Tu sesión expiró.' };

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id || perfil.rol !== 'dueno') {
    return { ok: false, error: 'No tienes permisos.' };
  }

  const { error } = await supabase
    .from('restaurantes')
    .update({
      nombre_publico: parsed.data.nombre_publico,
      color_marca: parsed.data.color_marca,
    })
    .eq('id', perfil.restaurante_id as string);

  if (error) {
    return { ok: false, error: 'No se pudo guardar. ' + error.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/configuracion');
  return { ok: true };
}
