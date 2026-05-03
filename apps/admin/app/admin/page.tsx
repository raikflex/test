import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { Button } from '@mesaya/ui';
import { logout } from '../actions/auth';
import { BannerActivacion } from './banner-activacion';
import { BannerBienvenida } from './banner-bienvenida';

export const metadata = { title: 'Panel · MesaYA' };

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ bienvenida?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, nombre')
    .eq('id', user.id)
    .single();

  if (!perfil?.restaurante_id) {
    redirect('/admin/onboarding/paso-1');
  }

  const restauranteId = perfil.restaurante_id as string;

  const [{ data: restaurante }, categoriasResp, productosResp, mesasResp, equipoResp] =
    await Promise.all([
      supabase
        .from('restaurantes')
        .select('nombre_publico, estado, color_marca, primer_activacion_en, trial_termina_en')
        .eq('id', restauranteId)
        .single(),
      supabase
        .from('categorias')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId)
        .eq('activa', true),
      supabase
        .from('productos')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId),
      supabase
        .from('mesas')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId),
      supabase
        .from('perfiles')
        .select('rol', { count: 'exact' })
        .eq('restaurante_id', restauranteId)
        .neq('rol', 'dueno'),
    ]);

  const categorias = categoriasResp.count ?? 0;
  const productos = productosResp.count ?? 0;
  const mesas = mesasResp.count ?? 0;
  const equipo = (equipoResp.data ?? []) as { rol: string }[];
  const cocinas = equipo.filter((p) => p.rol === 'cocina').length;
  const meseros = equipo.filter((p) => p.rol === 'mesero').length;

  const estado = (restaurante?.estado as string) ?? 'archivado';
  const trialTermina = restaurante?.trial_termina_en as string | null;

  return (
    <main className="min-h-screen">
      <Header nombreNegocio={(restaurante?.nombre_publico as string) ?? ''} />

      <div className="px-6 sm:px-10 py-10 max-w-5xl mx-auto space-y-8">
        {params.bienvenida === 'activo' ? <BannerBienvenida /> : null}

        <section>
          <p
            className="text-xs uppercase tracking-[0.16em] mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            Hola, {(perfil.nombre as string) ?? 'dueño'}
          </p>
          <h1
            className="font-[family-name:var(--font-display)] text-5xl tracking-[-0.025em] leading-[1.05]"
            style={{ color: 'var(--color-ink)' }}
          >
            {(restaurante?.nombre_publico as string) ?? 'Tu restaurante'}
          </h1>
        </section>

        <BannerActivacion estado={estado} trialTerminaEn={trialTermina} />

        <Resumen
          categorias={categorias}
          productos={productos}
          mesas={mesas}
          cocinas={cocinas}
          meseros={meseros}
        />

        <SeccionProximos />
      </div>
    </main>
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

function Resumen({
  categorias,
  productos,
  mesas,
  cocinas,
  meseros,
}: {
  categorias: number;
  productos: number;
  mesas: number;
  cocinas: number;
  meseros: number;
}) {
  return (
    <section>
      <h2
        className="text-xs uppercase tracking-[0.14em] mb-3"
        style={{ color: 'var(--color-muted)' }}
      >
        Tu configuración
      </h2>
      <ul
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-[var(--radius-lg)] sm:rounded-none sm:border-0 sm:bg-transparent border bg-[var(--color-paper)] sm:gap-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Stat label="Categorías" valor={categorias} />
        <Stat label="Productos" valor={productos} />
        <Link href="/admin/mesas" className="contents">
          <Stat label="Mesas" valor={mesas} />
        </Link>
        <Stat
          label="Equipo"
          valor={cocinas + meseros}
          detalle={`${cocinas} cocina · ${meseros} mesero${meseros === 1 ? '' : 's'}`}
        />
      </ul>
    </section>
  );
}

function Stat({
  label,
  valor,
  detalle,
}: {
  label: string;
  valor: number;
  detalle?: string;
}) {
  return (
    <li
      className="p-5 sm:rounded-[var(--radius-lg)] sm:border sm:bg-[var(--color-paper)]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <p
        className="text-xs uppercase tracking-[0.12em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </p>
      <p
        className="font-[family-name:var(--font-display)] text-4xl mt-1 tracking-[-0.02em]"
        style={{ color: 'var(--color-ink)' }}
      >
        {valor}
      </p>
      {detalle ? (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
          {detalle}
        </p>
      ) : null}
    </li>
  );
}

function SeccionProximos() {
  return (
    <section>
      <h2
        className="text-xs uppercase tracking-[0.14em] mb-3"
        style={{ color: 'var(--color-muted)' }}
      >
        Próximamente
      </h2>
      <div
        className="rounded-[var(--radius-lg)] border p-5"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}
      >
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Aquí verás tus pedidos del día, ventas en tiempo real y métricas
          básicas cuando tu restaurante reciba el primer cliente. La gestión
          completa del menú, mesas y equipo se agrega en la próxima sesión.
        </p>
      </div>
    </section>
  );
}
