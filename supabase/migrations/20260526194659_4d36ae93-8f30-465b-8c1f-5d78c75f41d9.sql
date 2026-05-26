-- 1. Expandir tipos permitidos e validar código de 5 dígitos
ALTER TABLE public.holerite_rubricas DROP CONSTRAINT IF EXISTS holerite_rubricas_tipo_check;
ALTER TABLE public.holerite_rubricas ADD CONSTRAINT holerite_rubricas_tipo_check
  CHECK (tipo IN ('provento','desconto','informativo','resultado'));

ALTER TABLE public.holerite_rubricas DROP CONSTRAINT IF EXISTS holerite_rubricas_codigo_5digitos;
ALTER TABLE public.holerite_rubricas ADD CONSTRAINT holerite_rubricas_codigo_5digitos
  CHECK (codigo ~ '^[0-9]{5}$');

-- 2. Novos campos de configuração
ALTER TABLE public.holerite_rubricas
  ADD COLUMN IF NOT EXISTS grupo text,
  ADD COLUMN IF NOT EXISTS base_calculo text,
  ADD COLUMN IF NOT EXISTS soma_proventos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS soma_descontos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entra_liquido boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS depende_ponto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS depende_justificativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aparece_pdf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incide_inss boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incide_fgts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incide_irrf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entra_medias boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entra_dsr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS padrao_sistema boolean NOT NULL DEFAULT false;

