
-- Extend holerites with header fields used in the recibo template
ALTER TABLE public.holerites
  ADD COLUMN IF NOT EXISTS folha_tipo text NOT NULL DEFAULT 'MENSAL',
  ADD COLUMN IF NOT EXISTS periodo_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_fim date,
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS banco_agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS num_dep_irrf integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_dep_sal_fam integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salario_contratual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_proventos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_descontos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_liquido numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sal_contrib_inss numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_fgts numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgts_mes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_irpf numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lotacao text,
  ADD COLUMN IF NOT EXISTS observacoes text;

-- pdf_url already exists; make it nullable so we can generate later
ALTER TABLE public.holerites ALTER COLUMN pdf_url DROP NOT NULL;

-- Line items (proventos / descontos / resultado)
CREATE TABLE IF NOT EXISTS public.holerite_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holerite_id uuid NOT NULL REFERENCES public.holerites(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  codigo text NOT NULL,
  descricao text NOT NULL,
  qtde numeric,
  provento numeric NOT NULL DEFAULT 0,
  desconto numeric NOT NULL DEFAULT 0,
  resultado numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holerite_lancamentos_holerite ON public.holerite_lancamentos(holerite_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holerite_lancamentos TO authenticated;
GRANT ALL ON public.holerite_lancamentos TO service_role;

ALTER TABLE public.holerite_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia lancamentos"
  ON public.holerite_lancamentos FOR ALL
  USING ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(),'admin'::app_role))
  WITH CHECK ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admin/Gerente veem lancamentos"
  ON public.holerite_lancamentos FOR SELECT
  USING ((empresa_id = get_user_empresa(auth.uid())) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role)));

CREATE POLICY "Gerente insere lancamentos"
  ON public.holerite_lancamentos FOR INSERT
  WITH CHECK ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(),'gerente'::app_role));

CREATE POLICY "Gerente atualiza lancamentos"
  ON public.holerite_lancamentos FOR UPDATE
  USING ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(),'gerente'::app_role))
  WITH CHECK ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(),'gerente'::app_role));

CREATE POLICY "Gerente remove lancamentos"
  ON public.holerite_lancamentos FOR DELETE
  USING ((empresa_id = get_user_empresa(auth.uid())) AND has_role(auth.uid(),'gerente'::app_role));

CREATE POLICY "Funcionario ve seus lancamentos"
  ON public.holerite_lancamentos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.holerites h
    JOIN public.funcionarios f ON f.id = h.funcionario_id
    WHERE h.id = holerite_lancamentos.holerite_id
      AND h.liberado = true
      AND f.usuario_id = auth.uid()
  ));
