import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DIAS_SEMANA_CURTO, NOMES_MES, formatMin, type ResumoCartao } from "@/lib/cartao";

export type EmpresaInfo = {
  nome_fantasia: string;
  cnpj: string | null;
};

export type FuncionarioInfo = {
  nome: string;
  cpf: string | null;
  cargo: string | null;
};

export function gerarPdfCartao(opts: {
  empresa: EmpresaInfo;
  funcionario: FuncionarioInfo;
  ano: number;
  mes: number;
  resumo: ResumoCartao;
  status: string;
}): jsPDF {
  const { empresa, funcionario, ano, mes, resumo, status } = opts;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Cartão de Ponto", 14, 16);
  doc.setFontSize(10);
  doc.text(`${empresa.nome_fantasia}${empresa.cnpj ? ` — CNPJ ${empresa.cnpj}` : ""}`, 14, 22);
  doc.text(`Funcionário: ${funcionario.nome}`, 14, 28);
  doc.text(
    `${funcionario.cargo ?? "—"} | CPF: ${funcionario.cpf ?? "—"}`,
    14,
    33
  );
  doc.text(`Referência: ${NOMES_MES[mes - 1]}/${ano} — Status: ${status}`, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [["Dia", "Sem", "Ent", "Saí Int", "Ret Int", "Saí", "Atraso", "Trab", "Extra", "Obs"]],
    body: resumo.dias.map((d) => [
      d.data.slice(8, 10),
      DIAS_SEMANA_CURTO[d.diaSemana],
      d.registrado.entrada ?? (d.falta ? "FALTA" : d.pendente && d.trabalha ? "—" : "—"),
      d.registrado.saida_intervalo ?? "—",
      d.registrado.retorno_intervalo ?? "—",
      d.registrado.saida_final ?? "—",
      d.atrasoMinutos ? `${d.atrasoMinutos}m` : "—",
      d.trabalhadoMinutos ? formatMin(d.trabalhadoMinutos) : "—",
      d.extrasMinutos ? formatMin(d.extrasMinutos) : "—",
      d.observacao ?? "",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 60, 30] },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFontSize(10);
  doc.text(`Total de atrasos: ${resumo.totalAtraso} min`, 14, finalY);
  doc.text(`Faltas: ${resumo.totalFaltas}`, 14, finalY + 5);
  doc.text(`Horas trabalhadas: ${formatMin(resumo.totalTrabalhado)}`, 14, finalY + 10);
  doc.text(`Horas extras: ${formatMin(resumo.totalExtras)}`, 14, finalY + 15);

  return doc;
}
