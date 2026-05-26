ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS matricula text;
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON public.funcionarios(empresa_id, matricula);