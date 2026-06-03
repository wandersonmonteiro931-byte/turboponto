import jsPDF from "jspdf";
import { DIAS_SEMANA_CURTO, NOMES_MES, formatMin, type ResumoCartao, type DiaCartao } from "@/lib/cartao";
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
  matricula?: string | number | null;
};

export type JornadaInfo = {
  nome: string;
  entrada: string | null;
  saida: string | null;
  intervalo_saida: string | null;
  intervalo_retorno: string | null;
};

export function salvarPdfArquivo(doc: jsPDF, nomeArquivo: string) {
  const arquivoSeguro = nomeArquivo
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

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

const sobreposicaoMinutos = (inicioA: number, fimA: number, inicioB: number, fimB: number): number =>
  Math.max(0, Math.min(fimA, fimB) - Math.max(inicioA, inicioB));

const minutosNoturnosIntervaloCartao = (inicio: string | null, fim: string | null): number => {
  const ini = hm(inicio);
  const out = hm(fim);

  if (ini == null || out == null) return 0;

  let start = ini;
  let end = out;

  if (end <= start) end += 1440;

  // Período noturno urbano: 22:00 até 05:00.
  // Aqui exibimos no cartão o tempo real trabalhado no período noturno.
  return sobreposicaoMinutos(start, end, 0, 5 * 60) + sobreposicaoMinutos(start, end, 22 * 60, 1440 + 5 * 60);
};

const minutosAdicionalNoturnoDiaCartao = (d: DiaCartao): number => {
  const r = d.registrado;

  if (!r.entrada || !r.saida_final) return 0;

  if (r.saida_intervalo && r.retorno_intervalo) {
    return (
      minutosNoturnosIntervaloCartao(r.entrada, r.saida_intervalo) +
      minutosNoturnosIntervaloCartao(r.retorno_intervalo, r.saida_final)
    );
  }

  return minutosNoturnosIntervaloCartao(r.entrada, r.saida_final);
};

const fmtMinHHMM = (min: number): string => {
  const a = Math.abs(min);

  return `${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

const fmtDataBR = (iso: string): string => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

const textoSeguro = (valor: unknown, fallback = "-"): string => {
  if (valor === null || valor === undefined) return fallback;

  const txt = String(valor).trim();

  return txt.length > 0 ? txt : fallback;
};

const normalizaTextoPdf = (valor: string | null | undefined): string =>
  (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const nomeJustificativaPdf = (j: any): string => {
  const nomeBase = String(j?.tipo?.nome ?? "").trim();
  const codigoBase = String(j?.tipo?.codigo ?? "").trim();
  const textoCompleto = [
    nomeBase,
    codigoBase,
    j?.observacao,
    j?.observacoes,
    j?.motivo,
    j?.descricao,
    j?.descricao_manual,
    j?.texto,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (textoCompleto.includes("TROCA FOLGA")) return "TROCA FOLGA";
  if (textoCompleto.includes("TROCA COMPENSADA")) return "TROCA COMPENSADA";

  return nomeBase || codigoBase || "";
};

const nomesJustificativasPdf = (justificativas: any[] | undefined | null): string[] =>
  (justificativas ?? []).map((j) => nomeJustificativaPdf(j)).filter(Boolean);

const justificativasLinhaPdf = (justificativas: any[] | undefined | null): string => {
  const nomes = nomesJustificativasPdf(justificativas);
  return nomes[0] ?? "";
};

const temJustificativaPdf = (justificativas: any[] | undefined | null, termo: string): boolean =>
  (justificativas ?? []).some((j) => nomeJustificativaPdf(j).toUpperCase().includes(termo.toUpperCase()));

type Irregularidade = {
  label: string;
  qtde: number;
  credito: boolean;
  debito: boolean;
};

function irregularidadesDoDia(d: DiaCartao, tolMin: number): Irregularidade[] {
  const out: Irregularidade[] = [];

  // Tolerância CLT: até `tolMin` por batida, máximo 10 min no dia.
  const TOL_DIARIA_MAX = 10;
  let tolUsada = 0;
  const aplicar = (absMin: number): number => {
    const disponivel = Math.max(0, Math.min(tolMin, TOL_DIARIA_MAX - tolUsada));
    const absorvido = Math.min(absMin, disponivel);
    tolUsada += absorvido;
    return absMin - absorvido;
  };

  const entDiff = minDiff(d.programado.entrada, d.registrado.entrada);
  if (entDiff != null) {
    if (entDiff > 0) {
      const restante = aplicar(entDiff);
      if (restante > 0) {
        out.push({ label: "ATRASO", qtde: entDiff, credito: false, debito: true });
      }
    } else if (entDiff < 0) {
      const restante = aplicar(-entDiff);
      if (restante > 0) {
        out.push({ label: "ENTRADA ANTECIPADA", qtde: -entDiff, credito: true, debito: false });
      }
    }
  }

  const saiDiff = minDiff(d.programado.saida_final, d.registrado.saida_final);
  if (saiDiff != null) {
    if (saiDiff > 0) {
      const restante = aplicar(saiDiff);
      if (restante > 0) {
        out.push({ label: "HORA EXTRA", qtde: saiDiff, credito: true, debito: false });
      }
    } else if (saiDiff < 0) {
      const restante = aplicar(-saiDiff);
      if (restante > 0) {
        out.push({ label: "SAÍDA ANTECIPADA", qtde: -saiDiff, credito: false, debito: true });
      }
    }
  }

  const temAlguma =
    !!d.registrado.entrada ||
    !!d.registrado.saida_intervalo ||
    !!d.registrado.retorno_intervalo ||
    !!d.registrado.saida_final;

  const faltaPrincipal = !d.registrado.entrada || !d.registrado.saida_final;

  if (temAlguma && faltaPrincipal) {
    out.push({
      label: "MARCAÇÃO INCOMPLETA",
      qtde: 0,
      credito: false,
      debito: false,
    });
  }

  return out;
}

export function gerarPdfCartao(opts: {
  empresa: EmpresaInfo;
  funcionario: FuncionarioInfo;
  matriculaPdf?: string | number | null;
  jornada?: JornadaInfo | null;
  jornadas?: VinculoAtivoComDias[];
  ano: number;
  mes: number;
  resumo: ResumoCartao;
  status: string;
}): jsPDF {
  const { empresa, funcionario, matriculaPdf, jornada, jornadas, ano, mes, resumo } = opts;

  const tol = resumo.toleranciaMinutos ?? 5;

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });

  const pageW = 210;
  const pageH = 297;
  const ML = 6;
  const MR = 6;
  const W = pageW - ML - MR;

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

  const matriculaFuncionario = textoSeguro(matriculaPdf ?? funcionario.matricula, "MATRICULA_NAO_RECEBIDA");
  const nomeFuncionario = textoSeguro(funcionario.nome);
  const cargoFuncionario = textoSeguro(funcionario.cargo);
  const cpfFuncionario = textoSeguro(funcionario.cpf);

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
  doc.text(``, pageW / 2, y, {
    align: "center",
  });
  doc.text("Pag: 0001", ML + W, y, { align: "right" });

  y += 1.5;

  hr(y);

  y += 3.5;

  // Cabeçalho alinhado em grade fixa: evita texto torto/sobreposto no PDF.
  const leftLabelX = ML;
  const leftValueX = ML + 21;
  const rightLabelX = ML + W * 0.62;
  const rightValueX = rightLabelX + 25;
  const rowStep = 3.4;

  const drawHeaderPair = (label1: string, value1: string, label2 = "", value2 = "", boldLeft = false) => {
    if (boldLeft) doc.setFont("courier", "bold");
    doc.text(label1, leftLabelX, y);
    doc.setFont("courier", "normal");
    doc.text(textoSeguro(value1).slice(0, 82), leftValueX, y);

    if (label2) {
      doc.text(label2, rightLabelX, y);
      doc.text(textoSeguro(value2).slice(0, 40), rightValueX, y);
    }

    y += rowStep;
  };

  drawHeaderPair(
    "Empresa:",
    textoSeguro(empresa.nome_fantasia).toUpperCase(),
    "Mes/Ano:",
    `${NOMES_MES[mes - 1]}/${ano}`,
  );

  drawHeaderPair("End:", textoSeguro(empresa.endereco).slice(0, 76), "CNPJ:", textoSeguro(empresa.cnpj));

  drawHeaderPair("Func:", nomeFuncionario, "Cargo:", cargoFuncionario);

  drawHeaderPair("Matricula:", matriculaFuncionario, "", "", true);

  drawHeaderPair("CPF:", cpfFuncionario);

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
      ? `${jornada.nome} [${jornada.entrada ?? "--:--"} as ${
          jornada.saida ?? "--:--"
        } Int: ${jornada.intervalo_saida ?? "--:--"} as ${jornada.intervalo_retorno ?? "--:--"}]`
      : "-";

    doc.text(`Hor.Trab: ${jornadaHdr}`, ML, y);
  }

  if (resumo.dataAdmissao) {
    y += 3.2;

    doc.text(
      `Admissao: ${fmtDataBR(resumo.dataAdmissao)}${
        resumo.dataDesligamento ? `   Desligamento: ${fmtDataBR(resumo.dataDesligamento)}` : ""
      }`,
      ML,
      y,
    );
  }

  y += 1.5;

  hr(y);

  const cols: {
    key: string;
    w: number;
    label: string;
    align?: "left" | "right" | "center";
  }[] = [
    { key: "dia", w: 8, label: "Dia" },
    { key: "data", w: 13, label: "Data" },
    { key: "esc", w: 6, label: "Esc", align: "center" },
    { key: "entPrev", w: 11, label: "E.Prev", align: "center" },
    { key: "intSai", w: 11, label: "I.Sai", align: "center" },
    { key: "intRet", w: 11, label: "I.Ret", align: "center" },
    { key: "saiPrev", w: 11, label: "S.Prev", align: "center" },
    { key: "entReal", w: 11, label: "E.Real", align: "center" },
    { key: "saiReal", w: 11, label: "S.Real", align: "center" },
    { key: "irreg", w: 34, label: "Irregularidade" },
    { key: "qtde", w: 11, label: "QTDE", align: "center" },
    { key: "just", w: 50, label: "Justificativa" },
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

  let creditos = 0;
  let debitos = 0;
  let horasBenef = 0;

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

  const drawJustificativasExtras = (justificativas: any[] | undefined | null) => {
    const nomes = nomesJustificativasPdf(justificativas);

    for (let i = 1; i < nomes.length; i++) {
      drawRow({
        just: nomes[i],
      });
    }
  };

  const nomeJustificativaCurto = (nome: string) =>
    textoSeguro(nome, "").replace(/\s+/g, " ").replace("REGIST", "REG.").replace("COLAB", "COLAB.").trim();

  const nomeJustificativaLinha = (j: { tipo: { nome: string }; observacao?: string | null }): string => {
    const base = nomeJustificativaPdf(j);
    const txt = normalizaTextoPdf(`${base} ${j.observacao ?? ""}`);

    if (txt.includes("TROCA FOLGA")) return "TROCA FOLGA";
    if (txt.includes("TROCA COMPENSADA")) return "TROCA COMPENSADA";

    return nomeJustificativaCurto(base);
  };
  void nomeJustificativaLinha;

  const justEntriesOf = (
    justificativas: Array<{ tipo: { nome: string }; observacao?: string | null; quantidadeMinutos?: number | null }>,
  ) =>
    justificativas
      .map((j) => ({
        text: nomeJustificativaLinha(j),
        qtde: j.quantidadeMinutos != null ? fmtMinHHMM(j.quantidadeMinutos) : "",
      }))
      .filter((e) => e.text);

  const drawDiaComJust = (
    rowBase: Record<string, string>,
    linhas: Array<{ label: string; qtde: string }>,
    justificativas: Array<{ tipo: { nome: string }; observacao?: string | null; quantidadeMinutos?: number | null }>,
  ) => {
    const justEntries = justEntriesOf(justificativas);
    const total = Math.max(1, linhas.length, justEntries.length);

    for (let i = 0; i < total; i++) {
      if (y > pageH - 35) {
        doc.addPage();
        y = 10;
        drawHeader();
      }

      const linha = linhas[i];
      const just = justEntries[i];

      const row: Record<string, string> = i === 0 ? { ...rowBase } : {};
      row.irreg = linha?.label ?? "";
      row.qtde = linha?.qtde || just?.qtde || "";
      row.just = just?.text ?? "";

      drawRow(row);
    }
  };

  const textoJustificativaRegra = (j: { tipo: { nome: string }; observacao?: string | null }) =>
    normalizaTextoPdf(`${nomeJustificativaPdf(j)} ${j.observacao ?? ""}`);

  const temTrocaFolga = (justificativas: Array<{ tipo: { nome: string }; observacao?: string | null }>) =>
    justificativas.some((j) => textoJustificativaRegra(j).includes("TROCA FOLGA"));

  const temTrocaCompensada = (justificativas: Array<{ tipo: { nome: string }; observacao?: string | null }>) =>
    justificativas.some((j) => textoJustificativaRegra(j).includes("TROCA COMPENSADA"));

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
      const adicNoturnoMin = minutosAdicionalNoturnoDiaCartao(d);

      drawDiaComJust(
        {
          dia: diaSem,
          data: dataStr,
          esc: d.jornadaCodigo ?? "",
          adic: adicNoturnoMin > 0 ? fmtMinHHMM(adicNoturnoMin) : "",
        },
        [{ label: "FORA DO VINCULO", qtde: "" }],
        justs,
      );

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
      const adicNoturnoMin = minutosAdicionalNoturnoDiaCartao(d);

      if (d.bancoHorasMinutos > 0) creditos += d.bancoHorasMinutos;

      const qtdePrimeira =
        d.bancoHorasMinutos > 0
          ? fmtMinHHMM(d.bancoHorasMinutos)
          : j0 && j0.quantidadeMinutos != null
            ? fmtMinHHMM(j0.quantidadeMinutos)
            : d.trabalhadoMinutos > 0 && temReg
              ? fmtMinHHMM(d.trabalhadoMinutos)
              : "";

      drawDiaComJust(
        {
          dia: diaSem,
          data: dataStr,
          esc: d.jornadaCodigo ?? "",
          entReal: temReg ? (d.registrado.entrada ?? "") : "",
          saiReal: temReg ? (d.registrado.saida_final ?? "") : "",
          adic: adicNoturnoMin > 0 ? fmtMinHHMM(adicNoturnoMin) : "",
        },
        [
          {
            label: temTrocaFolga(justs) ? "FOLGA" : temReg ? "TRABALHADO" : "FOLGA",
            qtde: d.bancoHorasMinutos > 0 || (d.trabalhadoMinutos > 0 && temReg) ? qtdePrimeira : "",
          },
        ],
        justs,
      );

      continue;
    }

    const semJornada = !d.programado.entrada && !d.programado.saida_final;
    const semMarcacao = (d.marcacaoNaoRegistrada || d.pendente) && d.bancoHorasMinutos >= 0;
    const falta = d.faltaRegistrada || d.falta;

    const irregs = irregularidadesDoDia(d, tol);
    const justificativas = d.justificativas ?? [];
    const temHoraExtraPagar = justificativas.some((j) => j.tipo.codigo === "HE_PAGAR");

    const faltaInjustificada =
      falta &&
      (!justificativas.length ||
        justificativas.some(
          (j) => j.tipo.categoria === "falta" && j.tipo.desconta_salario && j.tipo.afeta_assiduidade !== "nao",
        ));

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

    type LinhaIrreg = {
      label: string;
      qtde: string;
    };

    const linhas: LinhaIrreg[] = [];
    const temJustificativa = (d.justificativas ?? []).length > 0;

    if (semJornada) {
      linhas.push({
        label: d.trabalhadoMinutos > 0 ? "TRABALHADO" : "",
        qtde: d.trabalhadoMinutos > 0 ? fmtMinHHMM(d.trabalhadoMinutos) : "",
      });
    } else if (faltaInjustificada) {
      linhas.push({
        label: "FALTA",
        qtde: cargaProgDia > 0 ? fmtMinHHMM(cargaProgDia) : "",
      });

      horasBenef += cargaProgDia;
    } else if (!falta && semMarcacao && !temJustificativa && d.bancoHorasMinutos >= 0) {
      linhas.push({
        label: "MARCAÇÃO NÃO REGISTRADA",
        qtde: "",
      });
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

        linhas.push({
          label: lbl,
          qtde: fmtMinHHMM(i.qtde),
        });
      }

      if (irregs.length === 0 && d.trabalhadoMinutos > 0) {
        linhas.push({
          label: "TRABALHADO",
          qtde: fmtMinHHMM(d.trabalhadoMinutos),
        });
      }
    }

    const debitoJaRepresentadoPelaFalta = faltaInjustificada && d.bancoHorasMinutos < 0;

    const debitoJaRepresentadoPorIrreg = irregs
      .filter((i) => i.debito && (i.label === "ATRASO" || i.label === "SAÍDA ANTECIPADA"))
      .reduce((s, i) => s + i.qtde, 0);

    const creditoJaRepresentadoPorIrreg = irregs
      .filter((i) => i.credito && (i.label === "HORA EXTRA" || i.label === "ENTRADA ANTECIPADA"))
      .reduce((s, i) => s + i.qtde, 0);

    if (d.bancoHorasMinutos > 0) {
      creditos += d.bancoHorasMinutos;

      const restante = d.bancoHorasMinutos - creditoJaRepresentadoPorIrreg;

      if (restante > 0) {
        linhas.push({
          label: "CRÉDITO BCO DE HORAS",
          qtde: fmtMinHHMM(restante),
        });
      }
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

    if (linhas.length === 0) {
      linhas.push({
        label: "",
        qtde: "",
      });
    }

    const primeira = linhas[0];
    const adicNoturnoMin = minutosAdicionalNoturnoDiaCartao(d);

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
      adic: adicNoturnoMin > 0 ? fmtMinHHMM(adicNoturnoMin) : "",
    });

    for (let i = 1; i < linhas.length; i++) {
      drawRow({
        irreg: linhas[i].label,
        qtde: linhas[i].qtde,
      });
    }

    drawJustificativasDoDia(justificativas);
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
    `Saldo BH: ${creditos - debitos < 0 ? "-" : ""}${fmtMinHHMM(creditos - debitos)}   Creditos: ${fmtMinHHMM(
      creditos,
    )}   Debitos: ${fmtMinHHMM(debitos)}   `,
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
