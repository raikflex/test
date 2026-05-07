'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '@mesaya/database/client';
import {
  alternarSonido,
  desbloquearAudio,
  estaSonidoActivo,
  inicializarAudio,
  reproducir,
} from '../../lib/sonido-mesero';
import {
  atenderLlamado,
  cerrarSesion,
  confirmarPago,
  entregarComanda,
  liberarComanda,
  liberarLlamado,
  liberarPago,
  tomarComanda,
  tomarLlamado,
  tomarPago,
  type FormaPagoBackend,
} from './actions';

export type LlamadoMesero = {
  id: string;
  motivo: 'campana' | 'otro';
  creadoEn: string;
  mesaNumero: string;
  meseroAtendiendoId: string | null;
  // Nota opcional que el cliente escribió al llamar. Ej: "necesito otra
  // cuchara", "más servilletas". Si null, el mesero no ve sección de nota.
  nota: string | null;
};

export type ComandaListaMesero = {
  id: string;
  numeroDiario: number;
  total: number;
  creadaEn: string;
  clienteNombre: string;
  mesaNumero: string;
  meseroAtendiendoId: string | null;
  items: { id: string; nombre: string; cantidad: number; nota: string | null }[];
};

export type PagoMesero = {
  id: string;
  sesionId: string;
  creadoEn: string;
  mesaNumero: string;
  meseroAtendiendoId: string | null;
  totalAcumulado: number;
  cantidadComandas: number;
  // Forma de pago que el cliente eligió al pedir cuenta. Útil para que el
  // mesero prepare el cambio si es efectivo, o el datáfono si es tarjeta.
  formaPagoPreferida: string | null;
  // Datos de factura opcionales — el cliente los puede haber pasado al pedir
  // cuenta. Si están, el mesero los ve en el modal de cobrar para reportarlos
  // al sistema contable. Se denormalizan a `pagos` al confirmar.
  docTipo: string | null;
  docNumero: string | null;
  docNombre: string | null;
};

export type ColaMesero = {
  llamados: LlamadoMesero[];
  comandasListas: ComandaListaMesero[];
  pagos: PagoMesero[];
};

