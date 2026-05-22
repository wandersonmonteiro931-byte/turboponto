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

const pad = (s: string | number | null | undefined, n: number, right = false): string => {
  const v = (s ?? "").toString();
  if (v.length >= n) return v.slice(0, n);
  return right ? v.padStart(n) : v.padEnd(n);
};

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

type Irregularidade = { label: string; qtde: number; credito: boolean; debito: boolean };

function irregularidadesDoDia(d: DiaCartao, tolMin: number): Irregularidade[] {
  const out: Irregularidade[] = [];
  // Entrada
  const entDiff = minDiff(d.programado.entrada, d.registrado.entrada);
  if (entDiff != null && Math.abs(entDiff) > tolMin) {
    if (entDiff > 0)
      out.push({ label: `Atraso ${fmtMinHHMM(entDiff)}`, qtde: entDiff, credito: false, debito: true });
    else
      out.push({
        label: `Entrada Antecipada ${fmtMinHHMM(entDiff)}`,
        qtde: -entDiff,
        credito: false,
        debito: false,
      });
  }
  // Saída final
  const saiDiff = minDiff(d.programado.saida_final, d.registrado.saida_final);
  if (saiDiff != null && Math.abs(saiDiff) > tolMin) {
    if (saiDiff > 0)
      out.push({
        label: `Hora Extra ${fmtMinHHMM(saiDiff)}`,
        qtde: saiDiff,
        credito: true,
        debito: false,
      });
    else
      out.push({
        label: `Saida Antecipada ${fmtMinHHMM(saiDiff)}`,
        qtde: -saiDiff,
        credito: false,
        debito: true,
      });
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
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = 297,
    pageH = 210;
  const ML = 8,
    MR = 8;
  const W = pageW - ML - MR;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);

  const hr = (y: number) => doc.line(ML, y, ML + W, y);

  const emissao = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  let y = 10;
  hr(y);
  y += 4;
  doc.setFont("courier", "bold");
  doc.text("CARTAO DE PONTO", pageW / 2, y, { align: "center" });
  doc.setFont("courier", "normal");
  y += 1;
  hr(y);
  y += 4;
  doc.text(`Emissao: ${emissao}`, ML, y);
  doc.text(`Tolerancia: ${tol} min`, pageW / 2, y, { align: "center" });
  doc.text(`Pagina: 0001`, ML + W, y, { align: "right" });
  y += 2;
  hr(y);

  // Bloco empresa
  y += 4;
  const colR = ML + W * 0.62;
  doc.text(`Empresa  : ${empresa.nome_fantasia}`, ML, y);
  doc.text(`Mes/Ano: ${NOMES_MES[mes - 1]} / ${ano}`, colR, y);
  y += 4;
  doc.text(`Endereco : ${empresa.endereco ?? "-"}`, ML, y);
  doc.text(`CNPJ   : ${empresa.cnpj ?? "-"}`, colR, y);
  y += 4;
  const jornadaHdr = jornada
    ? `${jornada.nome} [${jornada.entrada ?? "--:--"} as ${jornada.saida ?? "--:--"} - Int: ${jornada.intervalo_saida ?? "--:--"} as ${jornada.intervalo_retorno ?? "--:--"}]`
    : "-";
  doc.text(`Funcionario: ${funcionario.nome}    Cargo: ${funcionario.cargo ?? "-"}`, ML, y);
  y += 4;
  doc.text(`Hor.Trab.: ${jornadaHdr}`, ML, y);
  y += 2;
  hr(y);

  // Layout em mm (landscape A4 = 281mm úteis)
  // Dia(10) Data(16) | EntPrev(13) IntSai(13) IntRet(13) SaiPrev(13) | EntReal(13) SaiReal(13) | Irreg(60) QTDE(15) Just(70) Adic(12)
  const cols: { key: string; w: number; label: string; align?: "left" | "right" | "center" }[] = [
    { key: "dia", w: 10, label: "Dia" },
    { key: "data", w: 16, label: "Data" },
    { key: "entPrev", w: 13, label: "Ent.Prev", align: "center" },
    { key: "intSai", w: 13, label: "Int.Sai", align: "center" },
    { key: "intRet", w: 13, label: "Int.Ret", align: "center" },
    { key: "saiPrev", w: 13, label: "Sai.Prev", align: "center" },
    { key: "entReal", w: 13, label: "Ent.Real", align: "center" },
    { key: "saiReal", w: 13, label: "Sai.Real", align: "center" },
    { key: "irreg", w: 60, label: "Irregularidade" },
    { key: "qtde", w: 15, label: "QTDE", align: "center" },
    { key: "just", w: 70, label: "Justificativa" },
    { key: "adic", w: 12, label: "Adic.Not", align: "center" },
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
    y += 1.2;
    hr(y);
    y += 3.5;
  };

  y += 4;
  drawHeader();

  const rowH = 3.4;
  let creditos = 0,
    debitos = 0;
  let totalAdicNot = 0;

  const drawRow = (vals: Record<string, string>) => {
    cols.forEach((c, i) => {
      const x = xOf(i);
      const align = c.align ?? "left";
      const tx = align === "center" ? x + c.w / 2 : align === "right" ? x + c.w - 1 : x + 1;
      const txt = vals[c.key] ?? "";
      // Recortar texto se exceder largura aproximada
      const maxChars = Math.floor((c.w - 1) / 1.7);
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
    const dataStr = `${d.data.slice(8)}/${d.data.slice(5, 7)}/${d.data.slice(2, 4)}`;

    if (d.foraVinculo) {
      drawRow({
        dia: diaSem,
        data: dataStr,
        irreg: "FORA DO VINCULO",
      });
      continue;
    }

    if (!d.trabalha) {
      drawRow({ dia: diaSem, data: dataStr, irreg: "FOLGA / DSR" });
      // Justificativas no domingo/folga ainda devem aparecer
      for (const j of d.justificativas ?? []) {
        drawRow({
          just: `${j.tipo.nome}${j.observacao ? " - " + j.observacao : ""}`,
          qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
        });
      }
      continue;
    }

    const semMarcacao = d.marcacaoNaoRegistrada || d.pendente;
    const falta = d.faltaRegistrada || d.falta;

    const irregs = irregularidadesDoDia(d, tol);
    for (const i of irregs) {
      if (i.credito) creditos += i.qtde;
      if (i.debito) debitos += i.qtde;
    }
    const irregTexto = falta
      ? "FALTA"
      : semMarcacao
        ? "MARCACAO NAO REGISTRADA"
        : irregs.map((i) => i.label).join(" / ");

    const justificativas = d.justificativas ?? [];
    const justPrincipal = justificativas[0];

    drawRow({
      dia: diaSem,
      data: dataStr,
      entPrev: d.programado.entrada ?? "",
      intSai: d.programado.saida_intervalo ?? "",
      intRet: d.programado.retorno_intervalo ?? "",
      saiPrev: d.programado.saida_final ?? "",
      entReal: semMarcacao || falta ? "" : (d.registrado.entrada ?? ""),
      saiReal: semMarcacao || falta ? "" : (d.registrado.saida_final ?? ""),
      irreg: irregTexto,
      qtde:
        justPrincipal?.quantidadeMinutos != null
          ? fmtMinHHMM(justPrincipal.quantidadeMinutos)
          : "",
      just: justPrincipal
        ? `${justPrincipal.tipo.nome}${justPrincipal.observacao ? " - " + justPrincipal.observacao : ""}`
        : "",
      adic: "",
    });

    // Justificativas adicionais
    for (let i = 1; i < justificativas.length; i++) {
      const j = justificativas[i];
      drawRow({
        just: `${j.tipo.nome}${j.observacao ? " - " + j.observacao : ""}`,
        qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
      });
    }
  }

  hr(y);
  y += 4;
  doc.text(`Total Trabalhado: ${fmtMinHHMM(resumo.totalTrabalhado)}`, ML, y);
  doc.text(`Total Atrasos: ${fmtMinHHMM(resumo.totalAtraso)}`, ML + 60, y);
  doc.text(`Total Faltas: ${resumo.totalFaltas}`, ML + 110, y);
  doc.text(`Total Extras: ${fmtMinHHMM(resumo.totalExtras)}`, ML + 150, y);
  y += 4;
  hr(y);
  y += 4;
  doc.text(
    `Saldo Banco de Horas: ${fmtMinHHMM(creditos - debitos)}     Creditos: ${fmtMinHHMM(creditos)}     Debitos: ${fmtMinHHMM(debitos)}     Tolerancia: ${tol} min`,
    ML,
    y,
  );
  y += 2;
  hr(y);

  // Assinaturas
  y += 14;
  if (y > pageH - 25) {
    doc.addPage();
    y = 40;
  }
  doc.line(ML + 20, y, ML + 100, y);
  doc.line(ML + 160, y, ML + 240, y);
  y += 4;
  doc.text("Chefe / Gerente", ML + 50, y, { align: "center" });
  doc.text("Funcionario", ML + 200, y, { align: "center" });

  void totalAdicNot;
  void formatMin;

  return doc;
}
