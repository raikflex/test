/**
 * Helper de horarios de atencion.
 * - Calcula si el restaurante esta abierto ahora (en hora Colombia).
 * - Calcula el proximo horario de apertura cuando esta cerrado.
 * - Sin dependencias externas; se duplica en apps/cliente y apps/admin.
 */

export type HorarioDia = {
  dia_semana: number; // 0=domingo, 1=lunes, ..., 6=sabado
  abierto: boolean;
  hora_apertura: string | null; // "HH:MM:SS" o "HH:MM"
  hora_cierre: string | null;
};

export type EstadoApertura =
  | { abierto: true }
  | { abierto: false; proximoTexto: string };

const NOMBRES_DIA = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
];

export function nombreDia(dia: number): string {
  return NOMBRES_DIA[dia] ?? '';
}

export function nombreDiaCapital(dia: number): string {
  const n = nombreDia(dia);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** Parsea "HH:MM:SS" o "HH:MM" a minutos desde medianoche. */
function parseHora(hora: string): number {
  const partes = hora.split(':');
  const h = parseInt(partes[0] ?? '0', 10);
  const m = parseInt(partes[1] ?? '0', 10);
  return h * 60 + m;
}

/** Formatea "08:00:00" o "08:00" como "8:00 am" / "10:00 pm". */
export function formatearHora(hora: string): string {
  const partes = hora.split(':');
  const h = parseInt(partes[0] ?? '0', 10);
  const m = parseInt(partes[1] ?? '0', 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Hora actual en zona Colombia (America/Bogota). */
function ahoraColombia(): { diaSemana: number; minutos: number } {
  const ahora = new Date();
  const colombia = new Date(
    ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }),
  );
  return {
    diaSemana: colombia.getDay(),
    minutos: colombia.getHours() * 60 + colombia.getMinutes(),
  };
}

/**
 * Determina si el restaurante esta abierto ahora segun los horarios.
 * Si esta cerrado, devuelve texto humano de cuando vuelve a abrir.
 */
export function estaAbiertoAhora(horarios: HorarioDia[]): EstadoApertura {
  const { diaSemana, minutos } = ahoraColombia();
  const horarioHoy = horarios.find((h) => h.dia_semana === diaSemana);

  if (
    horarioHoy?.abierto &&
    horarioHoy.hora_apertura &&
    horarioHoy.hora_cierre
  ) {
    const apertura = parseHora(horarioHoy.hora_apertura);
    const cierre = parseHora(horarioHoy.hora_cierre);

    // Caso normal: apertura < cierre (ej: 8am - 10pm)
    if (cierre > apertura && minutos >= apertura && minutos < cierre) {
      return { abierto: true };
    }
    // Caso cruce de medianoche: cierre <= apertura (ej: 6pm - 2am)
    if (cierre <= apertura && (minutos >= apertura || minutos < cierre)) {
      return { abierto: true };
    }
  }

  const proximoTexto = textoProximaApertura(horarios, diaSemana, minutos);
  return { abierto: false, proximoTexto };
}

function textoProximaApertura(
  horarios: HorarioDia[],
  diaActual: number,
  minutosActual: number,
): string {
  // Hoy todavia puede abrir mas tarde (ej: son las 7am y abre a las 8am)
  const horarioHoy = horarios.find((h) => h.dia_semana === diaActual);
  if (
    horarioHoy?.abierto &&
    horarioHoy.hora_apertura &&
    parseHora(horarioHoy.hora_apertura) > minutosActual
  ) {
    return `Abrimos hoy a las ${formatearHora(horarioHoy.hora_apertura)}`;
  }

  // Buscar el proximo dia abierto (hasta 7 dias hacia adelante)
  for (let i = 1; i <= 7; i++) {
    const dia = (diaActual + i) % 7;
    const horario = horarios.find((h) => h.dia_semana === dia);
    if (horario?.abierto && horario.hora_apertura) {
      const cuando = i === 1 ? 'manana' : `el ${nombreDia(dia)}`;
      return `Abrimos ${cuando} a las ${formatearHora(horario.hora_apertura)}`;
    }
  }

  return 'Pronto volvemos a abrir';
}
