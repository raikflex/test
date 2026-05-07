import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { PanelShell } from '../../_components/panel-shell';
import { SesionesLive, type SesionActiva } from './sesiones-live';
import { ComandasActivasLive, type ComandaActiva } from './comandas-activas-live';

export const dynamic = 'force-dynamic';

export default async function MetricasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, restaurante_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil || perfil.rol !== 'dueno') redirect('/login');

  const restauranteId = perfil.restaurante_id as string;

  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('nombre_publico, color_marca')
    .eq('id', restauranteId)
    .maybeSingle();

  const colorMarca = (restaurante?.color_marca as string) ?? '#9a3f6b';
  const nombreNegocio = (restaurante?.nombre_publico as string) ?? 'Tu negocio';

  // ===== Cálculo del rango "hoy" en hora local del servidor =====
  // Usamos UTC para simplicidad. En producción habría que respetar el timezone
  // del restaurante (Bogotá UTC-5).
  const ahora = new Date();
  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const inicioHoyIso = inicioHoy.toISOString();
  const ahoraIso = ahora.toISOString();

  // Inicio de los últimos 7 días (ventana móvil para "Esta semana")
  const inicioSemana = new Date(ahora);
  inicioSemana.setDate(inicioSemana.getDate() - 7);
  inicioSemana.setHours(0, 0, 0, 0);
  const inicioSemanaIso = inicioSemana.toISOString();

  // ===== Queries =====

  const [
    pagosHoyResp,
    comandasHoyResp,
    sesionesActivasResp,
    comandasActivasResp,
    ultimaSesionResp,
    pagosUltimosResp,
    pagosSemanaResp,
    itemsSemanaResp,
    sesionesSemanaResp,
  ] = await Promise.all([
    // Pagos confirmados hoy
    supabase
      .from('pagos')
      .select('monto_total, propina, metodo, confirmado_en, sesion_id, sesiones!inner(restaurante_id)')
      .eq('estado', 'confirmado')
      .gte('confirmado_en', inicioHoyIso)
      .lte('confirmado_en', ahoraIso),
    // Comandas no canceladas hoy
    supabase
      .from('comandas')
      .select('id, total', { count: 'exact' })
      .eq('restaurante_id', restauranteId)
      .neq('estado', 'cancelada')
      .gte('creada_en', inicioHoyIso),
    // Sesiones abiertas ahora con detalle (mesa, comandas, abierta)
    supabase
      .from('sesiones')
      .select(
        `
        id,
        abierta_en,
        mesa_id,
        mesas(numero),
        comandas(id, total, estado)
      `,
        { count: 'exact' },
      )
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'abierta'),
    // Comandas activas (cocina trabajando ahora): pendientes/preparando/listas
    supabase
      .from('comandas')
      .select(
        `
        id,
        numero_diario,
        estado,
        total,
        creada_en,
        mesero_atendiendo_nombre,
        sesiones!inner(mesa_id, mesas(numero)),
        sesion_clientes(nombre)
      `,
      )
      .eq('restaurante_id', restauranteId)
      .in('estado', ['pendiente', 'en_preparacion', 'lista'])
      .order('creada_en', { ascending: true }),
    // Última sesión cerrada (para "última visita hace X")
    supabase
      .from('sesiones')
      .select('cerrada_en')
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'cerrada')
      .order('cerrada_en', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Últimos 5 pagos (lista reciente)
    supabase
      .from('pagos')
      .select(
        `
        monto_total,
        propina,
        metodo,
        confirmado_en,
        sesion_id,
        sesiones!inner(restaurante_id, mesas(numero))
      `,
      )
      .eq('estado', 'confirmado')
      .order('confirmado_en', { ascending: false })
      .limit(5),
    // === SEMANA: Pagos confirmados últimos 7 días para ingreso + ventas por día ===
    supabase
      .from('pagos')
      .select(
        `
        monto_total,
        confirmado_en,
        sesion_id,
        sesiones!inner(restaurante_id)
      `,
      )
      .eq('estado', 'confirmado')
      .gte('confirmado_en', inicioSemanaIso)
      .lte('confirmado_en', ahoraIso),
    // === SEMANA: Items vendidos últimos 7 días (para top 3 productos) ===
    // Comanda_items con JOIN a comandas para filtrar por restaurante + fecha.
    supabase
      .from('comanda_items')
      .select(
        `
        nombre_snapshot,
        cantidad,
        precio_snapshot,
        comandas!inner(restaurante_id, estado, creada_en)
      `,
      )
      .eq('comandas.restaurante_id', restauranteId)
      .neq('comandas.estado', 'cancelada')
      .gte('comandas.creada_en', inicioSemanaIso),
    // === SEMANA: Sesiones cerradas últimos 7 días (para top mesas) ===
    supabase
      .from('sesiones')
      .select(
        `
        id,
        mesa_id,
        total_facturado,
        cerrada_en,
        mesas(numero)
      `,
      )
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'cerrada')
      .gte('cerrada_en', inicioSemanaIso),
  ]);

  // Filtrar pagos por restaurante (porque la RLS hace JOIN, pero no garantiza
  // restaurante exacto sin filtrar manualmente).
  type PagoRow = {
    monto_total: number;
    propina: number;
    metodo: string;
    confirmado_en: string;
    sesiones:
      | { restaurante_id: string; mesas?: { numero: string } | { numero: string }[] | null }
      | { restaurante_id: string; mesas?: { numero: string } | { numero: string }[] | null }[]
      | null;
  };

  const pagosHoy = ((pagosHoyResp.data ?? []) as PagoRow[])
    .filter((p) => {
      const ses = Array.isArray(p.sesiones) ? p.sesiones[0] : p.sesiones;
      return ses?.restaurante_id === restauranteId;
    });

  const ventasHoy = pagosHoy.reduce((acc, p) => acc + (p.monto_total ?? 0), 0);
  const propinasHoy = pagosHoy.reduce((acc, p) => acc + (p.propina ?? 0), 0);
  const cantidadPagosHoy = pagosHoy.length;
  const ticketPromedio =
    cantidadPagosHoy > 0 ? Math.round(ventasHoy / cantidadPagosHoy) : 0;

  const comandasHoy = comandasHoyResp.count ?? 0;
  const sesionesActivasCount = sesionesActivasResp.count ?? 0;

  const sesionesActivas: SesionActiva[] = ((sesionesActivasResp.data ?? []) as Array<{
    id: string;
    abierta_en: string;
    mesa_id: string;
    mesas: { numero: string } | { numero: string }[] | null;
    comandas: { total: number; estado: string }[] | null;
  }>).map((s) => {
    const m = Array.isArray(s.mesas) ? s.mesas[0] : s.mesas;
    const comandasNoCanceladas = (s.comandas ?? []).filter(
      (c) => c.estado !== 'cancelada',
    );
    const total = comandasNoCanceladas.reduce(
      (acc, c) => acc + (c.total ?? 0),
      0,
    );
    return {
      id: s.id,
      mesaNumero: m?.numero ?? '?',
      totalAcumulado: total,
      abiertaEn: s.abierta_en,
      comandasCount: comandasNoCanceladas.length,
    };
  });

  // Comandas activas (cocina/mesero trabajando ahora)
  const comandasActivas: ComandaActiva[] = ((comandasActivasResp.data ?? []) as Array<{
    id: string;
    numero_diario: number;
    estado: string;
    total: number;
    creada_en: string;
    mesero_atendiendo_nombre: string | null;
    sesiones: { mesa_id: string; mesas: { numero: string } | { numero: string }[] | null } | { mesa_id: string; mesas: { numero: string } | { numero: string }[] | null }[] | null;
    sesion_clientes: { nombre: string } | { nombre: string }[] | null;
  }>).map((c) => {
    const ses = Array.isArray(c.sesiones) ? c.sesiones[0] : c.sesiones;
    const mesa = ses?.mesas
      ? Array.isArray(ses.mesas)
        ? ses.mesas[0]
        : ses.mesas
      : null;
    const sc = Array.isArray(c.sesion_clientes)
      ? c.sesion_clientes[0]
      : c.sesion_clientes;
    return {
      id: c.id,
      numeroDiario: c.numero_diario,
      estado: c.estado as 'pendiente' | 'en_preparacion' | 'lista',
      total: c.total,
      creadaEn: c.creada_en,
      meseroAtendiendoNombre: c.mesero_atendiendo_nombre,
      mesaNumero: mesa?.numero ?? '?',
      clienteNombre: sc?.nombre ?? 'Cliente',
    };
  });

  const ultimaSesionCerrada = ultimaSesionResp.data?.cerrada_en as string | undefined;
  const minutosDesdeUltima = ultimaSesionCerrada
    ? Math.floor((Date.now() - new Date(ultimaSesionCerrada).getTime()) / 60000)
    : null;

  const pagosRecientes = ((pagosUltimosResp.data ?? []) as PagoRow[])
    .filter((p) => {
      const ses = Array.isArray(p.sesiones) ? p.sesiones[0] : p.sesiones;
      return ses?.restaurante_id === restauranteId;
    })
    .map((p) => {
      const ses = Array.isArray(p.sesiones) ? p.sesiones[0] : p.sesiones;
      const mesa = ses?.mesas ? (Array.isArray(ses.mesas) ? ses.mesas[0] : ses.mesas) : null;
      return {
        monto: p.monto_total,
        propina: p.propina,
        metodo: p.metodo,
        confirmadoEn: p.confirmado_en,
        mesaNumero: mesa?.numero ?? '?',
      };
    });

  // ===== Procesamiento de semana =====

  type PagoSemanaRow = {
    monto_total: number;
    confirmado_en: string;
    sesiones:
      | { restaurante_id: string }
      | { restaurante_id: string }[]
      | null;
  };

  const pagosSemana = ((pagosSemanaResp.data ?? []) as PagoSemanaRow[]).filter((p) => {
    const ses = Array.isArray(p.sesiones) ? p.sesiones[0] : p.sesiones;
    return ses?.restaurante_id === restauranteId;
  });

  const ventasSemana = pagosSemana.reduce((acc, p) => acc + (p.monto_total ?? 0), 0);
  const cantidadPagosSemana = pagosSemana.length;
  const ticketPromSemana =
    cantidadPagosSemana > 0 ? Math.round(ventasSemana / cantidadPagosSemana) : 0;

  // Agrupar pagos por día (yyyy-mm-dd) para encontrar el día más vendido.
  const ventasPorDia = new Map<string, number>();
  for (const p of pagosSemana) {
    const fecha = new Date(p.confirmado_en);
    const dia = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    ventasPorDia.set(dia, (ventasPorDia.get(dia) ?? 0) + (p.monto_total ?? 0));
  }
  let diaTop: { fecha: string; monto: number } | null = null;
  for (const [fecha, monto] of ventasPorDia) {
    if (!diaTop || monto > diaTop.monto) {
      diaTop = { fecha, monto };
    }
  }

  // Top 3 productos de la semana — agrupar items por nombre_snapshot.
  type ItemSemanaRow = {
    nombre_snapshot: string;
    cantidad: number;
    precio_snapshot: number;
    comandas:
      | { restaurante_id: string; estado: string; creada_en: string }
      | { restaurante_id: string; estado: string; creada_en: string }[]
      | null;
  };

  const itemsSemana = ((itemsSemanaResp.data ?? []) as ItemSemanaRow[]).filter(
    (i) => {
      const c = Array.isArray(i.comandas) ? i.comandas[0] : i.comandas;
      return c?.restaurante_id === restauranteId;
    },
  );

  const productosAgrupados = new Map<
    string,
    { nombre: string; cantidad: number; monto: number }
  >();
  for (const it of itemsSemana) {
    const nombre = it.nombre_snapshot;
    const actual = productosAgrupados.get(nombre);
    const cant = it.cantidad ?? 0;
    const subtotal = (it.precio_snapshot ?? 0) * cant;
    if (actual) {
      actual.cantidad += cant;
      actual.monto += subtotal;
    } else {
      productosAgrupados.set(nombre, { nombre, cantidad: cant, monto: subtotal });
    }
  }
  const topProductos = Array.from(productosAgrupados.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 3);

  // Top 3 mesas más activas (por sesiones cerradas en últimos 7 días).
  type SesionSemanaRow = {
    id: string;
    mesa_id: string;
    total_facturado: number | null;
    mesas: { numero: string } | { numero: string }[] | null;
  };

  const sesionesSemana = (sesionesSemanaResp.data ?? []) as SesionSemanaRow[];
  const mesasAgrupadas = new Map<
    string,
    { mesaId: string; numero: string; sesiones: number; monto: number }
  >();
  for (const s of sesionesSemana) {
    const mesa = Array.isArray(s.mesas) ? s.mesas[0] : s.mesas;
    const numero = mesa?.numero ?? '?';
    const actual = mesasAgrupadas.get(s.mesa_id);
    if (actual) {
      actual.sesiones += 1;
      actual.monto += s.total_facturado ?? 0;
    } else {
      mesasAgrupadas.set(s.mesa_id, {
        mesaId: s.mesa_id,
        numero,
        sesiones: 1,
        monto: s.total_facturado ?? 0,
      });
    }
  }
  const topMesas = Array.from(mesasAgrupadas.values())
    .sort((a, b) => b.sesiones - a.sesiones)
    .slice(0, 3);

  // Formato bonito de día top
  const diaTopFmt = diaTop
    ? new Date(diaTop.fecha + 'T12:00:00').toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      })
    : '—';

  return (
    <PanelShell currentPage="metricas" nombreNegocio={nombreNegocio}>
      <main className="px-6 sm:px-10 py-10 max-w-5xl mx-auto">
        <h1
          className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] mb-1"
          style={{ color: 'var(--color-ink)' }}
        >
          Métricas
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Lo que pasa en {nombreNegocio} hoy.
        </p>

        {/* Cards principales */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <CardMetrica
            label="Ventas hoy"
            valor={`$${ventasHoy.toLocaleString('es-CO')}`}
            detalle={
              cantidadPagosHoy > 0
                ? `${cantidadPagosHoy} pago${cantidadPagosHoy === 1 ? '' : 's'} confirmado${cantidadPagosHoy === 1 ? '' : 's'}`
                : 'Sin pagos aún'
            }
            destacado
            colorMarca={colorMarca}
          />
          <CardMetrica
            label="Pedidos hoy"
            valor={comandasHoy}
            detalle={
              comandasHoy === 0 ? 'Sin pedidos aún' : 'comandas no canceladas'
            }
          />
          <CardMetrica
            label="Mesas ocupadas"
            valor={sesionesActivasCount}
            detalle={
              sesionesActivasCount > 0
                ? `Mesas ${sesionesActivas
                    .map((s) => s.mesaNumero)
                    .slice(0, 3)
                    .join(', ')}${sesionesActivasCount > 3 ? '…' : ''}`
                : 'Ninguna abierta'
            }
          />
          <CardMetrica
            label="Última visita"
            valor={
              minutosDesdeUltima === null
                ? '—'
                : minutosDesdeUltima < 1
                  ? 'Recién'
                  : minutosDesdeUltima < 60
                    ? `${minutosDesdeUltima}m`
                    : minutosDesdeUltima < 1440
                      ? `${Math.floor(minutosDesdeUltima / 60)}h`
                      : `${Math.floor(minutosDesdeUltima / 1440)}d`
            }
            detalle={minutosDesdeUltima === null ? 'Sin visitas aún' : 'desde el último cierre'}
          />
        </section>

        {/* Sesiones en vivo (realtime) */}
        <SesionesLive
          sesionesIniciales={sesionesActivas}
          restauranteId={restauranteId}
          colorMarca={colorMarca}
        />

        {/* Comandas activas en cocina (realtime) */}
        <ComandasActivasLive
          comandasIniciales={comandasActivas}
          restauranteId={restauranteId}
          colorMarca={colorMarca}
        />

        {/* Stats secundarias */}
        {cantidadPagosHoy > 0 ? (
          <section
            className="rounded-[var(--radius-lg)] border bg-white p-5 mb-8"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="text-xs uppercase tracking-[0.14em] mb-3"
              style={{ color: 'var(--color-muted)' }}
            >
              Resumen del día
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
                  Ticket promedio
                </p>
                <p
                  className="font-[family-name:var(--font-display)] text-2xl mt-0.5"
                  style={{ color: 'var(--color-ink)' }}
                >
                  ${ticketPromedio.toLocaleString('es-CO')}
                </p>
              </div>
              <div>
                <p className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
                  Propinas
                </p>
                <p
                  className="font-[family-name:var(--font-display)] text-2xl mt-0.5"
                  style={{ color: 'var(--color-ink)' }}
                >
                  ${propinasHoy.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
                  Comandas por pago
                </p>
                <p
                  className="font-[family-name:var(--font-display)] text-2xl mt-0.5"
                  style={{ color: 'var(--color-ink)' }}
                >
                  {cantidadPagosHoy > 0
                    ? (comandasHoy / cantidadPagosHoy).toFixed(1)
                    : '—'}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {/* === ESTA SEMANA === */}
        {cantidadPagosSemana > 0 ? (
          <section className="mb-8">
            <h2
              className="text-xs uppercase tracking-[0.14em] mb-3"
              style={{ color: 'var(--color-muted)' }}
            >
              Esta semana · últimos 7 días
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <CardSemana
                label="Ingreso"
                valor={`$${ventasSemana.toLocaleString('es-CO')}`}
                detalle={`${cantidadPagosSemana} ${cantidadPagosSemana === 1 ? 'cuenta' : 'cuentas'}`}
                destacado
                colorMarca={colorMarca}
              />
              <CardSemana
                label="Ticket promedio"
                valor={`$${ticketPromSemana.toLocaleString('es-CO')}`}
                detalle="por cuenta"
              />
              <CardSemana
                label="Mejor día"
                valor={diaTopFmt}
                detalle={
                  diaTop ? `$${diaTop.monto.toLocaleString('es-CO')}` : 'sin datos'
                }
              />
              <CardSemana
                label="Días con ventas"
                valor={ventasPorDia.size.toString()}
                detalle={ventasPorDia.size === 7 ? 'todos los días' : 'de 7 días'}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Top 3 productos */}
              {topProductos.length > 0 ? (
                <div
                  className="rounded-[var(--radius-lg)] border bg-white p-5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <h3
                    className="text-[0.7rem] uppercase tracking-[0.14em] mb-3"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Productos más vendidos
                  </h3>
                  <ul className="space-y-3">
                    {topProductos.map((p, i) => (
                      <li
                        key={p.nombre}
                        className="flex items-center gap-3"
                      >
                        <span
                          className="size-8 rounded-full grid place-items-center shrink-0 text-sm font-medium"
                          style={{
                            background:
                              i === 0
                                ? colorMarca
                                : 'var(--color-paper-deep)',
                            color: i === 0 ? 'white' : 'var(--color-ink-soft)',
                          }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{ color: 'var(--color-ink)' }}
                          >
                            {p.nombre}
                          </p>
                          <p
                            className="text-[0.7rem]"
                            style={{ color: 'var(--color-muted)' }}
                          >
                            {p.cantidad} {p.cantidad === 1 ? 'unidad' : 'unidades'}{' '}
                            · ${p.monto.toLocaleString('es-CO')}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Top 3 mesas */}
              {topMesas.length > 0 ? (
                <div
                  className="rounded-[var(--radius-lg)] border bg-white p-5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <h3
                    className="text-[0.7rem] uppercase tracking-[0.14em] mb-3"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Mesas más activas
                  </h3>
                  <ul className="space-y-3">
                    {topMesas.map((m, i) => (
                      <li
                        key={m.mesaId}
                        className="flex items-center gap-3"
                      >
                        <span
                          className="size-8 rounded-full grid place-items-center shrink-0 text-sm font-medium"
                          style={{
                            background:
                              i === 0
                                ? colorMarca
                                : 'var(--color-paper-deep)',
                            color: i === 0 ? 'white' : 'var(--color-ink-soft)',
                          }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: 'var(--color-ink)' }}
                          >
                            Mesa {m.numero}
                          </p>
                          <p
                            className="text-[0.7rem]"
                            style={{ color: 'var(--color-muted)' }}
                          >
                            {m.sesiones} {m.sesiones === 1 ? 'visita' : 'visitas'}{' '}
                            · ${m.monto.toLocaleString('es-CO')}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Pagos recientes */}
        {pagosRecientes.length > 0 ? (
          <section className="mb-8">
            <h2
              className="text-xs uppercase tracking-[0.14em] mb-3"
              style={{ color: 'var(--color-muted)' }}
            >
              Últimos pagos
            </h2>
            <div
              className="rounded-[var(--radius-lg)] border bg-white overflow-hidden"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {pagosRecientes.map((p, i) => {
                  const fecha = new Date(p.confirmadoEn);
                  const horaFmt = fecha.toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  });
                  const fechaFmt = fecha.toLocaleDateString('es-CO', {
                    day: 'numeric',
                    month: 'short',
                  });
                  return (
                    <li
                      key={i}
                      className="px-5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p
                          className="text-sm"
                          style={{ color: 'var(--color-ink)' }}
                        >
                          Mesa {p.mesaNumero}
                        </p>
                        <p
                          className="text-[0.7rem]"
                          style={{ color: 'var(--color-muted)' }}
                        >
                          {fechaFmt} · {horaFmt} · {etiquetaMetodo(p.metodo)}
                          {p.propina > 0
                            ? ` · propina $${p.propina.toLocaleString('es-CO')}`
                            : ''}
                        </p>
                      </div>
                      <span
                        className="font-[family-name:var(--font-mono)] text-sm shrink-0"
                        style={{ color: 'var(--color-ink)' }}
                      >
                        ${p.monto.toLocaleString('es-CO')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}

        {/* Empty state si no hay nada */}
        {cantidadPagosHoy === 0 && comandasHoy === 0 && sesionesActivasCount === 0 ? (
          <section
            className="rounded-[var(--radius-lg)] border bg-white p-8 text-center"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h2
              className="font-[family-name:var(--font-display)] text-xl tracking-[-0.015em] mb-1"
              style={{ color: 'var(--color-ink)' }}
            >
              El día empieza con calma
            </h2>
            <p
              className="text-sm max-w-sm mx-auto"
              style={{ color: 'var(--color-ink-soft)' }}
            >
              Cuando lleguen los primeros clientes, aquí verás ventas, pedidos y
              mesas ocupadas en tiempo real.
            </p>
          </section>
        ) : null}
      </main>
    </PanelShell>
  );
}

function CardSemana({
  label,
  valor,
  detalle,
  destacado,
  colorMarca,
}: {
  label: string;
  valor: string;
  detalle: string;
  destacado?: boolean;
  colorMarca?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border bg-white p-4"
      style={{
        borderColor:
          destacado && colorMarca ? colorMarca : 'var(--color-border)',
        borderWidth: destacado ? 1.5 : 1,
      }}
    >
      <p
        className="text-[0.65rem] uppercase tracking-[0.12em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </p>
      <p
        className="font-[family-name:var(--font-display)] text-xl mt-1 tracking-[-0.02em] leading-tight"
        style={{
          color: destacado && colorMarca ? colorMarca : 'var(--color-ink)',
        }}
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

function CardMetrica({
  label,
  valor,
  detalle,
  destacado,
  colorMarca,
}: {
  label: string;
  valor: string | number;
  detalle: string;
  destacado?: boolean;
  colorMarca?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-5"
      style={{
        borderColor: 'var(--color-border)',
        background: destacado ? colorMarca : 'white',
        color: destacado ? 'white' : undefined,
      }}
    >
      <p
        className="text-[0.7rem] uppercase tracking-[0.14em]"
        style={{
          color: destacado ? 'rgba(255,255,255,0.85)' : 'var(--color-muted)',
        }}
      >
        {label}
      </p>
      <p
        className="font-[family-name:var(--font-display)] text-3xl mt-1 tracking-[-0.02em]"
        style={{
          color: destacado ? 'white' : 'var(--color-ink)',
        }}
      >
        {valor}
      </p>
      <p
        className="text-[0.7rem] mt-1"
        style={{
          color: destacado ? 'rgba(255,255,255,0.75)' : 'var(--color-muted)',
        }}
      >
        {detalle}
      </p>
    </div>
  );
}

function etiquetaMetodo(m: string): string {
  switch (m) {
    case 'efectivo':
      return 'efectivo';
    case 'tarjeta':
      return 'tarjeta';
    case 'transferencia':
      return 'transferencia';
    case 'no_seguro':
      return 'sin definir';
    default:
      return m;
  }
}
