import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p
            className="text-[0.7rem] uppercase tracking-[0.16em] mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            MesaYA · Staff
          </p>
          <h1
            className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] leading-[1.1]"
            style={{ color: 'var(--color-ink)' }}
          >
            Bienvenido al{' '}
            <em className="not-italic" style={{ fontStyle: 'italic', fontWeight: 400 }}>
              servicio
            </em>
            .
          </h1>
          <p
            className="text-sm mt-3 leading-relaxed"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Ingresa con tu correo para entrar a la cocina o al área de meseros.
          </p>
        </div>

        <LoginForm />
      </div>

      <p
        className="text-[0.7rem] uppercase tracking-[0.14em] mt-10"
        style={{ color: 'var(--color-muted)' }}
      >
        Servido con <span style={{ color: 'var(--color-ink)' }}>MesaYA</span>
      </p>
    </main>
  );
}
