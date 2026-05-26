import jsPDF from "jspdf";

export type HolerEmpresa = {
  nome_fantasia: string;
  razao_social?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
};

export type HolerFuncionario = {
  nome: string;
  cpf?: string | null;
  cargo?: string | null;
  data_admissao?: string | null;
  matricula?: string | null;
};

export type HolerLancamento = {
  codigo: string;
  descricao: string;
  qtde?: number | null;
  provento?: number | null;
  desconto?: number | null;
  resultado?: number | null;
};

export type HolerData = {
  folha_tipo: string;
  mes_referencia: number;
  ano_referencia: number;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  data_pagamento?: string | null;
  banco_agencia?: string | null;
  conta?: string | null;
  num_dep_irrf: number;
  num_dep_sal_fam: number;
  salario_contratual: number;
  total_proventos: number;
  total_descontos: number;
  total_liquido: number;
  sal_contrib_inss: number;
  base_fgts: number;
  fgts_mes: number;
  base_irpf: number;
  lotacao?: string | null;
  observacoes?: string | null;
};

const fmtNum = (v: number | null | undefined, dec = 2): string => {
  if (v == null || v === 0) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const fmtData = (d?: string | null): string => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
};
const fmtRef = (mes: number, ano: number) => `${String(mes).padStart(2, "0")}/${ano}`;

