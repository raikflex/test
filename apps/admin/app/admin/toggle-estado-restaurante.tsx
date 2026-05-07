'use client';

import { useState, useTransition } from 'react';
import { alternarEstadoRestaurante } from './estado-restaurante-actions';

/**
 * Toggle visible y prominente para pausar/reanudar pedidos. Útil cuando el
 * restaurante quiere parar de recibir pedidos sin cerrar la app (ej: hora de
 * almuerzo terminó, evento privado, falta personal momentáneamente).
 */
export function ToggleEstadoRestaurante({
  estadoActual,
  colorMarca,
}: {
  estadoActual: string;
  colorMarca: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  // Si todavía no está activado por primera vez (archivado/inactivo), no
  // mostrar este toggle — eso lo maneja BannerActivacion.
  if (estadoActual !== 'activo' && estadoActual !== 'pausado') {
    return null;
  }

  const estaPausado = estadoActual === 'pausado';

  function ejecutar(accion: 'pausar' | 'reanudar') {
    const fd = new FormData();
    fd.set('accion', accion);
    startTransition(async () => {
      await alternarEstadoRestaurante(fd);
      setConfirmando(false);
    });
  }

  if (estaPausado) {
    return (
      <section
        className="rounded-[var(--radius-lg)] border-2 p-4 sm:p-5 flex items-center gap-4"
        style={{
          borderColor: '#f59e0b',
          background: '#fffbeb',
        }}
      >
        <span
          className="size-10 rounded-full grid place-items-center shrink-0 animate-pulse"
          style={{ background: '#f59e0b', color: 'white' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="6" y="5" width="4" height="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="14" y="5" width="4" height="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: '#78350f' }}>
            Pedidos en pausa
          </p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#92400e' }}>
            Los clientes no pueden hacer pedidos nuevos. Las sesiones abiertas
            siguen su curso.
          </p>
        </div>
        <button
          type="button"
          onClick={() => ejecutar('reanudar')}
          disabled={pending}
          className="h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium shrink-0 disabled:opacity-60"
          style={{ background: '#f59e0b', color: 'white' }}
        >
          {pending ? 'Reanudando…' : 'Reanudar pedidos'}
        </button>
      </section>
    );
  }

  // Estado activo
  return (
    <section
      className="rounded-[var(--radius-lg)] border bg-white p-4 sm:p-5 flex items-center gap-4"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span
        className="size-10 rounded-full grid place-items-center shrink-0"
        style={{ background: '#dcfce7', color: '#166534' }}
      >
        <span className="size-3 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
          Recibiendo pedidos
        </p>
        <p
          className="text-xs mt-0.5"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Los clientes pueden escanear los QRs y hacer pedidos.
        </p>
      </div>
      {confirmando ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={pending}
            className="h-9 px-3 rounded-[var(--radius-md)] text-xs border disabled:opacity-60"
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
            onClick={() => ejecutar('pausar')}
            disabled={pending}
            className="h-9 px-3 rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-60"
            style={{ background: '#f59e0b', color: 'white' }}
          >
            {pending ? 'Pausando…' : 'Sí, pausar'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pending}
          className="h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium border shrink-0 disabled:opacity-60"
          style={{
            borderColor: colorMarca,
            color: colorMarca,
            background: 'white',
          }}
        >
          Pausar pedidos
        </button>
      )}
    </section>
  );
}
