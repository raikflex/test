/**
 * Helper para gestionar la sesión del cliente en sessionStorage.
 * Sobrevive refresh, se borra al cerrar pestaña.
 *
 * Estructura:
 *   mesaya:cliente:{qr_token} → { nombre, iniciada_en, authUserId?, ultimaComandaId? }
 *
 * - authUserId: id del user anónimo de Supabase. Persiste para que múltiples
 *   comandas del mismo browser usen el mismo sesion_cliente_id.
 *
 * - ultimaComandaId: id de la última comanda enviada por este cliente. Se usa
 *   para que las pantallas /llamar-mesero y /pedir-cuenta tengan un "Volver"
 *   que apunte a la pantalla de confirmación con el acumulado.
 */

export type ClienteSession = {
  nombre: string;
  iniciadaEn: number;
  authUserId?: string;
  ultimaComandaId?: string;
};

function key(qrToken: string) {
  return `mesaya:cliente:${qrToken}`;
}

export function leerSesionCliente(qrToken: string): ClienteSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key(qrToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClienteSession;
    if (typeof parsed.nombre !== 'string' || parsed.nombre.length < 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function guardarSesionCliente(qrToken: string, nombre: string): void {
  if (typeof window === 'undefined') return;
  const existente = leerSesionCliente(qrToken);
  const session: ClienteSession = {
    nombre: nombre.trim(),
    iniciadaEn: Date.now(),
    authUserId: existente?.authUserId,
    ultimaComandaId: existente?.ultimaComandaId,
  };
  window.sessionStorage.setItem(key(qrToken), JSON.stringify(session));
}

export function guardarAuthUserId(qrToken: string, authUserId: string): void {
  if (typeof window === 'undefined') return;
  const existente = leerSesionCliente(qrToken);
  if (!existente) return;
  const actualizada: ClienteSession = {
    ...existente,
    authUserId,
  };
  window.sessionStorage.setItem(key(qrToken), JSON.stringify(actualizada));
}

export function guardarUltimaComandaId(qrToken: string, comandaId: string): void {
  if (typeof window === 'undefined') return;
  const existente = leerSesionCliente(qrToken);
  if (!existente) return;
  const actualizada: ClienteSession = {
    ...existente,
    ultimaComandaId: comandaId,
  };
  window.sessionStorage.setItem(key(qrToken), JSON.stringify(actualizada));
}

export function borrarSesionCliente(qrToken: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key(qrToken));
}

/** Capitaliza primera letra de cada palabra. "ana maría" → "Ana María". */
export function capitalizarNombre(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : ''))
    .join(' ');
}
