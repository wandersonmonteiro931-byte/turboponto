
ALTER TABLE public.jornadas ADD COLUMN IF NOT EXISTS codigo varchar(3);

-- Preenche códigos automáticos para jornadas existentes ainda sem código
WITH numbered AS (
  SELECT id, empresa_id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at, nome) AS rn
  FROM public.jornadas
  WHERE codigo IS NULL
)
UPDATE public.jornadas j
SET codigo = LPAD(n.rn::text, 3, '0')
FROM numbered n
WHERE j.id = n.id;

ALTER TABLE public.jornadas
  ALTER COLUMN codigo SET NOT NULL;

ALTER TABLE public.jornadas
  DROP CONSTRAINT IF EXISTS jornadas_codigo_format_chk;
ALTER TABLE public.jornadas
  ADD CONSTRAINT jornadas_codigo_format_chk
  CHECK (codigo ~ '^[A-Z0-9]{3}$');

CREATE UNIQUE INDEX IF NOT EXISTS jornadas_empresa_codigo_uniq
  ON public.jornadas (empresa_id, codigo);