export function TableroMesero({
  perfilId,
  perfilNombre,
  restauranteNombre,
  colorMarca,
  restauranteId,
  colaInicial,
}: {
  perfilId: string;
  perfilNombre: string;
  restauranteNombre: string;
  colorMarca: string;
  restauranteId: string;
  colaInicial: ColaMesero;
}) {
  const [cola, setCola] = useState<ColaMesero>(colaInicial);

  const llamadoIdsRef = useRef<Set<string>>(
    new Set(colaInicial.llamados.map((l) => l.id)),
  );
  const comandaIdsRef = useRef<Set<string>>(
    new Set(colaInicial.comandasListas.map((c) => c.id)),
  );
  const pagoIdsRef = useRef<Set<string>>(
    new Set(colaInicial.pagos.map((p) => p.id)),
  );

  useEffect(() => {
    setCola(colaInicial);
    llamadoIdsRef.current = new Set(colaInicial.llamados.map((l) => l.id));
    comandaIdsRef.current = new Set(colaInicial.comandasListas.map((c) => c.id));
    pagoIdsRef.current = new Set(colaInicial.pagos.map((p) => p.id));
  }, [colaInicial]);

  useEffect(() => {
    inicializarAudio();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const canalNombre = `mesero-realtime-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let canalActual: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    async function setupRealtime() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelado) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (cancelado) return;

      const canal = supabase
        .channel(canalNombre)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'llamados_mesero' },
          async (payload) => {
            if (payload.eventType === 'INSERT') {
              const fila = payload.new as {
                id: string;
                restaurante_id: string;
                motivo: string;
                estado: string;
              };
              if (fila.restaurante_id !== restauranteId) return;
              if (fila.estado !== 'pendiente') return;

              const llamadoCompleto = await traerLlamadoCompleto(fila.id);
              if (!llamadoCompleto) return;

              if (fila.motivo === 'pago') {
                if (pagoIdsRef.current.has(fila.id)) return;
                pagoIdsRef.current.add(fila.id);
                const pago = await traerPagoCompleto(fila.id);
                if (pago) {
                  setCola((c) => ({ ...c, pagos: [...c.pagos, pago] }));
                  reproducir('pago');
                }
              } else {
                if (llamadoIdsRef.current.has(fila.id)) return;
                llamadoIdsRef.current.add(fila.id);
                setCola((c) => ({
                  ...c,
                  llamados: [...c.llamados, llamadoCompleto],
                }));
                reproducir('llamado');
              }
              return;
            }

            if (payload.eventType === 'UPDATE') {
              const actualizada = payload.new as {
                id: string;
                restaurante_id: string;
                estado: string;
                mesero_atendiendo_id: string | null;
                motivo: string;
              };
              if (actualizada.restaurante_id !== restauranteId) return;

              if (
                actualizada.estado === 'atendido' ||
                actualizada.estado === 'cancelado'
              ) {
                llamadoIdsRef.current.delete(actualizada.id);
                pagoIdsRef.current.delete(actualizada.id);
                setCola((c) => ({
                  ...c,
                  llamados: c.llamados.filter((l) => l.id !== actualizada.id),
                  pagos: c.pagos.filter((p) => p.id !== actualizada.id),
                }));
                return;
              }

              setCola((c) => ({
                ...c,
                llamados: c.llamados.map((l) =>
                  l.id === actualizada.id
                    ? { ...l, meseroAtendiendoId: actualizada.mesero_atendiendo_id }
                    : l,
                ),
                pagos: c.pagos.map((p) =>
                  p.id === actualizada.id
                    ? { ...p, meseroAtendiendoId: actualizada.mesero_atendiendo_id }
                    : p,
                ),
              }));
              return;
            }

            if (payload.eventType === 'DELETE') {
              const fila = payload.old as { id: string };
              llamadoIdsRef.current.delete(fila.id);
              pagoIdsRef.current.delete(fila.id);
              setCola((c) => ({
                ...c,
                llamados: c.llamados.filter((l) => l.id !== fila.id),
                pagos: c.pagos.filter((p) => p.id !== fila.id),
              }));
            }
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'comandas' },
          async (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const fila = payload.new as {
                id: string;
                restaurante_id: string;
                estado: string;
                mesero_atendiendo_id: string | null;
              };
              if (fila.restaurante_id !== restauranteId) return;

              if (fila.estado === 'lista') {
                if (comandaIdsRef.current.has(fila.id)) {
                  setCola((c) => ({
                    ...c,
                    comandasListas: c.comandasListas.map((cm) =>
                      cm.id === fila.id
                        ? { ...cm, meseroAtendiendoId: fila.mesero_atendiendo_id }
                        : cm,
                    ),
                  }));
                  return;
                }
                comandaIdsRef.current.add(fila.id);
                const completa = await traerComandaCompleta(fila.id);
                if (completa) {
                  setCola((c) => ({
                    ...c,
                    comandasListas: [...c.comandasListas, completa],
                  }));
                  reproducir('comanda');
                }
                return;
              }

              if (fila.estado === 'entregada' || fila.estado === 'cancelada') {
                comandaIdsRef.current.delete(fila.id);
                setCola((c) => ({
                  ...c,
                  comandasListas: c.comandasListas.filter((cm) => cm.id !== fila.id),
                }));
              }
            }
          },
        );

      if (cancelado) {
        supabase.removeChannel(canal);
        return;
      }

      canalActual = canal;
      canal.subscribe();
    }

    setupRealtime();

    return () => {
      cancelado = true;
      if (canalActual) {
        supabase.removeChannel(canalActual);
        canalActual = null;
      }
    };
  }, [restauranteId]);

  const total =
    cola.llamados.length + cola.comandasListas.length + cola.pagos.length;

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-paper)' }}
    >
      <Header
        perfilNombre={perfilNombre}
        restauranteNombre={restauranteNombre}
        colorMarca={colorMarca}
        totalItems={total}
      />

      <div className="flex-1 px-5 lg:px-8 py-6 max-w-[1400px] mx-auto w-full">
        {total === 0 ? (
          <EstadoVacio colorMarca={colorMarca} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <SeccionLlamados
              llamados={cola.llamados}
              colorMarca={colorMarca}
              perfilId={perfilId}
            />
            <SeccionComandasListas
              comandas={cola.comandasListas}
              colorMarca={colorMarca}
              perfilId={perfilId}
            />
            <SeccionPagos
              pagos={cola.pagos}
              colorMarca={colorMarca}
              perfilId={perfilId}
            />
          </div>
        )}
      </div>
    </main>
  );
}

async function traerLlamadoCompleto(llamadoId: string): Promise<LlamadoMesero | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('llamados_mesero')
    .select(
      `
      id, motivo, creado_en, mesero_atendiendo_id, nota,
      sesiones (mesas (numero))
    `,
    )
    .eq('id', llamadoId)
    .maybeSingle();

  if (!data) return null;
  const sesion = Array.isArray(data.sesiones) ? data.sesiones[0] : data.sesiones;
  const mesa = sesion ? (Array.isArray(sesion.mesas) ? sesion.mesas[0] : sesion.mesas) : null;

  return {
    id: data.id as string,
    motivo: data.motivo as 'campana' | 'otro',
    creadoEn: data.creado_en as string,
    mesaNumero: (mesa as { numero: string } | null)?.numero ?? '?',
    meseroAtendiendoId: (data.mesero_atendiendo_id as string | null) ?? null,
    nota: (data.nota as string | null) ?? null,
  };
}

async function traerPagoCompleto(llamadoId: string): Promise<PagoMesero | null> {
  const supabase = createClient();
  // Leer también doc_tipo, doc_numero, doc_nombre, forma_pago_preferida
  // (datos opcionales que el cliente pasó al pedir cuenta) para mostrarlos en
  // el modal de cobrar.
  const { data: llamado } = await supabase
    .from('llamados_mesero')
    .select(
      `
      id, creado_en, mesero_atendiendo_id, sesion_id,
      doc_tipo, doc_numero, doc_nombre, forma_pago_preferida,
      sesiones (mesas (numero))
    `,
    )
    .eq('id', llamadoId)
    .maybeSingle();

  if (!llamado) return null;

  const { data: comandas } = await supabase
    .from('comandas')
    .select('id, total')
    .eq('sesion_id', llamado.sesion_id as string)
    .neq('estado', 'cancelada');

  const totalAcumulado = (comandas ?? []).reduce(
    (acc, c) => acc + (c.total as number),
    0,
  );

  const sesion = Array.isArray(llamado.sesiones) ? llamado.sesiones[0] : llamado.sesiones;
  const mesa = sesion ? (Array.isArray(sesion.mesas) ? sesion.mesas[0] : sesion.mesas) : null;

  return {
    id: llamado.id as string,
    sesionId: llamado.sesion_id as string,
    creadoEn: llamado.creado_en as string,
    mesaNumero: (mesa as { numero: string } | null)?.numero ?? '?',
    meseroAtendiendoId: (llamado.mesero_atendiendo_id as string | null) ?? null,
    totalAcumulado,
    cantidadComandas: (comandas ?? []).length,
    formaPagoPreferida: (llamado.forma_pago_preferida as string | null) ?? null,
    docTipo: (llamado.doc_tipo as string | null) ?? null,
    docNumero: (llamado.doc_numero as string | null) ?? null,
    docNombre: (llamado.doc_nombre as string | null) ?? null,
  };
}

async function traerComandaCompleta(comandaId: string): Promise<ComandaListaMesero | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('comandas')
    .select(
      `
      id, numero_diario, total, creada_en, mesero_atendiendo_id,
      sesion_clientes (nombre),
      sesiones (mesas (numero))
    `,
    )
    .eq('id', comandaId)
    .maybeSingle();

  if (!data) return null;

  const { data: items } = await supabase
    .from('comanda_items')
    .select('id, nombre_snapshot, cantidad, nota')
    .eq('comanda_id', comandaId)
    .order('id', { ascending: true });

  const sc = Array.isArray(data.sesion_clientes) ? data.sesion_clientes[0] : data.sesion_clientes;
  const sesion = Array.isArray(data.sesiones) ? data.sesiones[0] : data.sesiones;
  const mesa = sesion ? (Array.isArray(sesion.mesas) ? sesion.mesas[0] : sesion.mesas) : null;

  return {
    id: data.id as string,
    numeroDiario: data.numero_diario as number,
    total: data.total as number,
    creadaEn: data.creada_en as string,
    clienteNombre: (sc as { nombre: string } | null)?.nombre ?? 'Cliente',
    mesaNumero: (mesa as { numero: string } | null)?.numero ?? '?',
    meseroAtendiendoId: (data.mesero_atendiendo_id as string | null) ?? null,
    items: (items ?? []).map((it) => ({
      id: it.id as string,
      nombre: it.nombre_snapshot as string,
      cantidad: it.cantidad as number,
      nota: (it.nota as string) ?? null,
    })),
  };
}

function Header({
  perfilNombre,
  restauranteNombre,
  colorMarca,
  totalItems,
}: {
  perfilNombre: string;
  restauranteNombre: string;
  colorMarca: string;
  totalItems: number;
}) {
  const [sonidoOn, setSonidoOn] = useState<boolean | null>(null);

  useEffect(() => {
    setSonidoOn(estaSonidoActivo());
  }, []);

  function toggleSonido() {
    desbloquearAudio();
    const nuevo = alternarSonido();
    setSonidoOn(nuevo);
    if (nuevo) reproducir('llamado');
  }

  return (
    <header
      className="sticky top-0 z-20 px-5 lg:px-8 py-3 border-b backdrop-blur-sm"
      style={{
        borderColor: 'var(--color-border)',
        background: 'rgba(250, 246, 241, 0.92)',
      }}
    >
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="size-10 rounded-full grid place-items-center shrink-0"
            style={{ background: colorMarca, color: 'white' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 11h18l-2 9H5l-2-9zM12 7v4M9 7v4M15 7v4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[0.65rem] uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>
              Mesero · {perfilNombre}
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-lg tracking-[-0.015em] truncate" style={{ color: 'var(--color-ink)' }}>
              {restauranteNombre}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: 'var(--color-paper-deep)' }}
          >
            <span className="size-2 rounded-full animate-pulse" style={{ background: colorMarca }} />
            <span className="text-xs" style={{ color: 'var(--color-ink-soft)' }}>
              {totalItems} pendiente{totalItems === 1 ? '' : 's'}
            </span>
          </div>

          {sonidoOn !== null ? (
            <button
              type="button"
              onClick={toggleSonido}
              aria-label={sonidoOn ? 'Apagar sonido' : 'Activar sonido'}
              className="size-9 rounded-full grid place-items-center transition-colors hover:opacity-80"
              style={{
                background: sonidoOn ? colorMarca : 'var(--color-paper-deep)',
                color: sonidoOn ? 'white' : 'var(--color-muted)',
              }}
            >
              {sonidoOn ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.89 17.89 0 0 1 18 8M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.33-5M1 1l22 22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ) : null}

          <form action={cerrarSesion}>
            <button type="submit" className="text-xs underline shrink-0" style={{ color: 'var(--color-muted)' }}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function SeccionLlamados({
  llamados,
  colorMarca,
  perfilId,
}: {
  llamados: LlamadoMesero[];
  colorMarca: string;
  perfilId: string;
}) {
  return (
    <section>
      <CabeceraSeccion
        titulo="🛎 Llamados"
        descripcion="Clientes que necesitan algo"
        count={llamados.length}
        bgColor="#fef3c7"
        fgColor="#92400e"
      />
      {llamados.length === 0 ? (
        <SeccionVacia mensaje="Sin llamados ahora" borderColor="#fde68a" />
      ) : (
        <ul className="space-y-3">
          {llamados.map((l) => (
            <li key={l.id}>
              <CardLlamado llamado={l} colorMarca={colorMarca} perfilId={perfilId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionComandasListas({
  comandas,
  colorMarca,
  perfilId,
}: {
  comandas: ComandaListaMesero[];
  colorMarca: string;
  perfilId: string;
}) {
  return (
    <section>
      <CabeceraSeccion
        titulo="🍽 Listas para entregar"
        descripcion="La cocina ya las terminó"
        count={comandas.length}
        bgColor="#dcfce7"
        fgColor="#166534"
      />
      {comandas.length === 0 ? (
        <SeccionVacia mensaje="Nada listo para entregar" borderColor="#bbf7d0" />
      ) : (
        <ul className="space-y-3">
          {comandas.map((c) => (
            <li key={c.id}>
              <CardComanda comanda={c} colorMarca={colorMarca} perfilId={perfilId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionPagos({
  pagos,
  colorMarca,
  perfilId,
}: {
  pagos: PagoMesero[];
  colorMarca: string;
  perfilId: string;
}) {
  return (
    <section>
      <CabeceraSeccion
        titulo="💵 Pagos pendientes"
        descripcion="Mesas pidiendo la cuenta"
        count={pagos.length}
        bgColor="var(--color-paper-deep)"
        fgColor="var(--color-ink-soft)"
      />
      {pagos.length === 0 ? (
        <SeccionVacia mensaje="Nadie pidió la cuenta" borderColor="var(--color-border)" />
      ) : (
        <ul className="space-y-3">
          {pagos.map((p) => (
            <li key={p.id}>
              <CardPago pago={p} colorMarca={colorMarca} perfilId={perfilId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CabeceraSeccion({
  titulo,
  descripcion,
  count,
  bgColor,
  fgColor,
}: {
  titulo: string;
  descripcion: string;
  count: number;
  bgColor: string;
  fgColor: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.015em]" style={{ color: 'var(--color-ink)' }}>
          {titulo}
        </h2>
        <p className="text-[0.7rem] mt-0.5" style={{ color: 'var(--color-muted)' }}>
          {descripcion}
        </p>
      </div>
      <span
        className="text-xs uppercase tracking-[0.1em] px-2.5 py-1 rounded-full font-medium shrink-0"
        style={{ background: bgColor, color: fgColor }}
      >
        {count}
      </span>
    </div>
  );
}

function CardLlamado({
  llamado,
  colorMarca,
  perfilId,
}: {
  llamado: LlamadoMesero;
  colorMarca: string;
  perfilId: string;
}) {
  const esMio = llamado.meseroAtendiendoId === perfilId;
  const esDeOtro = llamado.meseroAtendiendoId !== null && llamado.meseroAtendiendoId !== perfilId;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function tomar() {
    setError(null);
    desbloquearAudio();
    startTransition(async () => {
      const r = await tomarLlamado({ llamadoId: llamado.id });
      if (!r.ok) setError(r.error);
    });
  }
  function liberar() {
    setError(null);
    startTransition(async () => {
      const r = await liberarLlamado({ llamadoId: llamado.id });
      if (!r.ok) setError(r.error);
    });
  }
  function atender() {
    setError(null);
    startTransition(async () => {
      const r = await atenderLlamado({ llamadoId: llamado.id });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <CardBase esMio={esMio} esDeOtro={esDeOtro} colorMarca={colorMarca} pending={pending}>
      <header className="px-4 py-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-paper-deep)', color: 'var(--color-ink-soft)' }}>
          Mesa {llamado.mesaNumero}
        </span>
        <TiempoTranscurrido fecha={llamado.creadoEn} />
      </header>

      <div className="px-4 py-3">
        <p className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
          {llamado.motivo === 'campana' ? 'Necesita ayuda' : 'Llamado del cliente'}
        </p>
        {llamado.nota ? (
          <div
            className="mt-2 rounded-[var(--radius-md)] border px-3 py-2"
            style={{ borderColor: '#fde68a', background: '#fefce8' }}
          >
            <p
              className="text-[0.65rem] uppercase tracking-[0.12em] mb-0.5"
              style={{ color: '#92400e' }}
            >
              💬 El cliente dice
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--color-ink)' }}
            >
              «{llamado.nota}»
            </p>
          </div>
        ) : null}
        {esMio ? (
          <p className="text-[0.7rem] mt-2 italic" style={{ color: colorMarca }}>
            Estás atendiendo este llamado
          </p>
        ) : esDeOtro ? (
          <p className="text-[0.7rem] mt-2 italic" style={{ color: 'var(--color-muted)' }}>
            Otro mesero está atendiendo
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-[0.7rem]" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : null}
      </div>

      <FooterAcciones
        esMio={esMio}
        esDeOtro={esDeOtro}
        colorMarca={colorMarca}
        pending={pending}
        onTomar={tomar}
        onLiberar={liberar}
        onAccionPrimaria={atender}
        textoAccionPrimaria="Atendido"
      />
    </CardBase>
  );
}

function CardComanda({
  comanda,
  colorMarca,
  perfilId,
}: {
  comanda: ComandaListaMesero;
  colorMarca: string;
  perfilId: string;
}) {
  const esMio = comanda.meseroAtendiendoId === perfilId;
  const esDeOtro = comanda.meseroAtendiendoId !== null && comanda.meseroAtendiendoId !== perfilId;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function tomar() {
    setError(null);
    desbloquearAudio();
    startTransition(async () => {
      const r = await tomarComanda({ comandaId: comanda.id });
      if (!r.ok) setError(r.error);
    });
  }
  function liberar() {
    setError(null);
    startTransition(async () => {
      const r = await liberarComanda({ comandaId: comanda.id });
      if (!r.ok) setError(r.error);
    });
  }
  function entregar() {
    setError(null);
    startTransition(async () => {
      const r = await entregarComanda({ comandaId: comanda.id });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <CardBase esMio={esMio} esDeOtro={esDeOtro} colorMarca={colorMarca} pending={pending}>
      <header className="px-4 py-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-[family-name:var(--font-display)] text-base tabular-nums" style={{ color: 'var(--color-ink)' }}>
            #{comanda.numeroDiario.toString().padStart(3, '0')}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-paper-deep)', color: 'var(--color-ink-soft)' }}>
            Mesa {comanda.mesaNumero}
          </span>
        </div>
        <TiempoTranscurrido fecha={comanda.creadaEn} />
      </header>

      <div className="px-4 py-3">
        <p className="text-[0.7rem] uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-muted)' }}>
          {comanda.clienteNombre}
        </p>
        <ul className="space-y-1.5">
          {comanda.items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-[family-name:var(--font-display)] text-base tabular-nums shrink-0" style={{ color: colorMarca }}>
                  {item.cantidad}×
                </span>
                <span style={{ color: 'var(--color-ink)' }}>{item.nombre}</span>
              </div>
              {item.nota ? (
                <p className="text-xs mt-0.5 ml-7 italic" style={{ color: 'var(--color-ink-soft)' }}>
                  «{item.nota}»
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {esMio ? (
          <p className="text-[0.7rem] mt-2 italic" style={{ color: colorMarca }}>
            Estás llevando este pedido
          </p>
        ) : esDeOtro ? (
          <p className="text-[0.7rem] mt-2 italic" style={{ color: 'var(--color-muted)' }}>
            Otro mesero lo está llevando
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-[0.7rem]" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : null}
      </div>

      <FooterAcciones
        esMio={esMio}
        esDeOtro={esDeOtro}
        colorMarca={colorMarca}
        pending={pending}
        onTomar={tomar}
        onLiberar={liberar}
        onAccionPrimaria={entregar}
        textoAccionPrimaria="Entregar"
        infoExtra={`$${comanda.total.toLocaleString('es-CO')}`}
      />
    </CardBase>
  );
}

function CardPago({
  pago,
  colorMarca,
  perfilId,
}: {
  pago: PagoMesero;
  colorMarca: string;
  perfilId: string;
}) {
  const esMio = pago.meseroAtendiendoId === perfilId;
  const esDeOtro = pago.meseroAtendiendoId !== null && pago.meseroAtendiendoId !== perfilId;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  function tomar() {
    setError(null);
    desbloquearAudio();
    startTransition(async () => {
      const r = await tomarPago({ llamadoId: pago.id });
      if (!r.ok) setError(r.error);
    });
  }
  function liberar() {
    setError(null);
    startTransition(async () => {
      const r = await liberarPago({ llamadoId: pago.id });
      if (!r.ok) setError(r.error);
    });
  }
  function abrirModal() {
    setError(null);
    setModalAbierto(true);
  }

  const tieneFactura = !!pago.docNumero;
  const ETIQUETAS_PAGO: Record<string, { label: string; bg: string; fg: string }> = {
    efectivo: { label: '💵 Efectivo', bg: '#dcfce7', fg: '#166534' },
    tarjeta: { label: '💳 Tarjeta', bg: '#dbeafe', fg: '#1e40af' },
    transferencia: { label: '📱 Transferencia', bg: '#ede9fe', fg: '#5b21b6' },
    no_seguro: { label: '❓ Aún no decide', bg: '#fef3c7', fg: '#92400e' },
  };
  const formaPago = pago.formaPagoPreferida
    ? ETIQUETAS_PAGO[pago.formaPagoPreferida]
    : null;

  return (
    <>
      <CardBase esMio={esMio} esDeOtro={esDeOtro} colorMarca={colorMarca} pending={pending}>
        <header className="px-4 py-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-paper-deep)', color: 'var(--color-ink-soft)' }}>
              Mesa {pago.mesaNumero}
            </span>
            <span className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
              {pago.cantidadComandas} pedido{pago.cantidadComandas === 1 ? '' : 's'}
            </span>
            {formaPago ? (
              <span
                className="text-[0.65rem] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded font-medium"
                style={{ background: formaPago.bg, color: formaPago.fg }}
              >
                {formaPago.label}
              </span>
            ) : null}
            {tieneFactura ? (
              <span
                className="text-[0.65rem] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded font-medium"
                style={{ background: '#dbeafe', color: '#1e40af' }}
              >
                Pide factura
              </span>
            ) : null}
          </div>
          <TiempoTranscurrido fecha={pago.creadoEn} />
        </header>

        <div className="px-4 py-3">
          <p className="text-[0.7rem] uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>
            Total acumulado
          </p>
          <p className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.02em]" style={{ color: 'var(--color-ink)' }}>
            ${pago.totalAcumulado.toLocaleString('es-CO')}
          </p>
          {esMio ? (
            <p className="text-[0.7rem] mt-2 italic" style={{ color: colorMarca }}>
              Estás cobrando esta mesa
            </p>
          ) : esDeOtro ? (
            <p className="text-[0.7rem] mt-2 italic" style={{ color: 'var(--color-muted)' }}>
              Otro mesero está cobrando
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-[0.7rem]" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          ) : null}
        </div>

        <FooterAcciones
          esMio={esMio}
          esDeOtro={esDeOtro}
          colorMarca={colorMarca}
          pending={pending}
          onTomar={tomar}
          onLiberar={liberar}
          onAccionPrimaria={abrirModal}
          textoAccionPrimaria="Cobrar"
        />
      </CardBase>

      {modalAbierto ? (
        <ModalCobrar
          pago={pago}
          colorMarca={colorMarca}
          onCerrar={() => setModalAbierto(false)}
        />
      ) : null}
    </>
  );
}

function ModalCobrar({
  pago,
  colorMarca,
  onCerrar,
}: {
  pago: PagoMesero;
  colorMarca: string;
  onCerrar: () => void;
}) {
  const [conPropina, setConPropina] = useState(true);
  const [metodo, setMetodo] = useState<FormaPagoBackend>('efectivo');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const propina = conPropina ? Math.round(pago.totalAcumulado * 0.1) : 0;
  const total = pago.totalAcumulado + propina;

  const tieneFactura = !!pago.docNumero;

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const r = await confirmarPago({
        llamadoId: pago.id,
        metodoConfirmado: metodo,
        conPropina,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4 py-8"
      style={{ background: 'rgba(26, 24, 20, 0.6)' }}
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-md rounded-[var(--radius-lg)] bg-white overflow-hidden"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-[0.65rem] uppercase tracking-[0.14em]" style={{ color: 'var(--color-muted)' }}>
            Cobrar Mesa {pago.mesaNumero}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.02em] mt-1" style={{ color: 'var(--color-ink)' }}>
            Confirmar pago
          </h2>
        </header>

        <div className="px-5 py-4 space-y-4">
          {tieneFactura ? (
            <div
              className="rounded-[var(--radius-md)] border p-4"
              style={{
                borderColor: '#3b82f6',
                background: '#eff6ff',
              }}
            >
              <p
                className="text-[0.65rem] uppercase tracking-[0.14em] mb-2"
                style={{ color: '#1e40af' }}
              >
                ⚠️ El cliente pidió factura
              </p>
              <dl className="space-y-1 text-sm">
                <div className="flex items-baseline gap-2">
                  <dt
                    className="text-[0.7rem] uppercase tracking-[0.1em] w-20 shrink-0"
                    style={{ color: '#1e40af' }}
                  >
                    Tipo
                  </dt>
                  <dd className="font-[family-name:var(--font-mono)]" style={{ color: 'var(--color-ink)' }}>
                    {pago.docTipo}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt
                    className="text-[0.7rem] uppercase tracking-[0.1em] w-20 shrink-0"
                    style={{ color: '#1e40af' }}
                  >
                    Número
                  </dt>
                  <dd className="font-[family-name:var(--font-mono)] select-all" style={{ color: 'var(--color-ink)' }}>
                    {pago.docNumero}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt
                    className="text-[0.7rem] uppercase tracking-[0.1em] w-20 shrink-0"
                    style={{ color: '#1e40af' }}
                  >
                    Nombre
                  </dt>
                  <dd className="select-all" style={{ color: 'var(--color-ink)' }}>
                    {pago.docNombre}
                  </dd>
                </div>
              </dl>
              <p
                className="text-[0.65rem] mt-2 leading-relaxed"
                style={{ color: '#1e40af' }}
              >
                Estos datos quedan guardados con el pago para la facturación.
              </p>
            </div>
          ) : null}

          <div className="rounded-[var(--radius-md)] border p-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--color-ink-soft)' }}>Subtotal</span>
              <span className="font-[family-name:var(--font-mono)]" style={{ color: 'var(--color-ink)' }}>
                ${pago.totalAcumulado.toLocaleString('es-CO')}
              </span>
            </div>
            <label className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none">
              <span className="text-sm" style={{ color: 'var(--color-ink-soft)' }}>
                Propina (10%)
              </span>
              <div className="flex items-center gap-2">
                {conPropina ? (
                  <span className="text-sm font-[family-name:var(--font-mono)]" style={{ color: 'var(--color-ink)' }}>
                    ${propina.toLocaleString('es-CO')}
                  </span>
                ) : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={conPropina}
                  onClick={() => setConPropina((v) => !v)}
                  className="relative h-6 w-11 rounded-full transition-colors"
                  style={{
                    background: conPropina ? colorMarca : 'var(--color-paper-deep)',
                    border: `1px solid ${conPropina ? colorMarca : 'var(--color-border-strong)'}`,
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: conPropina ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            </label>
            <div className="border-t pt-3 mt-2 flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-base font-medium" style={{ color: 'var(--color-ink)' }}>
                Total
              </span>
              <span className="font-[family-name:var(--font-display)] text-2xl" style={{ color: 'var(--color-ink)' }}>
                ${total.toLocaleString('es-CO')}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--color-muted)' }}>
              Método de pago
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'efectivo', l: 'Efectivo' },
                { v: 'tarjeta', l: 'Tarjeta' },
                { v: 'transferencia', l: 'Transferencia' },
                { v: 'no_seguro', l: 'Otro' },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setMetodo(opt.v)}
                  className="h-10 rounded-[var(--radius-md)] border text-sm transition-colors"
                  style={{
                    borderColor: metodo === opt.v ? colorMarca : 'var(--color-border-strong)',
                    borderWidth: metodo === opt.v ? 1.5 : 1,
                    background: metodo === opt.v ? 'var(--color-paper)' : 'white',
                    color: metodo === opt.v ? colorMarca : 'var(--color-ink)',
                  }}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-center" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          ) : null}

          <p className="text-[0.7rem] text-center px-2" style={{ color: 'var(--color-muted)' }}>
            Al confirmar, la mesa se cierra y todas las comandas pendientes
            se marcan como entregadas.
          </p>
        </div>

        <footer className="px-5 py-4 border-t flex items-center gap-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pending}
            className="flex-1 h-11 rounded-[var(--radius-md)] text-sm border"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
              background: 'white',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={pending}
            className="flex-1 h-11 rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
            style={{ background: colorMarca, color: 'white' }}
          >
            {pending ? 'Cobrando…' : 'Confirmar y cerrar'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CardBase({
  children,
  esMio,
  esDeOtro,
  colorMarca,
  pending,
}: {
  children: React.ReactNode;
  esMio: boolean;
  esDeOtro: boolean;
  colorMarca: string;
  pending: boolean;
}) {
  return (
    <article
      className="rounded-[var(--radius-lg)] border bg-white overflow-hidden transition-shadow"
      style={{
        borderColor: esMio ? colorMarca : 'var(--color-border)',
        borderWidth: esMio ? 1.5 : 1,
        opacity: esDeOtro ? 0.65 : pending ? 0.6 : 1,
      }}
    >
      {children}
    </article>
  );
}

function FooterAcciones({
  esMio,
  esDeOtro,
  colorMarca,
  pending,
  onTomar,
  onLiberar,
  onAccionPrimaria,
  textoAccionPrimaria,
  infoExtra,
}: {
  esMio: boolean;
  esDeOtro: boolean;
  colorMarca: string;
  pending: boolean;
  onTomar: () => void;
  onLiberar: () => void;
  onAccionPrimaria: () => void;
  textoAccionPrimaria: string;
  infoExtra?: string;
}) {
  return (
    <footer
      className="px-4 py-2.5 border-t flex items-center justify-between gap-3"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-paper)',
      }}
    >
      {infoExtra ? (
        <span className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
          {infoExtra}
        </span>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        {esMio ? (
          <>
            <button
              type="button"
              onClick={onLiberar}
              disabled={pending}
              className="text-xs underline disabled:opacity-50"
              style={{ color: 'var(--color-muted)' }}
            >
              Liberar
            </button>
            <button
              type="button"
              onClick={onAccionPrimaria}
              disabled={pending}
              className="text-xs font-medium disabled:opacity-50"
              style={{ color: colorMarca }}
            >
              {pending ? 'Procesando…' : `${textoAccionPrimaria} →`}
            </button>
          </>
        ) : esDeOtro ? (
          <span className="text-xs italic" style={{ color: 'var(--color-muted)' }}>
            En atención
          </span>
        ) : (
          <button
            type="button"
            onClick={onTomar}
            disabled={pending}
            className="text-xs font-medium disabled:opacity-50"
            style={{ color: colorMarca }}
          >
            {pending ? 'Tomando…' : 'Tomar →'}
          </button>
        )}
      </div>
    </footer>
  );
}

function SeccionVacia({
  mensaje,
  borderColor,
}: {
  mensaje: string;
  borderColor: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border-2 border-dashed py-10 px-4 text-center"
      style={{ borderColor }}
    >
      <p className="text-xs italic" style={{ color: 'var(--color-muted)' }}>
        {mensaje}
      </p>
    </div>
  );
}

function TiempoTranscurrido({ fecha }: { fecha: string }) {
  const [texto, setTexto] = useState<string>(() => formatearTiempo(fecha));

  useEffect(() => {
    const interval = setInterval(() => {
      setTexto(formatearTiempo(fecha));
    }, 30_000);
    return () => clearInterval(interval);
  }, [fecha]);

  return (
    <span
      className="text-[0.7rem] tabular-nums"
      style={{ color: 'var(--color-muted)' }}
    >
      {texto}
    </span>
  );
}

function formatearTiempo(fecha: string): string {
  const ahora = Date.now();
  const desde = new Date(fecha).getTime();
  const minutos = Math.floor((ahora - desde) / 60_000);

  if (minutos < 1) return 'recién';
  if (minutos === 1) return 'hace 1 min';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas === 1) return 'hace 1 h';
  return `hace ${horas} h`;
}

function EstadoVacio({ colorMarca }: { colorMarca: string }) {
  return (
    <div className="text-center py-20 max-w-md mx-auto">
      <div
        className="size-16 rounded-full grid place-items-center mx-auto mb-6"
        style={{ background: colorMarca, color: 'white' }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2
        className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
        style={{ color: 'var(--color-ink)' }}
      >
        Todo bajo control.
      </h2>
      <p
        className="text-sm leading-relaxed"
        style={{ color: 'var(--color-ink-soft)' }}
      >
        Sin llamados, comandas listas, o pagos pendientes. Cuando llegue algo,
        sonará un aviso y aparecerá aquí.
      </p>
    </div>
  );
}
