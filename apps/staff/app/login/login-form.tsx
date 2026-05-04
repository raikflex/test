'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@mesaya/database/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('invalid')) {
          setError('Correo o contraseña incorrectos.');
        } else {
          setError('No pudimos iniciar sesión. Intenta de nuevo.');
        }
        return;
      }

      // El middleware redirige según rol al hacer el siguiente request.
      router.push('/');
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-lg)] border bg-white px-6 py-7 space-y-4"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div>
        <label
          htmlFor="email"
          className="text-xs uppercase tracking-[0.14em] mb-2 block"
          style={{ color: 'var(--color-muted)' }}
        >
          Correo
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@restaurante.com"
          required
          autoFocus
          autoComplete="email"
          className="w-full h-11 px-3.5 rounded-[var(--radius-md)] border text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: 'var(--color-border-strong)',
            color: 'var(--color-ink)',
            background: 'var(--color-paper)',
          }}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="text-xs uppercase tracking-[0.14em] mb-2 block"
          style={{ color: 'var(--color-muted)' }}
        >
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full h-11 px-3.5 rounded-[var(--radius-md)] border text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: 'var(--color-border-strong)',
            color: 'var(--color-ink)',
            background: 'var(--color-paper)',
          }}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="text-xs text-center"
          style={{ color: 'var(--color-danger)' }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || email.length < 3 || password.length < 4}
        className="w-full h-12 rounded-[var(--radius-md)] text-base font-medium transition-opacity disabled:opacity-50"
        style={{
          background: 'var(--color-ink)',
          color: 'var(--color-paper)',
        }}
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>

      <p
        className="text-[0.7rem] text-center pt-2"
        style={{ color: 'var(--color-muted)' }}
      >
        ¿Olvidaste tu contraseña? Pide ayuda al dueño del restaurante.
      </p>
    </form>
  );
}
