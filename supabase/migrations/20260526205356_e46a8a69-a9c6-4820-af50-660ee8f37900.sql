INSERT INTO public.justificativas_tipos (empresa_id, nome, codigo, categoria, desconta_salario, desconta_dsr, abona_ocorrencia, exige_aprovacao, exige_anexo, exige_observacao, movimenta_banco_horas, conta_dia_trabalhado, exige_marcacao_ponto, afeta_assiduidade, pode_aplicar_individual, pode_aplicar_massa, ativo, padrao_sistema, descricao)
SELECT e.id, 'FECHAMENTO BANCO - DESC', 'FECHAMENTO_BANCO_DESC', 'banco_horas', true, false, false, false, false, true, 'nenhum', true, false, 'nao', true, true, true, true,
       'Fechamento do banco de horas com desconto em folha. Quando aplicada, o saldo negativo do banco de horas do mês é descontado no holerite (rubrica 07045 — DESCONTO ATRASO). Sem esta justificativa, o atraso permanece apenas como saldo informativo no cartão de ponto e não gera desconto.'
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.justificativas_tipos j
  WHERE j.empresa_id = e.id AND j.codigo = 'FECHAMENTO_BANCO_DESC'
);