'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@mesaya/database/client';
import { logout } from '../actions/auth';

type CurrentPage = 'inicio' | 'menu' | 'mesas' | 'equipo' | 'reviews' | 'metricas' | 'horarios' | 'configuracion' | 'perfil';

const ITEMS: {
  id: CurrentPage;
  label: string;
  href:
    | '/admin'
    | '/admin/menu'
    | '/admin/mesas'
    | '/admin/equipo'
    | '/admin/reviews'
    | '/admin/metricas'
    | '/admin/horarios'
    | '/admin/configuracion';
  icon: string;
}[] = [
  { id: 'inicio', label: 'Inicio', href: '/admin', icon: 'home' },
  { id: 'menu', label: 'Menú', href: '/admin/menu', icon: 'menu' },
  { id: 'mesas', label: 'Mesas', href: '/admin/mesas', icon: 'mesas' },
  { id: 'equipo', label: 'Equipo', href: '/admin/equipo', icon: 'team' },
  { id: 'reviews', label: 'Reseñas', href: '/admin/reviews', icon: 'star' },
  { id: 'metricas', label: 'Métricas', href: '/admin/metricas', icon: 'chart' },
  { id: 'horarios', label: 'Horarios', href: '/admin/horarios', icon: 'clock' },
  { id: 'configuracion', label: 'Configuración', href: '/admin/configuracion', icon: 'gear' },
];

type Indicadores = {
  mesasActivas: number;
  comandasActivas: number;
  reseñasUltimas24h: number;
  estadoRestaurante: string;
};

/**
 * Hook que trae indicadores del dashboard refrescados cada 30s.
 * Usa el cliente Supabase con sesión del navegador (RLS protege).
 *
 * Devuelve null mientras carga la primera vez para evitar parpadeos del badge.
 */
function useIndicadoresAdmin(): Indicadores | null {
  const [data, setData] = useState<Indicadores | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelado = false;

    async function fetchIndicadores() {
      // Restaurante del usuario actual (vía RLS — perfiles solo deja ver el propio)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelado) return;

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('restaurante_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!perfil?.restaurante_id || cancelado) return;
      const restauranteId = perfil.restaurante_id as string;

      const ahora = new Date();
      const hace24h = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

      const [restResp, sesResp, comandasResp, reviewsResp] = await Promise.all([
        supabase
          .from('restaurantes')
          .select('estado')
          .eq('id', restauranteId)
          .maybeSingle(),
        supabase
          .from('sesiones')
          .select('id', { count: 'exact', head: true })
          .eq('restaurante_id', restauranteId)
          .eq('estado', 'abierta'),
        supabase
          .from('comandas')
          .select('id', { count: 'exact', head: true })
          .eq('restaurante_id', restauranteId)
          .in('estado', ['pendiente', 'en_preparacion', 'lista']),
        supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .gte('creada_en', hace24h.toISOString()),
      ]);

      if (cancelado) return;

      setData({
        mesasActivas: sesResp.count ?? 0,
        comandasActivas: comandasResp.count ?? 0,
        reseñasUltimas24h: reviewsResp.count ?? 0,
        estadoRestaurante: (restResp.data?.estado as string) ?? 'archivado',
      });
    }

    fetchIndicadores();
    const i = setInterval(fetchIndicadores, 30_000);

    return () => {
      cancelado = true;
      clearInterval(i);
    };
  }, []);

  return data;
}

