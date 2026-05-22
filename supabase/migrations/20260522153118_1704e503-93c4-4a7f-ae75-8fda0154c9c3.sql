-- Atualiza seed para incluir HORA EXTRA - PAGAR e HORA EXTRA - CREDIT
CREATE OR REPLACE FUNCTION public.seed_justificativas_padrao(_empresa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.justificativas_tipos
    (empresa_id, nome, codigo, categoria,
     desconta_salario, desconta_dsr, abona_ocorrencia,
     exige_aprovacao, exige_anexo, exige_observacao,
     movimenta_banco_horas, conta_dia_trabalhado, exige_marcacao_ponto,
     afeta_assiduidade, pode_aplicar_individual, pode_aplicar_massa,
     padrao_sistema, descricao)
  VALUES
    (_empresa_id, 'HORA EXTRA - PAGAR', 'HE_PAGAR', 'banco_horas',
     false, false, true, false, false, false, 'nenhum', false, false,
     'nao', true, false, true,
     'Horas extras trabalhadas em folga/extra que serão pagas em dinheiro no holerite (não vão para banco de horas).'),
    (_empresa_id, 'HORA EXTRA - CREDIT', 'HE_CREDITO', 'banco_horas',
     false, false, true, false, false, false, 'credito', false, false,
     'nao', true, false, true,
     'Horas extras trabalhadas em folga/extra que viram crédito no banco de horas do funcionário.')
  ON CONFLICT (empresa_id, codigo) DO NOTHING;
END;
$function$;

-- Aplica para empresas existentes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.empresas LOOP
    PERFORM public.seed_justificativas_padrao(r.id);
  END LOOP;
END $$;