-- 3. Função que popula a tabela padrão. Idempotente via ON CONFLICT (empresa_id, codigo).
CREATE OR REPLACE FUNCTION public.seed_rubricas_padrao(_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
INSERT INTO public.holerite_rubricas
  (empresa_id, codigo, descricao, tipo, tipo_calculo, grupo, base_calculo,
   soma_proventos, soma_descontos, entra_liquido, automatico,
   depende_ponto, depende_justificativa, aparece_pdf,
   incide_inss, incide_fgts, incide_irrf, entra_medias, entra_dsr, padrao_sistema)
VALUES
-- ====================== 00000 — PROVENTOS PRINCIPAIS ======================
(_empresa_id,'00005','SALARIO CONTRATUAL','provento','salario_dias_trabalhados','00000 - Proventos principais','Salário/30 × dias de vínculo na competência',true,false,true,true,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00010','SALARIO MENSAL INTEGRAL','provento','salario_base','00000 - Proventos principais','Salário contratual mensal (mês cheio)',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00015','SALDO DE SALARIO','provento','manual','00000 - Proventos principais','Salário/30 × dias trabalhados até desligamento',true,false,true,false,true,false,true,true,true,true,false,false,true),
(_empresa_id,'00020','DIARIA','provento','manual','00000 - Proventos principais','Valor da diária × dias',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00025','HORISTA','provento','manual','00000 - Proventos principais','Valor hora × horas trabalhadas',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00030','ADICIONAL POR FUNCAO','provento','manual','00000 - Proventos principais','Valor fixo ou % sobre salário base',true,false,true,false,false,false,true,true,true,true,true,true,true),
(_empresa_id,'00035','GRATIFICACAO','provento','manual','00000 - Proventos principais','Valor manual',true,false,true,false,false,false,true,true,true,true,true,false,true),
(_empresa_id,'00040','PREMIO / BONIFICACAO','provento','manual','00000 - Proventos principais','Valor manual',true,false,true,false,false,false,true,false,false,true,false,false,true),
(_empresa_id,'00045','COMISSAO','provento','manual','00000 - Proventos principais','% sobre vendas',true,false,true,false,false,false,true,true,true,true,true,true,true),
(_empresa_id,'00050','QUEBRA DE CAIXA','provento','manual','00000 - Proventos principais','Valor fixo ou % do salário',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00055','AJUDA DE CUSTO','provento','manual','00000 - Proventos principais','Valor manual',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00060','REEMBOLSO','provento','manual','00000 - Proventos principais','Valor manual',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00065','DIFERENCA SALARIAL','provento','manual','00000 - Proventos principais','Valor manual',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00070','ADICIONAL NOTURNO','provento','manual','00000 - Proventos principais','Horas noturnas × valor hora × adicional',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00075','DSR SOBRE ADICIONAL NOTURNO','provento','manual','00000 - Proventos principais','Reflexo do adicional noturno em DSR',true,false,true,true,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00080','INSALUBRIDADE','provento','percentual_salario','00000 - Proventos principais','% sobre base configurada (10/20/40%)',true,false,true,false,false,false,true,true,true,true,true,true,true),
(_empresa_id,'00085','PERICULOSIDADE','provento','percentual_salario','00000 - Proventos principais','% sobre salário base (geralmente 30%)',true,false,true,false,false,false,true,true,true,true,true,true,true),
(_empresa_id,'00090','HORAS EXTRAS 50%','provento','horas_extras_50','00000 - Proventos principais','Horas extras × valor hora × 1,5',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00095','HORAS EXTRAS 60%','provento','manual','00000 - Proventos principais','Horas extras × valor hora × 1,6',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00100','HORAS EXTRAS 70%','provento','manual','00000 - Proventos principais','Horas extras × valor hora × 1,7',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00105','HORAS EXTRAS 80%','provento','manual','00000 - Proventos principais','Horas extras × valor hora × 1,8',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00110','HORAS EXTRAS 100%','provento','horas_extras_100','00000 - Proventos principais','Horas extras × valor hora × 2',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00115','DSR HORAS EXTRAS 50%','provento','manual','00000 - Proventos principais','Reflexo das HE 50% no DSR',true,false,true,true,true,false,true,true,true,true,false,false,true),
(_empresa_id,'00120','DSR HORAS EXTRAS 100%','provento','manual','00000 - Proventos principais','Reflexo das HE 100% no DSR',true,false,true,true,true,false,true,true,true,true,false,false,true),
(_empresa_id,'00125','FERIADO TRABALHADO','provento','manual','00000 - Proventos principais','Horas × valor hora × % configurado',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00130','DOMINGO TRABALHADO','provento','manual','00000 - Proventos principais','Horas × valor hora × % configurado',true,false,true,true,true,false,true,true,true,true,true,true,true),
(_empresa_id,'00135','BANCO DE HORAS POSITIVO PAGO','provento','manual','00000 - Proventos principais','Horas positivas × valor hora × %',true,false,true,false,true,false,true,true,true,true,false,false,true),
(_empresa_id,'00140','ADICIONAL DE SOBREAVISO','provento','manual','00000 - Proventos principais','Horas de sobreaviso × % × valor hora',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00145','ADICIONAL DE TRANSFERENCIA','provento','percentual_salario','00000 - Proventos principais','% sobre salário base',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00150','ABONO SALARIAL EMPRESA','provento','manual','00000 - Proventos principais','Valor manual ou fixo',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00155','ABONO SUPERVISAO','provento','manual','00000 - Proventos principais','Valor manual',true,false,true,false,false,true,true,false,false,false,false,false,true),
(_empresa_id,'00160','ABONO DE FALTA','informativo','manual','00000 - Proventos principais','Não desconta o dia abonado',false,false,false,false,false,true,true,false,false,false,false,false,true),
(_empresa_id,'00165','INTEGRACAO','informativo','manual','00000 - Proventos principais','Dia considerado trabalhado',false,false,false,false,false,true,true,false,false,false,false,false,true),
(_empresa_id,'00170','TREINAMENTO','informativo','manual','00000 - Proventos principais','Período considerado trabalhado',false,false,false,false,false,true,true,false,false,false,false,false,true),
(_empresa_id,'00175','LIBERACAO DA COMPANHIA','informativo','manual','00000 - Proventos principais','Ausência autorizada pela empresa',false,false,false,false,false,true,true,false,false,false,false,false,true),
(_empresa_id,'00180','LIBERACAO SUPERVISAO','informativo','manual','00000 - Proventos principais','Ausência/atraso autorizado por supervisor',false,false,false,false,false,true,true,false,false,false,false,false,true),
(_empresa_id,'00185','FOLGA REMUNERADA','informativo','manual','00000 - Proventos principais','Dia remunerado, não gera falta',false,false,false,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00190','DSR','provento','manual','00000 - Proventos principais','DSR calculado separadamente',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'00195','COMPLEMENTO SALARIAL','provento','manual','00000 - Proventos principais','Ajuste ao mínimo/piso',true,false,true,false,false,false,true,true,true,true,false,false,true),

-- ====================== 00800 — BENEFÍCIOS E AUXÍLIOS ======================
(_empresa_id,'00800','VALE ALIMENTACAO','provento','manual','00800 - Benefícios e auxílios','Valor fixo ou diário × dias',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00805','VALE REFEICAO','provento','manual','00800 - Benefícios e auxílios','Valor diário × dias trabalhados',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00810','AUXILIO CRECHE','provento','manual','00800 - Benefícios e auxílios','Valor fixo por dependente',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00815','AUXILIO TRANSPORTE','informativo','manual','00800 - Benefícios e auxílios','Valor real do transporte concedido',false,false,false,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00820','CESTA BASICA','provento','manual','00800 - Benefícios e auxílios','Valor fixo ou regra de assiduidade',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00825','LANCHE / ALIMENTACAO INTERNA','informativo','manual','00800 - Benefícios e auxílios','Benefício interno concedido',false,false,false,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00830','BRINDE / PREMIACAO NAO SALARIAL','informativo','manual','00800 - Benefícios e auxílios','Valor manual',false,false,false,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'00835','SALARIO-FAMILIA','provento','manual','00800 - Benefícios e auxílios','Tabela vigente × dependentes elegíveis',true,false,true,true,false,false,true,false,false,false,false,false,true),

-- ====================== 07000 — DESCONTOS LEGAIS ======================
(_empresa_id,'07000','INSS MES','desconto','manual','07000 - Descontos legais','Tabela progressiva sobre salário de contribuição',false,true,true,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07005','IRRF MES','desconto','manual','07000 - Descontos legais','Tabela IRRF sobre base tributável',false,true,true,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07010','FGTS MES','informativo','manual','07000 - Descontos legais','Base FGTS × 8% (não desconta do empregado)',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07015','CONTRIBUICAO SINDICAL','desconto','manual','07000 - Descontos legais','Valor manual ou regra da convenção',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07020','CONTRIBUICAO ASSISTENCIAL','desconto','manual','07000 - Descontos legais','Valor fixo ou % por convenção',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07025','TAXA NEGOCIAL','desconto','manual','07000 - Descontos legais','Valor fixo ou % por convenção',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07030','VALE-TRANSPORTE','desconto','manual','07000 - Descontos legais','Menor entre VT concedido e 6% do salário base',false,true,true,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07035','DESCONTO DE FALTA INJUSTIFICADA','desconto','faltas_dias','07000 - Descontos legais','Salário/30 × dias de falta',false,true,true,true,true,true,true,false,false,false,false,false,true),
(_empresa_id,'07040','DESCONTO DSR SOBRE FALTA','desconto','dsr_faltas','07000 - Descontos legais','DSR perdido por falta injustificada',false,true,true,true,true,true,true,false,false,false,false,false,true),
(_empresa_id,'07045','DESCONTO ATRASO','desconto','atrasos','07000 - Descontos legais','Valor hora × minutos de atraso (respeita tolerância)',false,true,true,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'07050','DESCONTO SAIDA ANTECIPADA','desconto','manual','07000 - Descontos legais','Valor hora × tempo de saída antecipada',false,true,true,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'07055','DESCONTO INTERVALO NAO CUMPRIDO','desconto','manual','07000 - Descontos legais','Valor hora × tempo não cumprido (configurável)',false,true,true,false,true,false,true,false,false,false,false,false,true),
(_empresa_id,'07060','DESCONTO BANCO DE HORAS NEGATIVO','desconto','manual','07000 - Descontos legais','Horas negativas autorizadas × valor hora',false,true,true,false,true,false,true,false,false,false,false,false,true),
(_empresa_id,'07065','ADIANTAMENTO SALARIAL','desconto','manual','07000 - Descontos legais','Valor do adiantamento pago no mês',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07070','DESCONTO ADIANTAMENTO QUINZENAL','desconto','manual','07000 - Descontos legais','% do salário ou valor manual',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07075','DESCONTO VALE / EMPRESTIMO INTERNO','desconto','manual','07000 - Descontos legais','Valor manual ou parcela cadastrada',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07080','DESCONTO DANOS / AVARIAS','desconto','manual','07000 - Descontos legais','Valor manual (exige autorização)',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07085','DESCONTO UNIFORME','desconto','manual','07000 - Descontos legais','Valor manual ou parcela',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07090','DESCONTO EPI','desconto','manual','07000 - Descontos legais','Valor manual (bloqueado por padrão)',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07095','DESCONTO ALIMENTACAO','desconto','manual','07000 - Descontos legais','Diário × dias ou % ou valor fixo',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07100','DESCONTO REFEICAO','desconto','manual','07000 - Descontos legais','Quantidade × valor unitário',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07105','DESCONTO CAFE DA MANHA','desconto','manual','07000 - Descontos legais','Quantidade × valor unitário',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07110','DESCONTO LANCHE FUNCIONARIO','desconto','manual','07000 - Descontos legais','Valor consumido acima do benefício',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07115','DESCONTO PLANO DE SAUDE','desconto','manual','07000 - Descontos legais','Mensalidade funcionário + dependentes',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07120','DESCONTO PLANO ODONTOLOGICO','desconto','manual','07000 - Descontos legais','Mensalidade cadastrada',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07125','DESCONTO FARMACIA','desconto','manual','07000 - Descontos legais','Compras autorizadas em convênio',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07130','DESCONTO CONVENIO','desconto','manual','07000 - Descontos legais','Valor lançado manualmente',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07135','DESCONTO PENSAO ALIMENTICIA','desconto','manual','07000 - Descontos legais','Valor fixo ou % conforme decisão',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07140','DESCONTO FERIAS','desconto','manual','07000 - Descontos legais','Valor de adiantamento de férias já pago',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07145','DESCONTO FALTA DE CAIXA','desconto','manual','07000 - Descontos legais','Valor manual (exige conferência)',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07150','DESCONTO ARREDONDAMENTO','desconto','manual','07000 - Descontos legais','Ajuste de centavos',false,true,true,false,false,false,true,false,false,false,false,false,true),

-- ====================== 07800 — DESCONTOS DE BENEFÍCIOS ======================
(_empresa_id,'07800','VALE ALIMENTACAO DESCONTO','desconto','manual','07800 - Descontos de benefícios','% ou valor fixo definido pela empresa',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07805','VALE REFEICAO DESCONTO','desconto','manual','07800 - Descontos de benefícios','% ou valor por refeição',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07810','CESTA BASICA DESCONTO','desconto','manual','07800 - Descontos de benefícios','Valor de coparticipação',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07815','COPARTICIPACAO ALIMENTACAO','desconto','manual','07800 - Descontos de benefícios','Valor consumido pelo funcionário',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07820','COPARTICIPACAO PLANO DE SAUDE','desconto','manual','07800 - Descontos de benefícios','Coparticipação do mês',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07825','COPARTICIPACAO ODONTOLOGICO','desconto','manual','07800 - Descontos de benefícios','Coparticipação do mês',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07830','REFEICAO','desconto','manual','07800 - Descontos de benefícios','Quantidade × valor cadastrado',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07835','CAFE DA MANHA','desconto','manual','07800 - Descontos de benefícios','Quantidade × valor cadastrado',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07840','LANCHE EXCEDENTE','desconto','manual','07800 - Descontos de benefícios','Consumo acima do limite',false,true,true,false,false,false,true,false,false,false,false,false,true),

-- ====================== 07900 — CONSIGNADOS ======================
(_empresa_id,'07900','CONSIGNADO 1','desconto','manual','07900 - Consignados e parcelamentos','Valor da parcela',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07905','CONSIGNADO 2','desconto','manual','07900 - Consignados e parcelamentos','Valor da parcela',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07910','CONSIGNADO 3','desconto','manual','07900 - Consignados e parcelamentos','Valor da parcela',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07915','EMPRESTIMO EMPRESA PARCELA','desconto','manual','07900 - Consignados e parcelamentos','Parcela mensal',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07920','COMPRA FUNCIONARIO PARCELA','desconto','manual','07900 - Consignados e parcelamentos','Parcela cadastrada',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'07925','ADIANTAMENTO EXTRA','desconto','manual','07900 - Consignados e parcelamentos','Valor adiantado fora do normal',false,true,true,false,false,false,true,false,false,false,false,false,true),

-- ====================== 08000 — JUSTIFICATIVAS DO PONTO ======================
(_empresa_id,'08000','FALTA INJUSTIFICADA','informativo','manual','08000 - Justificativas do ponto','Gera desconto via 07035/07040',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08005','FALTA JUSTIFICADA SEM DESCONTO','informativo','manual','08000 - Justificativas do ponto','Não desconta o dia',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08010','ATESTADO MEDICO','informativo','manual','08000 - Justificativas do ponto','Não gera falta (anexa atestado)',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08015','AFASTAMENTO DOENCA','informativo','manual','08000 - Justificativas do ponto','Registra afastamento',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08020','ABONO','informativo','manual','08000 - Justificativas do ponto','Abona atraso/falta/saída antecipada',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08025','TROCA DE FOLGA','informativo','manual','08000 - Justificativas do ponto','Não desconta se houver troca aprovada',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08030','ADMISSAO','informativo','manual','08000 - Justificativas do ponto','Identifica início de vínculo',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08035','DESLIGAMENTO','informativo','manual','08000 - Justificativas do ponto','Identifica fim do vínculo',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08040','FOLGA','informativo','manual','08000 - Justificativas do ponto','Não gera desconto',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08045','INTEGRACAO','informativo','manual','08000 - Justificativas do ponto','Dia autorizado',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08050','TREINAMENTO','informativo','manual','08000 - Justificativas do ponto','Dia autorizado',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08055','DEBITO BANCO DE HORAS','informativo','manual','08000 - Justificativas do ponto','Horas negativas no banco',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08060','CREDITO BANCO DE HORAS','informativo','manual','08000 - Justificativas do ponto','Horas positivas no banco',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08065','FERIAS NORMAIS','informativo','manual','08000 - Justificativas do ponto','Marca período de férias',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08070','FERIAS','informativo','manual','08000 - Justificativas do ponto','Registra período de férias',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08075','LIBERACAO SUPERVISAO','informativo','manual','08000 - Justificativas do ponto','Abona irregularidade aprovada',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08080','ABONO SUPERVISAO','informativo','manual','08000 - Justificativas do ponto','Abona irregularidade aprovada',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08085','FERIAS COLETIVAS','informativo','manual','08000 - Justificativas do ponto','Registra férias coletivas',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08090','FECHADO','informativo','manual','08000 - Justificativas do ponto','Empresa fechada no dia',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08095','LIBERACAO COLETIVA SUPERVISAO','informativo','manual','08000 - Justificativas do ponto','Abono coletivo',false,false,false,false,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08100','MARCACAO NAO REGISTRADA','informativo','manual','08000 - Justificativas do ponto','Irregularidade, exige justificativa',false,false,false,true,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08105','ENTRADA ANTECIPADA','informativo','manual','08000 - Justificativas do ponto','Entrada antes do horário',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08110','SAIDA ANTECIPADA','informativo','manual','08000 - Justificativas do ponto','Saída antes do horário',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08115','ATRASO','informativo','manual','08000 - Justificativas do ponto','Atraso acima da tolerância',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'08120','HORA EXTRA NAO APROVADA','informativo','manual','08000 - Justificativas do ponto','Aguardando aprovação',false,false,false,true,true,true,true,false,false,false,false,false,true),
(_empresa_id,'08125','HORA EXTRA APROVADA','informativo','manual','08000 - Justificativas do ponto','Gera pagamento de HE',false,false,false,true,true,true,true,false,false,false,false,false,true),

-- ====================== 09000 — FÉRIAS ======================
(_empresa_id,'09000','FERIAS','provento','manual','09000 - Férias','Salário base × dias de férias',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'09005','1/3 FERIAS','provento','manual','09000 - Férias','Valor das férias / 3',true,false,true,true,false,false,true,true,true,true,false,false,true),
(_empresa_id,'09010','ABONO PECUNIARIO DE FERIAS','provento','manual','09000 - Férias','Dias vendidos de férias',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'09015','1/3 ABONO PECUNIARIO','provento','manual','09000 - Férias','Abono pecuniário / 3',true,false,true,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'09020','ADIANTAMENTO DE FERIAS','desconto','manual','09000 - Férias','Valores já pagos no recibo de férias',false,true,true,false,false,false,true,false,false,false,false,false,true),

-- ====================== 10000 — 13º SALÁRIO ======================
(_empresa_id,'10000','13o SALARIO 1a PARCELA','provento','manual','10000 - 13º Salário','50% do 13º devido por avos',true,false,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'10005','13o SALARIO 2a PARCELA','provento','manual','10000 - 13º Salário','13º total menos 1ª parcela',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'10010','ADIANTAMENTO 13o','desconto','manual','10000 - 13º Salário','Desconto da 1ª parcela já paga',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'10015','MEDIAS 13o','provento','manual','10000 - 13º Salário','Médias de HE, AN, comissões etc.',true,false,true,true,false,false,true,true,true,true,false,false,true),
(_empresa_id,'10020','INSS 13o','desconto','manual','10000 - 13º Salário','INSS sobre base do 13º',false,true,true,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'10025','IRRF 13o','desconto','manual','10000 - 13º Salário','IRRF sobre base do 13º',false,true,true,true,false,false,true,false,false,false,false,false,true),

-- ====================== 11000 — RESCISÃO ======================
(_empresa_id,'11000','SALDO DE SALARIO RESCISAO','provento','manual','11000 - Rescisão','Salário/30 × dias trabalhados',true,false,true,true,true,false,true,true,true,true,false,false,true),
(_empresa_id,'11005','AVISO PREVIO TRABALHADO','provento','manual','11000 - Rescisão','Conforme dias de aviso trabalhado',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'11010','AVISO PREVIO INDENIZADO','provento','manual','11000 - Rescisão','Salário/30 × dias de aviso indenizado',true,false,true,false,false,false,true,false,true,false,false,false,true),
(_empresa_id,'11015','FERIAS VENCIDAS','provento','manual','11000 - Rescisão','Salário base + médias',true,false,true,false,false,false,true,false,false,true,false,false,true),
(_empresa_id,'11020','1/3 FERIAS VENCIDAS','provento','manual','11000 - Rescisão','Férias vencidas / 3',true,false,true,true,false,false,true,false,false,true,false,false,true),
(_empresa_id,'11025','FERIAS PROPORCIONAIS','provento','manual','11000 - Rescisão','Salário/12 × avos',true,false,true,false,false,false,true,false,false,true,false,false,true),
(_empresa_id,'11030','1/3 FERIAS PROPORCIONAIS','provento','manual','11000 - Rescisão','Férias proporcionais / 3',true,false,true,true,false,false,true,false,false,true,false,false,true),
(_empresa_id,'11035','13o PROPORCIONAL','provento','manual','11000 - Rescisão','Salário/12 × avos de 13º',true,false,true,false,false,false,true,true,true,true,false,false,true),
(_empresa_id,'11040','MULTA FGTS','informativo','manual','11000 - Rescisão','Registro da multa do FGTS',false,false,false,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'11045','DESCONTO AVISO PREVIO','desconto','manual','11000 - Rescisão','Salário/30 × dias descontados',false,true,true,false,false,false,true,false,false,false,false,false,true),
(_empresa_id,'11050','DESCONTO FALTAS RESCISAO','desconto','manual','11000 - Rescisão','Faltas não justificadas na rescisão',false,true,true,true,true,true,true,false,false,false,false,false,true),
(_empresa_id,'11055','DESCONTO ADIANTAMENTO RESCISAO','desconto','manual','11000 - Rescisão','Valores adiantados antes da rescisão',false,true,true,false,false,false,true,false,false,false,false,false,true),

-- ====================== 18000 — RESULTADOS E TOTAIS ======================
(_empresa_id,'18000','TOTAL DE PROVENTOS','resultado','manual','18000 - Resultados e totais','Soma de todas rubricas de provento',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18005','TOTAL DE DESCONTOS','resultado','manual','18000 - Resultados e totais','Soma de todas rubricas de desconto',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18010','TOTAL LIQUIDO','resultado','manual','18000 - Resultados e totais','Proventos − descontos',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18015','BASE INSS','resultado','manual','18000 - Resultados e totais','Rubricas com incidência de INSS',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18020','BASE FGTS','resultado','manual','18000 - Resultados e totais','Rubricas com incidência de FGTS',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18025','FGTS DO MES','informativo','manual','18000 - Resultados e totais','Valor FGTS devido pela empresa',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18030','BASE IRRF','resultado','manual','18000 - Resultados e totais','Base tributável para IRRF',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18035','BASE SALARIO-FAMILIA','resultado','manual','18000 - Resultados e totais','Verifica direito ao salário-família',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18040','SALARIO BASE DO MES','resultado','manual','18000 - Resultados e totais','Salário/30 × dias de vínculo',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'18045','DIAS DE VINCULO','resultado','manual','18000 - Resultados e totais','Dias dentro do vínculo na competência',false,false,false,true,false,false,true,false,false,false,false,false,true),
(_empresa_id,'18050','HORAS TRABALHADAS','resultado','manual','18000 - Resultados e totais','Total de horas no cartão de ponto',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'18055','HORAS EXTRAS','resultado','manual','18000 - Resultados e totais','Total de horas extras apuradas',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'18060','BANCO DE HORAS POSITIVO','resultado','manual','18000 - Resultados e totais','Saldo positivo de banco de horas',false,false,false,true,true,false,true,false,false,false,false,false,true),
(_empresa_id,'18065','BANCO DE HORAS NEGATIVO','resultado','manual','18000 - Resultados e totais','Saldo negativo de banco de horas',false,false,false,true,true,false,true,false,false,false,false,false,true)
ON CONFLICT (empresa_id, codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  tipo = EXCLUDED.tipo,
  grupo = EXCLUDED.grupo,
  base_calculo = EXCLUDED.base_calculo,
  soma_proventos = EXCLUDED.soma_proventos,
  soma_descontos = EXCLUDED.soma_descontos,
  entra_liquido = EXCLUDED.entra_liquido,
  automatico = EXCLUDED.automatico,
  depende_ponto = EXCLUDED.depende_ponto,
  depende_justificativa = EXCLUDED.depende_justificativa,
  aparece_pdf = EXCLUDED.aparece_pdf,
  incide_inss = EXCLUDED.incide_inss,
  incide_fgts = EXCLUDED.incide_fgts,
  incide_irrf = EXCLUDED.incide_irrf,
  entra_medias = EXCLUDED.entra_medias,
  entra_dsr = EXCLUDED.entra_dsr,
  padrao_sistema = true,
  updated_at = now();
END;
$$;

-- 4. Trigger para empresas novas
CREATE OR REPLACE FUNCTION public.seed_rubricas_apos_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_rubricas_padrao(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_rubricas_apos_empresa ON public.empresas;
CREATE TRIGGER trg_seed_rubricas_apos_empresa
AFTER INSERT ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.seed_rubricas_apos_empresa();

-- 5. Carregar para empresas existentes
DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.seed_rubricas_padrao(e.id);
  END LOOP;
END $$;