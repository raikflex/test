import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { PanelShell } from '../../_components/panel-shell';
import { ConfiguracionForm } from './configuracion-form';

export const metadata = { title: 'Configuración · MesaYA' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id) redirect('/admin/onboarding/paso-1');
  if (perfil.rol !== 'dueno') redirect('/login?error=acceso-denegado');

  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('nombre_publico, color_marca')
    .eq('id', perfil.restaurante_id as string)
    .single();

  const nombreActual = (restaurante?.nombre_publico as string) ?? 'Tu negocio';
  const colorActual = (restaurante?.color_marca as string) ?? '#1a1814';

  return (
    <PanelShell currentPage="configuracion" nombreNegocio={nombreActual}>
      <main className="px-6 sm:px-10 py-10 max-w-2xl mx-auto space-y-8">
        <header>
          <h1
            className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-[-0.025em] leading-[1.05]"
            style={{ color: 'var(--color-ink)' }}
          >
            Tu{' '}
            <em
              className="not-italic"
              style={{ fontStyle: 'italic', fontWeight: 400 }}
            >
              configuración
            </em>
            .
          </h1>
          <p
            className="mt-3 text-[0.95rem] leading-relaxed max-w-xl"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Cambia el nombre público de tu negocio o el color de marca que ven
            tus clientes en los menús y la app.
          </p>
        </header>

        <ConfiguracionForm
          nombreInicial={nombreActual}
          colorInicial={colorActual}
        />

        <section
          className="rounded-[var(--radius-lg)] border-2 border-dashed p-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h2
            className="text-xs uppercase tracking-[0.14em] mb-2"
            style={{ color: 'var(--color-muted)' }}
          >
            Próximamente
          </h2>
          <ul
            className="text-sm space-y-1 list-disc pl-5"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            <li>Modo oscuro</li>
            <li>Idioma del menú (español / inglés)</li>
            <li>Logo del restaurante</li>
            <li>Horarios de atención</li>
            <li>Moneda y formato de fecha</li>
          </ul>
        </section>
      </main>
    </PanelShell>
  );
}
