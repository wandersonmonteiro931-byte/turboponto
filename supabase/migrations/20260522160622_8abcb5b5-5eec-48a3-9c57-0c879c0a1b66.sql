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
  IF v_tipo.movimenta_banco_horas = 'nenhum' THEN
    RETURN NEW;
  END IF;

  v_dow := EXTRACT(DOW FROM NEW.data)::INTEGER;
  SELECT jornada_id INTO v_jornada_id
  FROM public.funcionarios_jornadas
  WHERE funcionario_id = NEW.funcionario_id AND ativo = true
  ORDER BY data_inicio DESC
  LIMIT 1;

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
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ja.*
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.status = 'aprovada'
      AND jt.movimenta_banco_horas IN ('credito', 'debito')
  LOOP
    UPDATE public.justificativas_aplicadas
    SET updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;