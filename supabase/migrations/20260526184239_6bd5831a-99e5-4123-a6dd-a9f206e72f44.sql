CREATE TABLE public.holerite_rubricas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL,
  codigo text NOT NULL,
  descricao text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('provento','desconto')),
  tipo_calculo text NOT NULL DEFAULT 'manual' CHECK (tipo_calculo IN ('manual','valor_fixo','percentual_salario','salario_base','horas_extras_50','horas_extras_100','atrasos','faltas_dias','dsr_faltas')),
  valor_referencia numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, codigo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holerite_rubricas TO authenticated;
GRANT ALL ON public.holerite_rubricas TO service_role;

ALTER TABLE public.holerite_rubricas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia rubricas" ON public.holerite_rubricas
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admin/Gerente veem rubricas" ON public.holerite_rubricas
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role)));

CREATE TRIGGER trg_rubricas_updated BEFORE UPDATE ON public.holerite_rubricas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();