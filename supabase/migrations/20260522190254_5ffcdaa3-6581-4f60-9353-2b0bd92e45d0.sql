INSERT INTO public.justificativas_tipos (
  empresa_id, nome, codigo, categoria,
  desconta_salario, desconta_dsr, abona_ocorrencia,
  exige_aprovacao, exige_anexo, exige_observacao,
  movimenta_banco_horas, conta_dia_trabalhado,
  exige_marcacao_ponto, afeta_assiduidade,
  pode_aplicar_individual, pode_aplicar_massa,
  ativo, padrao_sistema, descricao
)
SELECT
  e.id, 'ESQUECIMENTO REGIST COLAB', 'ESQUEC_REGISTRO', 'abono',
  false, false, true,
  false, false, false,
  'nenhum', true,
  false, 'nao',
  true, false,
  true, true,
  'Preenche automaticamente as marcações em branco do dia com o horário previsto da jornada.'
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.justificativas_tipos t
  WHERE t.empresa_id = e.id AND t.codigo = 'ESQUEC_REGISTRO'
);