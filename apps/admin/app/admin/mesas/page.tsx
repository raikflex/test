import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { logout } from '../../actions/auth';
import { Button } from '@mesaya/ui';
import { MesasManager } from './mesas-manager';

export const metadata = { title: 'Mesas · MesaYA' };

type Mesa = {
  id: string;
  numero: string;
  capacidad: number;
  activa: boolean;
  qr_token: string;
};

export default async function MesasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol, nombre')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id) redirect('/admin/onboarding/paso-1');
  if (perfil.rol !== 'dueno') redirect('/login?error=acceso-denegado');

  const { data: mesas } = await supabase
    .from('mesas')
    .select('id, numero, capacidad, activa, qr_token')
    .eq('restaurante_id', perfil.restaurante_id as string)
    .order('numero', { ascending: true });

  // Ordenar numéricamente porque numero es text en DB.
  const mesasOrdenadas: Mesa[] = ((mesas ?? []) as Mesa[]).slice().sort((a, b) => {
    const na = parseInt(a.numero, 10);
    const nb = parseInt(b.numero, 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.numero.localeCompare(b.numero);
    return na - nb;
  });

  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('nombre_publico')
    .eq('id', perfil.restaurante_id as string)
    .single();

  return (
    <main className="min-h-screen">
      <Header nombreNegocio={(restaurante?.nombre_publico as string) ?? ''} />

      <div className="px-6 sm:px-10 py-10 max-w-5xl mx-auto space-y-8">
        <Breadcrumb />

        <header>
          <h1
            className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-[-0.025em] leading-[1.05]"
            style={{ color: 'var(--color-ink)' }}
          >
            Tus{' '}
            <em className="not-italic" style={{ fontStyle: 'italic', fontWeight: 400 }}>
              mesas
            </em>
            .
          </h1>
          <p
            className="mt-3 text-[0.95rem] leading-relaxed max-w-xl"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Agrega más mesas si tu restaurante crece, edita la capacidad, o
            descarga otra vez los QRs si los pierdes.
          </p>
        </header>

        <MesasManager mesas={mesasOrdenadas} />
      </div>
    </main>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-muted)' }}>
      <Link
        href="/admin"
        className="uppercase tracking-[0.14em] hover:text-[var(--color-ink)] transition-colors"
      >
        Panel
      </Link>
      <span aria-hidden>·</span>
      <span
        className="uppercase tracking-[0.14em]"
        style={{ color: 'var(--color-ink)' }}
      >
        Mesas
      </span>
    </nav>
  );
}

function Header({ nombreNegocio }: { nombreNegocio: string }) {
  return (
    <header
      className="border-b px-6 sm:px-10 py-4 flex items-center justify-between"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <Link href="/admin" className="inline-flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect
            x="4"
            y="4"
            width="24"
            height="24"
            rx="6"
            stroke="var(--color-ink)"
            strokeWidth="1.5"
          />
          <circle cx="22" cy="22" r="3" fill="var(--color-accent)" />
        </svg>
        <span
          className="font-[family-name:var(--font-display)] text-xl tracking-[-0.02em]"
          style={{ color: 'var(--color-ink)' }}
        >
          MesaYA
        </span>
        <span
          className="hidden sm:inline text-sm ml-2 truncate max-w-[200px]"
          style={{ color: 'var(--color-muted)' }}
        >
          / {nombreNegocio}
        </span>
      </Link>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="sm">
          Cerrar sesión
        </Button>
      </form>
    </header>
  );
}
