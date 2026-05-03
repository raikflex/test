'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { leerSesionCliente } from '../../../../lib/cliente-session';
import {
  borrarTimerLlamado,
  calcularSegundosRestantes,
} from '../../../../lib/timer-llamado';
import { cancelarLlamado, crearLlamado } from './actions';

type LlamadoActivo = {
  id: string;
  motivo: string;
  creado_en: string;
};

type Motivo = 'campana' | 'otro';

const ETIQUETAS: Record<string, string> = {
  campana: 'Necesitas algo',
  pago: 'Pediste la cuenta',
  otro: 'Avisaste al mesero',
};

export function LlamarMeseroCliente({
  qrToken,
  numeroMesa,
  nombreNegocio,
  colorMarca,
  tieneSesionAbierta,
  llamadosActivos,
}: {
  qrToken: string;
  numeroMesa: string;
  nombreNegocio: string;
  colorMarca: string;
  tieneSesionAbierta: boolean;
  llamadosActivos: LlamadoActivo[];
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<Motivo>('campana');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [urlVolver, setUrlVolver] = useState<string>(`/m/${qrToken}/menu`);

  useEffect(() => {
    const sesion = leerSesionCliente(qrToken);
    if (sesion?.ultimaComandaId) {
      setUrlVolver(`/m/${qrToken}/menu/enviada/${sesion.ultimaComandaId}`);
    }
  }, [qrToken]);

  const llamadosNoPago = llamadosActivos.filter((l) => l.motivo !== 'pago');

  function llamar() {
    setError(null);
    startTransition(async () => {
      const resultado = await crearLlamado({
        qrToken,
        motivo,
        nota: nota.trim() || null,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setNota('');
      router.refresh();
    });
  }

  function cancelar(llamadoId: string) {
    setError(null);
    startTransition(async () => {
      const resultado = await cancelarLlamado({ qrToken, llamadoId });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      borrarTimerLlamado(llamadoId);
      router.refresh();
    });
  }

  async function volverALlamar(llamadoId: string, motivoActual: Motivo) {
    setError(null);
    startTransition(async () => {
      const cancelarRes = await cancelarLlamado({ qrToken, llamadoId });
      if (!cancelarRes.ok) {
        setError(cancelarRes.error);
        return;
      }
      borrarTimerLlamado(llamadoId);
      const crearRes = await crearLlamado({
        qrToken,
        motivo: motivoActual,
        nota: null,
      });
      if (!crearRes.ok) {
        setError(crearRes.error);
        return;
      }
      router.refresh();
    });
  }

  if (!tieneSesionAbierta) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
        style={{ background: 'var(--color-paper)' }}
      >
        <div className="w-full max-w-sm">
          <h1
            className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
            style={{ color: 'var(--color-ink)' }}
          >
            Aún no hiciste tu pedido.
          </h1>
          <p
            className="text-sm leading-relaxed mb-8"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Pide algo del menú primero. Después puedes llamar al mesero si lo
            necesitas.
          </p>
          <Link
            href={`/m/${qrToken}/menu`}
            className="inline-flex items-center justify-center h-11 px-5 rounded-[var(--radius-md)] text-sm font-medium"
            style={{ background: colorMarca, color: 'white' }}
          >
            Ir al menú
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-paper)' }}
    >
      <header
        className="sticky top-0 z-10 px-5 py-3 border-b backdrop-blur-sm"
        style={{
          borderColor: 'var(--color-border)',
          background: 'rgba(250, 246, 241, 0.92)',
        }}
      >
        <Link
          href={urlVolver}
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
          Volver
        </Link>
      </header>

      <div className="flex-1 px-5 py-6 max-w-md mx-auto w-full">
        <p
          className="text-[0.65rem] uppercase tracking-[0.14em] mb-1"
          style={{ color: 'var(--color-muted)' }}
        >
          Mesa {numeroMesa} · {nombreNegocio}
        </p>
        <h1
          className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] leading-[1.1] mb-6"
          style={{ color: 'var(--color-ink)' }}
        >
          Llamar al mesero
        </h1>

        {llamadosNoPago.length > 0 ? (
          <section className="mb-6 space-y-3">
            {llamadosNoPago.map((l) => (
              <LlamadoActivoCard
                key={l.id}
                llamado={l}
                colorMarca={colorMarca}
                pending={pending}
                onCancelar={() => cancelar(l.id)}
                onVolverALlamar={() =>
                  volverALlamar(l.id, l.motivo as Motivo)
                }
              />
            ))}
          </section>
        ) : null}

        <section
          className="rounded-[var(--radius-lg)] border bg-white p-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <p
            className="text-xs uppercase tracking-[0.14em] mb-3"
            style={{ color: 'var(--color-muted)' }}
          >
            Motivo
          </p>
          <div className="space-y-2 mb-5">
            <OpcionMotivo
              value="campana"
              label="Necesito algo"
              descripcion="Más servilletas, agua, una recomendación, etc."
              checked={motivo === 'campana'}
              onChange={() => setMotivo('campana')}
              colorMarca={colorMarca}
            />
            <OpcionMotivo
              value="otro"
              label="Otra cosa"
              descripcion="No estoy seguro, pero necesito ayuda."
              checked={motivo === 'otro'}
              onChange={() => setMotivo('otro')}
              colorMarca={colorMarca}
            />
          </div>

          <label
            htmlFor="nota"
            className="text-xs uppercase tracking-[0.14em] mb-2 block"
            style={{ color: 'var(--color-muted)' }}
          >
            Detalles{' '}
            <span className="lowercase tracking-normal">(opcional)</span>
          </label>
          <textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 200))}
            placeholder="Ej: necesito otra cuchara"
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border text-sm resize-none focus:outline-none focus:ring-1"
            style={{
              borderColor: 'var(--color-border-strong)',
              color: 'var(--color-ink)',
              background: 'var(--color-paper)',
            }}
          />
          <p
            className="text-[0.7rem] mt-1 text-right"
            style={{ color: 'var(--color-muted)' }}
          >
            {nota.length} / 200
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-3 text-xs text-center"
              style={{ color: 'var(--color-danger)' }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={llamar}
            disabled={pending}
            className="w-full mt-4 h-12 rounded-[var(--radius-md)] text-base font-medium transition-opacity disabled:opacity-60"
            style={{ background: colorMarca, color: 'white' }}
          >
            {pending ? 'Avisando…' : 'Avisar al mesero'}
          </button>
        </section>

        <p
          className="text-[0.7rem] text-center mt-6 leading-relaxed px-2"
          style={{ color: 'var(--color-muted)' }}
        >
          El mesero recibe el aviso al instante en su tableta. Si tarda,
          puedes volver a llamarlo después de 1 minuto y 45 segundos.
        </p>
      </div>
    </main>
  );
}

