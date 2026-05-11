/**
 * Pantalla del cliente para los distintos estados que NO permiten pedir todavía.
 * En S4 esta misma estructura se reusa para el caso "activo" + flujo de menú.
 */

interface BaseProps {
  nombreNegocio: string;
  colorMarca: string;
  numeroMesa?: string;
}

interface EstadoProps extends BaseProps {
  tipo:
    | 'aun-no-abre'
    | 'cerrado'
    | 'suspendido'
    | 'mesa-inactiva'
    | 'placeholder-pedido'
    | 'pausado';
  proximaApertura?: string;
}

export function EstadoRestauranteScreen(props: EstadoProps) {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        {props.numeroMesa ? (
          <p
            className="text-[0.7rem] uppercase tracking-[0.16em] mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            Mesa {props.numeroMesa}
          </p>
        ) : null}
        <h1
          className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] leading-[1.1]"
          style={{ color: 'var(--color-ink)' }}
        >
          {props.nombreNegocio}
        </h1>

        <div className="mt-10">
          <Mensaje {...props} />
        </div>

        <p
          className="mt-12 text-[0.7rem] uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Servido con{' '}
          <span style={{ color: 'var(--color-ink)' }}>MesaYA</span>
        </p>
      </div>
    </main>
  );
}

function Mensaje(props: EstadoProps) {
  const { tipo, colorMarca } = props;

  if (tipo === 'aun-no-abre') {
    return (
      <Card colorMarca={colorMarca} icon={<IconClock />}>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Aún no abrimos.
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Estamos terminando de preparar todo. Vuelve a escanear este código
          cuando vengas en horario, y podrás pedir desde tu mesa.
        </p>
      </Card>
    );
  }

  if (tipo === 'cerrado') {
    return (
      <Card colorMarca={colorMarca} icon={<IconMoon />}>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Estamos cerrados ahora.
        </h2>
        {props.proximaApertura ? (
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            {props.proximaApertura}.
          </p>
        ) : (
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Vuelve a escanear cuando estemos en horario.
          </p>
        )}
      </Card>
    );
  }

  if (tipo === 'suspendido') {
    return (
      <Card colorMarca={colorMarca} icon={<IconWarning />}>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Servicio temporalmente pausado.
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          El restaurante no está atendiendo en este momento. Si quieres pedir,
          llama al mesero o pide directamente en la barra.
        </p>
      </Card>
    );
  }

  if (tipo === 'pausado') {
    return (
      <Card colorMarca={colorMarca} icon={<IconPause />}>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Estamos en pausa.
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Volvemos a recibir pedidos en un momento. Mientras tanto, podés
          llamar al mesero o pedir directo en la barra.
        </p>
      </Card>
    );
  }

  if (tipo === 'mesa-inactiva') {
    return (
      <Card colorMarca={colorMarca} icon={<IconWarning />}>
        <h2
          className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
          style={{ color: 'var(--color-ink)' }}
        >
          Esta mesa no está disponible.
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Por favor llama al mesero. Es posible que estemos reorganizando el
          salón.
        </p>
      </Card>
    );
  }

  // placeholder-pedido (cuando el restaurante está activo)
  return (
    <Card colorMarca={colorMarca} icon={<IconMenu />}>
      <h2
        className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mb-3"
        style={{ color: 'var(--color-ink)' }}
      >
        Tu menú está casi listo.
      </h2>
      <p
        className="text-sm leading-relaxed"
        style={{ color: 'var(--color-ink-soft)' }}
      >
        El sistema de pedidos se enciende muy pronto. Por ahora, llama al
        mesero o pide directo en la barra.
      </p>
    </Card>
  );
}

function Card({
  colorMarca,
  icon,
  children,
}: {
  colorMarca: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border bg-white px-6 py-8"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        className="size-14 rounded-full grid place-items-center mx-auto mb-5"
        style={{ background: colorMarca, color: 'white' }}
      >
        {icon}
      </div>
      {children}
    </div>
  );
}

function IconClock() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points="14 2 14 8 20 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 13h6M9 17h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="6"
        y="5"
        width="4"
        height="14"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="5"
        width="4"
        height="14"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}