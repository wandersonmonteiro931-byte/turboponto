import jsPDF from "jspdf";

export type HolerEmpresa = {
  nome_fantasia: string;
  razao_social?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  logoDataUrl?: string | null;
};

export type HolerFuncionario = {
  nome: string;
  cpf?: string | null;
  rg?: string | null;
  cargo?: string | null;
  data_admissao?: string | null;
  matricula?: string | null;
  endereco?: string | null;
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
const fmtHoras = (v: number | null | undefined): string => {
  if (v == null) return "";
  const sinal = v < 0 ? "-" : "";
  const totalMinutos = Math.round(Math.abs(v) * 60);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${sinal}${horas}h${String(minutos).padStart(2, "0")}`;
};
const fmtData = (d?: string | null): string => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
};
const fmtRef = (mes: number, ano: number) => `${String(mes).padStart(2, "0")}/${ano}`;

type Cell = { label: string; value: string; w: number };

export function gerarHoleritePdf(
  empresa: HolerEmpresa,
  funcionario: HolerFuncionario,
  dados: HolerData,
  lancamentos: HolerLancamento[],
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 8;
  const innerW = W - 2 * M;
  let y = M;

  doc.setLineWidth(0.2);

  // ===== Cabeçalho: Logo + Título =====
  const headH = 16;
  const logoW = innerW * 0.4;
  const titleW = innerW - logoW;
  doc.rect(M, y, logoW, headH);
  doc.rect(M + logoW, y, titleW, headH);

  if (empresa.logoDataUrl) {
    try {
      const pad = 2;
      const maxH = headH - pad * 2;
      const maxW = logoW - pad * 2;
      // Renderiza centralizado mantendo proporção (jsPDF ajusta para a caixa)
      doc.addImage(empresa.logoDataUrl, "PNG", M + pad, y + pad, maxW, maxH, undefined, "FAST");
    } catch {
      // ignora falha do logo
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text((empresa.nome_fantasia || empresa.razao_social || "").toUpperCase(), M + logoW / 2, y + headH / 2 + 1.5, {
      align: "center",
    });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RECIBO DE PAGAMENTO", M + logoW + titleW / 2, y + headH / 2 + 1.5, { align: "center" });
  y += headH;

  // helper para desenhar uma linha de células com label/valor
  const drawRow = (cells: Cell[], h = 8) => {
    doc.rect(M, y, innerW, h);
    let x = M;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (i > 0) doc.line(x, y, x, y + h);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(c.label, x + 1, y + 2.8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const val = c.value || "";
      const maxW = c.w - 2;
      const lines = doc.splitTextToSize(val, maxW);
      doc.text(lines[0] ?? "", x + 1, y + 6.8);
      x += c.w;
    }
    y += h;
  };

  // ===== Linha: Folha | Período | Página | Dt pagt | Referência =====
  const w1a = 26,
    w1b = 60,
    w1c = 16,
    w1d = 30;
  drawRow([
    { label: "Folha:", value: dados.folha_tipo, w: w1a },
    {
      label: "Período de Pagamento:",
      value: `${fmtData(dados.periodo_inicio)} a ${fmtData(dados.periodo_fim)}`,
      w: w1b,
    },
    { label: "Página:", value: "1", w: w1c },
    { label: "Dt. pagt.:", value: fmtData(dados.data_pagamento), w: w1d },
    {
      label: "Referência:",
      value: fmtRef(dados.mes_referencia, dados.ano_referencia),
      w: innerW - w1a - w1b - w1c - w1d,
    },
  ]);

  // ===== Linha: Nome da empresa | CNPJ =====
  const cnpjW = 50;
  drawRow([
    {
      label: "Nome da empresa:",
      value: (empresa.razao_social || empresa.nome_fantasia || "").toUpperCase(),
      w: innerW - cnpjW,
    },
    { label: "CNPJ:", value: empresa.cnpj || "", w: cnpjW },
  ]);

  // ===== Linha: Nome | Matrícula | CPF =====
  const matW = 35,
    cpfW = 45;
  drawRow([
    { label: "Nome:", value: (funcionario.nome || "").toUpperCase(), w: innerW - matW - cpfW },
    { label: "Matrícula:", value: funcionario.matricula || "", w: matW },
    { label: "CPF:", value: funcionario.cpf || "", w: cpfW },
  ]);

  // ===== Linha: CTPS/Série/UF | Cargo | Tipo de salário =====
  const ctpsW = 40,
    tipoSalW = 35;
  drawRow([
    { label: "CTPS/Série/UF:", value: funcionario.rg || "", w: ctpsW },
    { label: "Cargo:", value: (funcionario.cargo || "").toUpperCase(), w: innerW - ctpsW - tipoSalW },
    { label: "Tipo de salário:", value: dados.folha_tipo, w: tipoSalW },
  ]);

  // ===== Linha: Lotação | Data admissão =====
  const admW = 35;
  drawRow([
    { label: "Lotação:", value: dados.lotacao || "", w: innerW - admW },
    { label: "Data admissão:", value: fmtData(funcionario.data_admissao), w: admW },
  ]);

  // ===== Linha: Endereço da Lotação | Cidade - Estado =====
  const cidW = 50;
  drawRow([
    { label: "Endereço da Lotação:", value: empresa.endereco || "", w: innerW - cidW },
    { label: "Cidade - Estado:", value: "", w: cidW },
  ]);

  // ===== Linha: Bco/Ag | Conta | Dep IRRF | Dep Sal Fam | Salário contratual =====
  const wB = 30,
    wC = 30,
    wD1 = 32,
    wD2 = 36;
  drawRow([
    { label: "Bco/Ag:", value: dados.banco_agencia || "", w: wB },
    { label: "Conta:", value: dados.conta || "", w: wC },
    { label: "Num. Dep. IRRF:", value: String(dados.num_dep_irrf), w: wD1 },
    { label: "Num. Dep. Sal. Fam.:", value: String(dados.num_dep_sal_fam), w: wD2 },
    { label: "Salário contratual:", value: fmtNum(dados.salario_contratual), w: innerW - wB - wC - wD1 - wD2 },
  ]);

  // ===== Header da tabela =====
  doc.setFillColor(230, 230, 230);
  doc.rect(M, y, innerW, 6, "F");
  doc.rect(M, y, innerW, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const colsTab = { codigo: 20, desc: 80, qtde: 22, prov: 28, desc2: 28, res: innerW - 20 - 80 - 22 - 28 - 28 };
  let cx = M;
  doc.text("Código", cx + 1, y + 4);
  cx += colsTab.codigo;
  doc.text("Descrição", cx + 1, y + 4);
  cx += colsTab.desc;
  doc.text("Qtde", cx + colsTab.qtde - 1, y + 4, { align: "right" });
  cx += colsTab.qtde;
  doc.text("Provento", cx + colsTab.prov - 1, y + 4, { align: "right" });
  cx += colsTab.prov;
  doc.text("Desconto", cx + colsTab.desc2 - 1, y + 4, { align: "right" });
  cx += colsTab.desc2;
  doc.text("Resultado", cx + colsTab.res - 1, y + 4, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const grupoLancamentoPdf = (l: HolerLancamento) => {
    // Ordem obrigatória:
    // 1) todos os proventos
    // 2) todos os descontos
    // 3) todos os informativos
    if (Number(l.provento || 0) > 0) return 0;
    if (Number(l.desconto || 0) > 0) return 1;
    return 2;
  };

  const pesoInformativoPdf = (codigo: string) => {
    // Banco de horas no fim dos informativos e QTDE HORAS BENEF como última linha.
    if (codigo === "09998") return 2;
    if (codigo === "28651" || codigo === "28652") return 1;
    return 0;
  };

  const lancamentosOrdenados = [...lancamentos].sort((a, b) => {
    const grupoA = grupoLancamentoPdf(a);
    const grupoB = grupoLancamentoPdf(b);

    if (grupoA !== grupoB) return grupoA - grupoB;

    if (grupoA === 2) {
      const pesoA = pesoInformativoPdf(a.codigo);
      const pesoB = pesoInformativoPdf(b.codigo);

      if (pesoA !== pesoB) return pesoA - pesoB;
    }

    return 0;
  });

  for (const l of lancamentosOrdenados) {
    if (y > 250) {
      doc.addPage();
      y = M;
    }
    const isInformativo = !Number(l.provento || 0) && !Number(l.desconto || 0);
    cx = M;
    doc.text(l.codigo, cx + 1, y + 4);
    cx += colsTab.codigo;
    doc.text(l.descricao, cx + 1, y + 4);
    cx += colsTab.desc;
    const qtdePdf = (() => {
      if (l.qtde != null && Number(l.qtde) !== 0) return l.qtde;
      const provento = Number(l.provento || 0);
      const desconto = Number(l.desconto || 0);
      if (provento <= 0 && desconto <= 0) return l.qtde;

      const salarioBase = Number(lancamentosOrdenados.find((x) => x.codigo === "00005")?.provento || 0);
      const totalProventos = lancamentosOrdenados.reduce((s, x) => s + Number(x.provento || 0), 0);

      if (l.codigo === "07000") {
        const base = totalProventos > 0 ? totalProventos : salarioBase;
        return base > 0 ? Math.round((desconto / base) * 10000) / 100 : l.qtde;
      }

      if (l.codigo === "07030") return 6;

      if (l.codigo === "07065") {
        return salarioBase > 0 ? Math.round((desconto / salarioBase) * 10000) / 100 : l.qtde;
      }

      return 1;
    })();
    doc.text(fmtNum(qtdePdf, 2), cx + colsTab.qtde - 1, y + 4, { align: "right" });
    cx += colsTab.qtde;
    doc.text(fmtNum(l.provento), cx + colsTab.prov - 1, y + 4, { align: "right" });
    cx += colsTab.prov;
    doc.text(fmtNum(l.desconto), cx + colsTab.desc2 - 1, y + 4, { align: "right" });
    cx += colsTab.desc2;
    const isHoras = ["18445", "28651", "28652", "09998"].includes(l.codigo);
    const resTxt =
      l.codigo === "09990"
        ? ""
        : l.codigo === "09998"
          ? fmtHoras(Number(l.resultado || 0))
          : isInformativo && isHoras
            ? fmtHoras(l.resultado)
            : isInformativo
              ? fmtNum(l.resultado)
              : "";
    doc.text(resTxt, cx + colsTab.res - 1, y + 4, { align: "right" });
    y += 5;
  }

  y += 2;
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += 1;

  // ===== Rodapé: Totais (com destaque para líquido) =====
  const totH = 10;
  const liqW = 70;
  const provW = (innerW - liqW) / 2;
  const descW = provW;
  doc.rect(M, y, provW, totH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Total de proventos:", M + 2, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(fmtNum(dados.total_proventos), M + provW - 2, y + 8, { align: "right" });

  doc.rect(M + provW, y, descW, totH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Total de descontos:", M + provW + 2, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(fmtNum(dados.total_descontos), M + provW + descW - 2, y + 8, { align: "right" });

  doc.setFillColor(220, 220, 220);
  doc.rect(M + provW + descW, y, liqW, totH, "F");
  doc.rect(M + provW + descW, y, liqW, totH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total líquido:", M + provW + descW + 2, y + 4);
  doc.setFontSize(13);
  doc.text(
    Number(dados.total_liquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    W - M - 2,
    y + 8.5,
    { align: "right" },
  );
  y += totH;

  // Bases
  doc.rect(M, y, innerW, 10);
  const basesCols = [
    { l: "Sal. contrib. INSS:", v: fmtNum(dados.sal_contrib_inss) },
    { l: "Base cal. FGTS:", v: fmtNum(dados.base_fgts) },
    { l: "FGTS mês:", v: fmtNum(dados.fgts_mes) },
    { l: "Base calc. IRPF:", v: fmtNum(dados.base_irpf) },
  ];
  const colW = innerW / basesCols.length;
  basesCols.forEach((c, i) => {
    const bx = M + i * colW;
    if (i > 0) doc.line(bx, y, bx, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(c.l, bx + 1, y + 3.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(c.v, bx + colW - 2, y + 8, { align: "right" });
  });
  y += 12;

  if (dados.observacoes) {
    doc.setFontSize(7);
    doc.text("Observações:", M, y);
    y += 4;
    const lines = doc.splitTextToSize(dados.observacoes, innerW);
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

/** Baixa uma imagem (URL pública) e converte para data URL para uso no jsPDF. */
export async function carregarLogoComoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Falha ao ler logo"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
