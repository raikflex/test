import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@mesaya/database/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Middleware de apps/staff:
 *   1. Refresca el cookie de Supabase (updateSession).
 *   2. Si NO hay user logueado → redirect a /login (excepto si ya está en /login).
 *   3. Si hay user logueado y está en / → redirect según rol.
 *   4. Bloquea áreas por rol (cocina solo /cocina, mesero solo /mesero).
 */

export async function middleware(request: NextRequest) {
  // 1) Primero refrescamos el cookie de Supabase.
  const sessionResponse = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  // Permitir rutas estáticas y assets.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return sessionResponse;
  }

  // 2) Crear cliente de Supabase desde el request para leer la sesión.
  const response = sessionResponse;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookies: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 3) Sin sesión → mandar a /login (salvo que ya esté allí).
  if (!user) {
    if (pathname.startsWith('/login')) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 4) Con sesión: leer rol del perfil para enrutado/guards.
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();

  const rol = (perfil?.rol as string | null) ?? null;

  // Si está en /login pero ya tiene sesión → mandarlo a su área.
  if (pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = destinoSegunRol(rol);
    return NextResponse.redirect(url);
  }

  // Si está en la raíz → redirect a su área.
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = destinoSegunRol(rol);
    return NextResponse.redirect(url);
  }

  // Guards por rol: cocina solo entra a /cocina, mesero solo a /mesero.
  if (pathname.startsWith('/cocina') && rol !== 'cocina' && rol !== 'dueno') {
    const url = request.nextUrl.clone();
    url.pathname = destinoSegunRol(rol);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith('/mesero') && rol !== 'mesero' && rol !== 'dueno') {
    const url = request.nextUrl.clone();
    url.pathname = destinoSegunRol(rol);
    return NextResponse.redirect(url);
  }

  return response;
}

function destinoSegunRol(rol: string | null): string {
  if (rol === 'cocina') return '/cocina';
  if (rol === 'mesero') return '/mesero';
  if (rol === 'dueno') return '/cocina'; // Dueño puede ver todo, default cocina.
  return '/login';
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
