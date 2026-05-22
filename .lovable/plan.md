## Módulo de Justificativas de Irregularidade

Sistema completo para tratar faltas, atrasos, ausências e divergências de ponto com regras configuráveis por tipo de justificativa. Cada justificativa governa desconto, banco de horas, DSR, cesta básica e exigência de marcação.

A entrega é dividida em **5 fases**. Cada fase é independente, testável e já gera valor — você pode pausar entre elas, mudar prioridade ou pedir ajustes antes de avançar.

---

### Fase 1 — Cadastro de tipos de justificativa

Base do módulo. Tudo nas fases seguintes depende disso.

- Nova tabela `justificativas_tipos` com as 20 justificativas padrão pré-cadastradas (FALTA INJUSTIF - DESC, ATESTADO MED, AFAST DOENÇA, LIBERAÇÃO DA COMPANHIA, ABONO, TROCA, ADMISSÃO, DESLIGAMENTO, FOLGA, INTEGRAÇÃO, TREINAMENTO, DEBITO BC HORA, CREDITO BC HORA, FERIAS NORMAIS, FERIAS, LIBERACAO SUPERVISAO, ABONO SUPERVISAO, FERIAS COLETIVAS, FECHADO, LIBERACAO COLETIVA SUPERV).
- Campos por tipo: nome, código, categoria (falta/abono/afastamento/banco_horas/ferias/folga/admissao_desligamento), desconta_salario, desconta_dsr, abona_ocorrencia, exige_aprovacao, exige_anexo, exige_observacao, movimenta_banco_horas (nenhum/credito/debito), conta_dia_trabalhado, exige_marcacao_ponto, afeta_assiduidade (sim/nao/configuravel), pode_aplicar_individual, pode_aplicar_massa, ativo.
- Tela admin **Configurações → Justificativas**: listar, editar regras dos padrão, criar customizados, ativar/desativar.

### Fase 2 — Aplicação individual + exibição no cartão de ponto

A peça mais útil no dia a dia. Após esta fase você já consegue justificar qualquer dia.

- Tabela `justificativas_aplicadas` (funcionario, data, tipo_id, observacao, anexo_url, aplicado_por, status, data_inicio, data_fim para afastamentos).
- Substitui a tabela atual `dias_falta` (migração de dados).
- Diálogo "Aplicar justificativa" ao clicar em dia do cartão de ponto (admin/gerente): seleciona tipo, observação, anexo opcional.
- Cartão de ponto e PDF passam a mostrar a justificativa em vez de "MARCAÇÃO NÃO REGISTRADA" quando aplicada.
- Recálculo automático de totais (faltas, trabalhado, extras) respeitando flags do tipo (ex.: FOLGA não conta falta, ATESTADO abona).

### Fase 3 — Banco de horas + impacto financeiro

Ativa as justificativas que mexem em saldo e desconto.

- Nova tabela `banco_horas_movimentos` (funcionario, data, tipo: credito/debito, minutos, origem: justificativa_id ou automatico, saldo_apos).
- DEBITO BC HORA / CREDITO BC HORA passam a movimentar saldo real, exibido no cartão de ponto e PDF.
- Coluna "Desconto em folha" no relatório, calculada a partir de FALTA INJUSTIF - DESC (com regra de DSR opcional).
- Tela **Banco de Horas** por funcionário com extrato de movimentos.

### Fase 4 — Aplicação em massa + admissão/desligamento

Atende FERIAS COLETIVAS, FECHADO, LIBERACAO COLETIVA SUPERV, ADMISSÃO, DESLIGAMENTO.

- Tela "Aplicar em massa": escolhe tipo, período (data inicial/final), funcionários (todos / por cargo / seleção manual). Cria N registros em `justificativas_aplicadas`.
- ADMISSÃO/DESLIGAMENTO param de gerar falta antes/depois das datas no cartão de ponto (consulta `funcionarios.data_admissao` / `data_desligamento`).
- TROCA: dialog que vincula dia ausente a dia compensado, gera 2 movimentos no banco de horas se houver diferença.

### Fase 5 — Aprovação, anexos e cesta básica

Camada de governança e integração com benefícios.

- Fluxo de aprovação: tipos com `exige_aprovacao` ficam status `pendente` até admin/supervisor aprovar; tela "Justificativas pendentes".
- Upload de anexo (atestado médico, etc.) para Supabase Storage, bucket privado `justificativas`.
- Integração com `beneficios_calculos`: justificativas com `afeta_assiduidade=false` não retiram cesta básica; configurável para ATESTADO MED e AFAST DOENÇA.
- Filtros completos no relatório: por funcionário, período, tipo, status, com/sem desconto, com/sem impacto em cesta.
- Coluna "Responsável" + "Aprovado em" no relatório.

---

### Detalhes técnicos

```
justificativas_tipos
  id, empresa_id, nome, codigo, categoria,
  desconta_salario, desconta_dsr, abona_ocorrencia,
  exige_aprovacao, exige_anexo, exige_observacao,
  movimenta_banco_horas, conta_dia_trabalhado,
  exige_marcacao_ponto, afeta_assiduidade,
  pode_aplicar_individual, pode_aplicar_massa,
  ativo, padrao_sistema, created_at

justificativas_aplicadas
  id, empresa_id, funcionario_id, tipo_id,
  data, data_inicio, data_fim,
  observacao, anexo_url,
  aplicado_por, aprovado_por, aprovado_em,
  status (pendente/aprovado/reprovado),
  banco_horas_minutos, created_at

banco_horas_movimentos
  id, empresa_id, funcionario_id,
  data, tipo (credito/debito), minutos,
  origem (justificativa/automatico/ajuste),
  justificativa_aplicada_id, saldo_apos_minutos,
  created_by, created_at
```

RLS: admin/gerente gerenciam; funcionário lê apenas seus dados aprovados.

Cálculo do cartão de ponto (`src/lib/cartao.ts`) passa a consultar `justificativas_aplicadas` + `banco_horas_movimentos` e decidir status do dia conforme flags do tipo aplicado, em vez da lógica atual `pendente / falta`.

PDF (`src/lib/cartao-pdf.ts`) ganha coluna "Justificativa" preenchida com o nome do tipo + observação.

---

### Como prosseguir

Posso começar **Fase 1** agora mesmo. Me diga "ok fase 1" ou indique outra ordem se preferir começar por outra parte (ex.: pular cadastro editável e ir direto para aplicação individual com tipos hardcoded).