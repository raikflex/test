'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@mesaya/database/client';
import {
  actualizarCantidad,
  calcularTotal,
  eliminarItem,
  leerCarrito,
  totalUnidades,
  vaciarCarrito,
  type ItemCarrito,
} from '../../../../../lib/carrito';
import {
  guardarAuthUserId,
  guardarUltimaComandaId,
  leerSesionCliente,
} from '../../../../../lib/cliente-session';
import { enviarComanda } from './actions';

const SEGUNDOS_GRACIA = 30;

type EstadoEnvio =
  | { fase: 'idle' }
  | { fase: 'cuenta-regresiva'; segundosRestantes: number }
  | { fase: 'enviando' }
  | { fase: 'error'; mensaje: string };

export function CarritoCliente({
  qrToken,
  numeroMesa,
  nombreNegocio,
  colorMarca,
}: {
  qrToken: string;
  numeroMesa: string;
  nombreNegocio: string;
  colorMarca: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [envio, setEnvio] = useState<EstadoEnvio>({ fase: 'idle' });
  const cancelarRef = useRef<{ cancelado: boolean; saltarEspera: boolean }>({
    cancelado: false,
    saltarEspera: false,
  });

  useEffect(() => {
    const sesion = leerSesionCliente(qrToken);
    if (!sesion) {
      router.replace(`/m/${qrToken}`);
      return;
    }
    setNombre(sesion.nombre);
    setItems(leerCarrito(qrToken));
    setCargando(false);
  }, [qrToken, router]);

  useEffect(() => {
    if (envio.fase !== 'cuenta-regresiva') return;
    const handler = () => {
      cancelarRef.current.cancelado = true;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [envio.fase]);

  function cambiarCantidad(productoId: string, nuevaCantidad: number) {
    const actualizado = actualizarCantidad(qrToken, productoId, nuevaCantidad);
    setItems(actualizado);
  }

  function quitar(productoId: string) {
    const actualizado = eliminarItem(qrToken, productoId);
    setItems(actualizado);
  }

  async function obtenerAuthUserId(): Promise<string | null> {
    const supabase = createClient();

    const { data: { user: existente } } = await supabase.auth.getUser();
    if (existente) {
      guardarAuthUserId(qrToken, existente.id);
      return existente.id;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) return null;

    guardarAuthUserId(qrToken, data.user.id);
    return data.user.id;
  }

  async function iniciarEnvio() {
    if (items.length === 0 || !nombre) return;

    cancelarRef.current.cancelado = false;
    cancelarRef.current.saltarEspera = false;
    setEnvio({ fase: 'cuenta-regresiva', segundosRestantes: SEGUNDOS_GRACIA });

    for (let s = SEGUNDOS_GRACIA; s > 0; s--) {
      await sleep(1000);
      if (cancelarRef.current.cancelado) {
        setEnvio({ fase: 'idle' });
        return;
      }
      if (cancelarRef.current.saltarEspera) {
        break;
      }
      setEnvio({ fase: 'cuenta-regresiva', segundosRestantes: s - 1 });
    }

    if (cancelarRef.current.cancelado) {
      setEnvio({ fase: 'idle' });
      return;
    }

    setEnvio({ fase: 'enviando' });

    try {
      const authUserId = await obtenerAuthUserId();

      if (!authUserId) {
        setEnvio({
          fase: 'error',
          mensaje: 'No pudimos iniciar tu sesión. Intenta de nuevo.',
        });
        return;
      }

      const resultado = await enviarComanda({
        qrToken,
        authUserId,
        nombreCliente: nombre,
        items: items.map((i) => ({
          productoId: i.productoId,
          cantidad: i.cantidad,
          notas: i.notas,
        })),
      });

      if (!resultado.ok) {
        setEnvio({ fase: 'error', mensaje: resultado.error });
        return;
      }

      vaciarCarrito(qrToken);
      // Guardar la última comanda para que /llamar-mesero y /pedir-cuenta
      // tengan un "Volver" que apunte a la pantalla de confirmación.
      guardarUltimaComandaId(qrToken, resultado.comandaId);
      router.push(`/m/${qrToken}/menu/enviada/${resultado.comandaId}`);
    } catch (err) {
      console.error('[enviarComanda]', err);
      setEnvio({
        fase: 'error',
        mensaje: 'Algo falló. Por favor intenta de nuevo.',
      });
    }
  }

  function cancelarEnvio() {
    cancelarRef.current.cancelado = true;
    setEnvio({ fase: 'idle' });
  }

  function saltarEspera() {
    cancelarRef.current.saltarEspera = true;
  }

  function reintentar() {
    setEnvio({ fase: 'idle' });
  }

  if (cargando) {
    return (
      <main
        className="min-h-screen grid place-items-center"
        style={{ background: 'var(--color-paper)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Cargando…
        </p>
      </main>
    );
  }

  const total = calcularTotal(items);
  const unidades = totalUnidades(items);

  if (envio.fase === 'cuenta-regresiva') {
    return (
      <PantallaCuentaRegresiva
        segundosRestantes={envio.segundosRestantes}
        total={total}
        colorMarca={colorMarca}
        onCancelar={cancelarEnvio}
        onSaltarEspera={saltarEspera}
      />
    );
  }

  if (envio.fase === 'enviando') {
    return <PantallaEnviando colorMarca={colorMarca} />;
  }

  if (envio.fase === 'error') {
    return (
      <PantallaError
        mensaje={envio.mensaje}
        onReintentar={reintentar}
        qrToken={qrToken}
      />
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        background: 'var(--color-paper)',
        paddingBottom: items.length > 0 ? '6rem' : '1rem',
      }}
    >
      <header
        className="sticky top-0 z-10 px-5 py-3 border-b backdrop-blur-sm"
        style={{
          borderColor: 'var(--color-border)',
          background: 'rgba(250, 246, 241, 0.92)',
        }}
      >
        <Link
          href={`/m/${qrToken}/menu`}
          className="inline-flex items-center gap-2 text-sm"
          style={{ color: 'var(--color-ink)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M19 12H5M11 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Volver al menú
        </Link>
      </header>

      <div className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        <div className="mb-6">
          <p
            className="text-[0.65rem] uppercase tracking-[0.14em] mb-1"
            style={{ color: 'var(--color-muted)' }}
          >
            Mesa {numeroMesa} · {nombre}
          </p>
          <h1
            className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] leading-[1.1]"
            style={{ color: 'var(--color-ink)' }}
          >
            Tu pedido
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-ink-soft)' }}>
            {nombreNegocio}
          </p>
        </div>

        {items.length === 0 ? (
          <EstadoVacio qrToken={qrToken} colorMarca={colorMarca} />
        ) : (
          <>
            <ul
              className="rounded-[var(--radius-lg)] border bg-white divide-y mb-5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {items.map((item) => (
                <ItemFila
                  key={item.productoId}
                  item={item}
                  onCambiarCantidad={(c) => cambiarCantidad(item.productoId, c)}
                  onEliminar={() => quitar(item.productoId)}
                />
              ))}
            </ul>

            <section
              className="rounded-[var(--radius-lg)] border bg-white p-5 mb-5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-xs uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    Total de este pedido
                  </p>
                  <p
                    className="text-[0.7rem] mt-0.5"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {unidades} producto{unidades === 1 ? '' : 's'}
                  </p>
                </div>
                <span
                  className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em]"
                  style={{ color: 'var(--color-ink)' }}
                >
                  ${total.toLocaleString('es-CO')}
                </span>
              </div>
            </section>

            <p
              className="text-[0.7rem] text-center px-2 leading-relaxed"
              style={{ color: 'var(--color-muted)' }}
            >
              La propina y el pago final se gestionan al pedir la cuenta.
              Por ahora, este pedido pasa a la cocina.
            </p>
          </>
        )}
      </div>

      {items.length > 0 ? (
        <div
          className="sticky bottom-0 left-0 right-0 px-5 py-4 border-t"
          style={{
            borderColor: 'var(--color-border)',
            background: 'rgba(250, 246, 241, 0.96)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <button
            type="button"
            onClick={iniciarEnvio}
            className="w-full max-w-md mx-auto h-12 rounded-[var(--radius-md)] text-base font-medium flex items-center justify-between px-5"
            style={{
              background: colorMarca,
              color: 'white',
            }}
          >
            <span>Enviar a cocina</span>
            <span className="font-[family-name:var(--font-mono)]">
              ${total.toLocaleString('es-CO')}
            </span>
          </button>
        </div>
      ) : null}
    </main>
  );
}

function PantallaCuentaRegresiva({
  segundosRestantes,
  total,
  colorMarca,
  onCancelar,
  onSaltarEspera,
}: {
  segundosRestantes: number;
  total: number;
  colorMarca: string;
  onCancelar: () => void;
  onSaltarEspera: () => void;
}) {
  const progreso = ((SEGUNDOS_GRACIA - segundosRestantes) / SEGUNDOS_GRACIA) * 100;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        <div
          className="size-20 rounded-full grid place-items-center mx-auto mb-6 relative"
          style={{ background: colorMarca, color: 'white' }}
        >
          <span className="font-[family-name:var(--font-display)] text-3xl tabular-nums">
            {segundosRestantes}
          </span>
        </div>

        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Enviando tu pedido…
        </h2>
        <p
          className="text-sm leading-relaxed mb-6"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Si quieres cambiar algo, cancela ahora. En {segundosRestantes} segundo
          {segundosRestantes === 1 ? '' : 's'} pasa a la cocina.
        </p>

        <div
          className="h-2 rounded-full mb-6 overflow-hidden"
          style={{ background: 'var(--color-paper-deep)' }}
        >
          <div
            className="h-full transition-all duration-1000 ease-linear"
            style={{
              width: `${progreso}%`,
              background: colorMarca,
            }}
          />
        </div>

        <p
          className="font-[family-name:var(--font-mono)] text-base mb-8"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Total: ${total.toLocaleString('es-CO')}
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onSaltarEspera}
            className="w-full h-12 rounded-[var(--radius-md)] text-base font-medium"
            style={{
              background: colorMarca,
              color: 'white',
            }}
          >
            Enviar ya
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="w-full h-12 rounded-[var(--radius-md)] text-base font-medium border"
            style={{
              background: 'white',
              color: 'var(--color-ink)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </main>
  );
}

function PantallaEnviando({ colorMarca }: { colorMarca: string }) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        <div
          className="size-16 rounded-full mx-auto mb-6 animate-spin"
          style={{
            border: `4px solid var(--color-paper-deep)`,
            borderTopColor: colorMarca,
          }}
        />
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Enviando a cocina…
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Un momento, estamos avisando.
        </p>
      </div>
    </main>
  );
}

