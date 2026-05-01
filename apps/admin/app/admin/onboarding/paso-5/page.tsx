import { redirect } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { ProductosManager } from './productos-manager';

export const metadata = { title: 'Paso 5 · Productos' };

export default async function Paso5Page() {
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

  const [{ data: productos }, { data: categorias }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, nombre, precio, descripcion, categoria_id, disponible, orden')
      .eq('restaurante_id', perfil.restaurante_id)
      .order('orden', { ascending: true }),
    supabase
      .from('categorias')
      .select('id, nombre')
      .eq('restaurante_id', perfil.restaurante_id)
      .eq('activa', true)
      .order('orden', { ascending: true }),
  ]);

  if (!categorias || categorias.length === 0) {
    redirect('/admin/onboarding/paso-4');
  }

  return (
    <main className="px-6 sm:px-10 py-10 sm:py-14 max-w-3xl mx-auto">
      <header className="mb-10">
        <p
          className="text-xs uppercase tracking-[0.16em] mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          Paso 5 de 8
        </p>
        <h1
          className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-[-0.025em] leading-[1.05]"
          style={{ color: 'var(--color-ink)' }}
        >
          Tus{' '}
          <em className="not-italic" style={{ fontStyle: 'italic', fontWeight: 400 }}>
            productos
          </em>
          .
        </h1>
        <p
          className="mt-4 text-[0.95rem] leading-relaxed max-w-xl"
          style={{ color: 'var(--color-ink-soft)' }}
        >
          Agrega los platos y bebidas de tu carta. Empieza con los más populares; siempre
          puedes agregar más después.
        </p>
      </header>

      <ProductosManager
        productos={(productos ?? []).map((p) => ({
          id: p.id as string,
          nombre: p.nombre as string,
          precio: p.precio as number,
          descripcion: p.descripcion as string | null,
          categoria_id: p.categoria_id as string,
          disponible: p.disponible as boolean,
          orden: p.orden as number,
        }))}
        categorias={(categorias ?? []).map((c) => ({
          id: c.id as string,
          nombre: c.nombre as string,
        }))}
      />
    </main>
  );
}
