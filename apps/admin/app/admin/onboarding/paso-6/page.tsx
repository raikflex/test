import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { MesasManager } from './mesas-manager';

export const metadata = { title: 'Paso 6 · Mesas' };

export default async function Paso6Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id) redirect('/admin/onboarding/paso-1');

  const { data: mesas } = await supabase
    .from('mesas')
    .select('id, numero, capacidad, qr_token')
    .eq('restaurante_id', perfil.restaurante_id)
    .order('numero', { ascending: true });

  return (
    <main className="px-6 sm:px-10 py-10 sm:py-14 max-w-3xl mx-auto">
      <header className="mb-10">
        <p
          className="text-xs uppercase tracking-[0.16em] mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          Paso 6 de 8
        </p>
        <h1
          className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-[-0.025em] leading-[1.05]"
          style={{ color: 'var(--color-ink)' }}
        >
          Tus{' '}
          <em className="not-italic" style={{ fontStyle: 'italic', fontWeight: 400 }}>
            mesas
          </em>
          .
        </h1>
        <p
          className="mt-4 text-[0.95rem] leading-relaxed max-w-xl"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Cada mesa tendrá su propio QR. Empieza diciéndonos cuántas mesas hay; después
          ajustas la capacidad de cada una si quieres.
        </p>
      </header>

      <MesasManager
        mesas={(mesas ?? []).map((m) => ({
          id: m.id as string,
          numero: m.numero as string,
          capacidad: m.capacidad as number,
          qr_token: m.qr_token as string,
        }))}
      />
    </main>
  );
}