function PantallaError({
  mensaje,
  onReintentar,
  qrToken,
}: {
  mensaje: string;
  onReintentar: () => void;
  qrToken: string;
}) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        <div
          className="size-14 rounded-full grid place-items-center mx-auto mb-5"
          style={{ background: 'var(--color-danger)', color: 'white' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          No pudimos enviar tu pedido.
        </h2>
        <p
          className="text-sm leading-relaxed mb-8"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          {mensaje}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onReintentar}
            className="w-full h-12 rounded-[var(--radius-md)] text-base font-medium"
            style={{
              background: 'var(--color-ink)',
              color: 'var(--color-paper)',
            }}
          >
            Volver a intentar
          </button>
          <Link
            href={`/m/${qrToken}/menu`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Volver al menú
          </Link>
        </div>
      </div>
    </main>
  );
}

function ItemFila({
  item,
  onCambiarCantidad,
  onEliminar,
}: {
  item: ItemCarrito;
  onCambiarCantidad: (n: number) => void;
  onEliminar: () => void;
}) {
  const subtotal = item.precio * item.cantidad;

  return (
    <li className="px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
            {item.nombre}
          </p>
          {item.notas ? (
            <p
              className="text-xs mt-1 italic leading-relaxed"
              style={{ color: 'var(--color-ink-soft)' }}
            >
              {item.notas}
            </p>
          ) : null}
          <p
            className="text-xs mt-1.5 font-[family-name:var(--font-mono)]"
            style={{ color: 'var(--color-muted)' }}
          >
            ${item.precio.toLocaleString('es-CO')} c/u
          </p>
        </div>
        <button
          type="button"
          onClick={onEliminar}
          aria-label={`Eliminar ${item.nombre}`}
          className="size-8 grid place-items-center rounded-[var(--radius-md)] transition-colors shrink-0 -mr-1.5"
          style={{ color: 'var(--color-muted)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCambiarCantidad(item.cantidad - 1)}
            aria-label="Disminuir cantidad"
            className="size-8 grid place-items-center rounded-[var(--radius-md)] border transition-colors"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span
            className="w-9 text-center text-sm font-medium tabular-nums"
            style={{ color: 'var(--color-ink)' }}
            aria-live="polite"
          >
            {item.cantidad}
          </span>
          <button
            type="button"
            onClick={() => onCambiarCantidad(item.cantidad + 1)}
            disabled={item.cantidad >= 99}
            aria-label="Aumentar cantidad"
            className="size-8 grid place-items-center rounded-[var(--radius-md)] border transition-colors disabled:opacity-40"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <span
          className="font-[family-name:var(--font-mono)] text-sm"
          style={{ color: 'var(--color-ink)' }}
        >
          ${subtotal.toLocaleString('es-CO')}
        </span>
      </div>
    </li>
  );
}

function EstadoVacio({
  qrToken,
  colorMarca,
}: {
  qrToken: string;
  colorMarca: string;
}) {
  return (
    <div className="text-center py-12">
      <div
        className="size-14 rounded-full grid place-items-center mx-auto mb-5"
        style={{ background: colorMarca, color: 'white' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 11v6M14 11v6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2
        className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
        style={{ color: 'var(--color-ink)' }}
      >
        Tu pedido está vacío.
      </h2>
      <p
        className="text-sm leading-relaxed mb-6 max-w-xs mx-auto"
        style={{ color: 'var(--color-ink-soft)' }}
      >
        Vuelve al menú y agrega lo que quieras pedir.
      </p>
      <Link
        href={`/m/${qrToken}/menu`}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[var(--radius-md)] text-sm font-medium"
        style={{
          background: 'var(--color-ink)',
          color: 'var(--color-paper)',
        }}
      >
        Volver al menú
      </Link>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
