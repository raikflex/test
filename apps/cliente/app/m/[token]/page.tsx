import { notFound } from 'next/navigation';
import { createClient } from '@mesaya/database/server';
import { EstadoRestauranteScreen } from './estado-restaurante';
import { FormularioNombre } from './formulario-nombre';

/**
 * Entrada del cliente al escanear un QR.
 * URL: m.mesaya.co/m/{qr_token}
 *
 * Si el restaurante está activo y la mesa funciona:
 *   - Muestra formulario "¿cómo te llamas?"
 *   - Tras dar nombre, redirige a /m/{token}/menu
 *
 * Si hay algún estado bloqueante (archivado/cerrado/etc), muestra esa pantalla.
 */

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
    .maybeSingle();

  if (!mesa) {
    return { title: 'MesaYA' };
  }

  const rest = (Array.isArray(mesa.restaurantes) ? mesa.restaurantes[0] : mesa.restaurantes) as { nombre_publico?: string } | null;
  const nombre = rest?.nombre_publico ?? 'Restaurante';
  return {
    title: `Mesa ${mesa.numero as string} · ${nombre}`,
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
        estado,
        horario_apertura,
        horario_cierre,
        dias_operacion,
        timezone
      )
    `,
    )
    .eq('qr_token', token)
    .maybeSingle();

  if (!mesa) {
    notFound();
  }

  const restaurante = (Array.isArray(mesa.restaurantes) ? mesa.restaurantes[0] : mesa.restaurantes) as {
    id: string;
    nombre_publico: string;
    color_marca: string;
    estado: 'activo' | 'archivado' | 'suspendido' | 'pausado';
    horario_apertura: string;
    horario_cierre: string;
    dias_operacion: string[];
    timezone: string;
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

  const ahoraEnTZ = ahoraEnTimezone(restaurante.timezone);
  if (!estaAbierto(ahoraEnTZ, restaurante)) {
    return (
      <EstadoRestauranteScreen
        tipo="cerrado"
        nombreNegocio={restaurante.nombre_publico}
        colorMarca={restaurante.color_marca}
        proximaApertura={proximaApertura(ahoraEnTZ, restaurante)}
      />
    );
  }

  // Activo + en horario + mesa activa → pedir el nombre del cliente.
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

/* ============ helpers de horario (sin cambios desde S3) ============ */

function ahoraEnTimezone(tz: string): { dia: string; hora: string } {
  const ahora = new Date();
  const fmt = new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = fmt.formatToParts(ahora);
  const weekday = partes.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? '';
  const hora = partes.find((p) => p.type === 'hour')?.value ?? '00';
  const minuto = partes.find((p) => p.type === 'minute')?.value ?? '00';

  const map: Record<string, string> = {
    lun: 'lun',
    mar: 'mar',
    mié: 'mie',
    jue: 'jue',
    vie: 'vie',
    sáb: 'sab',
    dom: 'dom',
  };
  const sin_punto = weekday.replace('.', '');
  const dia = map[sin_punto] ?? sin_punto.slice(0, 3);

  return { dia, hora: `${hora}:${minuto}` };
}

function estaAbierto(
  ahora: { dia: string; hora: string },
  rest: { dias_operacion: string[]; horario_apertura: string; horario_cierre: string },
): boolean {
  if (!rest.dias_operacion.includes(ahora.dia)) return false;

  const apertura = rest.horario_apertura.slice(0, 5);
  const cierre = rest.horario_cierre.slice(0, 5);

  if (apertura <= cierre) {
    return ahora.hora >= apertura && ahora.hora < cierre;
  }
  return ahora.hora >= apertura || ahora.hora < cierre;
}

function proximaApertura(
  ahora: { dia: string; hora: string },
  rest: { dias_operacion: string[]; horario_apertura: string },
): string {
  const ordenDias = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const nombreDias: Record<string, string> = {
    lun: 'lunes',
    mar: 'martes',
    mie: 'miércoles',
    jue: 'jueves',
    vie: 'viernes',
    sab: 'sábado',
    dom: 'domingo',
  };

  const idxHoy = ordenDias.indexOf(ahora.dia);
  if (idxHoy === -1) return '';

  if (
    rest.dias_operacion.includes(ahora.dia) &&
    ahora.hora < rest.horario_apertura.slice(0, 5)
  ) {
    return `Abre hoy a las ${rest.horario_apertura.slice(0, 5)}`;
  }

  for (let i = 1; i <= 7; i++) {
    const idx = (idxHoy + i) % 7;
    const dia = ordenDias[idx]!;
    if (rest.dias_operacion.includes(dia)) {
      return `Abre el ${nombreDias[dia]} a las ${rest.horario_apertura.slice(0, 5)}`;
    }
  }
  return '';
}
