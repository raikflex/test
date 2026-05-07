import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { PanelShell } from '../_components/panel-shell';
import { BannerActivacion } from './banner-activacion';
import { BannerBienvenida } from './banner-bienvenida';
import { ToggleEstadoRestaurante } from './toggle-estado-restaurante';

export const metadata = { title: 'Panel · MesaYA' };
export const dynamic = 'force-dynamic';

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

  // Inicio del día (Bogotá): para queries "hoy"
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const inicioDiaIso = inicioDia.toISOString();

  const [
    { data: restaurante },
    categoriasResp,
    productosResp,
    mesasResp,
    equipoResp,
    reviewsResp,
    pagosHoyResp,
    comandasHoyResp,
    sesionesActivasResp,
  ] = await Promise.all([
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
    supabase
      .from('reviews')
      .select('estrellas, comentario, creada_en')
      .order('creada_en', { ascending: false })
      .limit(50),
    // Pagos confirmados hoy (para sumar ingresos)
    supabase
      .from('pagos')
      .select('monto_total, estado, confirmado_en')
      .gte('confirmado_en', inicioDiaIso)
      .eq('estado', 'confirmado'),
    // Comandas creadas hoy (excluyendo canceladas)
    supabase
      .from('comandas')
      .select('id', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .gte('creada_en', inicioDiaIso)
      .neq('estado', 'cancelada'),
    // Sesiones abiertas ahora
    supabase
      .from('sesiones')
      .select('id', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'abierta'),
  ]);

  const categorias = categoriasResp.count ?? 0;
  const productos = productosResp.count ?? 0;
  const mesas = mesasResp.count ?? 0;
  const equipo = (equipoResp.data ?? []) as { rol: string }[];
  const cocinas = equipo.filter((p) => p.rol === 'cocina').length;
  const meseros = equipo.filter((p) => p.rol === 'mesero').length;

  // Filtramos pagos hoy que correspondan a sesiones de este restaurante.
  // Para evitar JOIN, asumimos que `pagos` ya respeta RLS y solo trae los
  // que el dueño puede ver. Si el resumen sale alto, validamos con SQL aparte.
  const pagosHoy = (pagosHoyResp.data ?? []) as { monto_total: number }[];
  const ingresoHoy = pagosHoy.reduce((acc, p) => acc + (p.monto_total ?? 0), 0);
  const cantidadPagosHoy = pagosHoy.length;
  const comandasHoy = comandasHoyResp.count ?? 0;
  const sesionesActivas = sesionesActivasResp.count ?? 0;

  const estado = (restaurante?.estado as string) ?? 'archivado';
  const trialTermina = restaurante?.trial_termina_en as string | null;
  const colorMarca = (restaurante?.color_marca as string) ?? '#9a3f6b';
  const nombreNegocio = (restaurante?.nombre_publico as string) ?? 'Tu restaurante';

  const reviews = (reviewsResp.data ?? []) as {
    estrellas: number;
    comentario: string | null;
    creada_en: string;
  }[];

  const reviewsResumen =
    reviews.length === 0
      ? null
      : {
          total: reviews.length,
          promedio:
            reviews.reduce((acc, r) => acc + r.estrellas, 0) / reviews.length,
          ultimas: reviews.slice(0, 2),
        };

  return (
    <PanelShell currentPage="inicio" nombreNegocio={nombreNegocio}>
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
            {nombreNegocio}
          </h1>
        </section>

        <BannerActivacion estado={estado} trialTerminaEn={trialTermina} />

        <ToggleEstadoRestaurante estadoActual={estado} colorMarca={colorMarca} />

        <ResumenHoy
          ingreso={ingresoHoy}
          pagos={cantidadPagosHoy}
          comandas={comandasHoy}
          sesionesActivas={sesionesActivas}
          colorMarca={colorMarca}
        />

        <Atajos />

        <Resumen
          categorias={categorias}
          productos={productos}
          mesas={mesas}
          cocinas={cocinas}
          meseros={meseros}
        />

        <SeccionResenas resumen={reviewsResumen} colorMarca={colorMarca} />
      </div>
    </PanelShell>
  );
}

function ResumenHoy({
  ingreso,
  pagos,
  comandas,
  sesionesActivas,
  colorMarca,
}: {
  ingreso: number;
  pagos: number;
  comandas: number;
  sesionesActivas: number;
  colorMarca: string;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Hoy
        </h2>
        <Link
          href="/admin/metricas"
          className="text-xs underline"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Ver métricas →
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CardHoy
          label="Ingreso"
          valor={`$${ingreso.toLocaleString('es-CO')}`}
          detalle={`${pagos} ${pagos === 1 ? 'cuenta cobrada' : 'cuentas cobradas'}`}
          destacado
          colorMarca={colorMarca}
        />
        <CardHoy
          label="Comandas"
          valor={comandas.toString()}
          detalle={comandas === 0 ? 'sin pedidos aún' : 'creadas hoy'}
        />
        <CardHoy
          label="Mesas activas"
          valor={sesionesActivas.toString()}
          detalle={sesionesActivas === 0 ? 'sin clientes ahora' : 'abiertas ahora'}
          puslante={sesionesActivas > 0}
          colorMarca={colorMarca}
        />
        <CardHoy
          label="Promedio"
          valor={pagos > 0 ? `$${Math.round(ingreso / pagos).toLocaleString('es-CO')}` : '—'}
          detalle={pagos > 0 ? 'por cuenta' : 'sin datos'}
        />
      </div>
    </section>
  );
}

