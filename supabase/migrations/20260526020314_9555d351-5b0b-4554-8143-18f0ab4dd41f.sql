-- Atualiza funções para suportar múltiplas jornadas ativas por colaborador.
-- A jornada aplicável a uma data é a que tem trabalha=true para o dia da semana;
-- se nenhuma trabalhar, usa a mais recente cobrindo a data (folga).

CREATE OR REPLACE FUNCTION public.sync_banco_horas_automatico_dia(_funcionario_id uuid, _data date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid; v_jornada_id uuid; v_dow integer; v_trabalha boolean := false;
  v_credito integer := 0; v_debito integer := 0;
  v_entrada timestamptz; v_saida timestamptz; v_saida_intervalo timestamptz; v_retorno_intervalo timestamptz;
  v_entrada_local time; v_saida_local time; v_pe time; v_psi time; v_pri time; v_psf time;
  v_trabalhado integer := 0; v_qtd_he_credito integer;
  v_tem_he_pagar boolean := false; v_tem_abono boolean := false; v_tem_debito_manual boolean := false; v_tem_falta_desconto boolean := false;
  v_diff integer;
BEGIN
  IF _funcionario_id IS NULL OR _data IS NULL THEN RETURN; END IF;
  SELECT empresa_id INTO v_empresa_id FROM public.funcionarios WHERE id = _funcionario_id;
  DELETE FROM public.banco_horas_movimentos WHERE funcionario_id = _funcionario_id AND data = _data AND origem = 'automatico';
  IF v_empresa_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.justificativas_aplicadas ja JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id WHERE ja.funcionario_id = _funcionario_id AND ja.data = _data AND ja.status = 'aprovada' AND jt.codigo = 'HE_PAGAR') INTO v_tem_he_pagar;
  SELECT EXISTS (SELECT 1 FROM public.justificativas_aplicadas ja JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id WHERE ja.funcionario_id = _funcionario_id AND ja.data = _data AND ja.status = 'aprovada' AND jt.abona_ocorrencia = true AND jt.desconta_salario = false) INTO v_tem_abono;
  SELECT EXISTS (SELECT 1 FROM public.justificativas_aplicadas ja JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id WHERE ja.funcionario_id = _funcionario_id AND ja.data = _data AND ja.status = 'aprovada' AND jt.movimenta_banco_horas = 'debito') INTO v_tem_debito_manual;
  SELECT EXISTS (SELECT 1 FROM public.justificativas_aplicadas ja JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id WHERE ja.funcionario_id = _funcionario_id AND ja.data = _data AND ja.status = 'aprovada' AND jt.categoria = 'falta' AND jt.desconta_salario = true) OR EXISTS (SELECT 1 FROM public.dias_falta df WHERE df.funcionario_id = _funcionario_id AND df.data = _data) INTO v_tem_falta_desconto;

  v_dow := EXTRACT(DOW FROM _data)::integer;
  -- Escolhe a jornada do dia: prioriza vínculo ativo cuja jornada trabalhe nesse dow.
  SELECT fj.jornada_id INTO v_jornada_id
  FROM public.funcionarios_jornadas fj
  JOIN public.jornadas_dias jd ON jd.jornada_id = fj.jornada_id
  WHERE fj.funcionario_id = _funcionario_id
    AND fj.ativo = true
    AND fj.data_inicio <= _data
    AND (fj.data_fim IS NULL OR fj.data_fim >= _data)
    AND jd.dia_semana = v_dow
    AND jd.trabalha = true
  ORDER BY fj.data_inicio DESC
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    -- Nenhuma jornada trabalha hoje → pega a mais recente para registrar folga.
    SELECT fj.jornada_id INTO v_jornada_id
    FROM public.funcionarios_jornadas fj
    WHERE fj.funcionario_id = _funcionario_id
      AND fj.ativo = true
      AND fj.data_inicio <= _data
      AND (fj.data_fim IS NULL OR fj.data_fim >= _data)
    ORDER BY fj.data_inicio DESC
    LIMIT 1;
  END IF;

  IF v_jornada_id IS NOT NULL THEN
    SELECT COALESCE(jd.trabalha, false), jd.horario_entrada, jd.horario_intervalo_saida, jd.horario_intervalo_retorno, jd.horario_saida INTO v_trabalha, v_pe, v_psi, v_pri, v_psf FROM public.jornadas_dias jd WHERE jd.jornada_id = v_jornada_id AND jd.dia_semana = v_dow LIMIT 1;
  END IF;

  SELECT MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'entrada'), MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'saida_final'), MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'saida_intervalo'), MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'retorno_intervalo') INTO v_entrada, v_saida, v_saida_intervalo, v_retorno_intervalo FROM public.registros_ponto WHERE funcionario_id = _funcionario_id AND data_referencia = _data;
  v_entrada_local := CASE WHEN v_entrada IS NULL THEN NULL ELSE (v_entrada AT TIME ZONE 'America/Sao_Paulo')::time END;
  v_saida_local := CASE WHEN v_saida IS NULL THEN NULL ELSE (v_saida AT TIME ZONE 'America/Sao_Paulo')::time END;

  IF v_entrada IS NOT NULL AND v_saida IS NOT NULL THEN
    v_trabalhado := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_saida - v_entrada)) / 60)::integer);
    IF v_saida_intervalo IS NOT NULL AND v_retorno_intervalo IS NOT NULL THEN
      v_trabalhado := GREATEST(0, v_trabalhado - FLOOR(EXTRACT(EPOCH FROM (v_retorno_intervalo - v_saida_intervalo)) / 60)::integer);
    ELSIF v_psi IS NOT NULL AND v_pri IS NOT NULL THEN
      v_trabalhado := GREATEST(0, v_trabalhado - FLOOR(EXTRACT(EPOCH FROM (v_pri - v_psi)) / 60)::integer);
    END IF;
  END IF;

  SELECT ja.quantidade_minutos INTO v_qtd_he_credito FROM public.justificativas_aplicadas ja JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id WHERE ja.funcionario_id = _funcionario_id AND ja.data = _data AND ja.status = 'aprovada' AND jt.codigo = 'HE_CREDITO' AND ja.quantidade_minutos IS NOT NULL AND ja.quantidade_minutos > 0 ORDER BY ja.updated_at DESC NULLS LAST, ja.created_at DESC NULLS LAST LIMIT 1;

  IF COALESCE(v_trabalha, false) THEN
    IF v_pe IS NOT NULL AND v_entrada_local IS NOT NULL THEN
      v_diff := public.diff_minutos_relogio(v_entrada_local, v_pe);
      IF v_diff < 0 THEN v_credito := v_credito + ABS(v_diff);
      ELSIF NOT v_tem_abono AND NOT v_tem_debito_manual AND NOT v_tem_falta_desconto AND v_diff > 0 THEN v_debito := v_debito + v_diff;
      END IF;
    END IF;
    IF v_psf IS NOT NULL AND v_saida_local IS NOT NULL THEN
      v_diff := public.diff_minutos_relogio(v_saida_local, v_psf);
      IF NOT v_tem_he_pagar THEN
        IF v_qtd_he_credito IS NOT NULL THEN v_credito := v_credito + v_qtd_he_credito;
        ELSIF v_diff > 10 THEN v_credito := v_credito + v_diff;
        END IF;
      END IF;
      IF NOT v_tem_abono AND NOT v_tem_debito_manual AND NOT v_tem_falta_desconto AND v_diff < 0 THEN v_debito := v_debito + ABS(v_diff); END IF;
    END IF;
  ELSEIF NOT v_tem_he_pagar AND v_trabalhado > 0 THEN
    v_credito := v_trabalhado;
  END IF;

  IF v_credito > 0 THEN INSERT INTO public.banco_horas_movimentos (empresa_id, funcionario_id, data, tipo, minutos, origem, observacao) VALUES (v_empresa_id, _funcionario_id, _data, 'credito', v_credito, 'automatico', 'Banco de horas automático - crédito') ON CONFLICT (funcionario_id, data, tipo) WHERE origem = 'automatico' DO UPDATE SET minutos = EXCLUDED.minutos, observacao = EXCLUDED.observacao; END IF;
  IF v_debito > 0 THEN INSERT INTO public.banco_horas_movimentos (empresa_id, funcionario_id, data, tipo, minutos, origem, observacao) VALUES (v_empresa_id, _funcionario_id, _data, 'debito', v_debito, 'automatico', 'Banco de horas automático - débito') ON CONFLICT (funcionario_id, data, tipo) WHERE origem = 'automatico' DO UPDATE SET minutos = EXCLUDED.minutos, observacao = EXCLUDED.observacao; END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION public.preencher_marcacoes_esquecimento_registro_dia(_empresa_id uuid, _funcionario_id uuid, _data date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jornada_id uuid;
  v_dow integer;
  v_dia record;
  v_item record;
BEGIN
  v_dow := EXTRACT(DOW FROM _data)::integer;

  -- Escolhe jornada do dia: prioriza vínculo ativo cuja jornada trabalha nesse dow.
  SELECT fj.jornada_id INTO v_jornada_id
  FROM public.funcionarios_jornadas fj
  JOIN public.jornadas_dias jd ON jd.jornada_id = fj.jornada_id
  WHERE fj.funcionario_id = _funcionario_id
    AND fj.ativo = true
    AND fj.data_inicio <= _data
    AND (fj.data_fim IS NULL OR fj.data_fim >= _data)
    AND jd.dia_semana = v_dow
    AND jd.trabalha = true
  ORDER BY fj.data_inicio DESC
  LIMIT 1;

  IF v_jornada_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_dia
  FROM public.jornadas_dias jd
  WHERE jd.jornada_id = v_jornada_id
    AND jd.dia_semana = v_dow
    AND jd.trabalha = true
  LIMIT 1;

  IF v_dia IS NULL THEN RETURN; END IF;

  FOR v_item IN
    SELECT 'entrada'::text AS tipo_ponto, v_dia.horario_entrada AS hora
    UNION ALL SELECT 'saida_intervalo'::text, v_dia.horario_intervalo_saida
    UNION ALL SELECT 'retorno_intervalo'::text, v_dia.horario_intervalo_retorno
    UNION ALL SELECT 'saida_final'::text, v_dia.horario_saida
  LOOP
    IF v_item.hora IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.registros_ponto rp
      WHERE rp.funcionario_id = _funcionario_id
        AND rp.data_referencia = _data
        AND rp.tipo_ponto = v_item.tipo_ponto
    ) THEN
      INSERT INTO public.registros_ponto
        (empresa_id, funcionario_id, jornada_id, data_referencia, tipo_ponto,
         horario_programado, horario_registrado, atraso_minutos, status, origem, observacao)
      VALUES
        (_empresa_id, _funcionario_id, v_jornada_id, _data, v_item.tipo_ponto,
         v_item.hora, ((_data::timestamp + v_item.hora) AT TIME ZONE 'America/Sao_Paulo'),
         0, 'no_horario', 'sistema', 'Preenchido por ESQUECIMENTO REGIST COLAB');
    END IF;
  END LOOP;
