/**
 * Esta página rara vez se renderiza: el middleware ya redirige según rol.
 * Pero como defensa en profundidad, mostramos un loading state y dejamos
 * que el middleware actúe en el siguiente request.
 */

export default function StaffHome() {
  return (
    <main
      className="min-h-screen grid place-items-center p-8"
      style={{ background: 'var(--color-paper)' }}
    >
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Cargando…
      </p>
    </main>
  );
}
