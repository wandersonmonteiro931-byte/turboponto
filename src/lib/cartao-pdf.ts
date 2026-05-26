import jsPDF from "jspdf";
import {
  DIAS_SEMANA_CURTO,
  NOMES_MES,
  formatMin,
  type ResumoCartao,
  type DiaCartao,
} from "@/lib/cartao";
import { resumirDiasJornada, type VinculoAtivoComDias } from "@/lib/jornadas";

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

export function salvarPdfArquivo(doc: jsPDF, nomeArquivo: string) {
  const arquivoSeguro = nomeArquivo.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim();
  const finalName = arquivoSeguro.endsWith(".pdf") ? arquivoSeguro : `${arquivoSeguro}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = finalName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    doc.save(finalName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
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

const diffRelogio = (inicio: number, fim: number): number => {
  let diff = fim - inicio;
  if (diff < 0) diff += 1440;
  return diff;
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
  jornadas?: VinculoAtivoComDias[];
  ano: number;
  mes: number;
  resumo: ResumoCartao;
  status: string;
}): jsPDF {
  const { empresa, funcionario, jornada, jornadas, ano, mes, resumo } = opts;
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
  doc.text(`Tol: ${fmtMinHHMM(Number(tol) || 0)}`, pageW / 2, y, { align: "center" });
  doc.text(`Pag: 0001`, ML + W, y, { align: "right" });
  y += 1.5;
  hr(y);

  y += 3.5;
  const colR = ML + W * 0.6;
  doc.text(`Empresa: ${(empresa.nome_fantasia || "").toUpperCase()}`, ML, y);
  doc.text(`Mes/Ano: ${NOMES_MES[mes - 1]}/${ano}`, colR, y);
  y += 3.2;
  doc.text(`End: ${(empresa.endereco ?? "-").slice(0, 70)}`, ML, y);
  doc.text(`CNPJ: ${empresa.cnpj ?? "-"}`, colR, y);
  y += 3.2;
  doc.text(`Matricula: ${funcionario.matricula ?? "-"}  Func: ${funcionario.nome}  Cargo: ${funcionario.cargo ?? "-"}`, ML, y);
  y += 3.2;
  if (jornadas && jornadas.length > 0) {
    doc.text("Hor.Trab:", ML, y);
    let firstLine = true;
    for (const v of jornadas) {
      const linha = `[${v.codigo}] ${v.nome}: ${resumirDiasJornada(v.dias)}`;
      if (!firstLine) y += 3.2;
      doc.text(linha, ML + 16, y, { maxWidth: W - 16 });
      firstLine = false;
    }
  } else {
    const jornadaHdr = jornada
      ? `${jornada.nome} [${jornada.entrada ?? "--:--"} as ${jornada.saida ?? "--:--"} Int: ${jornada.intervalo_saida ?? "--:--"} as ${jornada.intervalo_retorno ?? "--:--"}]`
      : "-";
    doc.text(`Hor.Trab: ${jornadaHdr}`, ML, y);
  }
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
    { key: "esc", w: 6, label: "Esc", align: "center" },
    { key: "entPrev", w: 11, label: "E.Prev", align: "center" },
    { key: "intSai", w: 11, label: "I.Sai", align: "center" },
    { key: "intRet", w: 11, label: "I.Ret", align: "center" },
    { key: "saiPrev", w: 11, label: "S.Prev", align: "center" },
    { key: "entReal", w: 11, label: "E.Real", align: "center" },
    { key: "saiReal", w: 11, label: "S.Real", align: "center" },
    { key: "irreg", w: 36, label: "Irregularidade" },
    { key: "qtde", w: 11, label: "QTDE", align: "center" },
    { key: "just", w: 48, label: "Justificativa" },
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
    debitos = 0,
    horasBenef = 0;

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
      const justs = d.justificativas ?? [];
      const j0 = justs[0];
      drawRow({
        dia: diaSem,
        data: dataStr,
        esc: d.jornadaCodigo ?? "",
        irreg: "FORA DO VINCULO",
        just: j0 ? j0.tipo.nome : "",
        qtde: j0 && j0.quantidadeMinutos != null ? fmtMinHHMM(j0.quantidadeMinutos) : "",
      });
      for (let i = 1; i < justs.length; i++) {
        const j = justs[i];
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
      const justs = d.justificativas ?? [];
      const j0 = justs[0];
      // Crédito BH em folga (ex: HORA EXTRA - CREDIT em dia de folga)
      if (d.bancoHorasMinutos > 0) creditos += d.bancoHorasMinutos;
      const qtdePrimeira =
        d.bancoHorasMinutos > 0
          ? fmtMinHHMM(d.bancoHorasMinutos)
          : j0 && j0.quantidadeMinutos != null
            ? fmtMinHHMM(j0.quantidadeMinutos)
            : d.trabalhadoMinutos > 0 && temReg
              ? fmtMinHHMM(d.trabalhadoMinutos)
              : "";
      drawRow({
        dia: diaSem,
        data: dataStr,
        esc: d.jornadaCodigo ?? "",
        entReal: temReg ? (d.registrado.entrada ?? "") : "",
        saiReal: temReg ? (d.registrado.saida_final ?? "") : "",
        irreg: temReg ? "TRABALHO EM FOLGA" : justs.length > 0 ? "" : "FOLGA",
        just: j0 ? j0.tipo.nome : "",
        qtde: qtdePrimeira,
      });
      for (let i = 1; i < justs.length; i++) {
        const j = justs[i];
        drawRow({
          just: j.tipo.nome,
          qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
        });
      }
      continue;
    }

    const semJornada =
      !d.programado.entrada && !d.programado.saida_final;
    const semMarcacao = (d.marcacaoNaoRegistrada || d.pendente) && d.bancoHorasMinutos >= 0;
    const falta = d.faltaRegistrada || d.falta;

    const irregs = irregularidadesDoDia(d, tol);
    const justificativas = d.justificativas ?? [];
    const temHoraExtraPagar = justificativas.some((j) => j.tipo.codigo === "HE_PAGAR");
    const faltaInjustificada =
      falta &&
      (!justificativas.length ||
        justificativas.some(
          (j) =>
            j.tipo.categoria === "falta" &&
            j.tipo.desconta_salario &&
            j.tipo.afeta_assiduidade !== "nao",
        ));
    // QTDE HORAS BENEF deve refletir apenas débitos REAIS (não abonados).
    // O d.bancoHorasMinutos já considera justificativas que abonam atrasos/saídas
    // antecipadas, então usamos ele diretamente abaixo (após o bloco de falta).


    // Carga programada do dia (para faltas injustificadas em horas benef)
    const cargaProgDia = (() => {
      const pe = hm(d.programado.entrada);
      const psf = hm(d.programado.saida_final);
      if (pe == null || psf == null) return 0;
      let c = diffRelogio(pe, psf);
      const psi = hm(d.programado.saida_intervalo);
      const pri = hm(d.programado.retorno_intervalo);
      if (psi != null && pri != null) c -= diffRelogio(psi, pri);
      return Math.max(0, c);
    })();

    // Linhas a renderizar: { label, qtde }
    type LinhaIrreg = { label: string; qtde: string };
    const linhas: LinhaIrreg[] = [];
    const temJustificativa = (d.justificativas ?? []).length > 0;
    if (semJornada) {
      linhas.push({ label: "DIA SEM JORNADA CADASTRADA", qtde: "" });
    } else if (faltaInjustificada) {
      linhas.push({ label: "FALTA", qtde: cargaProgDia > 0 ? fmtMinHHMM(cargaProgDia) : "" });
      // Falta injustificada conta como hora benef
      horasBenef += cargaProgDia;
    } else if (semMarcacao && !temJustificativa && d.bancoHorasMinutos >= 0) {
      linhas.push({ label: "MARCAÇÃO NÃO REGISTRADA", qtde: "" });
    } else if (!falta && !semMarcacao) {
      for (const i of irregs) {
        const lbl =
          i.label === "HORA EXTRA"
            ? temHoraExtraPagar
              ? "HORA EXTRA / PAGAR"
              : "HORA EXTRA / CRED BH"
            : i.label === "ATRASO"
              ? "ATRASO / DEB BH"
              : i.label === "SAÍDA ANTECIPADA"
                ? "SAIDA ANTECIPADA / DEB BH"
                : i.label;
        linhas.push({ label: lbl, qtde: fmtMinHHMM(i.qtde) });
      }
      // Se dia trabalhado normalmente sem nenhuma irregularidade, mostra TRABALHADO
      if (irregs.length === 0 && d.trabalhadoMinutos > 0) {
        linhas.push({ label: "TRABALHADO", qtde: fmtMinHHMM(d.trabalhadoMinutos) });
      }
    }
    const debitoJaRepresentadoPelaFalta = faltaInjustificada && d.bancoHorasMinutos < 0;
    // Débitos já representados por linhas de ATRASO / SAÍDA ANTECIPADA (que já dizem "DEB BH")
    const debitoJaRepresentadoPorIrreg = irregs
      .filter((i) => i.debito && (i.label === "ATRASO" || i.label === "SAÍDA ANTECIPADA"))
      .reduce((s, i) => s + i.qtde, 0);
    if (d.bancoHorasMinutos > 0) {
      creditos += d.bancoHorasMinutos;
      linhas.push({
        label: "CRÉDITO BCO DE HORAS",
        qtde: fmtMinHHMM(d.bancoHorasMinutos),
      });
    }
    if (d.bancoHorasMinutos < 0) {
      debitos += -d.bancoHorasMinutos;
      const restante = -d.bancoHorasMinutos - debitoJaRepresentadoPorIrreg;
      if (!debitoJaRepresentadoPelaFalta && restante > 0) {
        horasBenef += restante;
        linhas.push({
          label: "DÉBITO BCO DE HORAS",
          qtde: fmtMinHHMM(restante),
        });
      }
    }
    if (linhas.length === 0) linhas.push({ label: "", qtde: "" });

    const primeira = linhas[0];

    drawRow({
      dia: diaSem,
      data: dataStr,
      esc: d.jornadaCodigo ?? "",
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
    `Saldo BH: ${creditos - debitos < 0 ? "-" : ""}${fmtMinHHMM(creditos - debitos)}   Creditos: ${fmtMinHHMM(creditos)}   Debitos: ${fmtMinHHMM(debitos)}   Tol: ${fmtMinHHMM(Number(tol) || 0)}`,
    ML,
    y,
  );
  y += 3.5;
  doc.text(`QTDE HORAS BENEF: ${fmtMinHHMM(horasBenef)}`, ML, y);
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
