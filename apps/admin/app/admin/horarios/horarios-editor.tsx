'use client';

import { useState, useTransition } from 'react';
import { actualizarHorarios, type HorarioInput } from './actions';
import {
  guardarExcepcion,
  eliminarExcepcion,
  type ExcepcionInput,
} from './excepciones-actions';
import { togglePausaForm } from './actions';
import {
  estaAbiertoAhora,
  formatearHora,
  nombreDiaCapital,
  type HorarioDia,
  type ExcepcionDia,
} from '../../../lib/horarios';

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function HorariosEditor({
  horariosIniciales,
  excepcionesIniciales,
  estadoRestaurante,
}: {
  horariosIniciales: HorarioDia[];
  excepcionesIniciales: ExcepcionDia[];
  estadoRestaurante: string;
}) {
  const [horarios, setHorarios] = useState<Record<number, HorarioDia>>(() => {
    const map: Record<number, HorarioDia> = {};
    for (let i = 0; i < 7; i++) {
      map[i] = horariosIniciales.find((h) => h.dia_semana === i) ?? {
        dia_semana: i,
        abierto: true,
        hora_apertura: '08:00',
        hora_cierre: '22:00',
      };
    }
    return map;
  });

  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [pending, startTransition] = useTransition();

  const estadoApertura = estaAbiertoAhora(
    horariosIniciales,
    excepcionesIniciales,
  );

  function actualizarDia(dia: number, cambios: Partial<HorarioDia>) {
    setError(null);
    setExito(false);
    setHorarios((prev) => ({
      ...prev,
      [dia]: { ...prev[dia]!, ...cambios },
    }));
  }

  function handleSubmit() {
    setError(null);
    setExito(false);
    const filas: HorarioInput[] = Object.values(horarios).map((h) => ({
      ...h,
      hora_apertura: h.abierto ? h.hora_apertura || '08:00' : null,
      hora_cierre: h.abierto ? h.hora_cierre || '22:00' : null,
    }));

    startTransition(async () => {
      const res = await actualizarHorarios(filas);
      if (!res.ok) {
        setError(res.error);
      } else {
        setExito(true);
        setTimeout(() => setExito(false), 3000);
      }
    });
  }

  return (
    <>
      <EstadoActual
        estadoRestaurante={estadoRestaurante}
        estadoApertura={estadoApertura}
      />

      <section
        className="rounded-[var(--radius-lg)] border bg-white p-5 sm:p-6 mb-6"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-1"
          style={{ color: 'var(--color-ink)' }}
        >
          Horario semanal
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--color-ink-soft)' }}>
          Edita cuando estas abierto cada dia. Los cambios se aplican al
          guardar.
        </p>

        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {ORDEN_DIAS.map((dia) => (
            <FilaDia
              key={dia}
              horario={horarios[dia]!}
              onCambio={(cambios) => actualizarDia(dia, cambios)}
            />
          ))}
        </ul>

        {error ? (
          <div
            className="mt-5 px-3 py-2.5 rounded-[var(--radius-md)] border text-sm"
            style={{
              borderColor: '#fecaca',
              background: '#fef2f2',
              color: '#b91c1c',
            }}
          >
            {error}
          </div>
        ) : null}

        {exito ? (
          <div
            className="mt-5 px-3 py-2.5 rounded-[var(--radius-md)] border text-sm"
            style={{
              borderColor: '#bbf7d0',
              background: '#f0fdf4',
              color: '#166534',
            }}
          >
            Horarios guardados.
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="mt-6 w-full sm:w-auto h-11 px-6 rounded-[var(--radius-md)] text-sm font-medium transition-opacity disabled:opacity-50"
          style={{
            background: 'var(--color-ink)',
            color: 'var(--color-paper)',
          }}
        >
          {pending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </section>

      <DiasEspeciales excepcionesIniciales={excepcionesIniciales} />
    </>
  );
}

function FilaDia({
  horario,
  onCambio,
}: {
  horario: HorarioDia;
  onCambio: (cambios: Partial<HorarioDia>) => void;
}) {
  const horaAperturaInput = (horario.hora_apertura ?? '08:00').slice(0, 5);
  const horaCierreInput = (horario.hora_cierre ?? '22:00').slice(0, 5);

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center justify-between sm:w-44 sm:shrink-0">
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--color-ink)' }}
          >
            {nombreDiaCapital(horario.dia_semana)}
          </span>

          <button
            type="button"
            role="switch"
            aria-checked={horario.abierto}
            onClick={() => {
              const nuevoAbierto = !horario.abierto;
              const cambios: Partial<HorarioDia> = { abierto: nuevoAbierto };
              if (nuevoAbierto && !horario.hora_apertura) cambios.hora_apertura = '08:00';
              if (nuevoAbierto && !horario.hora_cierre) cambios.hora_cierre = '22:00';
              onCambio(cambios);
            }}
            className="relative w-10 h-6 rounded-full transition-colors shrink-0"
            style={{
              background: horario.abierto
                ? 'var(--color-ink)'
                : 'var(--color-border-strong)',
            }}
          >
            <span
              className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform"
              style={{
                transform: horario.abierto
                  ? 'translateX(1rem)'
                  : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {horario.abierto ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="time"
              value={horaAperturaInput}
              onChange={(e) => {
                if (e.target.value) onCambio({ hora_apertura: e.target.value });
              }}
              className="h-10 px-3 rounded-[var(--radius-md)] border text-sm flex-1 max-w-[8rem]"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
                background: 'var(--color-paper)',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              a
            </span>
            <input
              type="time"
              value={horaCierreInput}
              onChange={(e) => {
                if (e.target.value) onCambio({ hora_cierre: e.target.value });
              }}
              className="h-10 px-3 rounded-[var(--radius-md)] border text-sm flex-1 max-w-[8rem]"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
                background: 'var(--color-paper)',
              }}
            />
          </div>
        ) : (
          <span
            className="text-sm italic"
            style={{ color: 'var(--color-muted)' }}
          >
            Cerrado todo el dia
          </span>
        )}
      </div>
    </li>
  );
}

