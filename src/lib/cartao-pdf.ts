import jsPDF from "jspdf";
import {
  DIAS_SEMANA_CURTO,
  NOMES_MES,
  formatMin,
  type ResumoCartao,
  type DiaCartao,
} from "@/lib/cartao";

export type EmpresaInfo = {
  nome_fantasia: string;
  cnpj: string | null;
  endereco?: string | null;
};

export type FuncionarioInfo = {
  nome: string;
  cpf: string | null;
  cargo: string | null;
  matricula?: string | null;
};

export type JornadaInfo = {
  nome: string;
  entrada: string | null;
  saida: string | null;
  intervalo_saida: string | null;
  intervalo_retorno: string | null;
};

export function abrirJanelaPdf(): Window | null {
  const janela = window.open("", "_blank");
  if (janela) {
    janela.opener = null;
    janela.document.write("<p style='font-family: sans-serif'>Gerando PDF...</p>");
  }
  return janela;
}

export function salvarPdfArquivo(doc: jsPDF, nomeArquivo: string, janela?: Window | null) {
  const arquivoSeguro = nomeArquivo.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim();
  const finalName = arquivoSeguro.endsWith(".pdf") ? arquivoSeguro : `${arquivoSeguro}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  if (janela && !janela.closed) {
    try {
      janela.document.body.innerHTML = "";
      const download = janela.document.createElement("a");
      download.href = url;
      download.download = finalName;
      download.textContent = "Baixar PDF";
      download.style.cssText = "display:inline-flex;margin:24px;padding:12px 16px;border-radius:8px;background:#111;color:#fff;font:16px sans-serif;text-decoration:none";
      janela.document.body.appendChild(download);
      download.click();
    } catch {
      janela.location.href = url;
    }
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = finalName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const hm = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

const minDiff = (prog: string | null, real: string | null): number | null => {
  const p = hm(prog);
  const r = hm(real);
  if (p == null || r == null) return null;
  let d = r - p;
  if (d < -12 * 60) d += 1440;
  if (d > 12 * 60) d -= 1440;
  return d;
};

const fmtMinHHMM = (min: number): string => {
  const a = Math.abs(min);
  return `${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

const fmtDataBR = (iso: string): string =>
  `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

type Irregularidade = { label: string; qtde: number; credito: boolean; debito: boolean };

function irregularidadesDoDia(d: DiaCartao, tolMin: number): Irregularidade[] {
  const out: Irregularidade[] = [];
  const entDiff = minDiff(d.programado.entrada, d.registrado.entrada);
  if (entDiff != null && Math.abs(entDiff) > tolMin) {
    if (entDiff > 0)
      out.push({ label: "ATRASO", qtde: entDiff, credito: false, debito: true });
    else
      out.push({ label: "ENTRADA ANTECIPADA", qtde: -entDiff, credito: false, debito: false });
  }
  const saiDiff = minDiff(d.programado.saida_final, d.registrado.saida_final);
  if (saiDiff != null && Math.abs(saiDiff) > tolMin) {
    if (saiDiff > 0)
      out.push({ label: "HORA EXTRA", qtde: saiDiff, credito: true, debito: false });
    else
      out.push({ label: "SAÍDA ANTECIPADA", qtde: -saiDiff, credito: false, debito: true });
  }
  // Marcação incompleta: tem alguma marcação mas falta entrada ou saída final
  const temAlguma =
    !!d.registrado.entrada ||
    !!d.registrado.saida_intervalo ||
    !!d.registrado.retorno_intervalo ||
    !!d.registrado.saida_final;
  const faltaPrincipal = !d.registrado.entrada || !d.registrado.saida_final;
  if (temAlguma && faltaPrincipal) {
    out.push({ label: "MARCAÇÃO INCOMPLETA", qtde: 0, credito: false, debito: false });
  }
  return out;
}

export function gerarPdfCartao(opts: {
  empresa: EmpresaInfo;
  funcionario: FuncionarioInfo;
  jornada?: JornadaInfo | null;
  ano: number;
  mes: number;
  resumo: ResumoCartao;
  status: string;
}): jsPDF {
  const { empresa, funcionario, jornada, ano, mes, resumo } = opts;
  const tol = resumo.toleranciaMinutos ?? 5;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210,
    pageH = 297;
  const ML = 6,
    MR = 6;
  const W = pageW - ML - MR; // 198mm
  doc.setFont("courier", "normal");
  doc.setFontSize(7);

  const hr = (y: number) => doc.line(ML, y, ML + W, y);

  const emissao = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  let y = 8;
  hr(y);
  y += 3.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text("CARTAO DE PONTO", pageW / 2, y, { align: "center" });
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  y += 1;
  hr(y);
  y += 3.5;
  doc.text(`Emissao: ${emissao}`, ML, y);
  doc.text(`Tol: ${tol}min`, pageW / 2, y, { align: "center" });
  doc.text(`Pag: 0001`, ML + W, y, { align: "right" });
  y += 1.5;
  hr(y);

  y += 3.5;
  const colR = ML + W * 0.6;
  doc.text(`Empresa: ${empresa.nome_fantasia}`, ML, y);
  doc.text(`Mes/Ano: ${NOMES_MES[mes - 1]}/${ano}`, colR, y);
  y += 3.2;
  doc.text(`End: ${(empresa.endereco ?? "-").slice(0, 70)}`, ML, y);
  doc.text(`CNPJ: ${empresa.cnpj ?? "-"}`, colR, y);
  y += 3.2;
  doc.text(`Func: ${funcionario.nome}  Cargo: ${funcionario.cargo ?? "-"}`, ML, y);
  y += 3.2;
  const jornadaHdr = jornada
    ? `${jornada.nome} [${jornada.entrada ?? "--:--"} as ${jornada.saida ?? "--:--"} Int: ${jornada.intervalo_saida ?? "--:--"} as ${jornada.intervalo_retorno ?? "--:--"}]`
    : "-";
  doc.text(`Hor.Trab: ${jornadaHdr}`, ML, y);
  if (resumo.dataAdmissao) {
    y += 3.2;
    doc.text(
      `Admissao: ${fmtDataBR(resumo.dataAdmissao)}${resumo.dataDesligamento ? `   Desligamento: ${fmtDataBR(resumo.dataDesligamento)}` : ""}`,
      ML,
      y,
    );
  }
  y += 1.5;
  hr(y);

  // Layout portrait — 198mm úteis
  // Dia(8) Data(13) | EntPrev(11) IntSai(11) IntRet(11) SaiPrev(11) | EntReal(11) SaiReal(11) | Irreg(36) QTDE(11) Just(54) Adic(10) = 198
  const cols: { key: string; w: number; label: string; align?: "left" | "right" | "center" }[] = [
    { key: "dia", w: 8, label: "Dia" },
    { key: "data", w: 13, label: "Data" },
    { key: "entPrev", w: 11, label: "E.Prev", align: "center" },
    { key: "intSai", w: 11, label: "I.Sai", align: "center" },
    { key: "intRet", w: 11, label: "I.Ret", align: "center" },
    { key: "saiPrev", w: 11, label: "S.Prev", align: "center" },
    { key: "entReal", w: 11, label: "E.Real", align: "center" },
    { key: "saiReal", w: 11, label: "S.Real", align: "center" },
    { key: "irreg", w: 36, label: "Irregularidade" },
    { key: "qtde", w: 11, label: "QTDE", align: "center" },
    { key: "just", w: 54, label: "Justificativa" },
    { key: "adic", w: 10, label: "Adic", align: "center" },
  ];

  const xOf = (idx: number) => ML + cols.slice(0, idx).reduce((a, c) => a + c.w, 0);

  const drawHeader = () => {
    doc.setFont("courier", "bold");
    cols.forEach((c, i) => {
      const x = xOf(i);
      const align = c.align ?? "left";
      const tx = align === "center" ? x + c.w / 2 : align === "right" ? x + c.w - 1 : x + 1;
      doc.text(c.label, tx, y, { align });
    });
    doc.setFont("courier", "normal");
    y += 1;
    hr(y);
    y += 3;
  };

  y += 3.5;
  drawHeader();

  const rowH = 3;
  let creditos = 0,
    debitos = 0;

  const drawRow = (vals: Record<string, string>) => {
    cols.forEach((c, i) => {
      const x = xOf(i);
      const align = c.align ?? "left";
      const tx = align === "center" ? x + c.w / 2 : align === "right" ? x + c.w - 1 : x + 1;
      const txt = vals[c.key] ?? "";
      const maxChars = Math.floor((c.w - 0.5) / 1.45);
      doc.text(txt.slice(0, maxChars), tx, y, { align });
    });
    y += rowH;
  };

  for (const d of resumo.dias) {
    if (y > pageH - 35) {
      doc.addPage();
      y = 10;
      drawHeader();
    }

    const diaSem = DIAS_SEMANA_CURTO[d.diaSemana];
    const dataStr = fmtDataBR(d.data);

    if (d.foraVinculo) {
      drawRow({
        dia: diaSem,
        data: dataStr,
        irreg: "FORA DO VINCULO",
      });
      for (const j of d.justificativas ?? []) {
        drawRow({
          just: j.tipo.nome,
          qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
        });
      }
      continue;
    }

    if (!d.trabalha) {
      const temReg =
        !!d.registrado.entrada ||
        !!d.registrado.saida_intervalo ||
        !!d.registrado.retorno_intervalo ||
        !!d.registrado.saida_final;
      drawRow({
        dia: diaSem,
        data: dataStr,
        entReal: temReg ? (d.registrado.entrada ?? "") : "",
        saiReal: temReg ? (d.registrado.saida_final ?? "") : "",
        irreg: temReg ? "TRABALHO EM FOLGA" : "FOLGA",
      });
      for (const j of d.justificativas ?? []) {
        drawRow({
          just: j.tipo.nome,
          qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
        });
      }
      continue;
    }

    const semJornada =
      !d.programado.entrada && !d.programado.saida_final;
    const semMarcacao = d.marcacaoNaoRegistrada || d.pendente;
    const falta = d.faltaRegistrada || d.falta;

    const irregs = irregularidadesDoDia(d, tol);
    for (const i of irregs) {
      if (i.credito) creditos += i.qtde;
      if (i.debito) debitos += i.qtde;
    }

    // Linhas a renderizar: { label, qtde }
    type LinhaIrreg = { label: string; qtde: string };
    const linhas: LinhaIrreg[] = [];
    if (semJornada) {
      linhas.push({ label: "DIA SEM JORNADA CADASTRADA", qtde: "" });
    } else if (falta) {
      linhas.push({ label: "FALTA", qtde: "" });
    } else if (semMarcacao) {
      linhas.push({ label: "MARCAÇÃO NÃO REGISTRADA", qtde: "" });
    } else {
      for (const i of irregs) {
        linhas.push({ label: i.label, qtde: fmtMinHHMM(i.qtde) });
      }
    }
    if (d.bancoHorasMinutos > 0) {
      creditos += d.bancoHorasMinutos;
      linhas.push({
        label: "CRÉDITO BCO DE HORAS",
        qtde: fmtMinHHMM(d.bancoHorasMinutos),
      });
    }
    if (d.bancoHorasMinutos < 0) {
      debitos += -d.bancoHorasMinutos;
      linhas.push({
        label: "DÉBITO BCO DE HORAS",
        qtde: fmtMinHHMM(-d.bancoHorasMinutos),
      });
    }
    if (linhas.length === 0) linhas.push({ label: "", qtde: "" });

    const justificativas = d.justificativas ?? [];
    const primeira = linhas[0];

    drawRow({
      dia: diaSem,
      data: dataStr,
      entPrev: d.programado.entrada ?? "",
      intSai: d.programado.saida_intervalo ?? "",
      intRet: d.programado.retorno_intervalo ?? "",
      saiPrev: d.programado.saida_final ?? "",
      entReal: semMarcacao || falta ? "" : (d.registrado.entrada ?? ""),
      saiReal: semMarcacao || falta ? "" : (d.registrado.saida_final ?? ""),
      irreg: primeira.label,
      qtde: primeira.qtde,
      just: justificativas[0] ? justificativas[0].tipo.nome : "",
      adic: "",
    });

    // Linhas adicionais de irregularidade
    for (let i = 1; i < linhas.length; i++) {
      drawRow({ irreg: linhas[i].label, qtde: linhas[i].qtde });
    }

    // Justificativas adicionais
    for (let i = 1; i < justificativas.length; i++) {
      const j = justificativas[i];
      drawRow({
        just: j.tipo.nome,
      });
    }
  }

  hr(y);
  y += 3.5;
  doc.text(`Trabalhado: ${fmtMinHHMM(resumo.totalTrabalhado)}`, ML, y);
  doc.text(`Atrasos: ${fmtMinHHMM(resumo.totalAtraso)}`, ML + 45, y);
  doc.text(`Faltas: ${resumo.totalFaltas}`, ML + 90, y);
  doc.text(`Extras: ${fmtMinHHMM(resumo.totalExtras)}`, ML + 130, y);
  y += 3.5;
  hr(y);
  y += 3.5;
  doc.text(
    `Saldo BH: ${fmtMinHHMM(creditos - debitos)}   Creditos: ${fmtMinHHMM(creditos)}   Debitos: ${fmtMinHHMM(debitos)}   Tol: ${tol}min`,
    ML,
    y,
  );
  y += 1.5;
  hr(y);

  y += 18;
  if (y > pageH - 20) {
    doc.addPage();
    y = 40;
  }
  doc.line(ML + 15, y, ML + 80, y);
  doc.line(ML + 115, y, ML + 180, y);
  y += 3.5;
  doc.text("Chefe / Gerente", ML + 47, y, { align: "center" });
  doc.text("Funcionario", ML + 147, y, { align: "center" });

  void formatMin;

  return doc;
}
