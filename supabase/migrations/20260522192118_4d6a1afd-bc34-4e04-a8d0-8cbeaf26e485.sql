CREATE OR REPLACE FUNCTION public.preencher_marcacoes_esquecimento_registro_dia(
  _empresa_id uuid,
  _funcionario_id uuid,
  _data date
)
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
  SELECT fj.jornada_id INTO v_jornada_id
  FROM public.funcionarios_jornadas fj
  WHERE fj.funcionario_id = _funcionario_id
    AND fj.ativo = true
    AND fj.data_inicio <= _data
    AND (fj.data_fim IS NULL OR fj.data_fim >= _data)
  ORDER BY fj.data_inicio DESC
  LIMIT 1;

  IF v_jornada_id IS NULL THEN
    RETURN;
  END IF;

  v_dow := EXTRACT(DOW FROM _data)::integer;

  SELECT * INTO v_dia
  FROM public.jornadas_dias jd
  WHERE jd.jornada_id = v_jornada_id
    AND jd.dia_semana = v_dow
    AND jd.trabalha = true
  LIMIT 1;

  IF v_dia IS NULL THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT 'entrada'::text AS tipo_ponto, v_dia.horario_entrada AS hora
    UNION ALL SELECT 'saida_intervalo'::text, v_dia.horario_intervalo_saida
    UNION ALL SELECT 'retorno_intervalo'::text, v_dia.horario_intervalo_retorno
    UNION ALL SELECT 'saida_final'::text, v_dia.horario_saida
  LOOP
    IF v_item.hora IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.registros_ponto rp
      WHERE rp.funcionario_id = _funcionario_id
        AND rp.data_referencia = _data
        AND rp.tipo_ponto = v_item.tipo_ponto
    ) THEN
      INSERT INTO public.registros_ponto
        (empresa_id, funcionario_id, jornada_id, data_referencia, tipo_ponto,
         horario_programado, horario_registrado, atraso_minutos, status, origem, observacao)
      VALUES
        (_empresa_id, _funcionario_id, v_jornada_id, _data, v_item.tipo_ponto,
         v_item.hora, (_data::timestamp + v_item.hora), 0, 'no_horario', 'sistema',
         'Preenchido por ESQUECIMENTO REGIST COLAB');
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.preencher_marcacoes_esquecimento_registro_trg_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo text;
BEGIN
  IF NEW.status <> 'aprovada' THEN
    RETURN NEW;
  END IF;

  SELECT codigo INTO v_codigo
  FROM public.justificativas_tipos
  WHERE id = NEW.tipo_id;

  IF v_codigo = 'ESQUEC_REGISTRO' THEN
    PERFORM public.preencher_marcacoes_esquecimento_registro_dia(NEW.empresa_id, NEW.funcionario_id, NEW.data);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS preencher_marcacoes_esquecimento_registro_trg ON public.justificativas_aplicadas;
CREATE TRIGGER preencher_marcacoes_esquecimento_registro_trg
AFTER INSERT OR UPDATE OF status, tipo_id, data, funcionario_id
ON public.justificativas_aplicadas
FOR EACH ROW
EXECUTE FUNCTION public.preencher_marcacoes_esquecimento_registro_trg_fn();

REVOKE ALL ON FUNCTION public.preencher_marcacoes_esquecimento_registro_dia(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preencher_marcacoes_esquecimento_registro_trg_fn() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT ja.empresa_id, ja.funcionario_id, ja.data
    FROM public.justificativas_aplicadas ja
    JOIN public.justificativas_tipos jt ON jt.id = ja.tipo_id
    WHERE ja.status = 'aprovada'
      AND jt.codigo = 'ESQUEC_REGISTRO'
  LOOP
    PERFORM public.preencher_marcacoes_esquecimento_registro_dia(r.empresa_id, r.funcionario_id, r.data);
  END LOOP;
END;
$$;