export function gerarHoleritePdf(
  empresa: HolerEmpresa,
  funcionario: HolerFuncionario,
  dados: HolerData,
  lancamentos: HolerLancamento[],
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 8;
  let y = M;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RECIBO DE PAGAMENTO", W / 2, y + 4, { align: "center" });
  y += 8;

  doc.setLineWidth(0.2);
  doc.rect(M, y, W - 2 * M, 8);
  const colsHeader = [
    { label: "Folha:", value: dados.folha_tipo, w: 30 },
    { label: "Período de Pagamento:", value: `${fmtData(dados.periodo_inicio)} a ${fmtData(dados.periodo_fim)}`, w: 60 },
    { label: "Página:", value: "1", w: 18 },
    { label: "Dt. pagt.:", value: fmtData(dados.data_pagamento), w: 30 },
    { label: "Referência:", value: fmtRef(dados.mes_referencia, dados.ano_referencia), w: W - 2 * M - 30 - 60 - 18 - 30 },
  ];
  let x = M;
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  for (const c of colsHeader) {
    doc.text(c.label, x + 1, y + 2.8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(c.value, x + 1, y + 6.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    x += c.w;
  }
  y += 8;

  // Empresa
  doc.rect(M, y, W - 2 * M, 8);
  doc.text("Nome da empresa:", M + 1, y + 2.8);
  doc.text("CNPJ:", W - M - 35, y + 2.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(empresa.razao_social || empresa.nome_fantasia, M + 1, y + 6.8);
  doc.text(empresa.cnpj || "", W - M - 35, y + 6.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  y += 8;

  // Nome funcionário
  doc.rect(M, y, W - 2 * M, 8);
  doc.text("Nome:", M + 1, y + 2.8);
  doc.text("CPF:", W - M - 35, y + 2.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(funcionario.nome, M + 1, y + 6.8);
  doc.text(funcionario.cpf || "", W - M - 35, y + 6.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  y += 8;

  // Cargo + admissão
  doc.rect(M, y, W - 2 * M, 8);
  doc.text("Cargo:", M + 1, y + 2.8);
  doc.text("Data admissão:", W - M - 35, y + 2.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(funcionario.cargo || "", M + 1, y + 6.8);
  doc.text(fmtData(funcionario.data_admissao), W - M - 35, y + 6.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  y += 8;

  // Lotação
  if (dados.lotacao) {
    doc.rect(M, y, W - 2 * M, 8);
    doc.text("Lotação:", M + 1, y + 2.8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(dados.lotacao, M + 1, y + 6.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    y += 8;
  }

  // Banco / Salário contratual
  doc.rect(M, y, W - 2 * M, 8);
  const bancoCols = [
    { l: "Bco/Ag:", v: dados.banco_agencia || "", w: 40 },
    { l: "Conta:", v: dados.conta || "", w: 40 },
    { l: "Num. Dep. IRRF:", v: String(dados.num_dep_irrf), w: 35 },
    { l: "Num. Dep. Sal. Fam.:", v: String(dados.num_dep_sal_fam), w: 40 },
    { l: "Salário contratual:", v: fmtNum(dados.salario_contratual), w: W - 2 * M - 40 - 40 - 35 - 40 },
  ];
  x = M;
  for (const c of bancoCols) {
    doc.text(c.l, x + 1, y + 2.8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(c.v, x + 1, y + 6.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    x += c.w;
  }
  y += 8;

  // Header da tabela
  doc.setFillColor(230, 230, 230);
  doc.rect(M, y, W - 2 * M, 6, "F");
  doc.rect(M, y, W - 2 * M, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const colsTab = { codigo: 20, desc: 80, qtde: 22, prov: 28, desc2: 28, res: W - 2 * M - 20 - 80 - 22 - 28 - 28 };
  let cx = M;
  doc.text("Código", cx + 1, y + 4); cx += colsTab.codigo;
  doc.text("Descrição", cx + 1, y + 4); cx += colsTab.desc;
  doc.text("Qtde", cx + colsTab.qtde - 1, y + 4, { align: "right" }); cx += colsTab.qtde;
  doc.text("Provento", cx + colsTab.prov - 1, y + 4, { align: "right" }); cx += colsTab.prov;
  doc.text("Desconto", cx + colsTab.desc2 - 1, y + 4, { align: "right" }); cx += colsTab.desc2;
  doc.text("Resultado", cx + colsTab.res - 1, y + 4, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  for (const l of lancamentos) {
    if (y > 250) {
      doc.addPage();
      y = M;
    }
    cx = M;
    doc.text(l.codigo, cx + 1, y + 4); cx += colsTab.codigo;
    doc.text(l.descricao, cx + 1, y + 4); cx += colsTab.desc;
    doc.text(fmtNum(l.qtde, 2), cx + colsTab.qtde - 1, y + 4, { align: "right" }); cx += colsTab.qtde;
    doc.text(fmtNum(l.provento), cx + colsTab.prov - 1, y + 4, { align: "right" }); cx += colsTab.prov;
    doc.text(fmtNum(l.desconto), cx + colsTab.desc2 - 1, y + 4, { align: "right" }); cx += colsTab.desc2;
    doc.text(fmtNum(l.resultado), cx + colsTab.res - 1, y + 4, { align: "right" });
    y += 5;
  }

  y += 2;
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += 1;

  // Totais
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.rect(M, y, W - 2 * M, 8);
  doc.text(`Total de proventos: ${fmtNum(dados.total_proventos)}`, M + 2, y + 5);
  doc.text(`Total de descontos: ${fmtNum(dados.total_descontos)}`, M + 70, y + 5);
  doc.text(`Total líquido: ${fmtNum(dados.total_liquido)}`, W - M - 50, y + 5);
  y += 8;

  // Bases
  doc.rect(M, y, W - 2 * M, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const basesCols = [
    { l: "Sal. contrib. INSS:", v: fmtNum(dados.sal_contrib_inss) },
    { l: "Base cal. FGTS:", v: fmtNum(dados.base_fgts) },
    { l: "FGTS mês:", v: fmtNum(dados.fgts_mes) },
    { l: "Base calc. IRPF:", v: fmtNum(dados.base_irpf) },
  ];
  const colW = (W - 2 * M) / basesCols.length;
  basesCols.forEach((c, i) => {
    const bx = M + i * colW;
    doc.text(c.l, bx + 1, y + 3.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(c.v, bx + colW - 2, y + 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
  });
  y += 12;

  if (dados.observacoes) {
    doc.setFontSize(7);
    doc.text("Observações:", M, y);
    y += 4;
    const lines = doc.splitTextToSize(dados.observacoes, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 4;
  }

  // Assinatura
  y = Math.max(y + 16, 260);
  doc.line(M + 30, y, W - M - 30, y);
  doc.setFontSize(7);
  doc.text("Assinatura do funcionário", W / 2, y + 4, { align: "center" });

  return doc;
}
