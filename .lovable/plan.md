# Motor de Cálculo da Folha — Rubricas Automáticas

Implementação do engine que substitui o "tudo manual" por rubricas automáticas, semi-automáticas e manuais, com cálculo de INSS, FGTS, IRRF, VT, atrasos, faltas, HE e DSR.

## 1. Banco de dados (migração)

Expandir `holerite_rubricas`:
- Adicionar/normalizar `tipo_calculo` para suportar os 34 tipos (CHECK constraint atualizado).
- Garantir flags já existentes: `automatico`, `depende_ponto`, `incide_inss`, `incide_fgts`, `incide_irrf`, `entra_dsr`, `entra_medias`, `entra_liquido`, `aparece_pdf`.
- Adicionar `modo` (`automatico` | `semi_automatico` | `manual`) e `editavel_manual` (bool).
- Reseed das rubricas padrão (`seed_rubricas_padrao`) marcando corretamente:
  - 00005, 00090, 00110, 00120, 00820, 07030, 07000, 07005, 07010, 07035, 07045, 07050, 07060, 07070 como **automáticas** com `tipo_calculo` adequado.
  - 00020, 00030, 00035, 00040, 00045, 00055, 00060, 00065, 07075, 07080, 07085, 07125, 07130, 07135, 07900, 07905, 07910 como **manuais**.
- Tabela nova `holerite_tabelas_legais` (INSS/IRRF/Salário-família) com vigência por ano/mês, para administrador editar quando mudar tabela. Seed com tabelas vigentes (2025/2026).
- Tabela nova `funcionario_vale_transporte` (valor mensal concedido por funcionário, opcional). Se ausente → VT = 0.

## 2. Engine de cálculo (`src/lib/holerite-engine.ts`)

Função única `recalcularHolerite(holeriteId)` que:
1. Carrega funcionário, salário, admissão/desligamento, dependentes IRRF/sal-fam, VT cadastrado.
2. Carrega rubricas da empresa.
3. Carrega ponto do mês (HE, atrasos, faltas, banco de horas).
4. Para cada rubrica **automática** já presente no holerite (ou adicionada), calcula qtde/provento/desconto conforme `tipo_calculo`:
   - `salario_proporcional` (00005), `salario_mensal` (00010)
   - `he_50/60/70/80/100`, `dsr_he`, `adicional_noturno`, `dsr_noturno`
   - `valor_fixo`, `valor_diario`, `valor_hora`, `pct_salario_base`, `pct_salario_bruto`, `pct_base_config`
   - `vt_automatico` (menor entre VT concedido e 6% do salário base proporcional)
   - `inss_automatico` (tabela progressiva sobre base com `incide_inss`)
   - `fgts_automatico` (8% sobre base com `incide_fgts`, **não desconta líquido** — atualiza `base_fgts` e `fgts_mes`)
   - `irrf_automatico` (tabela progressiva sobre base tributável − INSS − dedução por dependente)
   - `faltas_auto`, `atraso_auto`, `saida_antec_auto`, `bh_negativo`, `bh_positivo_pago`
   - `adto_quinzenal_auto` (% do salário proporcional)
   - `cesta_basica_auto`, `vale_alim_auto`, `vale_ref_auto`
   - `salario_familia_auto`
   - `relatorio_ponto`, `resultado_auto`
5. Recalcula bases e grava em `holerites`: `sal_contrib_inss`, `base_fgts`, `fgts_mes`, `base_irpf`, `total_proventos`, `total_descontos`, `total_liquido` (informativos não entram no líquido).
6. Persiste lançamentos em `holerite_lancamentos` (mantém manuais como estão).

## 3. UI — Rubricas (`src/routes/app/empresa/rubricas.tsx`)

- Coluna "Cálculo" passa a mostrar `tipo_calculo` legível + badge "AUTO / SEMI / MANUAL".
- Editor: novo select para `modo` e ampliação da lista `TIPO_CALCULO_OPCOES` em `src/lib/holerite-rubricas.ts` com os 34 tipos.

## 4. UI — Holerites (`src/routes/app/empresa/holerites.tsx`)

- Botão **"Recalcular holerite"** que chama `recalcularHolerite()` e recarrega lançamentos + totais.
- Ao adicionar rubrica automática no combobox: dispara cálculo imediato para aquela linha (qtde/prov/desc preenchidos).
- Campos qtde/provento/desconto ficam **read-only** quando a rubrica é automática e `editavel_manual=false`.
- Painel mostra bases atualizadas: Sal. contrib. INSS, Base FGTS, FGTS mês, Base IRPF.

## 5. Cadastro do VT por funcionário

Pequeno campo `vale_transporte_mensal` (numeric) em `funcionarios` + input em `funcionarios.$id.tsx`. Usado pelo `vt_automatico`.

## Detalhes técnicos

- Tabelas INSS/IRRF ficam em SQL seed e carregadas pelo engine (cache na sessão). Vigência atual: INSS 2025 (faixas 7,5% até 1.518,00; 9% até 2.793,88; 12% até 4.190,83; 14% até 8.157,41). IRRF 2025 (isento até 2.428,80; até 33,75% conforme tabela vigente; dedução por dependente R$ 189,59).
- Cálculo respeita admissão/desligamento (dias de vínculo, igual à rubrica `salario_dias_trabalhados` já existente).
- Faltas: usa `dias_falta` + justificativas com `desconta_salario`.
- Atrasos e HE: usa `banco_horas_movimentos` (débito = atraso, crédito = HE) somente para o mês.
- DSR sobre HE: usa proporção `domingos+feriados / dias úteis` do mês.
- Engine é client-side TypeScript (mesma stack das outras libs `holerite-*`). Sem servidor adicional.

## Fora do escopo desta iteração

- Tela administrativa para editar as tabelas INSS/IRRF (vão por seed; admin pode alterar via SQL/migração futura).
- Cálculo de adicional noturno e periculosidade/insalubridade fica como `manual` por enquanto (depende de configurações por funcionário ainda inexistentes).
- Sales/comissões automáticas (sem módulo de vendas).
