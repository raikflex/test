'use client';

import { useState, useTransition } from 'react';
import { actualizarHorarios, type HorarioInput } from './actions';
import { togglePausaForm } from './actions';
import {
  estaAbiertoAhora,
  nombreDiaCapital,
  type HorarioDia,
} from '../../../lib/horarios';

// Orden de display: lunes primero (convencion latina), domingo al final
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function HorariosEditor({
  horariosIniciales,
  estadoRestaurante,
}: {
  horariosIniciales: HorarioDia[];
  estadoRestaurante: string;
}) {
  // State del form: indexado por dia_semana (0-6). Si la BD no tiene una fila
  // para algun dia (no deberia pasar tras el bootstrap), usamos defaults.
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

  // Estado de apertura calculado a partir de los horarios YA guardados,
  // no de los que el usuario esta editando ahora.
  const estadoApertura = estaAbiertoAhora(horariosIniciales);

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
    const filas: HorarioInput[] = Object.values(horarios);

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
        className="rounded-[var(--radius-lg)] border bg-white p-5 sm:p-6"
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
  // Normalizar a HH:MM para input type="time"
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
            aria-label={
              horario.abierto
                ? `Marcar ${nombreDiaCapital(horario.dia_semana)} como cerrado`
                : `Marcar ${nombreDiaCapital(horario.dia_semana)} como abierto`
            }
            onClick={() => onCambio({ abierto: !horario.abierto })}
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
              onChange={(e) => onCambio({ hora_apertura: e.target.value })}
              aria-label={`Hora de apertura ${nombreDiaCapital(horario.dia_semana)}`}
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
              onChange={(e) => onCambio({ hora_cierre: e.target.value })}
              aria-label={`Hora de cierre ${nombreDiaCapital(horario.dia_semana)}`}
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
