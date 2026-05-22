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

type SubLinha = { realEntr: string; realSaida: string; irreg: string; qtde: string; just: string };

const horarioPar = (
  d: DiaCartao,
  tipo: "entrada" | "saida_intervalo" | "retorno_intervalo" | "saida_final",
) => d.registrado[tipo] || d.programado[tipo] || "";

function irregularidadesDoDia(d: DiaCartao, tolMin = 0): SubLinha[] {
  const out: SubLinha[] = [];
  const checks: Array<{
    tipo: "entrada" | "saida_intervalo" | "retorno_intervalo" | "saida_final";
    isSaida: boolean;
  }> = [
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
    const realEntr =
      c.tipo === "saida_final"
        ? horarioPar(d, "entrada")
        : c.tipo === "retorno_intervalo"
          ? horarioPar(d, "saida_intervalo")
          : horarioPar(d, c.tipo);
    const realSaida =
      c.tipo === "entrada"
        ? horarioPar(d, "saida_final")
        : c.tipo === "saida_intervalo"
          ? horarioPar(d, "retorno_intervalo")
          : horarioPar(d, c.tipo);
    out.push({
      realEntr,
      realSaida,
      irreg: label,
      qtde: fmtMinHHMM(diff),
      just:
        diff > 0 && c.isSaida
          ? "CREDITO BCO DE HORAS"
          : diff < 0 && !c.isSaida
            ? "DEBITO BCO DE HORAS"
            : diff > 0
              ? "DEBITO BCO DE HORAS"
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
  const pageW = 210,
    pageH = 297;
  const ML = 8,
    MR = 8;
  const W = pageW - ML - MR;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);

  // Linha horizontal helper
  const hr = (y: number) => doc.line(ML, y, ML + W, y);

  // Cabeçalho top
  const emissao = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
  const header1 =
    pad("Dia", 4) +
    pad("Data", 9) +
    pad("Hora", 7) +
    pad("Esca", 5) +
    pad("Marcacao do Ponto", 32) +
    pad("Irregularidade", 19) +
    pad("QTDE", 7) +
    pad("Justificativa", 22) +
    pad("Adic.", 8, true);
  const header2 =
    pad("Sem", 4) +
    pad("", 9) +
    pad("rio", 7) +
    pad("la", 5) +
    pad("Entr ", 6) +
    pad("Saida", 6) +
    pad("Entr ", 6) +
    pad("Saida", 6) +
    pad("Entr ", 6) +
    pad("Saida", 2) +
    pad("", 19) +
    pad("", 7) +
    pad("", 22) +
    pad("Noturno", 8, true);
  doc.setFont("courier", "bold");
  doc.text(header1, ML, y);
  y += 3.2;
  doc.text(header2, ML, y);
  doc.setFont("courier", "normal");
  y += 1;
  hr(y);
  y += 3.5;

  const rowH = 3.2;
  const totalNoturno = 0;
  let creditos = 0,
    debitos = 0;

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
      doc.text(`Pagina: ${String(doc.getNumberOfPages()).padStart(4, "0")}`, ML + W, y, {
        align: "right",
      });
      y += 3;
      hr(y);
      y += 4;
    }
    const diaSem = DIAS_SEMANA_CURTO[d.diaSemana];
    const dataStr = `${d.data.slice(8)}/${d.data.slice(5, 7)}/${d.data.slice(2, 4)}`;
    const codeJ = jornada?.nome.slice(0, 5).padStart(5, "0") ?? "";
    const escala = "";

    type Evento = {
      marcacao?: string;
      realEntr: string;
      realSaida: string;
      irreg: string;
      qtde: string;
      just: string;
    };
    const eventos: Evento[] = [];

    if (!d.trabalha && !d.foraVinculo)
      eventos.push({ realEntr: "", realSaida: "", irreg: "FOLGA", qtde: "", just: "" });
    if (d.faltaRegistrada || d.falta)
      eventos.push({ realEntr: "", realSaida: "", irreg: "FALTA", qtde: "", just: "" });
    if (d.marcacaoNaoRegistrada || d.pendente)
      eventos.push({
        marcacao: "MARCACAO NAO REGISTRADA",
        realEntr: "",
        realSaida: "",
        irreg: "",
        qtde: "",
        just: "",
      });

    for (const i of irregularidadesDoDia(d)) {
      eventos.push({
        realEntr: i.realEntr,
        realSaida: i.realSaida,
        irreg: i.irreg,
        qtde: i.qtde,
        just: "",
      });
      if (i.just.startsWith("CRED")) creditos += hm(i.qtde) ?? 0;
      else debitos += hm(i.qtde) ?? 0;
    }

    const justificativas = (
      d.justificativas?.length ? d.justificativas : d.justificativa ? [d.justificativa] : []
    ).map((j) => ({
      realEntr: "",
      realSaida: "",
      irreg: "",
      qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
      just: `${j.tipo.nome}${j.observacao ? " - " + j.observacao : ""}`.slice(0, 22),
    }));

    const totalLinhas = Math.max(eventos.length, justificativas.length, 1);

    const marcacoesRegistradas = [
      d.registrado.entrada ?? "",
      d.registrado.saida_intervalo ?? "",
      d.registrado.retorno_intervalo ?? "",
      d.registrado.saida_final ?? "",
      "",
      "",
    ];

    for (let k = 0; k < totalLinhas; k++) {
      const ev = eventos[k] ?? { realEntr: "", realSaida: "", irreg: "", qtde: "", just: "" };
      const just = justificativas[k] ?? { just: "", qtde: "" };
      const marcacaoIrregular =
        ev.realEntr || ev.realSaida
          ? [ev.realEntr, "", "", "", "", ev.realSaida]
          : ["", "", "", "", "", ""];
      const marcacaoCols = ev.marcacao
        ? ["", "", "", "", "", ""]
        : k === 0 && !ev.realEntr && !ev.realSaida
          ? marcacoesRegistradas
          : marcacaoIrregular;
      const cols = [
        k === 0 ? diaSem : "",
        k === 0 ? dataStr : "",
        k === 0 ? codeJ : "",
        k === 0 ? escala : "",
        ...marcacaoCols,
        ev.irreg,
        just.qtde || ev.qtde,
        just.just,
        "",
      ];
      doc.text(linha(cols), ML, y);
      if (ev.marcacao) {
        const prefix = pad(cols[0], 4) + pad(cols[1], 9) + pad(cols[2], 7) + pad(cols[3], 5);
        doc.text(ev.marcacao, ML + doc.getTextWidth(prefix), y);
      }
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
    ML,
    y,
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
    ML + W,
    yFooter,
    { align: "right" },
  );

  // Suprime aviso de variável não usada
  void totalNoturno;

  return doc;
}
