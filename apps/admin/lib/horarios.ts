/**
 * Helper de horarios de atencion.
 * - Calcula si el restaurante esta abierto ahora (en hora Colombia).
 * - Calcula el proximo horario de apertura cuando esta cerrado.
 * - Considera excepciones para fechas especificas (festivos) que sobreescriben
 *   el horario base.
 * - Sin dependencias externas; se duplica en apps/cliente y apps/admin.
 */

export type HorarioDia = {
  dia_semana: number; // 0=domingo, 1=lunes, ..., 6=sabado
  abierto: boolean;
  hora_apertura: string | null; // "HH:MM:SS" o "HH:MM"
  hora_cierre: string | null;
};

export type ExcepcionDia = {
  fecha: string; // "YYYY-MM-DD"
  abierto: boolean;
  hora_apertura: string | null;
  hora_cierre: string | null;
  nota?: string | null;
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

/** Devuelve la fecha actual en Colombia como "YYYY-MM-DD". */
function fechaColombia(offsetDias: number = 0): string {
  const ahora = new Date();
  const colombia = new Date(
    ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }),
  );
  if (offsetDias !== 0) {
    colombia.setDate(colombia.getDate() + offsetDias);
  }
  const y = colombia.getFullYear();
  const m = (colombia.getMonth() + 1).toString().padStart(2, '0');
  const d = colombia.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Hora actual en zona Colombia (America/Bogota). */
function ahoraColombia(): {
  diaSemana: number;
  minutos: number;
  fecha: string;
} {
  const ahora = new Date();
  const colombia = new Date(
    ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }),
  );
  const y = colombia.getFullYear();
  const m = (colombia.getMonth() + 1).toString().padStart(2, '0');
  const d = colombia.getDate().toString().padStart(2, '0');
  return {
    diaSemana: colombia.getDay(),
    minutos: colombia.getHours() * 60 + colombia.getMinutes(),
    fecha: `${y}-${m}-${d}`,
  };
}

/**
 * Determina si el restaurante esta abierto ahora.
 * Las excepciones (festivos, dias especiales) sobreescriben el horario base.
 */
export function estaAbiertoAhora(
  horarios: HorarioDia[],
  excepciones: ExcepcionDia[] = [],
): EstadoApertura {
  const { diaSemana, minutos, fecha } = ahoraColombia();

  // 1. Si hay excepcion para hoy, gana sobre el horario base
  const excepcionHoy = excepciones.find((e) => e.fecha === fecha);
  if (excepcionHoy) {
    if (
      excepcionHoy.abierto &&
      excepcionHoy.hora_apertura &&
      excepcionHoy.hora_cierre
    ) {
      const apertura = parseHora(excepcionHoy.hora_apertura);
      const cierre = parseHora(excepcionHoy.hora_cierre);
      if (cierre > apertura && minutos >= apertura && minutos < cierre) {
        return { abierto: true };
      }
      if (cierre <= apertura && (minutos >= apertura || minutos < cierre)) {
        return { abierto: true };
      }
    }
    // Excepcion dice cerrado o estamos fuera del horario de la excepcion
    return {
      abierto: false,
      proximoTexto: textoProximaApertura(horarios, excepciones),
    };
  }

  // 2. Sin excepcion: usar horario base por dia de semana
  const horarioHoy = horarios.find((h) => h.dia_semana === diaSemana);
  if (
    horarioHoy?.abierto &&
    horarioHoy.hora_apertura &&
    horarioHoy.hora_cierre
  ) {
    const apertura = parseHora(horarioHoy.hora_apertura);
    const cierre = parseHora(horarioHoy.hora_cierre);
    if (cierre > apertura && minutos >= apertura && minutos < cierre) {
      return { abierto: true };
    }
    if (cierre <= apertura && (minutos >= apertura || minutos < cierre)) {
      return { abierto: true };
    }
  }

  return {
    abierto: false,
    proximoTexto: textoProximaApertura(horarios, excepciones),
  };
}

/**
 * Calcula el texto de proxima apertura considerando excepciones.
 * Mira hoy primero (puede abrir mas tarde) y despues hasta 30 dias adelante.
 */
function textoProximaApertura(
  horarios: HorarioDia[],
  excepciones: ExcepcionDia[],
): string {
  const { diaSemana, minutos } = ahoraColombia();

  // Verificar HOY: con excepcion o sin
  const fechaHoy = fechaColombia(0);
  const excepHoy = excepciones.find((e) => e.fecha === fechaHoy);

  if (excepHoy?.abierto && excepHoy.hora_apertura) {
    const apertura = parseHora(excepHoy.hora_apertura);
    if (apertura > minutos) {
      return `Abrimos hoy a las ${formatearHora(excepHoy.hora_apertura)}`;
    }
  } else if (!excepHoy) {
    // Sin excepcion hoy: ver horario base
    const horarioHoy = horarios.find((h) => h.dia_semana === diaSemana);
    if (
      horarioHoy?.abierto &&
      horarioHoy.hora_apertura &&
      parseHora(horarioHoy.hora_apertura) > minutos
    ) {
      return `Abrimos hoy a las ${formatearHora(horarioHoy.hora_apertura)}`;
    }
  }

  // Buscar el proximo dia abierto (hasta 30 dias hacia adelante)
  for (let i = 1; i <= 30; i++) {
    const fechaDia = fechaColombia(i);
    const dia = (diaSemana + i) % 7;
    const excep = excepciones.find((e) => e.fecha === fechaDia);

    // Si hay excepcion para ese dia, usarla
    if (excep) {
      if (excep.abierto && excep.hora_apertura) {
        const cuando = i === 1 ? 'manana' : `el ${nombreDia(dia)}`;
        return `Abrimos ${cuando} a las ${formatearHora(excep.hora_apertura)}`;
      }
      // Excepcion cerrada: continuar buscando
      continue;
    }

    // Sin excepcion: ver horario base
    const horario = horarios.find((h) => h.dia_semana === dia);
    if (horario?.abierto && horario.hora_apertura) {
      const cuando = i === 1 ? 'manana' : `el ${nombreDia(dia)}`;
      return `Abrimos ${cuando} a las ${formatearHora(horario.hora_apertura)}`;
    }
  }

  return 'Pronto volvemos a abrir';
}