export function PanelShell({
  children,
  currentPage,
  nombreNegocio,
}: {
  children: React.ReactNode;
  currentPage: CurrentPage;
  nombreNegocio: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const indicadores = useIndicadoresAdmin();

  // Mapa de badges por item: solo se muestra si > 0
  const badges: Partial<Record<CurrentPage, number>> = indicadores
    ? {
        mesas: indicadores.mesasActivas,
        metricas: indicadores.comandasActivas,
        reviews: indicadores.reseñasUltimas24h,
      }
    : {};

  const estaPausado = indicadores?.estadoRestaurante === 'pausado';
  const estaActivo = indicadores?.estadoRestaurante === 'activo';

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-paper)' }}>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-30 bg-black/30"
        />
      ) : null}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-60 shrink-0 border-r flex flex-col transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          borderColor: 'var(--color-border)',
          background: 'white',
        }}
      >
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <Link href="/admin" className="inline-flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
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
              className="font-[family-name:var(--font-display)] text-lg tracking-[-0.02em]"
              style={{ color: 'var(--color-ink)' }}
            >
              MesaYA
            </span>
          </Link>
          <p
            className="text-[0.7rem] truncate mt-1"
            style={{ color: 'var(--color-muted)' }}
          >
            {nombreNegocio}
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {ITEMS.map((item) => {
            const activo = item.id === currentPage;
            const badge = badges[item.id] ?? 0;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors"
                style={{
                  background: activo ? 'var(--color-paper-deep)' : 'transparent',
                  color: activo ? 'var(--color-ink)' : 'var(--color-ink-soft)',
                  fontWeight: activo ? 500 : 400,
                }}
              >
                <ItemIcon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                {badge > 0 ? (
                  <span
                    className="text-[0.6rem] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded-full font-medium tabular-nums"
                    style={{
                      background: 'var(--color-accent, #9a3f6b)',
                      color: 'white',
                      minWidth: '1.25rem',
                      textAlign: 'center',
                    }}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Footer: estado del restaurante con dot pulsante */}
        {indicadores ? (
          <div
            className="px-3 py-3 border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)]"
              style={{
                background: estaPausado
                  ? '#fffbeb'
                  : estaActivo
                    ? 'var(--color-paper-deep)'
                    : 'transparent',
              }}
            >
              <span
                className={estaActivo ? 'size-2 rounded-full animate-pulse' : 'size-2 rounded-full'}
                style={{
                  background: estaPausado
                    ? '#f59e0b'
                    : estaActivo
                      ? '#22c55e'
                      : 'var(--color-muted)',
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-[0.65rem] uppercase tracking-[0.1em] leading-tight"
                  style={{
                    color: estaPausado
                      ? '#92400e'
                      : estaActivo
                        ? '#15803d'
                        : 'var(--color-muted)',
                  }}
                >
                  {estaPausado
                    ? 'Pausado'
                    : estaActivo
                      ? 'Recibiendo'
                      : 'Sin activar'}
                </p>
                {indicadores.mesasActivas > 0 ? (
                  <p
                    className="text-[0.65rem] leading-tight mt-0.5"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {indicadores.mesasActivas}{' '}
                    {indicadores.mesasActivas === 1 ? 'mesa activa' : 'mesas activas'}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div
          className="p-3 border-t space-y-0.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <Link
            href="/admin/perfil"
            onClick={() => setMobileOpen(false)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors"
            style={{
              background: currentPage === 'perfil' ? 'var(--color-paper-deep)' : 'transparent',
              color: currentPage === 'perfil' ? 'var(--color-ink)' : 'var(--color-ink-soft)',
              fontWeight: currentPage === 'perfil' ? 500 : 400,
            }}
          >
            <ItemIcon name="user" />
            <span>Mi perfil</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors hover:bg-[var(--color-paper-deep)]"
              style={{ color: 'var(--color-ink-soft)' }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className="lg:hidden sticky top-0 z-20 px-4 h-12 border-b flex items-center"
          style={{
            borderColor: 'var(--color-border)',
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2"
            style={{ color: 'var(--color-ink)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span
            className="ml-2 font-[family-name:var(--font-display)] text-base"
            style={{ color: 'var(--color-ink)' }}
          >
            MesaYA
          </span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function ItemIcon({ name }: { name: string }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true as const,
  };
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 12l9-9 9 9M5 10v10h14V10" {...stroke} />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <path
            d="M4 4h16v3H4zM4 10h16v3H4zM4 16h16v3H4z"
            {...stroke}
          />
        </svg>
      );
    case 'mesas':
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="12" rx="1" {...stroke} />
          <path d="M3 10h18M9 6v12M15 6v12" {...stroke} />
        </svg>
      );
    case 'team':
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" {...stroke} />
          <path d="M3 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" {...stroke} />
          <circle cx="17" cy="9" r="2.5" {...stroke} />
          <path d="M21 20v-1a3 3 0 0 0-3-3" {...stroke} />
        </svg>
      );
    case 'star':
      return (
        <svg {...props}>
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            {...stroke}
          />
        </svg>
      );
    case 'chart':
      return (
        <svg {...props}>
          <path d="M3 3v18h18M7 14l4-4 4 4 4-7" {...stroke} />
        </svg>
      );
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M12 7v5l3 2" {...stroke} />
        </svg>
      );
    case 'user':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" {...stroke} />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" {...stroke} />
        </svg>
      );
    default:
      return null;
  }
}
