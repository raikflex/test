import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { EstadoRestauranteScreen } from './estado-restaurante';
import { FormularioNombre } from './formulario-nombre';
import {
  estaAbiertoAhora,
  type HorarioDia,
  type ExcepcionDia,
} from '../../../lib/horarios';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: mesa } = await supabase
    .from('mesas')
    .select('numero, restaurantes(nombre_publico)')
    .eq('qr_token', token)
    .is('borrada_en', null)
    .maybeSingle();

  if (!mesa) {
    return { title: 'MesaYA' };
  }

  const rest = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as { nombre_publico?: string } | null;
  const nombre = rest?.nombre_publico ?? 'Restaurante';
  return {
    title: `Mesa ${mesa.numero as string} - ${nombre}`,
  };
}

export default async function MesaQRPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: mesa } = await supabase
    .from('mesas')
    .select(
      `
      id,
      numero,
      activa,
      restaurante_id,
      restaurantes (
        id,
        nombre_publico,
        color_marca,
        estado
      )
    `,
    )
    .eq('qr_token', token)
    .is('borrada_en', null)
    .maybeSingle();

  if (!mesa) {
    notFound();
  }

  const restaurante = (Array.isArray(mesa.restaurantes)
    ? mesa.restaurantes[0]
    : mesa.restaurantes) as {
    id: string;
    nombre_publico: string;
    color_marca: string;
    estado: 'activo' | 'archivado' | 'suspendido' | 'pausado';
  } | null;

  if (!restaurante) {
    notFound();
  }

  if (restaurante.estado === 'archivado') {
    return (
      <EstadoRestauranteScreen
        tipo="aun-no-abre"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
      />
    );
  }

  if (restaurante.estado === 'suspendido') {
    return (
      <EstadoRestauranteScreen
        tipo="suspendido"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
      />
    );
  }

  if (!mesa.activa) {
    return (
      <EstadoRestauranteScreen
        tipo="mesa-inactiva"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
        numeroMesa={mesa.numero as string}
      />
    );
  }

  if (restaurante.estado === 'pausado') {
    return (
      <EstadoRestauranteScreen
        tipo="pausado"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
      />
    );
  }

  // Verificar horario considerando excepciones
  const hoy = new Date().toISOString().slice(0, 10);
  const en30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: horariosRaw }, { data: excepcionesRaw }] = await Promise.all([
    supabase
      .from('horarios_atencion')
      .select('dia_semana, abierto, hora_apertura, hora_cierre')
      .eq('restaurante_id', restaurante.id)
      .order('dia_semana', { ascending: true }),
    supabase
      .from('excepciones_horario')
      .select('fecha, abierto, hora_apertura, hora_cierre, nota')
      .eq('restaurante_id', restaurante.id)
      .gte('fecha', hoy)
      .lte('fecha', en30Dias)
      .order('fecha', { ascending: true }),
  ]);

  const horarios: HorarioDia[] = (horariosRaw ?? []).map((h) => ({
    dia_semana: h.dia_semana as number,
    abierto: h.abierto as boolean,
    hora_apertura: (h.hora_apertura as string | null) ?? null,
    hora_cierre: (h.hora_cierre as string | null) ?? null,
  }));

  const excepciones: ExcepcionDia[] = (excepcionesRaw ?? []).map((e) => ({
    fecha: e.fecha as string,
    abierto: e.abierto as boolean,
    hora_apertura: (e.hora_apertura as string | null) ?? null,
    hora_cierre: (e.hora_cierre as string | null) ?? null,
    nota: (e.nota as string | null) ?? null,
  }));

  const estadoApertura = estaAbiertoAhora(horarios, excepciones);
  if (!estadoApertura.abierto) {
    return (
      <EstadoRestauranteScreen
        tipo="cerrado"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
        proximaApertura={estadoApertura.proximoTexto}
      />
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: 'var(--color-paper)' }}
    >
      <div className="w-full max-w-sm">
        <p
          className="text-[0.7rem] uppercase tracking-[0.16em] mb-2"
          style={{ color: 'var(--color-muted)' }}
        >
          Mesa {mesa.numero as string}
        </p>
        <h1
          className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.02em] leading-[1.1]"
          style={{ color: 'var(--color-ink)' }}
        >
          {restaurante.nombre_publico}
        </h1>

        <div className="mt-8">
          <FormularioNombre
            qrToken={token}
            numeroMesa={mesa.numero as string}
            colorMarca={restaurante.color_marca}
          />
        </div>

        <p
          className="mt-10 text-[0.7rem] uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted)' }}
        >
          Servido con <span style={{ color: 'var(--color-ink)' }}>MesaYA</span>
        </p>
      </div>
    </main>
  );
}