function CardHoy({
  label,
  valor,
  detalle,
  destacado,
  puslante,
  colorMarca,
}: {
  label: string;
  valor: string;
  detalle: string;
  destacado?: boolean;
  puslante?: boolean;
  colorMarca?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border bg-white p-4 sm:p-5"
      style={{
        borderColor: destacado && colorMarca ? colorMarca : 'var(--color-border)',
        borderWidth: destacado ? 1.5 : 1,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <p
          className="text-xs uppercase tracking-[0.12em]"
          style={{ color: 'var(--color-muted)' }}
        >
          {label}
        </p>
        {puslante ? (
          <span
            className="size-1.5 rounded-full animate-pulse"
            style={{ background: colorMarca ?? '#22c55e' }}
          />
        ) : null}
      </div>
      <p
        className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] tabular-nums"
        style={{ color: destacado && colorMarca ? colorMarca : 'var(--color-ink)' }}
      >
        {valor}
      </p>
      <p
        className="text-[0.7rem] mt-1 leading-relaxed"
        style={{ color: 'var(--color-muted)' }}
      >
        {detalle}
      </p>
    </div>
  );
}

function Atajos() {
  const ATAJOS = [
    { href: '/admin/menu', label: 'Editar menú', icon: 'menu' },
    { href: '/admin/mesas', label: 'Ver mesas', icon: 'table' },
    { href: '/admin/equipo', label: 'Equipo', icon: 'team' },
    { href: '/admin/configuracion', label: 'Configuración', icon: 'gear' },
  ] as const;

  return (
    <section>
      <h2
        className="text-xs uppercase tracking-[0.14em] mb-3"
        style={{ color: 'var(--color-muted)' }}
      >
        Atajos
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {ATAJOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-[var(--radius-md)] border bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--color-paper-deep)]"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-ink)',
            }}
          >
            {a.label} →
          </Link>
        ))}
      </div>
    </section>
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
        <Link href={{ pathname: '/admin/menu', query: { tab: 'categorias' } }} className="contents">
          <Stat label="Categorías" valor={categorias} />
        </Link>
        <Link href="/admin/menu" className="contents">
          <Stat label="Productos" valor={productos} />
        </Link>
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

function SeccionResenas({
  resumen,
  colorMarca,
}: {
  resumen: {
    total: number;
    promedio: number;
    ultimas: { estrellas: number; comentario: string | null; creada_en: string }[];
  } | null;
  colorMarca: string;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Reseñas de clientes
        </h2>
        <Link
          href="/admin/reviews"
          className="text-xs underline"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Ver todas →
        </Link>
      </div>

      {resumen === null ? (
        <div
          className="rounded-[var(--radius-lg)] border p-5"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-paper)',
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Aquí verás las opiniones que dejen tus clientes después de cada
            visita. Cuando recibas la primera, aparecerá un resumen con
            estrellas promedio y los comentarios más recientes.
          </p>
        </div>
      ) : (
        <div
          className="rounded-[var(--radius-lg)] border bg-white p-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="flex items-center gap-6 mb-4 pb-4 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill={colorMarca} style={{ color: colorMarca }}>
                <polygon
                  points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] ml-1"
                style={{ color: 'var(--color-ink)' }}
              >
                {resumen.promedio.toFixed(1)}
              </span>
            </div>
            <div>
              <p
                className="font-[family-name:var(--font-display)] text-xl tracking-[-0.015em]"
                style={{ color: 'var(--color-ink)' }}
              >
                {resumen.total} {resumen.total === 1 ? 'reseña' : 'reseñas'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                de tus clientes
              </p>
            </div>
          </div>

          <p
            className="text-[0.7rem] uppercase tracking-[0.12em] mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            Más recientes
          </p>
          <ul className="space-y-3">
            {resumen.ultimas.map((r, i) => (
              <li key={i}>
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <svg
                      key={n}
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill={r.estrellas >= n ? colorMarca : 'none'}
                      style={{
                        color:
                          r.estrellas >= n ? colorMarca : 'var(--color-border-strong)',
                      }}
                    >
                      <polygon
                        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ))}
                </div>
                {r.comentario ? (
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    "{r.comentario}"
                  </p>
                ) : (
                  <p
                    className="text-xs italic"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Sin comentario
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