END;
$function$;


CREATE OR REPLACE FUNCTION public.sync_banco_horas_justificativa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo RECORD;
  v_minutos INTEGER;
  v_carga INTEGER;
  v_trabalhado INTEGER;
  v_jornada_id UUID;
  v_dow INTEGER;
  v_entrada TIMESTAMPTZ;
  v_saida TIMESTAMPTZ;
  v_saida_intervalo TIMESTAMPTZ;
  v_retorno_intervalo TIMESTAMPTZ;
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    DELETE FROM public.banco_horas_movimentos WHERE justificativa_aplicada_id = OLD.id;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  IF NEW.status <> 'aprovada' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_tipo FROM public.justificativas_tipos WHERE id = NEW.tipo_id;

  IF v_tipo.codigo = 'HE_CREDITO' THEN
    PERFORM public.sync_banco_horas_automatico_dia(NEW.funcionario_id, NEW.data);
    RETURN NEW;
  END IF;

  IF v_tipo.movimenta_banco_horas = 'nenhum' THEN
    RETURN NEW;
  END IF;

  v_dow := EXTRACT(DOW FROM NEW.data)::INTEGER;

  -- Escolhe jornada do dia entre múltiplos vínculos ativos.
  SELECT fj.jornada_id INTO v_jornada_id
  FROM public.funcionarios_jornadas fj
  JOIN public.jornadas_dias jd ON jd.jornada_id = fj.jornada_id
  WHERE fj.funcionario_id = NEW.funcionario_id
    AND fj.ativo = true
    AND fj.data_inicio <= NEW.data
    AND (fj.data_fim IS NULL OR fj.data_fim >= NEW.data)
    AND jd.dia_semana = v_dow
    AND jd.trabalha = true
  ORDER BY fj.data_inicio DESC
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    SELECT fj.jornada_id INTO v_jornada_id
    FROM public.funcionarios_jornadas fj
    WHERE fj.funcionario_id = NEW.funcionario_id
      AND fj.ativo = true
      AND fj.data_inicio <= NEW.data
      AND (fj.data_fim IS NULL OR fj.data_fim >= NEW.data)
    ORDER BY fj.data_inicio DESC
    LIMIT 1;
  END IF;

  v_carga := 0;
  IF v_jornada_id IS NOT NULL THEN
    SELECT COALESCE(
      EXTRACT(EPOCH FROM (horario_saida - horario_entrada)) / 60
      - COALESCE(EXTRACT(EPOCH FROM (horario_intervalo_retorno - horario_intervalo_saida)) / 60, 0),
      0
    )::INTEGER INTO v_carga
    FROM public.jornadas_dias
    WHERE jornada_id = v_jornada_id AND dia_semana = v_dow AND trabalha = true;
  END IF;

  SELECT
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'entrada'),
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'saida_final'),
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'saida_intervalo'),
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'retorno_intervalo')
  INTO v_entrada, v_saida, v_saida_intervalo, v_retorno_intervalo
  FROM public.registros_ponto
  WHERE funcionario_id = NEW.funcionario_id
    AND data_referencia = NEW.data;

  v_trabalhado := 0;
  IF v_entrada IS NOT NULL AND v_saida IS NOT NULL THEN
    v_trabalhado := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_saida - v_entrada)) / 60)::INTEGER);
    IF v_saida_intervalo IS NOT NULL AND v_retorno_intervalo IS NOT NULL THEN
      v_trabalhado := GREATEST(0, v_trabalhado - FLOOR(EXTRACT(EPOCH FROM (v_retorno_intervalo - v_saida_intervalo)) / 60)::INTEGER);
    END IF;
  END IF;

  v_minutos := COALESCE(NEW.quantidade_minutos, 0);
  IF v_minutos <= 0 THEN
    IF v_tipo.movimenta_banco_horas = 'credito' THEN
      v_minutos := GREATEST(COALESCE(v_trabalhado, 0), COALESCE(v_carga, 0));
    ELSE
      v_minutos := COALESCE(v_carga, 0);
    END IF;
  END IF;

  IF v_minutos <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.banco_horas_movimentos
    (empresa_id, funcionario_id, data, tipo, minutos, origem, justificativa_aplicada_id, created_by, observacao)
  VALUES
    (NEW.empresa_id, NEW.funcionario_id, NEW.data,
     CASE WHEN v_tipo.movimenta_banco_horas = 'credito' THEN 'credito' ELSE 'debito' END,
     v_minutos, 'justificativa', NEW.id, NEW.aplicado_por,
     v_tipo.nome || COALESCE(' · ' || NEW.observacao, ''));

  RETURN NEW;
END;
$function$;
