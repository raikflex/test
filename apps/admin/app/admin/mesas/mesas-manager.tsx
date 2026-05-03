'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, cn } from '@mesaya/ui';
import {
  agregarMesas,
  actualizarCapacidad,
  toggleActiva,
  eliminarMesa,
  type AgregarMesasState,
} from './actions';

type Mesa = {
  id: string;
  numero: string;
  capacidad: number;
  activa: boolean;
  qr_token: string;
};

const initialAgregar: AgregarMesasState = { ok: false };

export function MesasManager({ mesas }: { mesas: Mesa[] }) {
  const activas = mesas.filter((m) => m.activa);
  const inactivas = mesas.filter((m) => !m.activa);

  return (
    <div className="space-y-8">
      <AccionesPrincipales totalActivas={activas.length} />

      {activas.length > 0 ? (
        <SeccionMesas titulo="Activas" mesas={activas} />
      ) : (
        <div
          className="rounded-[var(--radius-lg)] border border-dashed p-8 text-center"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No tienes mesas activas. Agrega algunas con el botón de arriba.
          </p>
        </div>
      )}

      {inactivas.length > 0 ? (
        <SeccionMesas titulo="Inactivas" mesas={inactivas} esInactivas />
      ) : null}
    </div>
  );
}

function AccionesPrincipales({ totalActivas }: { totalActivas: number }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <FormAgregar />
      <CardDescargarQRs disabled={totalActivas === 0} />
    </div>
  );
}

function FormAgregar() {
  const [state, formAction, pending] = useActionState(agregarMesas, initialAgregar);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && formRef.current) {
      formRef.current.reset();
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-[var(--radius-lg)] border p-5 space-y-3"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-paper)',
      }}
    >
      <div>
        <p
          className="text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Agregar mesas
        </p>
        <p
          className="text-xs mt-0.5"
          style={{ color: 'var(--color-muted)' }}
        >
          Continuamos la numeración desde la última.
        </p>
      </div>
      <Field id="cantidad" label="¿Cuántas?" error={state.fieldErrors?.cantidad}>
        <Input
          id="cantidad"
          name="cantidad"
          type="number"
          min={1}
          max={50}
          required
          placeholder="Ej: 3"
        />
      </Field>
      {state.error ? (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {state.error}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full">
        Agregar
      </Button>
    </form>
  );
}

function CardDescargarQRs({ disabled }: { disabled: boolean }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-5 flex flex-col"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-paper)',
      }}
    >
      <p
        className="text-xs uppercase tracking-[0.14em]"
        style={{ color: 'var(--color-muted)' }}
      >
        Descargar QRs
      </p>
      <p
        className="text-xs mt-0.5"
        style={{ color: 'var(--color-muted)' }}
      >
        PDF A4 con todas las mesas activas.
      </p>
      <div className="flex-1" />
      <a
        href="/api/qrs-pdf"
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 mt-4 h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium transition-colors',
          disabled && 'opacity-50 pointer-events-none',
        )}
        style={{
          background: 'var(--color-ink)',
          color: 'var(--color-paper)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Descargar PDF
      </a>
    </div>
  );
}

function SeccionMesas({
  titulo,
  mesas,
  esInactivas = false,
}: {
  titulo: string;
  mesas: Mesa[];
  esInactivas?: boolean;
}) {
  return (
    <section>
      <h2
        className="text-xs uppercase tracking-[0.14em] mb-3 px-1 flex items-center gap-2"
        style={{ color: 'var(--color-muted)' }}
      >
        {titulo} · {mesas.length}
      </h2>
      <ul
        className="rounded-[var(--radius-lg)] border divide-y"
        style={{
          borderColor: 'var(--color-border)',
          background: esInactivas ? 'transparent' : 'var(--color-paper)',
        }}
      >
        {mesas.map((m) => (
          <ItemMesa key={m.id} mesa={m} />
        ))}
      </ul>
    </section>
  );
}

function ItemMesa({ mesa }: { mesa: Mesa }) {
  const [editando, setEditando] = useState(false);
  const [valorCapacidad, setValorCapacidad] = useState(mesa.capacidad.toString());

  function guardarCapacidad() {
    const formData = new FormData();
    formData.append('id', mesa.id);
    formData.append('capacidad', valorCapacidad);
    void actualizarCapacidad(formData);
    setEditando(false);
  }

  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-3.5',
        !mesa.activa && 'opacity-60',
      )}
    >
      <div
        className="size-11 rounded-[var(--radius-md)] grid place-items-center shrink-0 font-[family-name:var(--font-display)] text-lg"
        style={{
          background: mesa.activa
            ? 'var(--color-ink)'
            : 'var(--color-paper-deep)',
          color: mesa.activa ? 'var(--color-paper)' : 'var(--color-muted)',
        }}
      >
        {mesa.numero}
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--color-ink)' }}
        >
          Mesa {mesa.numero}
        </p>
        {editando ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              type="number"
              value={valorCapacidad}
              onChange={(e) => setValorCapacidad(e.target.value)}
              min={1}
              max={30}
              className="w-16 h-7 px-2 rounded text-xs border focus:outline-none focus:ring-1 focus:ring-[var(--color-ink)]"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardarCapacidad();
                if (e.key === 'Escape') {
                  setValorCapacidad(mesa.capacidad.toString());
                  setEditando(false);
                }
              }}
            />
            <button
              type="button"
              onClick={guardarCapacidad}
              className="text-xs px-2 h-7 rounded transition-colors"
              style={{
                background: 'var(--color-ink)',
                color: 'var(--color-paper)',
              }}
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs mt-0.5 hover:underline transition-colors text-left"
            style={{ color: 'var(--color-muted)' }}
          >
            {mesa.capacidad} comensales · editar
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <form action={toggleActiva}>
          <input type="hidden" name="id" value={mesa.id} />
          <input type="hidden" name="activar" value={mesa.activa ? 'false' : 'true'} />
          <button
            type="submit"
            className={cn(
              'text-xs px-3 h-8 rounded-[var(--radius-md)] border transition-colors',
              'hover:bg-[var(--color-paper-deep)]',
            )}
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink-soft)',
            }}
          >
            {mesa.activa ? 'Desactivar' : 'Activar'}
          </button>
        </form>

        {mesa.activa ? (
          <form action={eliminarMesa}>
            <input type="hidden" name="id" value={mesa.id} />
            <button
              type="submit"
              aria-label={`Eliminar mesa ${mesa.numero}`}
              className={cn(
                'size-8 grid place-items-center rounded-[var(--radius-md)] transition-colors',
                'text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-paper-deep)]',
              )}
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
          </form>
        ) : null}
      </div>
    </li>
  );
}