function LlamadoActivoCard({
  llamado,
  colorMarca,
  pending,
  onCancelar,
  onVolverALlamar,
}: {
  llamado: LlamadoActivo;
  colorMarca: string;
  pending: boolean;
  onCancelar: () => void;
  onVolverALlamar: () => void;
}) {
  // Inicializamos a null y calculamos en useEffect para evitar mismatch SSR/client.
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);

  useEffect(() => {
    setSegundosRestantes(calcularSegundosRestantes(llamado.id));
    const interval = setInterval(() => {
      setSegundosRestantes(calcularSegundosRestantes(llamado.id));
    }, 1000);
    return () => clearInterval(interval);
  }, [llamado.id]);

  if (segundosRestantes === null) return null;

  const puedeReLlamar = segundosRestantes <= 0;
  const minutos = Math.floor(segundosRestantes / 60);
  const segs = segundosRestantes % 60;

  return (
    <div
      className="rounded-[var(--radius-lg)] border bg-white"
      style={{ borderColor: colorMarca, borderWidth: 1.5 }}
    >
      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="size-9 rounded-full grid place-items-center shrink-0 animate-pulse"
            style={{ background: colorMarca, color: 'white' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M14 2a8 8 0 0 0-8 8c0 5 4 6 4 11h8c0-5 4-6 4-11a8 8 0 0 0-8-8z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--color-ink)' }}
            >
              {ETIQUETAS[llamado.motivo] ?? 'Llamado activo'}
            </p>
            <p
              className="text-[0.7rem]"
              style={{ color: 'var(--color-muted)' }}
            >
              El mesero está en camino
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancelar}
          disabled={pending}
          className="text-xs underline shrink-0 disabled:opacity-50"
          style={{ color: 'var(--color-muted)' }}
        >
          Cancelar
        </button>
      </div>

      <div
        className="border-t px-4 py-2.5"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-paper)',
        }}
      >
        {puedeReLlamar ? (
          <button
            type="button"
            onClick={onVolverALlamar}
            disabled={pending}
            className="w-full h-9 rounded-[var(--radius-md)] text-xs font-medium border transition-colors disabled:opacity-50"
            style={{
              borderColor: colorMarca,
              color: colorMarca,
              background: 'white',
            }}
          >
            {pending ? 'Avisando…' : 'Volver a llamar'}
          </button>
        ) : (
          <p
            className="text-[0.7rem] text-center"
            style={{ color: 'var(--color-muted)' }}
          >
            Si no llega en{' '}
            <span
              className="font-[family-name:var(--font-mono)] tabular-nums"
              style={{ color: 'var(--color-ink-soft)' }}
            >
              {minutos}:{segs.toString().padStart(2, '0')}
            </span>
            , podrás llamarlo de nuevo
          </p>
        )}
      </div>
    </div>
  );
}

function OpcionMotivo({
  value,
  label,
  descripcion,
  checked,
  onChange,
  colorMarca,
}: {
  value: string;
  label: string;
  descripcion: string;
  checked: boolean;
  onChange: () => void;
  colorMarca: string;
}) {
  return (
    <label
      className="flex items-start gap-3 px-3.5 py-3 rounded-[var(--radius-md)] border cursor-pointer transition-colors"
      style={{
        borderColor: checked ? colorMarca : 'var(--color-border-strong)',
        borderWidth: checked ? 1.5 : 1,
        background: checked ? 'var(--color-paper)' : 'transparent',
      }}
    >
      <input
        type="radio"
        name="motivo"
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div
        className="size-5 rounded-full border-2 grid place-items-center shrink-0 mt-0.5"
        style={{
          borderColor: checked ? colorMarca : 'var(--color-border-strong)',
        }}
      >
        {checked ? (
          <span
            className="size-2.5 rounded-full"
            style={{ background: colorMarca }}
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--color-ink)' }}
        >
          {label}
        </p>
        <p
          className="text-[0.7rem] mt-0.5"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          {descripcion}
        </p>
      </div>
    </label>
  );
}
