'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@mesaya/database/client';

export type ComandaConItems = {
  id: string;
  numero_diario: number;
  estado: string;
  total: number;
  creada_en: string;
  mesero_atendiendo_nombre: string | null;
  motivo_cancelacion: string | null;
  items: {
    id: string;
    nombre_snapshot: string;
    precio_snapshot: number;
    cantidad: number;
    nota: string | null;
  }[];
};

type EstadoTono = 'pending' | 'progress' | 'done';

const ETIQUETAS_ESTADO: Record<
  string,
  { label: string; tono: EstadoTono }
> = {
  pendiente: { label: 'En cola', tono: 'pending' },
  en_preparacion: { label: 'En preparación', tono: 'progress' },
  lista: { label: 'Lista', tono: 'progress' },
  entregada: { label: 'Entregada', tono: 'done' },
  cancelada: { label: 'Cancelada', tono: 'done' },
};

export function ComandaEnviadaCliente({
  qrToken,
  sesionId,
  mesaNumero,
  nombreNegocio,
  colorMarca,
  nombreCliente,
  comandaActualId,
  comandasIniciales,
}: {
  qrToken: string;
  sesionId: string;
  mesaNumero: string;
  nombreNegocio: string;
  colorMarca: string;
  nombreCliente: string;
  comandaActualId: string;
  comandasIniciales: ComandaConItems[];
}) {
  const router = useRouter();
  const [comandas, setComandas] = useState<ComandaConItems[]>(comandasIniciales);
  const idsRef = useRef<Set<string>>(new Set(comandasIniciales.map((c) => c.id)));
  // Modal de "tu pedido fue cancelado" cuando es la única comanda de la sesión
  // del cliente y se cancela. Si había otras (es una adición), no aparece.
  const [modalCancelacion, setModalCancelacion] = useState<{
    motivo: string;
  } | null>(null);

  useEffect(() => {
    setComandas(comandasIniciales);
    idsRef.current = new Set(comandasIniciales.map((c) => c.id));
  }, [comandasIniciales]);

  /**
   * Realtime cliente: nos suscribimos a UPDATEs de comandas (cambios de estado
   * y mesero_atendiendo_nombre) y a INSERTs en pagos (para redirigir a
   * pantalla de gracias cuando el mesero confirma el pago).
   */
  useEffect(() => {
    const supabase = createClient();
    const canalNombre = `cliente-comanda-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let canalActual: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;

    async function setup() {
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
          { event: 'UPDATE', schema: 'public', table: 'comandas' },
          (payload) => {
            const fila = payload.new as {
              id: string;
              sesion_id: string;
              estado: string;
              mesero_atendiendo_nombre: string | null;
              motivo_cancelacion: string | null;
            };
            if (fila.sesion_id !== sesionId) return;
            if (!idsRef.current.has(fila.id)) return;

            setComandas((cs) => {
              const actualizadas = cs.map((c) =>
                c.id === fila.id
                  ? {
                      ...c,
                      estado: fila.estado,
                      mesero_atendiendo_nombre: fila.mesero_atendiendo_nombre,
                      motivo_cancelacion: fila.motivo_cancelacion,
                    }
                  : c,
              );

              // Si la comanda actual (la que el cliente está viendo) fue
              // cancelada Y NO existen otras comandas no-canceladas en su
              // sesión, mostrar modal grande para que vuelva al menú o salga.
              if (
                fila.id === comandaActualId &&
                fila.estado === 'cancelada'
              ) {
                const tieneOtrasActivas = actualizadas.some(
                  (c) => c.id !== fila.id && c.estado !== 'cancelada',
                );
                if (!tieneOtrasActivas) {
                  setModalCancelacion({
                    motivo:
                      fila.motivo_cancelacion ?? 'La cocina canceló tu pedido.',
                  });
                }
              }

              return actualizadas;
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pagos' },
          (payload) => {
            const fila = payload.new as {
              sesion_id: string;
              estado: string;
            };
            if (fila.sesion_id !== sesionId) return;
            if (fila.estado === 'confirmado') {
              router.push(`/m/${qrToken}/gracias?sesion=${sesionId}`);
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

    setup();

    return () => {
      cancelado = true;
      if (canalActual) {
        supabase.removeChannel(canalActual);
        canalActual = null;
      }
    };
  }, [qrToken, sesionId, router]);

  // Total acumulado solo cuenta comandas NO canceladas. Si la cocina cancela
  // un pedido, no debe sumar al monto que el cliente debe pagar.
  const totalAcumulado = comandas
    .filter((c) => c.estado !== 'cancelada')
    .reduce((acc, c) => acc + c.total, 0);
  const cantidadActivas = comandas.filter((c) => c.estado !== 'cancelada').length;
  // Solo permitimos pedir la cuenta cuando TODAS las comandas no canceladas
  // están en estado 'entregada'. Si hay alguna en pendiente/preparando/lista,
  // el botón se deshabilita con un mensaje explicativo. Esto evita que el
  // cliente pague antes de recibir su pedido completo.
  const todasEntregadas =
    cantidadActivas > 0 &&
    comandas
      .filter((c) => c.estado !== 'cancelada')
      .every((c) => c.estado === 'entregada');
  const ultimaComanda =
    comandas.find((c) => c.id === comandaActualId) ??
    comandas[comandas.length - 1]!;

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="flex-1 px-5 py-10 max-w-md mx-auto w-full">
        <div
          className="rounded-[var(--radius-lg)] p-5 mb-6 flex items-center gap-4"
          style={{ background: colorMarca, color: 'white' }}
        >
          <div
            className="size-12 rounded-full grid place-items-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <polyline
                points="5 12 10 17 19 8"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] opacity-80">
              Pedido #{ultimaComanda.numero_diario.toString().padStart(3, '0')}{' '}
              en cocina
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.015em] mt-0.5">
              ¡Listo, {nombreCliente}!
            </h1>
          </div>
        </div>

        <p
          className="text-xs text-center mb-6"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Mesa {mesaNumero} · {nombreNegocio}
        </p>

        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-4"
          style={{ color: 'var(--color-ink)' }}
        >
          Tu cuenta hasta ahora
        </h2>

        <div className="space-y-3 mb-5">
          {comandas.map((c) => (
            <ComandaCard
              key={c.id}
              comanda={c}
              esLaUltima={c.id === comandaActualId}
              colorMarca={colorMarca}
            />
          ))}
        </div>

        <section
          className="rounded-[var(--radius-lg)] border bg-white px-5 py-4 mb-6"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-xs uppercase tracking-[0.14em]"
                style={{ color: 'var(--color-muted)' }}
              >
                Total acumulado
              </p>
              <p
                className="text-[0.7rem] mt-0.5"
                style={{ color: 'var(--color-muted)' }}
              >
                {cantidadActivas} pedido{cantidadActivas === 1 ? '' : 's'}
                {comandas.length > cantidadActivas
                  ? ` · ${comandas.length - cantidadActivas} cancelado${comandas.length - cantidadActivas === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
            <span
              className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em]"
              style={{ color: 'var(--color-ink)' }}
            >
              ${totalAcumulado.toLocaleString('es-CO')}
            </span>
          </div>
        </section>

        <p
          className="text-[0.7rem] text-center mb-8 leading-relaxed px-2"
          style={{ color: 'var(--color-muted)' }}
        >
          La cocina ya recibió tu pedido. Cuando quieras, pide la cuenta y el
          mesero se acercará a tu mesa.
        </p>

        <div className="space-y-2">
          <Link
            href={`/m/${qrToken}/menu`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium"
            style={{ background: colorMarca, color: 'white' }}
          >
            Agregar más al pedido
          </Link>
          <Link
            href={`/m/${qrToken}/llamar-mesero`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium border"
            style={{
              background: 'white',
              color: 'var(--color-ink)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Llamar al mesero
          </Link>
          {todasEntregadas ? (
            <Link
              href={`/m/${qrToken}/pedir-cuenta`}
              className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium border"
              style={{
                background: 'white',
                color: 'var(--color-ink)',
                borderColor: 'var(--color-border-strong)',
              }}
            >
              Pedir la cuenta
            </Link>
          ) : (
            <div
              className="w-full rounded-[var(--radius-md)] border-2 border-dashed px-3 py-3 text-center"
              style={{ borderColor: 'var(--color-border)' }}
              aria-disabled="true"
            >
              <p
                className="text-[0.7rem] uppercase tracking-[0.12em]"
                style={{ color: 'var(--color-muted)' }}
              >
                Pedir la cuenta · Disponible al recibir
              </p>
              <p
                className="text-xs mt-1 leading-relaxed"
                style={{ color: 'var(--color-ink-soft)' }}
              >
                Espera a que el mesero entregue todos tus pedidos.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="py-6 text-center">
        <p
          className="text-[0.7rem] uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Servido con <span style={{ color: 'var(--color-ink)' }}>MesaYA</span>
        </p>
      </footer>

      {modalCancelacion ? (
        <ModalPedidoCancelado
          motivo={modalCancelacion.motivo}
          qrToken={qrToken}
          colorMarca={colorMarca}
          nombreNegocio={nombreNegocio}
        />
      ) : null}
    </main>
  );
}

function ComandaCard({
  comanda,
  esLaUltima,
  colorMarca,
}: {
  comanda: ComandaConItems;
  esLaUltima: boolean;
  colorMarca: string;
}) {
  const etiqueta = ETIQUETAS_ESTADO[comanda.estado] ?? {
    label: comanda.estado,
    tono: 'pending' as EstadoTono,
  };

  const hora = new Date(comanda.creada_en).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Muestra info del mesero asignado cuando exista (denormalizado en DB).
  const mensajeMesero =
    comanda.estado === 'lista' && comanda.mesero_atendiendo_nombre
      ? `${comanda.mesero_atendiendo_nombre} la trae a tu mesa`
      : comanda.estado === 'entregada' && comanda.mesero_atendiendo_nombre
        ? `Entregada por ${comanda.mesero_atendiendo_nombre}`
        : null;

  // Si fue cancelada por cocina, mostrar motivo prominente.
  const mensajeCancelacion =
    comanda.estado === 'cancelada' && comanda.motivo_cancelacion
      ? comanda.motivo_cancelacion
      : null;

  return (
    <article
      className="rounded-[var(--radius-lg)] border bg-white overflow-hidden"
      style={{
        borderColor: esLaUltima ? colorMarca : 'var(--color-border)',
        borderWidth: esLaUltima ? 1.5 : 1,
      }}
    >
      <header
        className="px-4 py-3 flex items-center justify-between gap-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <p
            className="font-[family-name:var(--font-display)] text-base"
            style={{ color: 'var(--color-ink)' }}
          >
            #{comanda.numero_diario.toString().padStart(3, '0')}
          </p>
          <span className="text-[0.7rem]" style={{ color: 'var(--color-muted)' }}>
            {hora}
          </span>
        </div>
        <EstadoPill etiqueta={etiqueta} />
      </header>

      {mensajeMesero ? (
        <div
          className="px-4 py-2 border-b"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-paper)',
          }}
        >
          <p className="text-[0.7rem]" style={{ color: colorMarca }}>
            ✦ {mensajeMesero}
          </p>
        </div>
      ) : null}

      {mensajeCancelacion ? (
        <div
          className="px-4 py-3 border-b"
          style={{
            borderColor: '#fecaca',
            background: '#fef2f2',
          }}
        >
          <p
            className="text-[0.7rem] uppercase tracking-[0.12em] mb-1"
            style={{ color: '#b91c1c' }}
          >
            ✗ Cancelada por la cocina
          </p>
          <p className="text-sm" style={{ color: '#7f1d1d' }}>
            {mensajeCancelacion}
          </p>
        </div>
      ) : null}

      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {comanda.items.map((item) => {
          const subtotal = item.precio_snapshot * item.cantidad;
          return (
            <li key={item.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--color-ink)' }}>
                    <span style={{ color: 'var(--color-muted)' }}>
                      {item.cantidad}×
                    </span>{' '}
                    {item.nombre_snapshot}
                  </p>
                  {item.nota ? (
                    <p
                      className="text-[0.7rem] mt-0.5 italic"
                      style={{ color: 'var(--color-ink-soft)' }}
                    >
                      {item.nota}
                    </p>
                  ) : null}
                </div>
                <span
                  className="font-[family-name:var(--font-mono)] text-xs shrink-0"
                  style={{ color: 'var(--color-ink-soft)' }}
                >
                  ${subtotal.toLocaleString('es-CO')}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <footer
        className="px-4 py-2.5 flex items-center justify-between border-t"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-paper)',
        }}
      >
        <span
          className="text-xs uppercase tracking-[0.1em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Subtotal
        </span>
        <span
          className="font-[family-name:var(--font-mono)] text-sm"
          style={{ color: 'var(--color-ink)' }}
        >
          ${comanda.total.toLocaleString('es-CO')}
        </span>
      </footer>
    </article>
  );
}

function EstadoPill({
  etiqueta,
}: {
  etiqueta: { label: string; tono: EstadoTono };
}) {
  const estilos: Record<EstadoTono, { bg: string; fg: string }> = {
    pending: { bg: 'var(--color-paper-deep)', fg: 'var(--color-ink-soft)' },
    progress: { bg: '#fef3c7', fg: '#92400e' },
    done: { bg: '#dcfce7', fg: '#166534' },
  };
  const s = estilos[etiqueta.tono];

  return (
    <span
      className="text-[0.65rem] uppercase tracking-[0.1em] px-2 py-1 rounded-full font-medium shrink-0"
      style={{ background: s.bg, color: s.fg }}
    >
      {etiqueta.label}
    </span>
  );
}

function ModalPedidoCancelado({
  motivo,
  qrToken,
  colorMarca,
  nombreNegocio,
}: {
  motivo: string;
  qrToken: string;
  colorMarca: string;
  nombreNegocio: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-6 text-center">
        <div
          className="size-14 rounded-full mx-auto mb-4 grid place-items-center"
          style={{ background: '#fef2f2', color: '#b91c1c' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-2"
          style={{ color: 'var(--color-ink)' }}
        >
          Tu pedido fue cancelado
        </h2>
        <div
          className="rounded-[var(--radius-md)] border px-3 py-2 mb-5 text-left"
          style={{ borderColor: '#fecaca', background: '#fef2f2' }}
        >
          <p className="text-[0.65rem] uppercase tracking-[0.12em] mb-1" style={{ color: '#b91c1c' }}>
            Motivo de la cocina
          </p>
          <p className="text-sm" style={{ color: '#7f1d1d' }}>
            {motivo}
          </p>
        </div>
        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-ink-soft)' }}>
          No se cobró nada. Puedes volver al menú y pedir otra cosa, o salir.
        </p>
        <div className="space-y-2">
          <Link
            href={`/m/${qrToken}/menu`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium"
            style={{ background: colorMarca, color: 'white' }}
          >
            Pedir otra cosa
          </Link>
          <Link
            href={`/m/${qrToken}`}
            className="w-full h-11 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium border"
            style={{
              background: 'white',
              color: 'var(--color-ink)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Salir
          </Link>
        </div>
        <p className="text-[0.7rem] mt-4" style={{ color: 'var(--color-muted)' }}>
          {nombreNegocio} agradece tu paciencia.
        </p>
      </div>
    </div>
  );
}
