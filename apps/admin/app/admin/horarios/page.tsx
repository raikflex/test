import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { PanelShell } from '../../_components/panel-shell';
import { HorariosEditor } from './horarios-editor';
import type { HorarioDia } from '../../../lib/horarios';

export const metadata = { title: 'Horarios' };

export default async function HorariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, restaurante_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id) redirect('/admin/onboarding/paso-1');
  if (perfil.rol !== 'dueno') redirect('/admin');

  const restauranteId = perfil.restaurante_id as string;

  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('nombre_publico, estado')
    .eq('id', restauranteId)
    .maybeSingle();

  const nombreNegocio =
    (restaurante?.nombre_publico as string) ?? 'Tu restaurante';
  const estado = (restaurante?.estado as string) ?? 'activo';

  const { data: horariosRaw } = await supabase
    .from('horarios_atencion')
    .select('dia_semana, abierto, hora_apertura, hora_cierre')
    .eq('restaurante_id', restauranteId)
    .order('dia_semana', { ascending: true });

  const horarios: HorarioDia[] = (horariosRaw ?? []).map((h) => ({
    dia_semana: h.dia_semana as number,
    abierto: h.abierto as boolean,
    hora_apertura: (h.hora_apertura as string | null) ?? null,
    hora_cierre: (h.hora_cierre as string | null) ?? null,
  }));

  return (
    <PanelShell currentPage="horarios" nombreNegocio={nombreNegocio}>
      <main className="px-6 sm:px-10 py-10 sm:py-14 max-w-3xl mx-auto">
        <header className="mb-10">
          <p
            className="text-xs uppercase tracking-[0.16em] mb-3"
            style={{ color: 'var(--color-muted)' }}
          >
            Configuracion
          </p>
          <h1
            className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-[-0.025em] leading-[1.05]"
            style={{ color: 'var(--color-ink)' }}
          >
            Horarios de{' '}
            <em
              className="not-italic"
              style={{ fontStyle: 'italic', fontWeight: 400 }}
            >
              atencion
            </em>
            .
          </h1>
          <p
            className="mt-4 text-[0.95rem] leading-relaxed max-w-xl"
            style={{ color: 'var(--color-ink-soft)' }}
          >
            Define cuando recibis pedidos. Fuera del horario los clientes ven
            que estas cerrado y no pueden ordenar.
          </p>
        </header>

        <HorariosEditor
          horariosIniciales={horarios}
          estadoRestaurante={estado}
        />
      </main>
    </PanelShell>
  );
}
