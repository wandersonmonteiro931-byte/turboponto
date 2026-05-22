
-- Tabela de movimentos do banco de horas
CREATE TABLE public.banco_horas_movimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  funcionario_id UUID NOT NULL,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('credito','debito')),
  minutos INTEGER NOT NULL CHECK (minutos > 0),
  origem TEXT NOT NULL DEFAULT 'justificativa' CHECK (origem IN ('justificativa','automatico','ajuste')),
  justificativa_aplicada_id UUID,
  observacao TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_bh_func_data ON public.banco_horas_movimentos(funcionario_id, data);
CREATE INDEX idx_bh_empresa ON public.banco_horas_movimentos(empresa_id);
CREATE UNIQUE INDEX uq_bh_just ON public.banco_horas_movimentos(justificativa_aplicada_id) WHERE justificativa_aplicada_id IS NOT NULL;

ALTER TABLE public.banco_horas_movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia bh_movimentos"
ON public.banco_horas_movimentos FOR ALL
USING (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'::app_role))
WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Admin/Gerente veem bh_movimentos"
ON public.banco_horas_movimentos FOR SELECT
USING (empresa_id = get_user_empresa(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role)));

CREATE POLICY "Gerente insere bh_movimentos"
ON public.banco_horas_movimentos FOR INSERT
WITH CHECK (empresa_id = get_user_empresa(auth.uid()) AND has_role(auth.uid(),'gerente'::app_role) AND created_by = auth.uid());

CREATE POLICY "Funcionario ve seus bh_movimentos"
ON public.banco_horas_movimentos FOR SELECT
USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = banco_horas_movimentos.funcionario_id AND f.usuario_id = auth.uid()));

-- Trigger: ao inserir/atualizar/deletar justificativa_aplicada, sincronizar movimento
CREATE OR REPLACE FUNCTION public.sync_banco_horas_justificativa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo RECORD;
  v_minutos INTEGER;
  v_carga INTEGER;
  v_jornada_id UUID;
  v_dow INTEGER;
BEGIN
  -- remove movimento anterior (caso update/delete)
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    DELETE FROM public.banco_horas_movimentos WHERE justificativa_aplicada_id = OLD.id;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  -- só cria movimento se aprovada
  IF NEW.status <> 'aprovada' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_tipo FROM public.justificativas_tipos WHERE id = NEW.tipo_id;
  IF v_tipo.movimenta_banco_horas = 'nenhum' THEN
    RETURN NEW;
  END IF;

  -- calcula carga programada da jornada ativa no dia
  v_dow := EXTRACT(DOW FROM NEW.data)::INTEGER;
  SELECT jornada_id INTO v_jornada_id FROM public.funcionarios_jornadas
    WHERE funcionario_id = NEW.funcionario_id AND ativo = true
    ORDER BY data_inicio DESC LIMIT 1;

  v_carga := 0;
  IF v_jornada_id IS NOT NULL THEN
    SELECT COALESCE(
      EXTRACT(EPOCH FROM (horario_saida - horario_entrada))/60
      - COALESCE(EXTRACT(EPOCH FROM (horario_intervalo_retorno - horario_intervalo_saida))/60, 0),
    0)::INTEGER INTO v_carga
    FROM public.jornadas_dias WHERE jornada_id = v_jornada_id AND dia_semana = v_dow AND trabalha = true;
  END IF;

  v_minutos := COALESCE(v_carga, 0);
  IF v_minutos <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.banco_horas_movimentos
    (empresa_id, funcionario_id, data, tipo, minutos, origem, justificativa_aplicada_id, created_by, observacao)
  VALUES
    (NEW.empresa_id, NEW.funcionario_id, NEW.data,
     CASE WHEN v_tipo.movimenta_banco_horas = 'credito' THEN 'credito' ELSE 'debito' END,
     v_minutos, 'justificativa', NEW.id, NEW.aplicado_por,
     v_tipo.nome || COALESCE(' · '||NEW.observacao,''));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_bh_just
AFTER INSERT OR UPDATE OR DELETE ON public.justificativas_aplicadas
FOR EACH ROW EXECUTE FUNCTION public.sync_banco_horas_justificativa();

-- Backfill: gera movimentos para justificativas já aplicadas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.justificativas_aplicadas WHERE status = 'aprovada' LOOP
    UPDATE public.justificativas_aplicadas SET updated_at = now() WHERE id = r.id;
  END LOOP;
END$$;
