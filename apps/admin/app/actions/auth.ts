'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@mesaya/database/server';

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72, 'Máximo 72 caracteres'),
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(80),
});

export type SignupState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<'email' | 'password' | 'nombre', string>>;
};

export async function signupOwner(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    nombre: formData.get('nombre'),
  });

  if (!parsed.success) {
    const fieldErrors: SignupState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'email' || key === 'password' || key === 'nombre') {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();

  // Solo creamos auth.users. El perfil se crea en paso-1 del onboarding,
  // junto con el restaurante, porque perfiles.restaurante_id es NOT NULL.
  // Guardamos el nombre y el rol en user_metadata para usarlos después.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        nombre: parsed.data.nombre,
        rol_intencion: 'dueno',
      },
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data.user) return { ok: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' };

  if (!data.session) {
    return {
      ok: true,
      error: 'Cuenta creada. Te enviamos un correo para confirmar antes de continuar.',
    };
  }

  redirect('/admin/onboarding/paso-1');
}