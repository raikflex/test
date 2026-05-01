import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';

/**
 * Layout de toda la zona /admin. Garantiza que hay sesión activa.
 *
 * NO chequea perfil aquí porque el perfil se crea en paso-1 del onboarding
 * (junto con el restaurante, ya que perfiles.restaurante_id es NOT NULL).
 * Cada sub-ruta es responsable de chequear si el dueño completó onboarding
 * y redirigir a paso-1 si falta.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signup');

  return <>{children}</>;
}