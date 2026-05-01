'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, cn } from '@mesaya/ui';
import {
  actualizarCapacidad,
  avanzarAPaso7,
  borrarMesa,
  generarMesas,
  type BulkState,
} from './actions';

type Mesa = {
  id: string;
  numero: string;
  capacidad: number;
  qr_token: string;
};

const initialBulk: BulkState = { ok: false };

export function MesasManager({ mesas }: { mesas: Mesa[] }) {
  const total = mesas.length;
  const puedeAvanzar = total >= 1;
  const totalCapacidad = mesas.reduce((acc, m) => acc + m.capacidad, 0);

  return (
    <div className="space-y-8">
      <BulkForm tieneAlguna={total > 0} />

      <Lista mesas={mesas} />

      <div className="pt-2 flex items-center justify-between gap-4 flex-wrap border-t border-[var(--color-border)] mt-2">
        <p className="text-xs pt-4" style={{ color: 'var(--color-muted)' }}>
          {total === 0
            ? 'Genera tus mesas para continuar.'
            : `${total} mesa${total === 1 ? '' : 's'} · ${totalCapacidad} comensales total. Te quedan 2 pasos.`}
        </p>
        <form action={avanzarAPaso7} className="pt-4">
          <Button type="submit" size="lg" disabled={!puedeAvanzar}>
            Siguiente · QRs
            <ArrowRight />
          </Button>
        </form>
      </div>
    </div>
  );
}

function BulkForm({ tieneAlguna }: { tieneAlguna: boolean }) {
  const [state, formAction, pending] = useActionState(generarMesas, initialBulk);
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
      className="rounded-[var(--radius-lg)] border p-5"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}
    >
      <div className="flex items-end gap-3 max-w-md">
        <Field
          id="cantidad"
          label={tieneAlguna ? 'Agregar más mesas' : '¿Cuántas mesas tienes?'}
          hint={tieneAlguna ? 'Se añadirán al final con números secuenciales.' : 'Capacidad por defecto: 4 comensales (la cambias abajo).'}
          error={state.fieldError}
          className="flex-1"
        >
          <Input
            id="cantidad"
            name="cantidad"
            type="text"
            inputMode="numeric"
            required
            autoFocus={!tieneAlguna}
            placeholder="Ej: 8"
            maxLength={3}
          />
        </Field>
        <Button type="submit" loading={pending} className="shrink-0">
          {tieneAlguna ? 'Agregar' : 'Generar'}
        </Button>
      </div>

      {state.error ? (
        <div
          role="alert"
          className="mt-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-sm"
          style={{
            borderColor: 'var(--color-danger)',
            color: 'var(--color-danger)',
            background: 'var(--color-accent-soft)',
          }}
        >
          {state.error}
        </div>
      ) : null}
    </form>
  );
}

function Lista({ mesas }: { mesas: Mesa[] }) {
  if (mesas.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-lg)] border border-dashed p-8 text-center"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Aún no tienes mesas. Genera el primer lote arriba.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3
        className="text-xs uppercase tracking-[0.14em] mb-2 px-1"
        style={{ color: 'var(--color-muted)' }}
      >
        {mesas.length} {mesas.length === 1 ? 'mesa' : 'mesas'}
      </h3>
      <ul
        className="rounded-[var(--radius-lg)] border divide-y"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-paper)',
        }}
      >
        {mesas.map((m) => (
          <ItemMesa key={m.id} mesa={m} />
        ))}
      </ul>
    </div>
  );
}

function ItemMesa({ mesa }: { mesa: Mesa }) {
  const [editando, setEditando] = useState(false);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div
        className="size-10 rounded-[var(--radius-md)] grid place-items-center shrink-0 font-[family-name:var(--font-mono)] text-sm"
        style={{
          background: 'var(--color-paper-deep)',
          color: 'var(--color-ink)',
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
          <form
            action={async (formData) => {
              await actualizarCapacidad(formData);
              setEditando(false);
            }}
            className="flex items-center gap-2 mt-1"
          >
            <input type="hidden" name="id" value={mesa.id} />
            <Input
              name="capacidad"
              type="number"
              min="1"
              max="50"
              defaultValue={mesa.capacidad}
              className="h-8 w-20"
              required
              autoFocus
            />
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              comensales
            </span>
            <Button type="submit" size="sm">
              OK
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs hover:underline underline-offset-4"
            style={{ color: 'var(--color-muted)' }}
          >
            Capacidad: {mesa.capacidad} comensales
          </button>
        )}
      </div>

      {!editando ? (
        <form action={borrarMesa} className="shrink-0">
          <input type="hidden" name="id" value={mesa.id} />
          <button
            type="submit"
            aria-label={`Borrar mesa ${mesa.numero}`}
            className={cn(
              'size-9 grid place-items-center rounded-[var(--radius-md)] transition-colors',
              'text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-paper-deep)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)]',
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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
    </li>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
