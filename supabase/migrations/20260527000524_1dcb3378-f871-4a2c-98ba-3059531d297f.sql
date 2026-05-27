INSERT INTO public.holerite_rubricas (empresa_id, codigo, descricao, tipo, tipo_calculo, modo, automatico, editavel_manual, entra_liquido, aparece_pdf, padrao_sistema, ativo)
SELECT e.id, '09000', 'INSUFICIENCIA DE SALDO', 'informativo', 'manual', 'automatico', true, false, false, true, true, true
FROM public.empresas e
WHERE NOT EXISTS (SELECT 1 FROM public.holerite_rubricas r WHERE r.empresa_id = e.id AND r.codigo = '09000');

INSERT INTO public.holerite_rubricas (empresa_id, codigo, descricao, tipo, tipo_calculo, modo, automatico, editavel_manual, entra_liquido, aparece_pdf, padrao_sistema, ativo, soma_descontos)
SELECT e.id, '09005', 'INSUF MES ANTERIOR', 'desconto', 'manual', 'automatico', true, false, true, true, true, true, true
FROM public.empresas e
WHERE NOT EXISTS (SELECT 1 FROM public.holerite_rubricas r WHERE r.empresa_id = e.id AND r.codigo = '09005');