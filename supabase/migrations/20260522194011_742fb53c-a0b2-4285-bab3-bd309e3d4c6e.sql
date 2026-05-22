-- Garantir que o autofill do ESQUECIMENTO REGIST COLAB rode em qualquer caminho de aplicação
DROP TRIGGER IF EXISTS trg_preencher_marcacoes_esquec_registro ON public.justificativas_aplicadas;

CREATE TRIGGER trg_preencher_marcacoes_esquec_registro
AFTER INSERT OR UPDATE ON public.justificativas_aplicadas
FOR EACH ROW
EXECUTE FUNCTION public.preencher_marcacoes_esquecimento_registro_trg_fn();