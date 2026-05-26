CREATE TABLE public.lotacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, codigo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotacoes TO authenticated;
GRANT ALL ON public.lotacoes TO service_role;

ALTER TABLE public.lotacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia lotacoes" ON public.lotacoes
  FOR ALL USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admin/Gerente veem lotacoes" ON public.lotacoes
  FOR SELECT USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role)));

CREATE POLICY "Funcionario ve lotacoes ativas" ON public.lotacoes
  FOR SELECT USING (ativo = true AND EXISTS (
    SELECT 1 FROM public.funcionarios f WHERE f.usuario_id = auth.uid() AND f.empresa_id = lotacoes.empresa_id
  ));

CREATE TRIGGER trg_lotacoes_updated BEFORE UPDATE ON public.lotacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();