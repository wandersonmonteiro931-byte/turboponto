-- Histórico de alterações de justificativas
CREATE TABLE public.justificativas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  justificativa_id uuid NOT NULL,
  funcionario_id uuid NOT NULL,
  acao text NOT NULL, -- criada / atualizada / aprovada / reprovada / removida
  status_anterior text,
  status_novo text,
  alterado_por uuid,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_just_hist_just ON public.justificativas_historico(justificativa_id);
CREATE INDEX idx_just_hist_empresa ON public.justificativas_historico(empresa_id, created_at DESC);

ALTER TABLE public.justificativas_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Gerente veem historico just"
ON public.justificativas_historico FOR SELECT
USING (empresa_id = get_user_empresa(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Sistema insere historico just"
ON public.justificativas_historico FOR INSERT
WITH CHECK (empresa_id = get_user_empresa(auth.uid()));

-- Notificações ao funcionário
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  funcionario_id uuid NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  link text,
  categoria text NOT NULL DEFAULT 'geral', -- justificativa / banco_horas / aviso / geral
  lida boolean NOT NULL DEFAULT false,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_func ON public.notificacoes(funcionario_id, lida, created_at DESC);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Funcionario ve suas notificacoes"
ON public.notificacoes FOR SELECT
USING (EXISTS (SELECT 1 FROM funcionarios f
  WHERE f.id = notificacoes.funcionario_id AND f.usuario_id = auth.uid()));

CREATE POLICY "Funcionario marca como lida"
ON public.notificacoes FOR UPDATE
USING (EXISTS (SELECT 1 FROM funcionarios f
  WHERE f.id = notificacoes.funcionario_id AND f.usuario_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM funcionarios f
  WHERE f.id = notificacoes.funcionario_id AND f.usuario_id = auth.uid()));

CREATE POLICY "Admin/Gerente veem notificacoes"
ON public.notificacoes FOR SELECT
USING (empresa_id = get_user_empresa(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

CREATE POLICY "Admin/Gerente criam notificacoes"
ON public.notificacoes FOR INSERT
WITH CHECK (empresa_id = get_user_empresa(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente')));

-- Trigger: registra histórico + cria notificação ao mudar justificativa
CREATE OR REPLACE FUNCTION public.log_justificativa_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acao text;
  v_status_ant text;
  v_status_novo text;
  v_actor uuid;
  v_tipo_nome text;
  v_titulo text;
  v_msg text;
BEGIN
  v_actor := COALESCE(auth.uid(),
    CASE WHEN TG_OP='DELETE' THEN OLD.aplicado_por ELSE NEW.aplicado_por END);

  IF TG_OP = 'INSERT' THEN
    v_acao := 'criada';
    v_status_novo := NEW.status;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_acao := CASE NEW.status
        WHEN 'aprovada' THEN 'aprovada'
        WHEN 'reprovada' THEN 'reprovada'
        ELSE 'atualizada' END;
      v_status_ant := OLD.status;
      v_status_novo := NEW.status;
    ELSE
      v_acao := 'atualizada';
      v_status_ant := OLD.status;
      v_status_novo := NEW.status;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'removida';
    v_status_ant := OLD.status;
  END IF;

  INSERT INTO public.justificativas_historico
    (empresa_id, justificativa_id, funcionario_id, acao,
     status_anterior, status_novo, alterado_por, observacao)
  VALUES (
    COALESCE(NEW.empresa_id, OLD.empresa_id),
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.funcionario_id, OLD.funcionario_id),
    v_acao, v_status_ant, v_status_novo, v_actor,
    COALESCE(NEW.observacao, OLD.observacao)
  );

  -- Notificação para o funcionário
  IF TG_OP IN ('INSERT','UPDATE') AND v_acao IN ('aprovada','reprovada','criada') THEN
    SELECT nome INTO v_tipo_nome FROM public.justificativas_tipos WHERE id = NEW.tipo_id;
    v_titulo := CASE v_acao
      WHEN 'aprovada' THEN 'Justificativa aprovada'
      WHEN 'reprovada' THEN 'Justificativa reprovada'
      ELSE 'Nova justificativa lançada' END;
    v_msg := COALESCE(v_tipo_nome,'Justificativa') || ' em ' ||
             to_char(NEW.data, 'DD/MM/YYYY') ||
             COALESCE(' · '||NEW.observacao,'');
    INSERT INTO public.notificacoes
      (empresa_id, funcionario_id, titulo, mensagem, categoria, link)
    VALUES (NEW.empresa_id, NEW.funcionario_id, v_titulo, v_msg,
            'justificativa', '/app/funcionario/cartao-ponto');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_just_changes
AFTER INSERT OR UPDATE OR DELETE ON public.justificativas_aplicadas
FOR EACH ROW EXECUTE FUNCTION public.log_justificativa_changes();

-- Função: cálculo de impacto em folha (helper)
CREATE OR REPLACE FUNCTION public.calcular_desconto_folha(
  _funcionario_id uuid, _ano int, _mes int)
RETURNS TABLE(dias_desc int, dias_dsr int, valor_desconto numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_salario numeric;
  v_dias_mes int;
  v_valor_dia numeric;
BEGIN
  SELECT COALESCE(salario,0) INTO v_salario FROM funcionarios WHERE id = _funcionario_id;
  v_dias_mes := EXTRACT(DAY FROM (date_trunc('month', make_date(_ano,_mes,1)) + interval '1 month - 1 day'));
  v_valor_dia := CASE WHEN v_dias_mes>0 THEN v_salario/v_dias_mes ELSE 0 END;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE jt.desconta_salario)::int,
    COUNT(*) FILTER (WHERE jt.desconta_dsr)::int,
    ROUND((COUNT(*) FILTER (WHERE jt.desconta_salario)
         + COUNT(*) FILTER (WHERE jt.desconta_dsr))::numeric * v_valor_dia, 2)
  FROM justificativas_aplicadas ja
  JOIN justificativas_tipos jt ON jt.id = ja.tipo_id
  WHERE ja.funcionario_id = _funcionario_id
    AND ja.status = 'aprovada'
    AND EXTRACT(YEAR FROM ja.data) = _ano
    AND EXTRACT(MONTH FROM ja.data) = _mes;
END;
$$;