-- Migracion S16 (rate limiting Postgres-based)
-- Aplicada manualmente en SQL Editor de Supabase
-- Crea tabla rate_limits + funcion check_rate_limit para proteger endpoints publicos.
--
-- Endpoints protegidos en cliente:
--   - llamar_mesero: 10 / 60s
--   - pedir_cuenta:  5 / 300s
--   - crear_comanda: 20 / 60s

-- ============================================
-- Tabla rate_limits
-- ============================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  contador INTEGER NOT NULL DEFAULT 1,
  ventana_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_intento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key, action_type)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ventana
  ON public.rate_limits(ventana_inicio);

-- RLS sin policies = bloqueado para todos.
-- Solo accesible via service_role o la funcion check_rate_limit (security definer).
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Funcion check_rate_limit
-- ============================================
-- Devuelve TRUE si la accion esta dentro del limite (consume 1 contador).
-- Devuelve FALSE si excede el limite.
-- Las ventanas que ya expiraron se resetean automaticamente.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_action_type TEXT,
  p_max_requests INTEGER,
  p_ventana_segundos INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_ahora TIMESTAMPTZ := NOW();
  v_ventana_inicio TIMESTAMPTZ;
  v_contador INTEGER;
  v_ventana_segundos_str TEXT := p_ventana_segundos || ' seconds';
BEGIN
  SELECT ventana_inicio, contador
    INTO v_ventana_inicio, v_contador
  FROM public.rate_limits
  WHERE key = p_key AND action_type = p_action_type;

  IF v_ventana_inicio IS NULL THEN
    INSERT INTO public.rate_limits (key, action_type, contador, ventana_inicio, ultimo_intento)
    VALUES (p_key, p_action_type, 1, v_ahora, v_ahora);
    RETURN TRUE;

  ELSIF v_ahora - v_ventana_inicio > v_ventana_segundos_str::interval THEN
    UPDATE public.rate_limits
    SET contador = 1, ventana_inicio = v_ahora, ultimo_intento = v_ahora
    WHERE key = p_key AND action_type = p_action_type;
    RETURN TRUE;

  ELSIF v_contador >= p_max_requests THEN
    UPDATE public.rate_limits
    SET ultimo_intento = v_ahora
    WHERE key = p_key AND action_type = p_action_type;
    RETURN FALSE;

  ELSE
    UPDATE public.rate_limits
    SET contador = contador + 1, ultimo_intento = v_ahora
    WHERE key = p_key AND action_type = p_action_type;
    RETURN TRUE;
  END IF;
END;
$func$;