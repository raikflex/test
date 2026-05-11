import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@mesaya/database/server';

/**
 * Handler universal de callback de Supabase auth.
 * Cubre: confirmación de email post-signup, password reset, email change, magic links.
 *
 * Flujo: Supabase redirige a esta URL con ?code=...&next=...
 * 1. Intercambiamos el code por sesión
 * 2. Redirigimos al path de `next` (o /admin por default)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/admin';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Si falló (code inválido, expirado o ausente) → mandar a login con flag de error
  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}