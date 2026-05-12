'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@mesaya/database/server';
import { createServiceClient } from '@mesaya/database/service';

export type HorarioInput = {
  dia_semana: number;
  abierto: boolean;
  hora_apertura: string | null;
  hora_cierre: string | null;
};
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
function nombreDia(n: number): string {
  return NOMBRES_DIA[n] ?? `Dia ${n}`;
}
export type ActualizarHorariosResultado =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Actualiza los 7 dias del horario del restaurante del dueño logueado.
 * El array debe contener exactamente 7 filas (una por dia_semana 0-6).
 *
 * Usa service client para el upsert porque las RLS policies sobre
 * horarios_atencion solo permiten lectura publica.
 */
export async function actualizarHorarios(
  horarios: HorarioInput[],
): Promise<ActualizarHorariosResultado> {
  // Validaciones baratas primero
  if (!Array.isArray(horarios) || horarios.length !== 7) {
    return { ok: false, error: 'Se esperan exactamente 7 dias.' };
  }

  const diasVistos = new Set<number>();
  for (const h of horarios) {
    if (
      typeof h.dia_semana !== 'number' ||
      h.dia_semana < 0 ||
      h.dia_semana > 6
    ) {
      return { ok: false, error: `dia_semana invalido: ${h.dia_semana}` };
    }
    if (diasVistos.has(h.dia_semana)) {
      return { ok: false, error: `dia_semana duplicado: ${h.dia_semana}` };
    }
    diasVistos.add(h.dia_semana);

    if (h.abierto) {
      if (!h.hora_apertura || !h.hora_cierre) {
        return {
          ok: false,
          error: `${nombreDia(h.dia_semana)}: necesita hora de apertura y cierre.`,
        };
      }
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(h.hora_apertura)) {
        return {
          ok: false,
          error: `${nombreDia(h.dia_semana)}: hora de apertura invalida.`,
        };
      }
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(h.hora_cierre)) {
        return {
          ok: false,
          error: `${nombreDia(h.dia_semana)}: hora de cierre invalida.`,
        };
      }
      if (h.hora_apertura === h.hora_cierre) {
        return {
          ok: false,
          error: `${nombreDia(h.dia_semana)}: apertura y cierre no pueden ser iguales.`,
        };
      }
    }
  }

  // Verificar dueño via tabla perfiles
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('restaurante_id, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (!perfil?.restaurante_id || perfil.rol !== 'dueno') {
    return { ok: false, error: 'Solo el dueno puede editar horarios.' };
  }

  // Upsert con service client (bypass RLS)
  const admin = createServiceClient();
  const filas = horarios.map((h) => ({
    restaurante_id: perfil.restaurante_id as string,
    dia_semana: h.dia_semana,
    abierto: h.abierto,
    hora_apertura: h.abierto ? h.hora_apertura : null,
    hora_cierre: h.abierto ? h.hora_cierre : null,
  }));

  const { error } = await admin
    .from('horarios_atencion')
    .upsert(filas, { onConflict: 'restaurante_id,dia_semana' });

  if (error) {
    return {
      ok: false,
      error: 'No pudimos guardar el cambio: ' + error.message,
    };
  }

  revalidatePath('/admin/horarios');
  revalidatePath('/admin');
  return { ok: true };
}
import { alternarEstadoRestaurante } from '../estado-restaurante-actions';

/**
 * Wrapper de alternarEstadoRestaurante para usar como form action directo.
 * React 19 exige que las form actions retornen void; este wrapper descarta
 * el resultado (el revalidate de la action original ya refresca la UI).
 */
export async function togglePausaForm(formData: FormData): Promise<void> {
  await alternarEstadoRestaurante(formData);
}