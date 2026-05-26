
INSERT INTO public.holerite_rubricas (
  empresa_id, codigo, descricao, tipo, tipo_calculo, valor_referencia,
  ativo, grupo, soma_proventos, soma_descontos, entra_liquido,
  automatico, modo, editavel_manual, aparece_pdf,
  incide_inss, incide_fgts, incide_irrf, entra_medias, entra_dsr, padrao_sistema
)
SELECT e.id, x.codigo, x.descricao, 'informativo', 'manual', 0,
  true, 'informativo', false, false, false,
  false, 'manual', true, true,
  false, false, false, false, false, true
FROM public.empresas e
CROSS JOIN (VALUES
  ('28651', 'SALDO BANCO DE HORAS POSITIVO'),
  ('28652', 'SALDO BANCO DE HORAS NEGATIVO'),
  ('18445', 'QTD HORAS CESTA BASICA')
) AS x(codigo, descricao)
ON CONFLICT (empresa_id, codigo) DO NOTHING;
