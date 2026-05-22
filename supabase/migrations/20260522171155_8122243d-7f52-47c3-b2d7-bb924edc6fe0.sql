CREATE OR REPLACE FUNCTION public.sync_banco_horas_automatico_dia(
  _funcionario_id uuid,
  _data date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa_id uuid;
  v_jornada_id uuid;
  v_tolerancia integer := 5;
  v_dow integer;
  v_trabalha boolean := false;
  v_carga integer := 0;
  v_credito integer := 0;
  v_debito integer := 0;
  v_entrada timestamptz;
  v_saida timestamptz;
  v_saida_intervalo timestamptz;
  v_retorno_intervalo timestamptz;
  v_pe time;
  v_psi time;
  v_pri time;
  v_psf time;
  v_trabalhado integer := 0;
  v_qtd_he_credito integer;
  v_tem_he_pagar boolean := false;
  v_tem_abono boolean := false;
  v_tem_falta_manual boolean := false;
  v_tem_credito_manual boolean := false;
  v_tem_debito_manual boolean := false;
  v_diff integer;
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

  SELECT EXISTS (
    SELECT 1
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.funcionario_id = _funcionario_id
      AND ja.data = _data
      AND ja.status = 'aprovada'
      AND jt.codigo = 'HE_PAGAR'
  ) INTO v_tem_he_pagar;

  SELECT EXISTS (
    SELECT 1
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.funcionario_id = _funcionario_id
      AND ja.data = _data
      AND ja.status = 'aprovada'
      AND jt.abona_ocorrencia = true
      AND jt.desconta_salario = false
  ) INTO v_tem_abono;

  SELECT EXISTS (
    SELECT 1
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.funcionario_id = _funcionario_id
      AND ja.data = _data
      AND ja.status = 'aprovada'
      AND jt.movimenta_banco_horas = 'credito'
      AND jt.codigo <> 'HE_CREDITO'
  ) INTO v_tem_credito_manual;

  SELECT EXISTS (
    SELECT 1
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.funcionario_id = _funcionario_id
      AND ja.data = _data
      AND ja.status = 'aprovada'
      AND jt.movimenta_banco_horas = 'debito'
  ) INTO v_tem_debito_manual;

  SELECT EXISTS (
    SELECT 1
    FROM public.dias_falta df
    WHERE df.funcionario_id = _funcionario_id
      AND df.data = _data
  ) INTO v_tem_falta_manual;

  SELECT fj.jornada_id, COALESCE(j.tolerancia_atraso_minutos, 5)
  INTO v_jornada_id, v_tolerancia
  FROM public.funcionarios_jornadas fj
  LEFT JOIN public.jornadas j ON j.id = fj.jornada_id
  WHERE fj.funcionario_id = _funcionario_id
    AND fj.ativo = true
    AND fj.data_inicio <= _data
    AND (fj.data_fim IS NULL OR fj.data_fim >= _data)
  ORDER BY fj.data_inicio DESC
  LIMIT 1;

  v_dow := EXTRACT(DOW FROM _data)::integer;

  IF v_jornada_id IS NOT NULL THEN
    SELECT
      COALESCE(jd.trabalha, false),
      jd.horario_entrada,
      jd.horario_intervalo_saida,
      jd.horario_intervalo_retorno,
      jd.horario_saida,
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
    INTO v_trabalha, v_pe, v_psi, v_pri, v_psf, v_carga
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

  IF v_entrada IS NOT NULL AND v_saida IS NOT NULL THEN
    v_trabalhado := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_saida - v_entrada)) / 60)::integer);
    IF v_saida_intervalo IS NOT NULL AND v_retorno_intervalo IS NOT NULL THEN
      v_trabalhado := GREATEST(
        0,
        v_trabalhado - FLOOR(EXTRACT(EPOCH FROM (v_retorno_intervalo - v_saida_intervalo)) / 60)::integer
      );
    ELSIF v_psi IS NOT NULL AND v_pri IS NOT NULL THEN
      v_trabalhado := GREATEST(
        0,
        v_trabalhado - FLOOR(EXTRACT(EPOCH FROM (v_pri - v_psi)) / 60)::integer
      );
    END IF;
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

  IF NOT v_tem_he_pagar AND NOT v_tem_credito_manual THEN
    IF v_qtd_he_credito IS NOT NULL THEN
      v_credito := v_qtd_he_credito;
    ELSIF COALESCE(v_trabalha, false) THEN
      v_credito := CASE WHEN v_trabalhado - v_carga > v_tolerancia THEN v_trabalhado - v_carga ELSE 0 END;
    ELSE
      v_credito := v_trabalhado;
    END IF;
  END IF;

  IF COALESCE(v_trabalha, false) AND NOT v_tem_abono AND NOT v_tem_debito_manual THEN
    IF v_tem_falta_manual OR (v_entrada IS NULL AND v_saida IS NULL AND v_carga > 0) THEN
      v_debito := v_carga;
    ELSE
      IF v_pe IS NOT NULL AND v_entrada IS NOT NULL THEN
        v_diff := FLOOR(EXTRACT(EPOCH FROM (v_entrada::time - v_pe)) / 60)::integer;
        IF v_diff > v_tolerancia THEN
          v_debito := v_debito + v_diff;
        END IF;
      END IF;

      IF v_pri IS NOT NULL AND v_retorno_intervalo IS NOT NULL THEN
        v_diff := FLOOR(EXTRACT(EPOCH FROM (v_retorno_intervalo::time - v_pri)) / 60)::integer;
        IF v_diff > v_tolerancia THEN
          v_debito := v_debito + v_diff;
        END IF;
      END IF;

      IF v_psf IS NOT NULL AND v_saida IS NOT NULL THEN
        v_diff := FLOOR(EXTRACT(EPOCH FROM (v_psf - v_saida::time)) / 60)::integer;
        IF v_diff > v_tolerancia THEN
          v_debito := v_debito + v_diff;
        END IF;
      END IF;
    END IF;
  END IF;

  IF COALESCE(v_credito, 0) > 0 THEN
    INSERT INTO public.banco_horas_movimentos
      (empresa_id, funcionario_id, data, tipo, minutos, origem, observacao)
    VALUES
      (v_empresa_id, _funcionario_id, _data, 'credito', v_credito, 'automatico', 'Banco de horas automático - crédito')
    ON CONFLICT (funcionario_id, data, tipo) WHERE origem = 'automatico'
    DO UPDATE SET
      minutos = EXCLUDED.minutos,
      observacao = EXCLUDED.observacao;
  END IF;

  IF COALESCE(v_debito, 0) > 0 THEN
    INSERT INTO public.banco_horas_movimentos
      (empresa_id, funcionario_id, data, tipo, minutos, origem, observacao)
    VALUES
      (v_empresa_id, _funcionario_id, _data, 'debito', v_debito, 'automatico', 'Banco de horas automático - débito')
    ON CONFLICT (funcionario_id, data, tipo) WHERE origem = 'automatico'
    DO UPDATE SET
      minutos = EXCLUDED.minutos,
      observacao = EXCLUDED.observacao;
  END IF;
END;
$$;

DELETE FROM public.banco_horas_movimentos
WHERE origem = 'automatico';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT funcionario_id, data_referencia AS data
    FROM public.registros_ponto
    UNION
    SELECT DISTINCT funcionario_id, data
    FROM public.justificativas_aplicadas
    UNION
    SELECT DISTINCT funcionario_id, data
    FROM public.dias_falta
  LOOP
    PERFORM public.sync_banco_horas_automatico_dia(r.funcionario_id, r.data);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_banco_horas_automatico_dia(uuid, date) FROM PUBLIC, anon, authenticated;