'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { leerSesionCliente } from '../../../../lib/cliente-session';
import {
  borrarTimerLlamado,
  calcularSegundosRestantes,
} from '../../../../lib/timer-llamado';
import { cancelarLlamado } from '../llamar-mesero/actions';
import { pedirCuenta, type FormaPago } from './actions';

const PORCENTAJE_PROPINA = 0.1;

type ItemFila = {
  id: string;
  nombre_snapshot: string;
  precio_snapshot: number;
  cantidad: number;
  nota: string | null;
};

type ComandaPorCliente = {
  comandaId: string;
  numeroDiario: number;
  total: number;
  estado: string;
  items: ItemFila[];
  cliente: string;
};

const FORMAS_PAGO: { value: FormaPago; label: string; descripcion: string }[] = [
  { value: 'efectivo', label: 'Efectivo', descripcion: 'Pago en monedas y billetes' },
  { value: 'tarjeta', label: 'Tarjeta', descripcion: 'Débito o crédito en datafono' },
  { value: 'transferencia', label: 'Transferencia / PSE', descripcion: 'Nequi, Bancolombia, Daviplata' },
  { value: 'no_seguro', label: 'Aún no decido', descripcion: 'Le digo al mesero al llegar' },
];

export function PedirCuentaCliente({
  qrToken,
  numeroMesa,
  nombreNegocio,
  colorMarca,
  tieneSesionAbierta,
  comandas,
  llamadoPagoPendiente,
}: {
  qrToken: string;
  numeroMesa: string;
  nombreNegocio: string;
  colorMarca: string;
  tieneSesionAbierta: boolean;
  comandas: ComandaPorCliente[];
  llamadoPagoPendiente: { id: string; creado_en: string } | null;
}) {
  const router = useRouter();
  const [conPropina, setConPropina] = useState(false);
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [urlVolver, setUrlVolver] = useState<string>(`/m/${qrToken}/menu`);

  useEffect(() => {
    const sesion = leerSesionCliente(qrToken);
    if (sesion?.ultimaComandaId) {
      setUrlVolver(`/m/${qrToken}/menu/enviada/${sesion.ultimaComandaId}`);
    }
  }, [qrToken]);

  if (!tieneSesionAbierta || comandas.length === 0) {
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
            Pide algo del menú primero. Cuando termines, regresas aquí para
            pedir la cuenta.
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

  const subtotal = comandas.reduce((acc, c) => acc + c.total, 0);
  const propina = conPropina ? Math.round(subtotal * PORCENTAJE_PROPINA) : 0;
  const totalFinal = subtotal + propina;

  function pedir() {
    setError(null);
    startTransition(async () => {
      const resultado = await pedirCuenta({
        qrToken,
        conPropina,
        formaPago,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  if (llamadoPagoPendiente) {
    return (
      <PantallaCuentaPedida
        qrToken={qrToken}
        numeroMesa={numeroMesa}
        nombreNegocio={nombreNegocio}
        colorMarca={colorMarca}
        totalFinal={totalFinal}
        llamado={llamadoPagoPendiente}
        urlVolver={urlVolver}
        conPropina={conPropina}
        formaPago={formaPago}
      />
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        background: 'var(--color-paper)',
        paddingBottom: '6rem',
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
          Tu cuenta
        </h1>

        <section
          className="rounded-[var(--radius-lg)] border bg-white mb-5 overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-5 py-3 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <p
              className="text-xs uppercase tracking-[0.14em]"
              style={{ color: 'var(--color-muted)' }}
            >
              Detalle de la mesa · {comandas.length} pedido
              {comandas.length === 1 ? '' : 's'}
            </p>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {comandas.map((c) => (
              <li key={c.comandaId} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-xs uppercase tracking-[0.1em]"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    #{c.numeroDiario.toString().padStart(3, '0')} · {c.cliente}
                  </p>
                  <span
                    className="font-[family-name:var(--font-mono)] text-sm"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    ${c.total.toLocaleString('es-CO')}
                  </span>
                </div>
                <ul className="space-y-1">
                  {c.items.map((it) => (
                    <li
                      key={it.id}
                      className="text-xs leading-relaxed flex items-start gap-2"
                    >
                      <span style={{ color: 'var(--color-muted)' }}>
                        {it.cantidad}×
                      </span>
                      <span
                        className="flex-1"
                        style={{ color: 'var(--color-ink-soft)' }}
                      >
                        {it.nombre_snapshot}
                        {it.nota ? (
                          <span
                            className="italic ml-1"
                            style={{ color: 'var(--color-muted)' }}
                          >
                            ({it.nota})
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rounded-[var(--radius-lg)] border bg-white p-5 mb-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--color-ink-soft)' }}>Subtotal</span>
              <span
                className="font-[family-name:var(--font-mono)]"
                style={{ color: 'var(--color-ink)' }}
              >
                ${subtotal.toLocaleString('es-CO')}
              </span>
            </div>

            <label
              className="flex items-center justify-between gap-3 py-2 cursor-pointer select-none"
              htmlFor="toggle-propina"
            >
              <div className="flex-1 min-w-0">
                <span
                  className="text-sm block"
                  style={{ color: 'var(--color-ink-soft)' }}
                >
                  Propina sugerida (10%)
                </span>
                <span
                  className="text-[0.7rem]"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Voluntaria. Decides tú.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {conPropina ? (
                  <span
                    className="text-sm font-[family-name:var(--font-mono)]"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    ${propina.toLocaleString('es-CO')}
                  </span>
                ) : null}
                <button
                  id="toggle-propina"
                  type="button"
                  role="switch"
                  aria-checked={conPropina}
                  onClick={() => setConPropina((v) => !v)}
                  className="relative h-6 w-11 rounded-full transition-colors"
                  style={{
                    background: conPropina
                      ? colorMarca
                      : 'var(--color-paper-deep)',
                    border: `1px solid ${
                      conPropina ? colorMarca : 'var(--color-border-strong)'
                    }`,
                  }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                    style={{
                      transform: conPropina
                        ? 'translateX(20px)'
                        : 'translateX(0)',
                    }}
                  />
                </button>
              </div>
            </label>

            <div
              className="border-t pt-3 mt-2 flex items-center justify-between"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span
                className="text-base font-medium"
                style={{ color: 'var(--color-ink)' }}
              >
                Total a pagar
              </span>
              <span
                className="font-[family-name:var(--font-display)] text-2xl"
                style={{ color: 'var(--color-ink)' }}
              >
                ${totalFinal.toLocaleString('es-CO')}
              </span>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <p
            className="text-xs uppercase tracking-[0.14em] mb-3"
            style={{ color: 'var(--color-muted)' }}
          >
            ¿Cómo prefieres pagar?
          </p>
          <div className="space-y-2">
            {FORMAS_PAGO.map((f) => (
              <label
                key={f.value}
                className="flex items-start gap-3 px-3.5 py-3 rounded-[var(--radius-md)] border cursor-pointer transition-colors bg-white"
                style={{
                  borderColor:
                    formaPago === f.value
                      ? colorMarca
                      : 'var(--color-border-strong)',
                  borderWidth: formaPago === f.value ? 1.5 : 1,
                }}
              >
                <input
                  type="radio"
                  name="formaPago"
                  value={f.value}
                  checked={formaPago === f.value}
                  onChange={() => setFormaPago(f.value)}
                  className="sr-only"
                />
                <div
                  className="size-5 rounded-full border-2 grid place-items-center shrink-0 mt-0.5"
                  style={{
                    borderColor:
                      formaPago === f.value
                        ? colorMarca
                        : 'var(--color-border-strong)',
                  }}
                >
                  {formaPago === f.value ? (
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
                    {f.label}
                  </p>
                  <p
                    className="text-[0.7rem] mt-0.5"
                    style={{ color: 'var(--color-ink-soft)' }}
                  >
                    {f.descripcion}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </section>

        <p
          className="text-[0.7rem] text-center mb-2 leading-relaxed px-2"
          style={{ color: 'var(--color-muted)' }}
        >
          Al pedir la cuenta, el mesero llega a tu mesa con la información que
          elegiste. La cuenta es para toda la mesa.
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
      </div>

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
          onClick={pedir}
          disabled={pending}
          className="w-full max-w-md mx-auto h-12 rounded-[var(--radius-md)] text-base font-medium flex items-center justify-between px-5 transition-opacity disabled:opacity-60"
          style={{ background: colorMarca, color: 'white' }}
        >
          <span>{pending ? 'Avisando…' : 'Pedir la cuenta'}</span>
          <span className="font-[family-name:var(--font-mono)]">
            ${totalFinal.toLocaleString('es-CO')}
          </span>
        </button>
      </div>
    </main>
  );
}

function PantallaCuentaPedida({
  qrToken,
  numeroMesa,
  nombreNegocio,
  colorMarca,
  totalFinal,
  llamado,
  urlVolver,
  conPropina,
  formaPago,
}: {
  qrToken: string;
  numeroMesa: string;
  nombreNegocio: string;
  colorMarca: string;
  totalFinal: number;
  llamado: { id: string; creado_en: string };
  urlVolver: string;
  conPropina: boolean;
  formaPago: FormaPago;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null);

  useEffect(() => {
    setSegundosRestantes(calcularSegundosRestantes(llamado.id));
    const interval = setInterval(() => {
      setSegundosRestantes(calcularSegundosRestantes(llamado.id));
    }, 1000);
    return () => clearInterval(interval);
  }, [llamado.id]);

  function reLlamar() {
    setError(null);
    startTransition(async () => {
      const cancelarRes = await cancelarLlamado({ qrToken, llamadoId: llamado.id });
      if (!cancelarRes.ok) {
        setError(cancelarRes.error);
        return;
      }
      borrarTimerLlamado(llamado.id);
      const crearRes = await pedirCuenta({ qrToken, conPropina, formaPago });
      if (!crearRes.ok) {
        setError(crearRes.error);
        return;
      }
      router.refresh();
    });
  }

  const puedeReLlamar = segundosRestantes !== null && segundosRestantes <= 0;
  const minutos = segundosRestantes !== null ? Math.floor(segundosRestantes / 60) : 0;
  const segs = segundosRestantes !== null ? segundosRestantes % 60 : 0;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        <div
          className="size-16 rounded-full grid place-items-center mx-auto mb-6 animate-pulse"
          style={{ background: colorMarca, color: 'white' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M14 2a8 8 0 0 0-8 8c0 5 4 6 4 11h8c0-5 4-6 4-11a8 8 0 0 0-8-8z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          El mesero viene con la cuenta.
        </h1>
        <p
          className="text-sm leading-relaxed mb-2"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Total a pagar:{' '}
          <span className="font-medium" style={{ color: 'var(--color-ink)' }}>
            ${totalFinal.toLocaleString('es-CO')}
          </span>
        </p>
        <p className="text-xs mb-8" style={{ color: 'var(--color-muted)' }}>
          Mesa {numeroMesa} · {nombreNegocio}
        </p>

        {segundosRestantes !== null ? (
          <div
            className="rounded-[var(--radius-md)] border px-4 py-3 mb-3"
            style={{ borderColor: 'var(--color-border)', background: 'white' }}
          >
            {puedeReLlamar ? (
              <button
                type="button"
                onClick={reLlamar}
                disabled={pending}
                className="w-full h-10 rounded-[var(--radius-md)] text-xs font-medium border transition-colors disabled:opacity-50"
                style={{ borderColor: colorMarca, color: colorMarca, background: 'white' }}
              >
                {pending ? 'Avisando…' : 'Volver a llamar al mesero'}
              </button>
            ) : (
              <p
                className="text-[0.7rem]"
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
        ) : null}

        {error ? (
          <p
            role="alert"
            className="text-xs mb-3"
            style={{ color: 'var(--color-danger)' }}
          >
            {error}
          </p>
        ) : null}

        <Link
          href={urlVolver}
          className="inline-flex items-center justify-center h-11 px-5 rounded-[var(--radius-md)] text-sm font-medium"
          style={{
            background: 'white',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border-strong)',
          }}
        >
          Volver al resumen
        </Link>
      </div>
    </main>
  );
}
