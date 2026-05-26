
INSERT INTO public.holerite_tabelas_legais
  (empresa_id, vigencia_inicio, inss_faixas, irrf_faixas, irrf_deducao_dependente, fgts_aliquota, salario_familia_valor, salario_familia_teto)
VALUES (
  NULL, '2026-01-01',
  '[
    {"ate": 1621.00, "aliquota": 7.5,  "deducao": 0},
    {"ate": 2902.84, "aliquota": 9.0,  "deducao": 24.32},
    {"ate": 4354.27, "aliquota": 12.0, "deducao": 111.40},
    {"ate": 8475.55, "aliquota": 14.0, "deducao": 198.49}
  ]'::jsonb,
  '[
    {"ate": 2428.80, "aliquota": 0,    "deducao": 0},
    {"ate": 2826.65, "aliquota": 7.5,  "deducao": 182.16},
    {"ate": 3751.05, "aliquota": 15.0, "deducao": 394.16},
    {"ate": 4664.68, "aliquota": 22.5, "deducao": 675.49},
    {"ate": 999999999, "aliquota": 27.5, "deducao": 908.73}
  ]'::jsonb,
  189.59, 8, 65.00, 1906.04
)
ON CONFLICT DO NOTHING;

-- FGTS: informativo, nunca reduz o líquido
UPDATE public.holerite_rubricas
  SET tipo='informativo', entra_liquido=false
  WHERE codigo='07010' AND padrao_sistema=true;
