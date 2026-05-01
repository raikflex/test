import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';

/**
 * Entry point. Decide a dónde mandar al usuario:
 *   - Sin sesión → /signup
 *   - Con sesión, sin perfil aún → onboarding paso 1 (no completó setup)
 *   - Con sesión y perfil → /admin (ya está adentro)
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signup');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil) {
    redirect('/admin/onboarding/paso-1');
  }

  redirect('/admin');
}