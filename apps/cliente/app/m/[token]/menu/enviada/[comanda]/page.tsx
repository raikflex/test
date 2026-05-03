import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string; comanda: string }>;
}

type ItemFila = {
  id: string;
  nombre_snapshot: string;
  precio_snapshot: number;
  cantidad: number;
  nota: string | null;
};

type ComandaConItems = {
  id: string;
  numero_diario: number;
  estado: string;
  total: number;
  creada_en: string;
  items: ItemFila[];
};

const ETIQUETAS_ESTADO: Record<
  string,
  { label: string; tono: 'pending' | 'progress' | 'done' }
> = {
  pendiente: { label: 'En cola', tono: 'pending' },
  en_preparacion: { label: 'En preparación', tono: 'progress' },
  lista: { label: 'Lista', tono: 'progress' },
  entregada: { label: 'Entregada', tono: 'done' },
  cancelada: { label: 'Cancelada', tono: 'done' },
};

export default async function ComandaEnviadaPage({ params }: PageProps) {
  const { token, comanda } = await params;
  const supabase = await createClient();

  const { data: mesa } = await supabase
    .from('mesas')
    .select(
      `
      restaurante_id,
      numero,
      restaurantes (nombre_publico, color_marca)
    `,
    )
    .eq('qr_token', token)
    .maybeSingle();

  if (!mesa) notFound();

  const restaurante = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as {
    nombre_publico: string;
    color_marca: string;
  } | null;

  if (!restaurante) notFound();

  const { data: comandaActual } = await supabase
    .from('comandas')
    .select('id, sesion_id, sesion_cliente_id')
    .eq('id', comanda)
    .eq('restaurante_id', mesa.restaurante_id as string)
    .maybeSingle();

  if (!comandaActual) notFound();

  const { data: sesionCliente } = await supabase
    .from('sesion_clientes')
    .select('nombre')
    .eq('id', comandaActual.sesion_cliente_id as string)
    .maybeSingle();

  const nombreCliente = (sesionCliente?.nombre as string) ?? '';

  const { data: comandasRaw } = await supabase
    .from('comandas')
    .select('id, numero_diario, estado, total, creada_en')
    .eq('sesion_id', comandaActual.sesion_id as string)
    .eq('sesion_cliente_id', comandaActual.sesion_cliente_id as string)
    .order('creada_en', { ascending: true });

  const comandas = (comandasRaw ?? []) as Pick<
    ComandaConItems,
    'id' | 'numero_diario' | 'estado' | 'total' | 'creada_en'
  >[];

  if (comandas.length === 0) notFound();

  const comandaIds = comandas.map((c) => c.id);
  const { data: itemsRaw } = await supabase
    .from('comanda_items')
    .select('id, comanda_id, nombre_snapshot, precio_snapshot, cantidad, nota')
    .in('comanda_id', comandaIds)
    .order('id', { ascending: true });

  const itemsPorComanda = new Map<string, ItemFila[]>();
  for (const c of comandas) {
    itemsPorComanda.set(c.id, []);
  }
  for (const it of itemsRaw ?? []) {
    const arr = itemsPorComanda.get(it.comanda_id as string);
    if (arr) {
      arr.push({
        id: it.id as string,
        nombre_snapshot: it.nombre_snapshot as string,
        precio_snapshot: it.precio_snapshot as number,
        cantidad: it.cantidad as number,
        nota: (it.nota as string) ?? null,
      });
    }
  }

  const comandasConItems: ComandaConItems[] = comandas.map((c) => ({
    ...c,
    items: itemsPorComanda.get(c.id) ?? [],
  }));

  const totalAcumulado = comandasConItems.reduce((acc, c) => acc + c.total, 0);
  const colorMarca = restaurante.color_marca;
  const ultimaComanda = comandasConItems.find((c) => c.id === comanda)!;

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="flex-1 px-5 py-10 max-w-md mx-auto w-full">
        <div
          className="rounded-[var(--radius-lg)] p-5 mb-6 flex items-center gap-4"
          style={{
            background: colorMarca,
            color: 'white',
          }}
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
          Mesa {mesa.numero as string} · {restaurante.nombre_publico}
        </p>

        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-4"
          style={{ color: 'var(--color-ink)' }}
        >
          Tu cuenta hasta ahora
        </h2>

        <div className="space-y-3 mb-5">
          {comandasConItems.map((c) => (
            <ComandaCard
              key={c.id}
              comanda={c}
              esLaUltima={c.id === comanda}
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
                {comandasConItems.length} pedido
                {comandasConItems.length === 1 ? '' : 's'}
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
            href={`/m/${token}/menu`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium"
            style={{
              background: colorMarca,
              color: 'white',
            }}
          >
            Agregar más al pedido
          </Link>
          <Link
            href={`/m/${token}/llamar-mesero`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium border"
            style={{
              background: 'white',
              color: 'var(--color-ink)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Llamar al mesero
          </Link>
          <Link
            href={`/m/${token}/pedir-cuenta`}
            className="w-full h-12 grid place-items-center rounded-[var(--radius-md)] text-sm font-medium border"
            style={{
              background: 'white',
              color: 'var(--color-ink)',
              borderColor: 'var(--color-border-strong)',
            }}
          >
            Pedir la cuenta
          </Link>
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
    tono: 'pending' as const,
  };

  const hora = new Date(comanda.creada_en).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

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
          <span
            className="text-[0.7rem]"
            style={{ color: 'var(--color-muted)' }}
          >
            {hora}
          </span>
        </div>
        <EstadoPill etiqueta={etiqueta} />
      </header>

      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {comanda.items.map((item) => {
          const subtotal = item.precio_snapshot * item.cantidad;
          return (
            <li key={item.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm"
                    style={{ color: 'var(--color-ink)' }}
                  >
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
  etiqueta: { label: string; tono: 'pending' | 'progress' | 'done' };
}) {
  const estilos: Record<typeof etiqueta.tono, { bg: string; fg: string }> = {
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
