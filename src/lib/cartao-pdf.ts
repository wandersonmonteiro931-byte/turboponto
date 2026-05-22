import jsPDF from "jspdf";
import { DIAS_SEMANA_CURTO, NOMES_MES, formatMin, type ResumoCartao, type DiaCartao } from "@/lib/cartao";

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
  const p = hm(prog); const r = hm(real);
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

type SubLinha = { realEntr: string; realSaida: string; irreg: string; qtde: string; just: string };

function irregularidadesDoDia(d: DiaCartao, tolMin = 0): SubLinha[] {
  const out: SubLinha[] = [];
  const checks: Array<{ tipo: "entrada" | "saida_intervalo" | "retorno_intervalo" | "saida_final"; isSaida: boolean }> = [
    { tipo: "entrada", isSaida: false },
    { tipo: "saida_intervalo", isSaida: true },
    { tipo: "retorno_intervalo", isSaida: false },
    { tipo: "saida_final", isSaida: true },
  ];
  for (const c of checks) {
    const prog = d.programado[c.tipo];
    const real = d.registrado[c.tipo];
    if (!prog || !real) continue;
    const diff = minDiff(prog, real);
    if (diff == null || Math.abs(diff) <= tolMin) continue;
    let label = "";
    if (c.isSaida) label = diff < 0 ? "Saida Antecipada" : "Hora Extra";
    else label = diff < 0 ? "Entrada Antecipada" : "Entrada em Atraso";
    out.push({
      realEntr: c.isSaida ? prog : real,
      realSaida: c.isSaida ? real : prog,
      irreg: label,
      qtde: fmtMinHHMM(diff),
      just: diff > 0 && c.isSaida ? "CREDITO BCO DE HORAS"
        : diff < 0 && !c.isSaida ? "DEBITO BCO DE HORAS"
        : diff > 0 ? "DEBITO BCO DE HORAS"
        : "CREDITO BCO DE HORAS",
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
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210, pageH = 297;
  const ML = 8, MR = 8;
  const W = pageW - ML - MR;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);

  // Linha horizontal helper
  const hr = (y: number) => doc.line(ML, y, ML + W, y);

  // Cabeçalho top
  const emissao = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
  doc.text(`Pagina: 0001`, ML + W, y, { align: "right" });
  y += 2;
  hr(y);

  // Bloco empresa
  y += 4;
  const colR = ML + W * 0.62;
  doc.text(`Empresa   : ${empresa.nome_fantasia}`, ML, y);
  doc.text(`Mes/Ano Competencia : ${NOMES_MES[mes - 1]} / ${ano}`, colR, y);
  y += 4;
  doc.text(`Endereco  : ${empresa.endereco ?? "-"}`, ML, y);
  doc.text(`CNPJ                : ${empresa.cnpj ?? "-"}`, colR, y);
  y += 4;
  const jornadaHdr = jornada
    ? `${jornada.nome} [${jornada.entrada ?? "--:--"} as ${jornada.saida ?? "--:--"} - Int: ${jornada.intervalo_saida ?? "--:--"} as ${jornada.intervalo_retorno ?? "--:--"}]`
    : "-";
  doc.text(`Hor. de Trab.: ${jornadaHdr}`, ML, y);
  y += 2;
  hr(y);

  // Funcionario
  y += 4;
  doc.text(`Funcionario : ${funcionario.nome}`, ML, y);
  doc.text(`Categoria de Ponto : ${funcionario.cargo ?? "-"}`, colR, y);
  y += 4;
  doc.text(`Matricula   : ${funcionario.matricula ?? funcionario.cpf ?? "-"}`, ML, y);
  y += 2;
  hr(y);

  // Cabeçalho da tabela (duas linhas)
  y += 4;
  const header1 = pad("Dia", 4) + pad("Data", 9) + pad("Hora", 7) + pad("Esca", 5) + pad("Marcacao do Ponto", 32) + pad("Irregularidade", 19) + pad("QTDE", 7) + pad("Justificativa", 22) + pad("Adic.", 8, true);
  const header2 = pad("Sem", 4) + pad("", 9) + pad("rio", 7) + pad("la", 5) + pad("Entr ", 6) + pad("Saida", 6) + pad("Entr ", 6) + pad("Saida", 6) + pad("Entr ", 6) + pad("Saida", 2) + pad("", 19) + pad("", 7) + pad("", 22) + pad("Noturno", 8, true);
  doc.setFont("courier", "bold");
  doc.text(header1, ML, y);
  y += 3.2;
  doc.text(header2, ML, y);
  doc.setFont("courier", "normal");
  y += 1;
  hr(y);
  y += 3.5;


  const rowH = 3.2;
  let totalNoturno = 0;
  let creditos = 0, debitos = 0;

  const linha = (cols: string[]) => {
    // 11 colunas, larguras fixas (em chars)
    const w = [4, 9, 7, 5, 6, 6, 6, 6, 6, 6, 19, 7, 22, 8];
    let s = "";
    for (let i = 0; i < cols.length; i++) {
      const right = i === cols.length - 1; // Adic.Noturno à direita
      s += pad(cols[i] ?? "", w[i] ?? 0, right && i === w.length - 1);
    }
    return s;
  };

  for (const d of resumo.dias) {
    if (y > pageH - 70) {
      doc.addPage();
      y = 14;
      doc.text(`Emissao: ${emissao}`, ML, y);
      doc.text(`Pagina: ${String(doc.getNumberOfPages()).padStart(4, "0")}`, ML + W, y, { align: "right" });
      y += 3; hr(y); y += 4;
    }
    const diaSem = DIAS_SEMANA_CURTO[d.diaSemana];
    const dataStr = `${d.data.slice(8)}/${d.data.slice(5, 7)}/${d.data.slice(2, 4)}`;
    const codeJ = jornada?.nome.slice(0, 5).padStart(5, "0") ?? "";
    const escala = "";

    // Dia fora do vínculo (antes da admissão / após desligamento): linha em branco
    if (d.foraVinculo) {
      doc.text(linha([diaSem, dataStr, "", "", "", "", "", "", "", "", "", "", "", ""]), ML, y);
      y += rowH;
      continue;
    }

    // Linha principal
    const progE = d.programado.entrada?.slice(0, 5) ?? "";
    const progSI = d.programado.saida_intervalo?.slice(0, 5) ?? "";
    const progRI = d.programado.retorno_intervalo?.slice(0, 5) ?? "";
    const progSF = d.programado.saida_final?.slice(0, 5) ?? "";

    let irregMain = "";
    let qtdeMain = "";
    let justMain = "";
    let realEntrMain = "";
    let realSaidaMain = "";
    let marcacaoNaoRegistrada = false;

    // Justificativa do supervisor (sempre exibida na coluna Justificativa)
    const justSupervisor = d.justificativa
      ? (d.justificativa.tipo.nome + (d.justificativa.observacao ? " · " + d.justificativa.observacao : "")).slice(0, 30)
      : "";

    const subs: SubLinha[] = [];
    if (!d.trabalha && !d.justificativa) {
      irregMain = "FOLGA";
    } else if (d.falta) {
      irregMain = "FALTA";
      justMain = justSupervisor || (d.observacao ?? "").slice(0, 30);
    } else if (d.pendente) {
      marcacaoNaoRegistrada = true;
      justMain = justSupervisor;
    } else {
      const irregs = irregularidadesDoDia(d);
      if (irregs.length > 0) {
        const first = irregs.shift()!;
        realEntrMain = first.realEntr;
        realSaidaMain = first.realSaida;
        irregMain = first.irreg;
        qtdeMain = first.qtde;
        subs.push(...irregs);
        // computa créditos/débitos do mês
        if (first.just.startsWith("CRED")) creditos += hm(first.qtde) ?? 0;
        else debitos += hm(first.qtde) ?? 0;
      }
      justMain = justSupervisor;
    }

    if (marcacaoNaoRegistrada) {
      doc.text(
        linha([diaSem, dataStr, codeJ, escala, "", "", "", "", "", "", "", "", justMain, ""]),
        ML, y,
      );
      // posicao aproximada da coluna "Marcacao do Ponto"
      doc.text("MARCACAO NAO REGISTRADA", ML + (4 + 9 + 7 + 5) * 1.6, y);
    } else {
      doc.text(
        linha([
          diaSem, dataStr, codeJ, escala,
          progE, progSI, progRI, progSF,
          realEntrMain, realSaidaMain,
          irregMain, qtdeMain, justMain, "",
        ]),
        ML, y,
      );
    }
    y += rowH;

    for (const s of subs) {
      if (s.just.startsWith("CRED")) creditos += hm(s.qtde) ?? 0;
      else debitos += hm(s.qtde) ?? 0;
      doc.text(
        linha(["", "", "", "", "", "", "", "", s.realEntr, s.realSaida, s.irreg, s.qtde, justSupervisor, ""]),
        ML, y,
      );
      y += rowH;
    }
  }

  // Total trabalhado
  y += 1;
  hr(y);
  y += 4;
  doc.text(fmtMinHHMM(resumo.totalTrabalhado), ML + W - 2, y, { align: "right" });
  y += 2;
  hr(y);

  // Saldo
  y += 4;
  doc.text(
    `Saldo Inicial : 00:00     Saldo Banco de Horas : ${fmtMinHHMM(creditos - debitos)}     Creditos Mes: ${fmtMinHHMM(creditos)}     Debitos Mes: ${fmtMinHHMM(debitos)}`,
    ML, y,
  );
  y += 2;
  hr(y);
  y += 4;
  doc.text(`Total de Horas Extras : ${formatMin(resumo.totalExtras).padStart(6, "0")}`, ML, y);
  y += 2;
  hr(y);

  // Confirmacao
  y += 6;
  doc.text("CONFIRMO A FREQUENCIA ACIMA", ML, y);
  y += 14;
  doc.line(ML, y, ML + 70, y);
  doc.line(ML + 95, y, ML + 165, y);
  y += 4;
  doc.text("Chefe / Gerente", ML, y);
  doc.text("Funcionario", ML + 95, y);

  // Rodapé
  const yFooter = pageH - 8;
  doc.text(
    `Numero Interno : ${Date.now().toString().padStart(14, "0")}     Matricula ${funcionario.matricula ?? funcionario.cpf ?? "-"}`,
    ML + W, yFooter, { align: "right" },
  );

  // Suprime aviso de variável não usada
  void totalNoturno;

  return doc;
}
