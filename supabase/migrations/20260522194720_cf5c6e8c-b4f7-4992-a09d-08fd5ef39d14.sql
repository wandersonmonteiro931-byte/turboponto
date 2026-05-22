
-- Remove trigger duplicado
DROP TRIGGER IF EXISTS trg_preencher_marcacoes_esquec_registro ON public.justificativas_aplicadas;

-- Função que remove os registros preenchidos automaticamente quando a justificativa é apagada
CREATE OR REPLACE FUNCTION public.limpar_marcacoes_esquecimento_registro_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
BEGIN
  SELECT codigo INTO v_codigo FROM public.justificativas_tipos WHERE id = OLD.tipo_id;

  IF v_codigo = 'ESQUEC_REGISTRO' THEN
    DELETE FROM public.registros_ponto
    WHERE funcionario_id = OLD.funcionario_id
      AND data_referencia = OLD.data
      AND origem = 'sistema'
      AND observacao = 'Preenchido por ESQUECIMENTO REGIST COLAB';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_marcacoes_esquec_registro ON public.justificativas_aplicadas;
CREATE TRIGGER trg_limpar_marcacoes_esquec_registro
AFTER DELETE ON public.justificativas_aplicadas
FOR EACH ROW
EXECUTE FUNCTION public.limpar_marcacoes_esquecimento_registro_fn();
