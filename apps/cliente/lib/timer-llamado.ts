/**
 * Helper para que el timer de "podrás volver a llamar" sea consistente entre
 * navegaciones. El timestamp del primer momento que la UI vió el llamado se
 * guarda en sessionStorage; si el cliente vuelve a la pantalla, recuperamos
 * ese timestamp y mostramos el tiempo restante real.
 *
 * Sin esto, cada vez que el componente se monta el timer arranca de nuevo en
 * 1:45 aunque ya hayan pasado 50 segundos — confunde al cliente.
 *
 * Usamos Date.now() del browser (no creado_en de la DB) para evitar drift de
 * timezones. El cliente y el sessionStorage usan exactamente el mismo reloj.
 */

const SEGUNDOS_PARA_RELLAMAR = 105; // 1 minuto 45 segundos

function key(llamadoId: string) {
  return `mesaya:llamado-iniciado:${llamadoId}`;
}

/**
 * Devuelve los segundos restantes (0..105). Si es la primera vez que vemos
 * este llamado, registra `Date.now()` y devuelve 105.
 */
export function calcularSegundosRestantes(llamadoId: string): number {
  if (typeof window === 'undefined') return SEGUNDOS_PARA_RELLAMAR;

  const stored = window.sessionStorage.getItem(key(llamadoId));
  let inicioEn: number;

  if (stored) {
    const parsed = parseInt(stored, 10);
    if (Number.isFinite(parsed)) {
      inicioEn = parsed;
    } else {
      inicioEn = Date.now();
      window.sessionStorage.setItem(key(llamadoId), String(inicioEn));
    }
  } else {
    inicioEn = Date.now();
    window.sessionStorage.setItem(key(llamadoId), String(inicioEn));
  }

  const transcurridos = Math.floor((Date.now() - inicioEn) / 1000);
  return Math.max(0, SEGUNDOS_PARA_RELLAMAR - transcurridos);
}

/**
 * Borra el timestamp de un llamado. Llamar cuando se cancela/relamada para
 * que el siguiente llamado arranque desde cero.
 */
export function borrarTimerLlamado(llamadoId: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key(llamadoId));
}

export const SEGUNDOS_TIMER_LLAMADO = SEGUNDOS_PARA_RELLAMAR;
