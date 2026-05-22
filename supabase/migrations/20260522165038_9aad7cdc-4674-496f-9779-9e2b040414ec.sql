CREATE UNIQUE INDEX IF NOT EXISTS uq_bh_auto_dia
ON public.banco_horas_movimentos (funcionario_id, data)
WHERE origem = 'automatico';

CREATE OR REPLACE FUNCTION public.sync_banco_horas_automatico_dia(
  _funcionario_id uuid,
  _data date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_jornada_id uuid;
  v_tolerancia integer := 5;
  v_dow integer;
  v_trabalha boolean := false;
  v_carga integer := 0;
  v_trabalhado integer := 0;
  v_credito integer := 0;
  v_entrada timestamptz;
  v_saida timestamptz;
  v_saida_intervalo timestamptz;
  v_retorno_intervalo timestamptz;
  v_qtd_he_credito integer;
BEGIN
  IF _funcionario_id IS NULL OR _data IS NULL THEN
    RETURN;
  END IF;

  SELECT empresa_id INTO v_empresa_id
  FROM public.funcionarios
  WHERE id = _funcionario_id;

  DELETE FROM public.banco_horas_movimentos
  WHERE funcionario_id = _funcionario_id
    AND data = _data
    AND origem = 'automatico';

  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.funcionario_id = _funcionario_id
      AND ja.data = _data
      AND ja.status = 'aprovada'
      AND jt.codigo = 'HE_PAGAR'
  ) THEN
    RETURN;
  END IF;

  SELECT fj.jornada_id, COALESCE(j.tolerancia_atraso_minutos, 5)
  INTO v_jornada_id, v_tolerancia
  FROM public.funcionarios_jornadas fj
  LEFT JOIN public.jornadas j ON j.id = fj.jornada_id
  WHERE fj.funcionario_id = _funcionario_id
    AND fj.ativo = true
  ORDER BY fj.data_inicio DESC
  LIMIT 1;

  v_dow := EXTRACT(DOW FROM _data)::integer;

  IF v_jornada_id IS NOT NULL THEN
    SELECT
      COALESCE(jd.trabalha, false),
      CASE
        WHEN jd.horario_entrada IS NOT NULL AND jd.horario_saida IS NOT NULL THEN
          GREATEST(
            0,
            (
              EXTRACT(EPOCH FROM (jd.horario_saida - jd.horario_entrada)) / 60
              - COALESCE(EXTRACT(EPOCH FROM (jd.horario_intervalo_retorno - jd.horario_intervalo_saida)) / 60, 0)
            )::integer
          )
        ELSE 0
      END
    INTO v_trabalha, v_carga
    FROM public.jornadas_dias jd
    WHERE jd.jornada_id = v_jornada_id
      AND jd.dia_semana = v_dow
    LIMIT 1;
  END IF;

  SELECT
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'entrada'),
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'saida_final'),
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'saida_intervalo'),
    MAX(horario_registrado) FILTER (WHERE tipo_ponto = 'retorno_intervalo')
  INTO v_entrada, v_saida, v_saida_intervalo, v_retorno_intervalo
  FROM public.registros_ponto
  WHERE funcionario_id = _funcionario_id
    AND data_referencia = _data;

  IF v_entrada IS NULL OR v_saida IS NULL THEN
    RETURN;
  END IF;

  v_trabalhado := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_saida - v_entrada)) / 60)::integer);
  IF v_saida_intervalo IS NOT NULL AND v_retorno_intervalo IS NOT NULL THEN
    v_trabalhado := GREATEST(
      0,
      v_trabalhado - FLOOR(EXTRACT(EPOCH FROM (v_retorno_intervalo - v_saida_intervalo)) / 60)::integer
    );
  END IF;

  SELECT ja.quantidade_minutos
  INTO v_qtd_he_credito
  FROM public.justificativas_aplicadas ja
  JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
  WHERE ja.funcionario_id = _funcionario_id
    AND ja.data = _data
    AND ja.status = 'aprovada'
    AND jt.codigo = 'HE_CREDITO'
    AND ja.quantidade_minutos IS NOT NULL
    AND ja.quantidade_minutos > 0
  ORDER BY ja.updated_at DESC NULLS LAST, ja.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_qtd_he_credito IS NOT NULL THEN
    v_credito := v_qtd_he_credito;
  ELSIF COALESCE(v_trabalha, false) THEN
    v_credito := CASE WHEN v_trabalhado - v_carga > v_tolerancia THEN v_trabalhado - v_carga ELSE 0 END;
  ELSE
    v_credito := v_trabalhado;
  END IF;

  IF v_credito <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.banco_horas_movimentos
    (empresa_id, funcionario_id, data, tipo, minutos, origem, observacao)
  VALUES
    (v_empresa_id, _funcionario_id, _data, 'credito', v_credito, 'automatico', 'Hora extra automática')
  ON CONFLICT (funcionario_id, data) WHERE origem = 'automatico'
  DO UPDATE SET
    minutos = EXCLUDED.minutos,
    observacao = EXCLUDED.observacao;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_bh_automatico_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_banco_horas_automatico_dia(OLD.funcionario_id, OLD.data_referencia);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD.funcionario_id IS DISTINCT FROM NEW.funcionario_id
      OR OLD.data_referencia IS DISTINCT FROM NEW.data_referencia) THEN
    PERFORM public.sync_banco_horas_automatico_dia(OLD.funcionario_id, OLD.data_referencia);
  END IF;

  PERFORM public.sync_banco_horas_automatico_dia(NEW.funcionario_id, NEW.data_referencia);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bh_auto_registro ON public.registros_ponto;
CREATE TRIGGER trg_sync_bh_auto_registro
AFTER INSERT OR UPDATE OR DELETE ON public.registros_ponto
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_bh_automatico_registro();

CREATE OR REPLACE FUNCTION public.trg_sync_bh_automatico_justificativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_banco_horas_automatico_dia(OLD.funcionario_id, OLD.data);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (OLD.funcionario_id IS DISTINCT FROM NEW.funcionario_id
      OR OLD.data IS DISTINCT FROM NEW.data) THEN
    PERFORM public.sync_banco_horas_automatico_dia(OLD.funcionario_id, OLD.data);
  END IF;

  PERFORM public.sync_banco_horas_automatico_dia(NEW.funcionario_id, NEW.data);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bh_auto_justificativa ON public.justificativas_aplicadas;
CREATE TRIGGER trg_sync_bh_auto_justificativa
AFTER INSERT OR UPDATE OR DELETE ON public.justificativas_aplicadas
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_bh_automatico_justificativa();

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

  IF v_tipo.codigo = 'HE_CREDITO' THEN
    PERFORM public.sync_banco_horas_automatico_dia(NEW.funcionario_id, NEW.data);
    RETURN NEW;
  END IF;

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

DELETE FROM public.banco_horas_movimentos bh
USING public.justificativas_aplicadas ja, public.justificativas_tipos jt
WHERE bh.justificativa_aplicada_id = ja.id
  AND ja.tipo_id = jt.id
  AND jt.codigo = 'HE_CREDITO';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT funcionario_id, data_referencia AS data
    FROM public.registros_ponto
  LOOP
    PERFORM public.sync_banco_horas_automatico_dia(r.funcionario_id, r.data);
  END LOOP;
END $$;