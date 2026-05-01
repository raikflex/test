'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, cn } from '@mesaya/ui';
import {
  agregarProducto,
  avanzarAPaso6,
  borrarProducto,
  type AddProductoState,
} from './actions';

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string | null;
  categoria_id: string;
  disponible: boolean;
  orden: number;
};

type Categoria = {
  id: string;
  nombre: string;
};

const initialAdd: AddProductoState = { ok: false };

const MIN_PARA_AVANZAR = 1; // S2.2 deja en 1; S2.3 sube a 5 cuando esté reorder + edicion.

export function ProductosManager({
  productos,
  categorias,
}: {
  productos: Producto[];
  categorias: Categoria[];
}) {
  const total = productos.length;
  const puedeAvanzar = total >= MIN_PARA_AVANZAR;
  const categoriasMap = new Map(categorias.map((c) => [c.id, c.nombre]));

  return (
    <div className="space-y-8">
      <FormularioAgregar categorias={categorias} />

      <Lista productos={productos} categoriasMap={categoriasMap} />

      <div className="pt-2 flex items-center justify-between gap-4 flex-wrap border-t border-[var(--color-border)] mt-2">
        <p className="text-xs pt-4" style={{ color: 'var(--color-muted)' }}>
          {total === 0
            ? 'Agrega al menos un producto para continuar.'
            : `${total} producto${total === 1 ? '' : 's'}. Te quedan 3 pasos.`}
        </p>
        <form action={avanzarAPaso6} className="pt-4">
          <Button type="submit" size="lg" disabled={!puedeAvanzar}>
            Siguiente · Mesas
            <ArrowRight />
          </Button>
        </form>
      </div>
    </div>
  );
}

function FormularioAgregar({ categorias }: { categorias: Categoria[] }) {
  const [state, formAction, pending] = useActionState(agregarProducto, initialAdd);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && formRef.current) {
      formRef.current.reset();
      const input = formRef.current.querySelector<HTMLInputElement>('input[name="nombre"]');
      input?.focus();
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-[var(--radius-lg)] border p-5 space-y-4"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-paper)' }}
    >
      <div className="grid sm:grid-cols-[1fr_140px] gap-4">
        <Field id="nombre" label="Nombre del producto" error={state.fieldErrors?.nombre}>
          <Input
            id="nombre"
            name="nombre"
            type="text"
            required
            autoFocus
            placeholder="Ej: Bandeja paisa"
            maxLength={80}
          />
        </Field>

        <Field id="precio" label="Precio (COP)" error={state.fieldErrors?.precio}>
          <Input
            id="precio"
            name="precio"
            type="text"
            inputMode="numeric"
            required
            placeholder="32000"
            maxLength={7}
          />
        </Field>
      </div>

      <Field
        id="categoria_id"
        label="Categoría"
        error={state.fieldErrors?.categoria_id}
      >
        <select
          id="categoria_id"
          name="categoria_id"
          required
          defaultValue=""
          className={cn(
            'w-full h-11 rounded-[var(--radius-md)] border px-3 text-sm',
            'bg-[var(--color-paper)] text-[var(--color-ink)]',
            'border-[var(--color-border-strong)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)]',
            'focus:border-[var(--color-ink)]',
          )}
        >
          <option value="" disabled>
            Selecciona una categoría
          </option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id="descripcion"
        label="Descripción"
        hint="Opcional. Una línea, máximo 200 caracteres."
        error={state.fieldErrors?.descripcion}
      >
        <Input
          id="descripcion"
          name="descripcion"
          type="text"
          placeholder="Ej: Frijoles, arroz, carne, chicharrón, huevo, plátano y aguacate"
          maxLength={200}
        />
      </Field>

      {state.error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border px-3.5 py-3 text-sm"
          style={{
            borderColor: 'var(--color-danger)',
            color: 'var(--color-danger)',
            background: 'var(--color-accent-soft)',
          }}
        >
          {state.error}
        </div>
      ) : null}

      <div className="flex justify-end pt-1">
        <Button type="submit" loading={pending}>
          Agregar producto
        </Button>
      </div>
    </form>
  );
}

function Lista({
  productos,
  categoriasMap,
}: {
  productos: Producto[];
  categoriasMap: Map<string, string>;
}) {
  if (productos.length === 0) {
    return (
      <div
        className="rounded-[var(--radius-lg)] border border-dashed p-8 text-center"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Aún no has agregado productos. Llena el formulario de arriba.
        </p>
      </div>
    );
  }

  // Agrupar por categoría
  const porCategoria = new Map<string, Producto[]>();
  for (const p of productos) {
    const arr = porCategoria.get(p.categoria_id) ?? [];
    arr.push(p);
    porCategoria.set(p.categoria_id, arr);
  }

  return (
    <div className="space-y-6">
      {Array.from(porCategoria.entries()).map(([catId, prods]) => (
        <section key={catId}>
          <h3
            className="text-xs uppercase tracking-[0.14em] mb-2 px-1"
            style={{ color: 'var(--color-muted)' }}
          >
            {categoriasMap.get(catId) ?? 'Sin categoría'}
          </h3>
          <ul
            className="rounded-[var(--radius-lg)] border divide-y"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-paper)',
            }}
          >
            {prods.map((p) => (
              <ItemProducto key={p.id} producto={p} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemProducto({ producto }: { producto: Producto }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="text-base font-medium truncate"
            style={{ color: 'var(--color-ink)' }}
          >
            {producto.nombre}
          </p>
          <p
            className="text-sm shrink-0 font-[family-name:var(--font-mono)]"
            style={{ color: 'var(--color-ink)' }}
          >
            ${formatPrecio(producto.precio)}
          </p>
        </div>
        {producto.descripcion ? (
          <p
            className="text-xs mt-0.5 leading-relaxed"
            style={{ color: 'var(--color-muted)' }}
          >
            {producto.descripcion}
          </p>
        ) : null}
      </div>

      <form action={borrarProducto} className="shrink-0">
        <input type="hidden" name="id" value={producto.id} />
        <button
          type="submit"
          aria-label={`Borrar ${producto.nombre}`}
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
    </li>
  );
}

function formatPrecio(n: number): string {
  return n.toLocaleString('es-CO');
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
