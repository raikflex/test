'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@mesaya/database/server';
import { createServiceClient } from '@mesaya/database/service';

export type ExcepcionInput = {
  fecha: string; // "YYYY-MM-DD"
  abierto: boolean;
  hora_apertura: string | null;
  hora_cierre: string | null;
  nota: string | null;
};

export type ResultadoExcepcion =
  | { ok: true }
  | { ok: false; error: string };

function validarInput(input: ExcepcionInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    return 'Fecha invalida.';
  }
  if (input.abierto) {
    if (!input.hora_apertura || !input.hora_cierre) {
      return 'Si esta abierto necesita hora de apertura y cierre.';
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.hora_apertura)) {
      return 'Hora de apertura con formato invalido.';
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.hora_cierre)) {
      return 'Hora de cierre con formato invalido.';
    }
    if (input.hora_apertura === input.hora_cierre) {
      return 'Apertura y cierre no pueden ser iguales.';
    }
  }
  if (input.nota && input.nota.length > 100) {
    return 'La nota es muy larga (max 100 caracteres).';
  }
  return null;
}

async function verificarDueno(): Promise<
  { ok: true; restauranteId: string } | { ok: false; error: string }
> {
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
    return { ok: false, error: 'Solo el dueno puede editar excepciones.' };
  }
  return { ok: true, restauranteId: perfil.restaurante_id as string };
}

/**
 * Crea o actualiza una excepcion (upsert por fecha).
 * Si ya existe una excepcion para esa fecha, la sobreescribe.
 */
export async function guardarExcepcion(
  input: ExcepcionInput,
): Promise<ResultadoExcepcion> {
  const errorValidacion = validarInput(input);
  if (errorValidacion) return { ok: false, error: errorValidacion };

  const auth = await verificarDueno();
  if (!auth.ok) return auth;

  const admin = createServiceClient();
  const { error } = await admin.from('excepciones_horario').upsert(
    {
      restaurante_id: auth.restauranteId,
      fecha: input.fecha,
      abierto: input.abierto,
      hora_apertura: input.abierto ? input.hora_apertura : null,
      hora_cierre: input.abierto ? input.hora_cierre : null,
      nota: input.nota?.trim() || null,
    },
    { onConflict: 'restaurante_id,fecha' },
  );

  if (error) {
    return {
      ok: false,
      error: 'No pudimos guardar la excepcion: ' + error.message,
    };
  }

  revalidatePath('/admin/horarios');
  return { ok: true };
}

/**
 * Elimina una excepcion. La fecha vuelve a usar el horario base.
 */
export async function eliminarExcepcion(
  fecha: string,
): Promise<ResultadoExcepcion> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: 'Fecha invalida.' };
  }

  const auth = await verificarDueno();
  if (!auth.ok) return auth;

  const admin = createServiceClient();
  const { error } = await admin
    .from('excepciones_horario')
    .delete()
    .eq('restaurante_id', auth.restauranteId)
    .eq('fecha', fecha);

  if (error) {
    return {
      ok: false,
      error: 'No pudimos eliminar la excepcion: ' + error.message,
    };
  }

  revalidatePath('/admin/horarios');
  return { ok: true };
}