function EstadoActual({
  estadoRestaurante,
  estadoApertura,
}: {
  estadoRestaurante: string;
  estadoApertura: ReturnType<typeof estaAbiertoAhora>;
}) {
  const estaPausadoManualmente = estadoRestaurante === 'pausado';

  let titulo: string;
  let descripcion: string;
  let badgeColor: string;
  let badgeBg: string;
  let badgeTexto: string;

  if (estaPausadoManualmente) {
    titulo = 'Cerrado manualmente';
    descripcion =
      'Pausaste los pedidos. Reanuda para volver a recibir clientes (siempre que estes dentro del horario).';
    badgeColor = '#92400e';
    badgeBg = '#fef3c7';
    badgeTexto = 'Pausado';
  } else if (estadoApertura.abierto) {
    titulo = 'Abierto ahora';
    descripcion = 'Los clientes pueden hacer pedidos.';
    badgeColor = '#15803d';
    badgeBg = '#dcfce7';
    badgeTexto = 'Abierto';
  } else {
    titulo = 'Cerrado por horario';
    descripcion = estadoApertura.proximoTexto;
    badgeColor = '#475569';
    badgeBg = '#f1f5f9';
    badgeTexto = 'Cerrado';
  }

  return (
    <section
      className="rounded-[var(--radius-lg)] border bg-white p-5 sm:p-6 mb-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span
            className="text-[0.65rem] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full font-medium inline-block"
            style={{ background: badgeBg, color: badgeColor }}
          >
            {badgeTexto}
          </span>
          <h2
            className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mt-2"
            style={{ color: 'var(--color-ink)' }}
          >
            {titulo}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-ink-soft)' }}>
            {descripcion}
          </p>
        </div>

        {estaPausadoManualmente ? (
          <form action={togglePausaForm}>
            <input type="hidden" name="accion" value="reanudar" />
            <button
              type="submit"
              className="h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium border whitespace-nowrap"
              style={{
                background: 'white',
                color: 'var(--color-ink)',
                borderColor: 'var(--color-border-strong)',
              }}
            >
              Reanudar
            </button>
          </form>
        ) : estadoApertura.abierto ? (
          <form action={togglePausaForm}>
            <input type="hidden" name="accion" value="pausar" />
            <button
              type="submit"
              className="h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium whitespace-nowrap"
              style={{
                background: '#fef3c7',
                color: '#92400e',
              }}
            >
              Cerrar ahora
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

/* ============= DIAS ESPECIALES (EXCEPCIONES) ============= */

function DiasEspeciales({
  excepcionesIniciales,
}: {
  excepcionesIniciales: ExcepcionDia[];
}) {
  const [excepciones, setExcepciones] =
    useState<ExcepcionDia[]>(excepcionesIniciales);
  const [editando, setEditando] = useState<string | null>(null); // fecha que se esta editando
  const [creando, setCreando] = useState(false);

  function refrescarLista(nueva?: ExcepcionDia, eliminada?: string) {
    setExcepciones((prev) => {
      let lista = prev;
      if (eliminada) {
        lista = lista.filter((e) => e.fecha !== eliminada);
      }
      if (nueva) {
        const sinDuplicado = lista.filter((e) => e.fecha !== nueva.fecha);
        lista = [...sinDuplicado, nueva].sort((a, b) =>
          a.fecha.localeCompare(b.fecha),
        );
      }
      return lista;
    });
  }

  return (
    <section
      className="rounded-[var(--radius-lg)] border bg-white p-5 sm:p-6"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <h2
        className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-1"
        style={{ color: 'var(--color-ink)' }}
      >
        Dias especiales
      </h2>
      <p className="text-sm mb-5" style={{ color: 'var(--color-ink-soft)' }}>
        Excepciones para fechas concretas (festivos, cierres tempranos). Estos
        sobreescriben el horario semanal solo ese dia.
      </p>

      {excepciones.length === 0 ? (
        <p
          className="text-sm italic mb-5"
          style={{ color: 'var(--color-muted)' }}
        >
          No tienes excepciones programadas para los proximos 90 dias.
        </p>
      ) : (
        <ul className="divide-y mb-5" style={{ borderColor: 'var(--color-border)' }}>
          {excepciones.map((e) =>
            editando === e.fecha ? (
              <FormExcepcion
                key={e.fecha}
                inicial={e}
                onGuardado={(nueva) => {
                  refrescarLista(nueva);
                  setEditando(null);
                }}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <FilaExcepcion
                key={e.fecha}
                excepcion={e}
                onEditar={() => setEditando(e.fecha)}
                onEliminar={() => refrescarLista(undefined, e.fecha)}
              />
            ),
          )}
        </ul>
      )}

      {creando ? (
        <FormExcepcion
          onGuardado={(nueva) => {
            refrescarLista(nueva);
            setCreando(false);
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="w-full sm:w-auto h-11 px-5 rounded-[var(--radius-md)] text-sm font-medium border"
          style={{
            background: 'white',
            color: 'var(--color-ink)',
            borderColor: 'var(--color-border-strong)',
          }}
        >
          + Agregar dia especial
        </button>
      )}
    </section>
  );
}

function FilaExcepcion({
  excepcion,
  onEditar,
  onEliminar,
}: {
  excepcion: ExcepcionDia;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const [eliminando, setEliminando] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleEliminar() {
    if (!confirm(`Eliminar excepcion del ${formatearFechaCorta(excepcion.fecha)}?`)) {
      return;
    }
    setEliminando(true);
    startTransition(async () => {
      const res = await eliminarExcepcion(excepcion.fecha);
      if (res.ok) {
        onEliminar();
      } else {
        alert(res.error);
        setEliminando(false);
      }
    });
  }

  return (
    <li className="py-3 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--color-ink)' }}
          >
            {formatearFechaCorta(excepcion.fecha)}
            {excepcion.nota ? (
              <span
                className="ml-2 text-xs"
                style={{ color: 'var(--color-muted)' }}
              >
                · {excepcion.nota}
              </span>
            ) : null}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-soft)' }}>
            {excepcion.abierto && excepcion.hora_apertura && excepcion.hora_cierre
              ? `Abierto ${formatearHora(excepcion.hora_apertura)} - ${formatearHora(excepcion.hora_cierre)}`
              : 'Cerrado todo el dia'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEditar}
            disabled={pending || eliminando}
            className="h-8 px-3 text-xs rounded-[var(--radius-md)] border"
            style={{
              background: 'white',
              color: 'var(--color-ink-soft)',
              borderColor: 'var(--color-border)',
            }}
          >
            Editar
          </button>
          <button
            type="button"
            onClick={handleEliminar}
            disabled={pending || eliminando}
            className="h-8 px-3 text-xs rounded-[var(--radius-md)]"
            style={{
              background: '#fef2f2',
              color: '#b91c1c',
            }}
          >
            {pending ? '...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </li>
  );
}

function FormExcepcion({
  inicial,
  onGuardado,
  onCancelar,
}: {
  inicial?: ExcepcionDia;
  onGuardado: (e: ExcepcionDia) => void;
  onCancelar: () => void;
}) {
  const editando = !!inicial;
  const hoy = new Date().toISOString().slice(0, 10);

  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy);
  const [abierto, setAbierto] = useState(inicial?.abierto ?? false);
  const [horaApertura, setHoraApertura] = useState(
    (inicial?.hora_apertura ?? '08:00').slice(0, 5),
  );
  const [horaCierre, setHoraCierre] = useState(
    (inicial?.hora_cierre ?? '22:00').slice(0, 5),
  );
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGuardar() {
    setError(null);
    const input: ExcepcionInput = {
      fecha,
      abierto,
      hora_apertura: abierto ? horaApertura : null,
      hora_cierre: abierto ? horaCierre : null,
      nota: nota.trim() || null,
    };

    startTransition(async () => {
      const res = await guardarExcepcion(input);
      if (!res.ok) {
        setError(res.error);
      } else {
        onGuardado({
          fecha: input.fecha,
          abierto: input.abierto,
          hora_apertura: input.hora_apertura,
          hora_cierre: input.hora_cierre,
          nota: input.nota,
        });
      }
    });
  }

  return (
    <li
      className="py-4 first:pt-0 -mx-1 px-3 rounded-[var(--radius-md)]"
      style={{ background: 'var(--color-paper-deep)' }}
    >
      <p
        className="text-[0.7rem] uppercase tracking-[0.12em] mb-3"
        style={{ color: 'var(--color-muted)' }}
      >
        {editando ? 'Editando dia especial' : 'Nuevo dia especial'}
      </p>

      <div className="space-y-3">
        <div>
          <label
            className="block text-xs mb-1"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Fecha
          </label>
          <input
            type="date"
            value={fecha}
            min={hoy}
            disabled={editando}
            onChange={(e) => setFecha(e.target.value)}
            className="h-10 px-3 rounded-[var(--radius-md)] border text-sm w-full sm:w-48 disabled:opacity-60"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
              background: 'white',
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
            {abierto ? 'Abierto' : 'Cerrado'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={abierto}
            onClick={() => setAbierto((v) => !v)}
            className="relative w-10 h-6 rounded-full transition-colors"
            style={{
              background: abierto
                ? 'var(--color-ink)'
                : 'var(--color-border-strong)',
            }}
          >
            <span
              className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform"
              style={{
                transform: abierto ? 'translateX(1rem)' : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {abierto ? (
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={horaApertura}
              onChange={(e) => setHoraApertura(e.target.value)}
              className="h-10 px-3 rounded-[var(--radius-md)] border text-sm flex-1 max-w-[8rem]"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
                background: 'white',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              a
            </span>
            <input
              type="time"
              value={horaCierre}
              onChange={(e) => setHoraCierre(e.target.value)}
              className="h-10 px-3 rounded-[var(--radius-md)] border text-sm flex-1 max-w-[8rem]"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
                background: 'white',
              }}
            />
          </div>
        ) : null}

        <div>
          <label
            className="block text-xs mb-1"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Nota (opcional)
          </label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: Navidad, festivo, cierre temprano"
            maxLength={100}
            className="h-10 px-3 rounded-[var(--radius-md)] border text-sm w-full"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
              background: 'white',
            }}
          />
        </div>

        {error ? (
          <div
            className="px-3 py-2 rounded-[var(--radius-md)] border text-sm"
            style={{
              borderColor: '#fecaca',
              background: '#fef2f2',
              color: '#b91c1c',
            }}
          >
            {error}
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleGuardar}
            disabled={pending}
            className="h-10 px-5 rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
            style={{
              background: 'var(--color-ink)',
              color: 'var(--color-paper)',
            }}
          >
            {pending ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            disabled={pending}
            className="h-10 px-5 rounded-[var(--radius-md)] text-sm font-medium border"
            style={{
              background: 'white',
              color: 'var(--color-ink-soft)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </li>
  );
}

function formatearFechaCorta(fecha: string): string {
  // "2026-12-25" -> "25 dic 2026"
  const [y, m, d] = fecha.split('-');
  const meses = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  const mesIdx = parseInt(m ?? '1', 10) - 1;
  return `${parseInt(d ?? '1', 10)} ${meses[mesIdx] ?? ''} ${y}`;
}
