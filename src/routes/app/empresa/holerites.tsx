import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { mesNome } from "@/lib/beneficios";
import { CheckCircle2, Download, Plus, Trash2, Pencil, ChevronsUpDown, Loader2 } from "lucide-react";
import { gerarHoleritePdf, carregarLogoComoDataUrl, type HolerLancamento } from "@/lib/holerite-pdf";
import turboLogoHolerite from "@/assets/turbo-logo-holerite.png";
import { calcularRubrica, type TipoCalculo } from "@/lib/holerite-rubricas";
import { recalcular as engineRecalcular } from "@/lib/holerite-engine";

export const Route = createFileRoute("/app/empresa/holerites")({
  component: HoleritesPage,
});

type Func = {
  id: string;
  nome: string;
  cargo: string | null;
  cpf: string | null;
  rg: string | null;
  endereco: string | null;
  data_admissao: string | null;
  salario: number | null;
  banco_agencia: string | null;
  conta: string | null;
  lotacao: string | null;
  num_dep_irrf: number | null;
  num_dep_sal_fam: number | null;
  matricula: string | null;
  vale_transporte_mensal?: number | null;
  vale_transporte?: boolean | null;
  usa_vale_transporte?: boolean | null;
  utiliza_vale_transporte?: boolean | null;
  vt_ativo?: boolean | null;
  vt_concedido?: number | null;
  valor_vale_transporte?: number | null;
  vale_transporte_valor?: number | null;
};
type Holerite = {
  id: string;
  funcionario_id: string;
  mes_referencia: number;
  ano_referencia: number;
  pdf_url: string | null;
  liberado: boolean;
  liberado_em: string | null;
  acessado_em: string | null;
  total_liquido: number;
  funcionarios: { nome: string } | null;
};

function HoleritesPage() {
  const { empresaId, role, user } = useAuth();
  const podeEditar = role === "admin" || role === "gerente";

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [funcionarioId, setFuncionarioId] = useState("todos");
  const [status, setStatus] = useState("todos");

  const [funcs, setFuncs] = useState<Func[]>([]);
  const [lista, setLista] = useState<Holerite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!empresaId) return;
    void supabase
      .from("funcionarios")
      .select(
        "id,nome,cargo,cpf,rg,endereco,data_admissao,salario,banco_agencia,conta,lotacao,num_dep_irrf,num_dep_sal_fam,matricula",
      )
      .eq("empresa_id", empresaId)
      .eq("status", "ativo")
      .order("nome")
      .then(({ data }) => setFuncs((data ?? []) as Func[]));
  }, [empresaId]);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    let q = supabase
      .from("holerites")
      .select(
        "id,funcionario_id,mes_referencia,ano_referencia,pdf_url,liberado,liberado_em,acessado_em,total_liquido,funcionarios(nome)",
      )
      .eq("empresa_id", empresaId)
      .eq("mes_referencia", mes)
      .eq("ano_referencia", ano)
      .order("created_at", { ascending: false });
    if (funcionarioId !== "todos") q = q.eq("funcionario_id", funcionarioId);
    if (status === "liberado") q = q.eq("liberado", true);
    if (status === "pendente") q = q.eq("liberado", false);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setLista((data ?? []) as unknown as Holerite[]);
    setSelecionados(new Set());
    setLoading(false);
  };
  useEffect(() => {
    void carregar(); /* eslint-disable-next-line */
  }, [empresaId, mes, ano, funcionarioId, status]);

  const liberar = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { error } = await supabase
      .from("holerites")
      .update({
        liberado: true,
        status: "liberado",
        liberado_por: user.id,
        liberado_em: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} holerite(s) liberado(s)`);
    await carregar();
  };

  const negarAcesso = async (h: Holerite) => {
    if (!confirm("Revogar acesso do funcionário a este holerite?")) return;
    const { error } = await supabase
      .from("holerites")
      .update({
        liberado: false,
        status: "pendente",
        liberado_em: null,
        liberado_por: null,
      })
      .eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Acesso revogado");
    await carregar();
  };

  const remover = async (h: Holerite) => {
    if (!confirm("Remover este holerite?")) return;
    if (h.pdf_url) {
      const path = h.pdf_url.split(`/holerites/`)[1]?.split("?")[0];
      if (path) await supabase.storage.from("holerites").remove([path]);
    }
    const { error } = await supabase.from("holerites").delete().eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    await carregar();
  };

  const download = async (h: Holerite) => {
    const { data: atual, error: atualErr } = await supabase
      .from("holerites")
      .select("pdf_url")
      .eq("id", h.id)
      .maybeSingle();

    if (atualErr) return toast.error(atualErr.message);

    const pdfUrlAtual = atual?.pdf_url || h.pdf_url;
    if (!pdfUrlAtual) return toast.error("PDF ainda não foi gerado");

    const path = pdfUrlAtual.split(`/holerites/`)[1]?.split("?")[0];
    if (!path) return toast.error("Caminho do PDF inválido");

    const { data, error } = await supabase.storage.from("holerites").download(path);
    if (error || !data) return toast.error(error?.message ?? "Erro ao baixar PDF");

    const blobUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `holerite-${h.funcionarios?.nome ?? "funcionario"}-${h.mes_referencia}-${h.ano_referencia}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };

  const totais = useMemo(
    () => ({
      total: lista.length,
      liberados: lista.filter((h) => h.liberado).length,
      pendentes: lista.filter((h) => !h.liberado).length,
      acessados: lista.filter((h) => h.acessado_em).length,
    }),
    [lista],
  );

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Holerites</h2>
          <p className="text-sm text-muted-foreground">
            Crie holerites detalhados e libere o acesso para o funcionário baixar o PDF.
          </p>
        </div>
        {podeEditar && (
          <Button
            onClick={() => {
              setEditandoId(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Novo holerite
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Fld label="Mês">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {mesNome(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Ano">
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
          </Fld>
          <Fld label="Funcionário">
            <Select value={funcionarioId} onValueChange={setFuncionarioId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcs.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="liberado">Liberado</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </Fld>
          <div className="flex items-end">
            {podeEditar && selecionados.size > 0 && (
              <Button onClick={() => liberar(Array.from(selecionados))} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Liberar ({selecionados.size})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={totais.total} />
        <Stat label="Liberados" value={totais.liberados} color="text-green-600" />
        <Stat label="Pendentes" value={totais.pendentes} color="text-amber-600" />
        <Stat label="Acessados" value={totais.acessados} color="text-blue-600" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum holerite para esse período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    {podeEditar && (
                      <th className="p-2 w-8">
                        <input
                          type="checkbox"
                          checked={
                            selecionados.size > 0 && selecionados.size === lista.filter((h) => !h.liberado).length
                          }
                          onChange={(e) => {
                            if (e.target.checked)
                              setSelecionados(new Set(lista.filter((h) => !h.liberado).map((h) => h.id)));
                            else setSelecionados(new Set());
                          }}
                        />
                      </th>
                    )}
                    <th className="text-left p-2">Funcionário</th>
                    <th className="text-left p-2">Mês/Ano</th>
                    <th className="text-right p-2">Líquido</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Liberado em</th>
                    <th className="text-left p-2">Acessado em</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lista.map((h) => (
                    <tr key={h.id} className="hover:bg-muted/30">
                      {podeEditar && (
                        <td className="p-2">
                          {!h.liberado && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(h.id)}
                              onChange={(e) => {
                                const s = new Set(selecionados);
                                if (e.target.checked) s.add(h.id);
                                else s.delete(h.id);
                                setSelecionados(s);
                              }}
                            />
                          )}
                        </td>
                      )}
                      <td className="p-2 font-medium">{h.funcionarios?.nome ?? "—"}</td>
                      <td className="p-2">
                        {mesNome(h.mes_referencia)}/{h.ano_referencia}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {Math.max(0, Number(h.total_liquido || 0)).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-2">
                        {h.liberado ? (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-700">
                            Liberado
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {h.liberado_em ? new Date(h.liberado_em).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="p-2 text-xs">
                        {h.acessado_em ? new Date(h.acessado_em).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap space-x-1">
                        {h.pdf_url && (
                          <Button size="sm" variant="ghost" onClick={() => download(h)} title="Baixar PDF">
                            <Download className="h-3 w-3" />
                          </Button>
                        )}
                        {podeEditar && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditandoId(h.id);
                              setEditorOpen(true);
                            }}
                            title="Editar"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                        {podeEditar && !h.liberado && (
                          <Button size="sm" variant="outline" onClick={() => liberar([h.id])}>
                            Liberar
                          </Button>
                        )}
                        {podeEditar && h.liberado && (
                          <Button size="sm" variant="outline" onClick={() => negarAcesso(h)}>
                            Revogar
                          </Button>
                        )}
                        {podeEditar && (
                          <Button size="sm" variant="ghost" onClick={() => remover(h)} title="Remover">
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {empresaId && editorOpen && (
        <EditorDialog
          empresaId={empresaId}
          holeriteId={editandoId}
          funcs={funcs}
          defaultMes={mes}
          defaultAno={ano}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

type LancEdit = HolerLancamento & { id?: string; _k: string };

const CODIGO_QTDE_HORAS_BENEF = "09998";

const garantirQtdeHorasBenefHolerite = (linhas: LancEdit[]) => {
  const jaExiste = linhas.some((linha) => linha.codigo === CODIGO_QTDE_HORAS_BENEF);

  if (jaExiste) return linhas;

  return [
    ...linhas,
    {
      _k: crypto.randomUUID(),
      codigo: CODIGO_QTDE_HORAS_BENEF,
      descricao: "QTDE HORAS BENEF",
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: 0,
    },
  ];
};

const grupoLancamentoHolerite = (linha: LancEdit) => {
  // Ordem obrigatória em qualquer holerite:
  // 1) todos os proventos
  // 2) todos os descontos
  // 3) todos os informativos
  if (linha.codigo === "09990") return 2;
  if (Number(linha.provento || 0) > 0) return 0;
  if (Number(linha.desconto || 0) > 0) return 1;
  return 2;
};

const pesoInformativoHolerite = (codigo: string) => {
  // Dentro dos informativos:
  // banco de horas fica no fim, e QTDE HORAS BENEF fica obrigatoriamente por último.
  if (codigo === CODIGO_QTDE_HORAS_BENEF) return 3;
  if (codigo === "28651" || codigo === "28652") return 2;
  if (codigo === "09990") return 1;
  return 0;
};

const preencherQtdeRubricasCalculadasHolerite = (linhas: LancEdit[]) => {
  const salarioBase = Number(linhas.find((linha) => linha.codigo === "00005")?.provento || 0);
  const totalProventos = linhas.reduce((s, linha) => s + Number(linha.provento || 0), 0);

  return linhas.map((linha) => {
    const provento = Number(linha.provento || 0);
    const desconto = Number(linha.desconto || 0);
    const temValor = provento > 0 || desconto > 0;

    // Informativos continuam com a regra própria de horas.
    if (!temValor) return linha;

    // Se já tem QTDE preenchida, mantém.
    if (linha.qtde != null && Number(linha.qtde) !== 0) return linha;

    // INSS: mostrar a alíquota efetiva/percentual aplicado.
    if (linha.codigo === "07000") {
      return { ...linha, qtde: 7.5 };
    }

    // Vale Transporte: pela regra legal, a QTDE representa o percentual de 6%.
    if (linha.codigo === "07030") {
      return { ...linha, qtde: 6 };
    }

    // Adiantamento: se estiver sem QTDE, calcula percentual sobre o salário proporcional.
    if (linha.codigo === "07065") {
      const percentual = salarioBase > 0 ? roundAutoHolerite((desconto / salarioBase) * 100) : null;
      return { ...linha, qtde: percentual };
    }

    // Outras rubricas de provento/desconto calculadas: se não houver quantidade própria,
    // informa 1 para não deixar a coluna QTDE vazia.
    return { ...linha, qtde: 1 };
  });
};

const ordenarLancamentosHolerite = (linhas: LancEdit[]) => {
  return preencherQtdeRubricasCalculadasHolerite(garantirQtdeHorasBenefHolerite([...linhas])).sort((a, b) => {
    const grupoA = grupoLancamentoHolerite(a);
    const grupoB = grupoLancamentoHolerite(b);

    if (grupoA !== grupoB) return grupoA - grupoB;

    if (grupoA === 2) {
      const pesoA = pesoInformativoHolerite(a.codigo);
      const pesoB = pesoInformativoHolerite(b.codigo);

      if (pesoA !== pesoB) return pesoA - pesoB;
    }

    return 0;
  });
};

const roundAutoHolerite = (valor: number) => Math.round(valor * 100) / 100;

const hmAutoHolerite = (valor: string | null | undefined): number | null => {
  if (!valor) return null;
  const [h, m] = valor.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const sobreposicaoAutoHolerite = (inicioA: number, fimA: number, inicioB: number, fimB: number) =>
  Math.max(0, Math.min(fimA, fimB) - Math.max(inicioA, inicioB));

const minutosNoturnosAutoHolerite = (inicio: string | null, fim: string | null) => {
  const ini = hmAutoHolerite(inicio);
  const out = hmAutoHolerite(fim);
  if (ini == null || out == null) return 0;

  let start = ini;
  let end = out;
  if (end <= start) end += 1440;

  return sobreposicaoAutoHolerite(start, end, 0, 5 * 60) + sobreposicaoAutoHolerite(start, end, 22 * 60, 1440 + 5 * 60);
};

const calcularDsrProporcionalAutoHolerite = (diasTrabalhadosOuPagos: number) => {
  // DSR proporcional:
  // a cada até 6 dias trabalhados/pagos, considera 1 repouso semanal.
  // Exemplo: 3 dias pagos => 1 DSR, e não todos os domingos do mês.
  const dias = Math.max(1, Number(diasTrabalhadosOuPagos || 0));
  return Math.max(1, Math.ceil(dias / 6));
};

const calcularInssAutoHolerite = (base: number) => {
  const b = Math.max(0, Number(base || 0));
  if (b <= 0) return 0;

  const faixas = [
    { ate: 1621.0, aliquota: 7.5, deducao: 0 },
    { ate: 2902.84, aliquota: 9, deducao: 24.32 },
    { ate: 4354.27, aliquota: 12, deducao: 111.4 },
    { ate: 8475.55, aliquota: 14, deducao: 198.49 },
  ];

  const teto = faixas[faixas.length - 1].ate;
  const baseLimitada = Math.min(b, teto);
  const faixa = faixas.find((f) => baseLimitada <= f.ate) ?? faixas[faixas.length - 1];

  return roundAutoHolerite(Math.max(0, baseLimitada * (faixa.aliquota / 100) - faixa.deducao));
};

const normalizarTipoPontoHolerite = (tipo: string) => {
  const t = tipo.toLowerCase().trim();

  if (["entrada", "entrada_real", "inicio", "entrada1"].includes(t)) return "entrada";
  if (
    [
      "saida_intervalo",
      "intervalo_saida",
      "inicio_intervalo",
      "saida_almoco",
      "saida_janta",
      "intervalo_inicio",
    ].includes(t)
  )
    return "saida_intervalo";
  if (
    [
      "retorno_intervalo",
      "intervalo_retorno",
      "fim_intervalo",
      "volta_intervalo",
      "retorno_almoco",
      "retorno_janta",
    ].includes(t)
  )
    return "retorno_intervalo";
  if (["saida_final", "saida", "fim", "saida_real", "saida2"].includes(t)) return "saida_final";

  return t;
};

async function adicionarFechamentoBancoHorasHolerite(params: {
  funcionarioId: string;
  ano: number;
  mes: number;
  salario: number;
  linhas: LancEdit[];
}): Promise<{ linhas: LancEdit[]; aplicado: boolean; minutos: number }> {
  const { funcionarioId, ano, mes, salario, linhas } = params;
  const novas = [...linhas];

  const removerLinha = (codigo: string) => {
    const idx = novas.findIndex((linha) => linha.codigo === codigo);
    if (idx >= 0) novas.splice(idx, 1);
  };

  const setLinha = (codigo: string, descricao: string, qtde: number | null, provento: number, desconto = 0) => {
    const idx = novas.findIndex((linha) => linha.codigo === codigo);
    const linha: LancEdit = {
      _k: idx >= 0 ? novas[idx]._k : crypto.randomUUID(),
      id: idx >= 0 ? novas[idx].id : undefined,
      codigo,
      descricao,
      qtde,
      provento: roundAutoHolerite(provento),
      desconto: roundAutoHolerite(desconto),
      resultado: roundAutoHolerite(provento - desconto),
    };

    if (idx >= 0) novas[idx] = linha;
    else novas.push(linha);
  };

  const minutosDoSaldoInformativo = () => {
    const linhaPositiva = novas.find((linha) => linha.codigo === "28651");
    const linhaNegativa = novas.find((linha) => linha.codigo === "28652");

    const horasPositivas = Number(linhaPositiva?.resultado || linhaPositiva?.qtde || 0);
    const horasNegativas = Number(linhaNegativa?.resultado || linhaNegativa?.qtde || 0);

    if (horasPositivas > 0) return Math.round(horasPositivas * 60);
    if (horasNegativas < 0) return Math.round(horasNegativas * 60);
    if (horasNegativas > 0) return -Math.round(horasNegativas * 60);

    return 0;
  };

  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("justificativas_aplicadas")
    .select("quantidade_minutos,tipo:justificativas_tipos(codigo,nome)")
    .eq("funcionario_id", funcionarioId)
    .gte("data", ini)
    .lte("data", fim);

  if (error) {
    console.warn("[holerites] não foi possível carregar fechamento BH", error);
  }

  let minutosPagar = 0;
  let minutosDescontar = 0;

  for (const row of data ?? []) {
    const tipo = (row as { tipo?: { codigo?: string | null; nome?: string | null } }).tipo;
    const codigo = String(tipo?.codigo || "")
      .trim()
      .toUpperCase();
    const nome = String(tipo?.nome || "")
      .trim()
      .toUpperCase();
    const qtd = Math.max(0, Number((row as { quantidade_minutos?: number | null }).quantidade_minutos || 0));

    const ehPagar =
      codigo === "FECHAMENTO_BH_PAGAR" ||
      codigo === "FECHAMENTO_BANCO_PAGAR" ||
      codigo === "FECHAMENTO_BANCO_HORAS_PAGAR" ||
      (nome.includes("FECHAMENTO") && nome.includes("BANCO") && nome.includes("PAGAR")) ||
      (nome.includes("FECHAMENTO") && nome.includes("BH") && nome.includes("PAGAR"));

    const ehDescontar =
      codigo === "FECHAMENTO_BANCO_DESC" ||
      codigo === "FECHAMENTO_BH_DESC" ||
      codigo === "FECHAMENTO_BANCO_HORAS_DESC" ||
      (nome.includes("FECHAMENTO") && nome.includes("BANCO") && nome.includes("DESC")) ||
      (nome.includes("FECHAMENTO") && nome.includes("BH") && nome.includes("DESC"));

    if (ehPagar) minutosPagar += qtd;
    if (ehDescontar) minutosDescontar += qtd;
  }

  let minutosFechamento = minutosPagar > 0 ? minutosPagar : minutosDescontar > 0 ? -minutosDescontar : 0;

  // Plano B: se o cartão foi fechado/liberado, usa o saldo informativo do próprio holerite.
  if (minutosFechamento === 0) {
    const { data: cartaoFechado } = await supabase
      .from("cartoes_ponto")
      .select("status")
      .eq("funcionario_id", funcionarioId)
      .eq("ano_referencia", ano)
      .eq("mes_referencia", mes)
      .maybeSingle();

    const statusCartao = String((cartaoFechado as { status?: string } | null)?.status || "");
    if (statusCartao === "fechado" || statusCartao === "liberado") {
      minutosFechamento = minutosDoSaldoInformativo();
    }
  }

  const horas = roundAutoHolerite(Math.abs(minutosFechamento) / 60);
  const valorHora = salario > 0 ? salario / 220 : 0;

  if (minutosFechamento > 0) {
    // Fechamento positivo de banco de horas deve ser pago como hora extra 50%.
    const valorHe50 = roundAutoHolerite(horas * valorHora * 1.5);

    const linhaSalario = novas.find((linha) => linha.codigo === "00005");
    const diasSalario = Math.max(1, Number(linhaSalario?.qtde || 1));
    const dsrReflexo = calcularDsrProporcionalAutoHolerite(diasSalario);
    const valorDsrHe50 = roundAutoHolerite((valorHe50 / diasSalario) * dsrReflexo);

    setLinha("00090", "HORAS EXTRAS 50%", horas, valorHe50, 0);
    setLinha("00115", "DSR HORAS EXTRAS 50%", dsrReflexo, valorDsrHe50, 0);

    // Não usar FECHAMENTO BH como provento de hora normal, para evitar pagamento sem adicional.
    removerLinha("00120");
  } else if (minutosFechamento < 0) {
    // Fechamento negativo pode ser descontado como FECHAMENTO BH.
    const valorDesconto = roundAutoHolerite(horas * valorHora);
    setLinha("00120", "FECHAMENTO BH", horas, 0, valorDesconto);

    // Sem hora extra paga, não pode existir DSR de HE.
    removerLinha("00115");
  } else {
    removerLinha("00120");

    const he50 = novas.find((linha) => linha.codigo === "00090");
    if (!he50 || Number(he50.provento || 0) <= 0) removerLinha("00115");
  }

  // Recalcula o INSS depois de incluir HE/DSR/fechamento BH.
  const totalProventosRecalculado = novas.reduce((s, linha) => s + Number(linha.provento || 0), 0);
  const inssRecalculado = calcularInssAutoHolerite(totalProventosRecalculado);
  setLinha("07000", "INSS MES", 7.5, 0, inssRecalculado);

  return {
    linhas: novas,
    aplicado: minutosFechamento !== 0,
    minutos: minutosFechamento,
  };
}

async function adicionarValeTransporteAutomatico(params: {
  funcionarioId: string;
  ano: number;
  mes: number;
  linhas: LancEdit[];
}): Promise<{ linhas: LancEdit[]; aplicado: boolean; valor: number }> {
  const { funcionarioId, ano, mes, linhas } = params;
  const novas = [...linhas];

  const aplicarLinha = (codigo: string, descricao: string, qtde: number | null, provento: number, desconto: number) => {
    const idx = novas.findIndex((linha) => linha.codigo === codigo);

    if (desconto <= 0) {
      if (idx >= 0) novas.splice(idx, 1);
      return;
    }

    const linha: LancEdit = {
      _k: idx >= 0 ? novas[idx]._k : crypto.randomUUID(),
      id: idx >= 0 ? novas[idx].id : undefined,
      codigo,
      descricao,
      qtde,
      provento: roundAutoHolerite(provento),
      desconto: roundAutoHolerite(desconto),
      resultado: roundAutoHolerite(provento - desconto),
    };

    if (idx >= 0) novas[idx] = linha;
    else novas.push(linha);
  };

  const { data: funcionario } = await supabase.from("funcionarios").select("*").eq("id", funcionarioId).maybeSingle();

  const f = (funcionario || {}) as Record<string, unknown>;

  // Aceita vários nomes de campo, porque os projetos anteriores usaram nomes diferentes.
  const usaValeTransporte =
    f.vale_transporte === true ||
    f.usa_vale_transporte === true ||
    f.utiliza_vale_transporte === true ||
    f.vt_ativo === true ||
    Number(f.vale_transporte_mensal || 0) > 0 ||
    Number(f.vt_concedido || 0) > 0 ||
    Number(f.valor_vale_transporte || 0) > 0 ||
    Number(f.vale_transporte_valor || 0) > 0;

  if (!usaValeTransporte) {
    aplicarLinha("07030", "VALE TRANSPORTE", null, 0, 0);
    return { linhas: novas, aplicado: false, valor: 0 };
  }

  // Base legal do desconto: até 6% sobre o salário base/proporcional do holerite,
  // sem incluir horas extras, adicional noturno ou DSR.
  const linhaSalario = novas.find((linha) => linha.codigo === "00005");
  const salarioProporcional = Number(linhaSalario?.provento || 0);
  const tetoSeisPorCento = roundAutoHolerite(salarioProporcional * 0.06);

  // Custo real informado no cadastro/benefício. Se não houver custo cadastrado,
  // usa o teto de 6%, que é o caso esperado no exemplo da Thayssa: 6% de 120 = 7,20.
  const valorVtMensal = Number(f.vale_transporte_mensal || 0);

  const custoRealTransporte = Math.max(
    0,
    valorVtMensal > 1 ? valorVtMensal : 0,
    Number(f.vt_concedido || 0),
    Number(f.valor_vale_transporte || 0),
    Number(f.vale_transporte_valor || 0),
  );

  // Se o cadastro só marcou "Sim" usando vale_transporte_mensal = 1,
  // aplica o teto legal de 6% sobre o salário proporcional.
  // Se houver custo real maior que zero e menor que o teto, usa o custo real.
  const desconto =
    custoRealTransporte > 0 ? Math.min(tetoSeisPorCento, roundAutoHolerite(custoRealTransporte)) : tetoSeisPorCento;

  aplicarLinha("07030", "VALE TRANSPORTE", desconto > 0 ? 6 : null, 0, desconto);

  return { linhas: novas, aplicado: desconto > 0, valor: desconto };
}

async function adicionarRubricasNoturnoDsrObrigatorias(params: {
  funcionarioId: string;
  ano: number;
  mes: number;
  salario: number;
  linhas: LancEdit[];
}): Promise<{ linhas: LancEdit[]; resumo: string }> {
  const { funcionarioId, ano, mes, salario, linhas } = params;
  const novas = [...linhas];

  const aplicarLinhaObrigatoria = (
    codigo: string,
    descricao: string,
    qtde: number | null,
    provento: number,
    desconto = 0,
  ) => {
    const idx = novas.findIndex((linha) => linha.codigo === codigo);

    const valorProvento = roundAutoHolerite(provento);
    const valorDesconto = roundAutoHolerite(desconto);

    const linha: LancEdit = {
      _k: idx >= 0 ? novas[idx]._k : crypto.randomUUID(),
      id: idx >= 0 ? novas[idx].id : undefined,
      codigo,
      descricao,
      qtde,
      provento: valorProvento,
      desconto: valorDesconto,
      resultado: roundAutoHolerite(valorProvento - valorDesconto),
    };

    if (idx >= 0) novas[idx] = linha;
    else novas.push(linha);
  };

  const valorHora = salario > 0 ? salario / 220 : 0;

  const linhaHE50 = novas.find((linha) => linha.codigo === "00090");
  const valorHorasExtras50 = Number(linhaHE50?.provento || 0);
  const horasExtras = valorHorasExtras50 > 0 ? Number(linhaHE50?.qtde || 0) : 0;

  const linhaSalario = novas.find((linha) => linha.codigo === "00005");
  const diasSalario = Number(linhaSalario?.qtde || 0);

  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const { data: registros, error } = await supabase
    .from("registros_ponto")
    .select("data_referencia,tipo_ponto,horario_registrado")
    .eq("funcionario_id", funcionarioId)
    .gte("data_referencia", ini)
    .lte("data_referencia", fim);

  const porDia = new Map<string, Record<string, string | null>>();

  if (!error) {
    for (const r of registros ?? []) {
      const data = String(r.data_referencia);
      const atual = porDia.get(data) ?? {
        entrada: null,
        saida_intervalo: null,
        retorno_intervalo: null,
        saida_final: null,
      };

      const dataRegistro = new Date(String(r.horario_registrado));
      const hhmm = `${String(dataRegistro.getHours()).padStart(2, "0")}:${String(dataRegistro.getMinutes()).padStart(2, "0")}`;
      const tipo = normalizarTipoPontoHolerite(String(r.tipo_ponto));

      if (tipo === "entrada" || tipo === "saida_intervalo" || tipo === "retorno_intervalo" || tipo === "saida_final") {
        atual[tipo] = hhmm;
      }

      porDia.set(data, atual);
    }
  }

  let minutosNoturnos = 0;

  for (const reg of porDia.values()) {
    if (!reg.entrada || !reg.saida_final) continue;

    if (reg.saida_intervalo && reg.retorno_intervalo) {
      minutosNoturnos += minutosNoturnosAutoHolerite(reg.entrada, reg.saida_intervalo);
      minutosNoturnos += minutosNoturnosAutoHolerite(reg.retorno_intervalo, reg.saida_final);
    } else {
      minutosNoturnos += minutosNoturnosAutoHolerite(reg.entrada, reg.saida_final);
    }
  }

  const horasNoturnasReduzidas = minutosNoturnos / 52.5;
  const valorAdicionalNoturno = roundAutoHolerite(valorHora * 0.2 * horasNoturnasReduzidas);

  const diasTrabalhados = Math.max(1, porDia.size || diasSalario || 1);
  const dsrReflexo = calcularDsrProporcionalAutoHolerite(diasTrabalhados);

  const valorDsrHe50 = roundAutoHolerite(horasExtras > 0 ? (valorHorasExtras50 / diasTrabalhados) * dsrReflexo : 0);

  const valorDsrAdicionalNoturno = roundAutoHolerite(
    valorAdicionalNoturno > 0 ? (valorAdicionalNoturno / diasTrabalhados) * dsrReflexo : 0,
  );

  aplicarLinhaObrigatoria(
    "00070",
    "ADICIONAL NOTURNO",
    roundAutoHolerite(horasNoturnasReduzidas),
    valorAdicionalNoturno,
  );
  aplicarLinhaObrigatoria("00075", "DSR SOBRE ADICIONAL NOTURNO", dsrReflexo, valorDsrAdicionalNoturno);
  const idxDsrHe = novas.findIndex((linha) => linha.codigo === "00115");
  if (valorDsrHe50 > 0) {
    aplicarLinhaObrigatoria("00115", "DSR HORAS EXTRAS 50%", dsrReflexo, valorDsrHe50);
  } else if (idxDsrHe >= 0) {
    novas.splice(idxDsrHe, 1);
  }

  // Recalcula o INSS depois de inserir adicional noturno e DSR.
  // Para esse caso de base baixa, usa a faixa de 7,5%; para bases maiores,
  // respeita a tabela progressiva configurada no próprio sistema.
  const totalProventosRecalculado = novas.reduce((s, l) => s + Number(l.provento || 0), 0);
  const inssRecalculado = calcularInssAutoHolerite(totalProventosRecalculado);
  aplicarLinhaObrigatoria("07000", "INSS MES", null, 0, inssRecalculado);

  return {
    linhas: novas,
    resumo: `00070=${valorAdicionalNoturno.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | 00075=${valorDsrAdicionalNoturno.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | 00115=${valorDsrHe50.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | INSS=${inssRecalculado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  };
}

const descricaoPadraoRubricaHolerite = (codigo: string) => {
  if (codigo === "09990") return "INSUFICIENCIA DE SALDO";
  if (codigo === "09995") return "COMP INSUF MES ANTERIOR";
  return "";
};

const sincronizarDescricoesRubricasHolerite = (
  linhas: LancEdit[],
  rubricas: Array<{ codigo: string; descricao: string }>,
) => {
  const porCodigo = new Map(rubricas.map((r) => [r.codigo, r.descricao]));

  return linhas.map((linha) => {
    const descricaoAtualizada = porCodigo.get(linha.codigo) || descricaoPadraoRubricaHolerite(linha.codigo);
    return descricaoAtualizada ? { ...linha, descricao: descricaoAtualizada } : linha;
  });
};

const aplicarInsuficienciaSaldoHolerite = (linhas: LancEdit[]) => {
  const semInsuf = linhas.filter((linha) => linha.codigo !== "09990");

  const totalProventos = semInsuf.reduce((s, linha) => s + Number(linha.provento || 0), 0);
  const totalDescontos = semInsuf.reduce((s, linha) => s + Number(linha.desconto || 0), 0);
  const insuficiencia = roundAutoHolerite(Math.max(0, totalDescontos - totalProventos));

  if (insuficiencia <= 0) return semInsuf;

  return [
    ...semInsuf,
    {
      _k: crypto.randomUUID(),
      codigo: "09990",
      descricao: "INSUFICIENCIA DE SALDO",
      qtde: null,
      provento: 0,
      desconto: 0,
      resultado: insuficiencia,
    },
  ];
};

const aplicarCompInsufMesAnteriorHolerite = async (params: {
  empresaId: string;
  funcionarioId: string;
  ano: number;
  mes: number;
  linhas: LancEdit[];
}) => {
  const { empresaId, funcionarioId, ano, mes, linhas } = params;
  const novas = linhas.filter((linha) => linha.codigo !== "09995");

  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoAnterior = mes === 1 ? ano - 1 : ano;

  const { data: holeriteAnterior } = await supabase
    .from("holerites")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("funcionario_id", funcionarioId)
    .eq("ano_referencia", anoAnterior)
    .eq("mes_referencia", mesAnterior)
    .eq("folha_tipo", "MENSAL")
    .maybeSingle();

  if (!holeriteAnterior?.id) return novas;

  const { data: lancamentosAnterior } = await supabase
    .from("holerite_lancamentos")
    .select("codigo,resultado")
    .eq("holerite_id", holeriteAnterior.id);

  const valorInsufAnterior = roundAutoHolerite(
    Math.max(
      0,
      ...(lancamentosAnterior ?? [])
        .filter((linha) => linha.codigo === "09990")
        .map((linha) => Math.abs(Number(linha.resultado || 0))),
    ),
  );

  if (valorInsufAnterior <= 0) return novas;

  return [
    ...novas,
    {
      _k: crypto.randomUUID(),
      codigo: "09995",
      descricao: "COMP INSUF MES ANTERIOR",
      qtde: 1,
      provento: 0,
      desconto: valorInsufAnterior,
      resultado: -valorInsufAnterior,
    },
  ];
};

const formatHorasDecimais = (v: number | null | undefined) => {
  if (v == null) return "";
  const sinal = Number(v) < 0 ? "-" : "";
  const totalMinutos = Math.round(Math.abs(Number(v)) * 60);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${sinal}${horas}h${String(minutos).padStart(2, "0")}`;
};

const formatResultado = (l: LancEdit) => {
  if (l.codigo === "09998") return formatHorasDecimais(Number(l.resultado || 0));
  if (l.codigo === "09990") {
    const valor = Math.abs(Number(l.resultado || 0));
    return valor > 0 ? valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
  }
  if (l.resultado == null || Number(l.resultado) === 0) return "";
  if (["18445", "28651", "28652"].includes(l.codigo)) return formatHorasDecimais(l.resultado);
  return Number(l.resultado).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
};

function EditorDialog({
  empresaId,
  holeriteId,
  funcs,
  defaultMes,
  defaultAno,
  onClose,
  onSaved,
}: {
  empresaId: string;
  holeriteId: string | null;
  funcs: Func[];
  defaultMes: number;
  defaultAno: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [funcId, setFuncId] = useState("");
  const [mes, setMes] = useState(defaultMes);
  const [ano, setAno] = useState(defaultAno);
  const [folhaTipo, setFolhaTipo] = useState("MENSAL");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [dataPagamento, setDataPagamento] = useState("");
  const [dataPagamentoTocada, setDataPagamentoTocada] = useState(false);
  const [bancoAg, setBancoAg] = useState("");
  const [conta, setConta] = useState("");
  const [numDepIrrf, setNumDepIrrf] = useState(0);
  const [numDepSalFam, setNumDepSalFam] = useState(0);
  const [salarioContratual, setSalarioContratual] = useState(0);
  const [salContribInss, setSalContribInss] = useState(0);
  const [baseFgts, setBaseFgts] = useState(0);
  const [fgtsMes, setFgtsMes] = useState(0);
  const [baseIrpf, setBaseIrpf] = useState(0);
  const [lotacao, setLotacao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [liberarJa, setLiberarJa] = useState(false);
  const [lancamentos, setLancamentos] = useState<LancEdit[]>([
    { _k: crypto.randomUUID(), codigo: "", descricao: "", qtde: null, provento: 0, desconto: 0, resultado: 0 },
  ]);
  const [salvando, setSalvando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [rubricas, setRubricas] = useState<
    Array<{
      id: string;
      codigo: string;
      descricao: string;
      tipo: "provento" | "desconto" | "informativo" | "resultado";
      tipo_calculo: TipoCalculo;
      valor_referencia: number;
      entra_liquido?: boolean;
    }>
  >([]);

  useEffect(() => {
    void supabase
      .from("holerite_rubricas")
      .select("id,codigo,descricao,tipo,tipo_calculo,valor_referencia,entra_liquido")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("codigo")
      .then(({ data }) => setRubricas((data ?? []) as typeof rubricas));
    // eslint-disable-next-line
  }, [empresaId]);

  const aplicarRubrica = async (k: string, rubricaId: string) => {
    const r = rubricas.find((x) => x.id === rubricaId);
    if (!r) return;
    const f = funcs.find((x) => x.id === funcId);
    const salario = Number(f?.salario ?? salarioContratual ?? 0);
    const calc = await calcularRubrica(r.tipo, r.tipo_calculo, Number(r.valor_referencia), {
      salario,
      funcionarioId: funcId,
      ano,
      mes,
    });
    updLinha(k, {
      codigo: r.codigo,
      descricao: r.descricao,
      qtde: calc.qtde,
      provento: calc.provento,
      desconto: calc.desconto,
      resultado: calc.resultado,
    });
  };

  // Carregar para edição
  useEffect(() => {
    if (!holeriteId) {
      const ult = new Date(ano, mes, 0).getDate();
      setPeriodoInicio(`${ano}-${String(mes).padStart(2, "0")}-01`);
      setPeriodoFim(`${ano}-${String(mes).padStart(2, "0")}-${String(ult).padStart(2, "0")}`);
      return;
    }
    void (async () => {
      const { data: h } = await supabase.from("holerites").select("*").eq("id", holeriteId).maybeSingle();
      if (!h) return;
      setFuncId(h.funcionario_id);
      setMes(h.mes_referencia);
      setAno(h.ano_referencia);
      setFolhaTipo(h.folha_tipo ?? "MENSAL");
      setPeriodoInicio(h.periodo_inicio ?? "");
      setPeriodoFim(h.periodo_fim ?? "");
      setDataPagamento(h.data_pagamento ?? "");
      setDataPagamentoTocada(!!h.data_pagamento);
      setBancoAg(h.banco_agencia ?? "");
      setConta(h.conta ?? "");
      setNumDepIrrf(h.num_dep_irrf ?? 0);
      setNumDepSalFam(h.num_dep_sal_fam ?? 0);
      setSalarioContratual(Number(h.salario_contratual ?? 0));
      setSalContribInss(Number(h.sal_contrib_inss ?? 0));
      setBaseFgts(Number(h.base_fgts ?? 0));
      setFgtsMes(Number(h.fgts_mes ?? 0));
      setBaseIrpf(Number(h.base_irpf ?? 0));
      setLotacao(h.lotacao ?? "");
      setObservacoes(h.observacoes ?? "");
      setLiberarJa(h.liberado);
      const { data: ls } = await supabase
        .from("holerite_lancamentos")
        .select("*")
        .eq("holerite_id", holeriteId)
        .order("ordem");
      setLancamentos(
        ordenarLancamentosHolerite(
          sincronizarDescricoesRubricasHolerite(
            (ls ?? []).map((l) => {
              const provento = Number(l.provento ?? 0);
              const desconto = Number(l.desconto ?? 0);
              const resultado = Number(l.resultado ?? 0);
              const qtde = l.qtde != null ? Number(l.qtde) : null;
              const legadoSaldoEmFerias =
                l.codigo === "09000" && provento === 0 && desconto === 0 && Number(resultado || qtde || 0) > 0;
              const legadoInsufMesAnteriorEmFerias =
                l.codigo === "09005" && provento === 0 && (desconto > 0 || resultado < 0);
              return {
                _k: l.id,
                id: l.id,
                codigo: legadoSaldoEmFerias ? "09990" : legadoInsufMesAnteriorEmFerias ? "09995" : l.codigo,
                descricao: legadoSaldoEmFerias
                  ? "INSUFICIENCIA DE SALDO"
                  : legadoInsufMesAnteriorEmFerias
                    ? "INSUF MES ANTERIOR"
                    : l.descricao,
                qtde,
                provento,
                desconto,
                resultado,
              };
            }),
            rubricas,
          ),
        ),
      );
    })();
    // eslint-disable-next-line
  }, [holeriteId]);

  // Auto-preenche dados do funcionário ao selecionar (apenas em novo)
  useEffect(() => {
    if (holeriteId) return;
    const f = funcs.find((x) => x.id === funcId);
    if (!f) return;
    setSalarioContratual(Number(f.salario ?? 0));
    setBancoAg(f.banco_agencia ?? "");
    setConta(f.conta ?? "");
    setLotacao(f.lotacao ?? "");
    setNumDepIrrf(Number(f.num_dep_irrf ?? 0));
    setNumDepSalFam(Number(f.num_dep_sal_fam ?? 0));
  }, [funcId, funcs, holeriteId]);

  // Atualiza Período de Pagamento ao trocar mês/ano
  useEffect(() => {
    const ult = new Date(ano, mes, 0).getDate();
    setPeriodoInicio(`${ano}-${String(mes).padStart(2, "0")}-01`);
    setPeriodoFim(`${ano}-${String(mes).padStart(2, "0")}-${String(ult).padStart(2, "0")}`);
    // Default: dia 05 do mês seguinte (apenas se usuário ainda não escolheu manualmente)
    if (!dataPagamentoTocada) {
      const proxMes = mes === 12 ? 1 : mes + 1;
      const proxAno = mes === 12 ? ano + 1 : ano;
      setDataPagamento(`${proxAno}-${String(proxMes).padStart(2, "0")}-05`);
    }
  }, [mes, ano, dataPagamentoTocada]);

  const rubricaPorCodigo = useMemo(() => new Map(rubricas.map((r) => [r.codigo, r])), [rubricas]);

  useEffect(() => {
    if (rubricas.length === 0) return;
    setLancamentos((prev) => sincronizarDescricoesRubricasHolerite(prev, rubricas));
  }, [rubricas]);

  const entraNoLiquido = (l: LancEdit) => {
    if (l.codigo === "09990") return false;
    if (l.codigo === "09995") return true;
    const r = rubricaPorCodigo.get(l.codigo);
    return !(r && (r.tipo === "informativo" || r.entra_liquido === false));
  };
  const totalProv = useMemo(
    () => lancamentos.reduce((s, l) => (entraNoLiquido(l) ? s + Number(l.provento || 0) : s), 0),
    [lancamentos, rubricaPorCodigo],
  );
  const totalDesc = useMemo(
    () => lancamentos.reduce((s, l) => (entraNoLiquido(l) ? s + Number(l.desconto || 0) : s), 0),
    [lancamentos, rubricaPorCodigo],
  );
  const totalLiq = Math.max(0, totalProv - totalDesc);

  const addLinha = () =>
    setLancamentos((prev) => [
      ...prev,
      { _k: crypto.randomUUID(), codigo: "", descricao: "", qtde: null, provento: 0, desconto: 0, resultado: 0 },
    ]);
  const removerLinha = (k: string) => setLancamentos((prev) => prev.filter((l) => l._k !== k));
  const updLinha = (k: string, patch: Partial<LancEdit>) =>
    setLancamentos((prev) => prev.map((l) => (l._k === k ? { ...l, ...patch } : l)));

  const salvar = async () => {
    if (!funcId) {
      toast.error("Selecione o funcionário");
      return;
    }

    setSalvando(true);
    try {
      let f = funcs.find((x) => x.id === funcId) ?? null;

      // Correção: em alguns casos o funcionário não está na lista local
      // por filtro de status ou tela aberta em edição. Antes o sistema dava
      // return silencioso e parecia que o botão não fazia nada.
      if (!f) {
        const { data: funcionarioBanco, error: funcionarioErro } = await supabase
          .from("funcionarios")
          .select(
            "id,nome,cargo,cpf,rg,endereco,data_admissao,salario,banco_agencia,conta,lotacao,num_dep_irrf,num_dep_sal_fam,matricula",
          )
          .eq("id", funcId)
          .maybeSingle();

        if (funcionarioErro) throw funcionarioErro;

        if (!funcionarioBanco) {
          toast.error("Funcionário não encontrado. Atualize a página e tente novamente.");
          return;
        }

        f = funcionarioBanco as Func;
      }
      const { data: emp } = await supabase
        .from("empresas")
        .select("nome_fantasia,razao_social,cnpj,endereco,logo_url")
        .eq("id", empresaId)
        .maybeSingle();
      const logoDataUrl =
        (await carregarLogoComoDataUrl(turboLogoHolerite)) ?? (await carregarLogoComoDataUrl(emp?.logo_url ?? null));

      const now = new Date().toISOString();
      const { data: u } = await supabase.auth.getUser();

      // Monta a versão final das linhas ANTES de salvar.
      // Isso garante que PDF, totais da lista e lançamentos salvos fiquem iguais à tela atual.
      const linhas = ordenarLancamentosHolerite(
        sincronizarDescricoesRubricasHolerite(
          aplicarInsuficienciaSaldoHolerite(lancamentos.filter((l) => l.codigo.trim() || l.descricao.trim())),
          rubricas,
        ),
      );

      const entraNoLiquidoLinhaFinal = (l: LancEdit) => {
        if (l.codigo === "09990") return false;
        if (l.codigo === "09995") return true;
        const r = rubricaPorCodigo.get(l.codigo);
        return !(r && (r.tipo === "informativo" || r.entra_liquido === false));
      };

      const totalProvFinal = linhas.reduce(
        (s, l) => (entraNoLiquidoLinhaFinal(l) ? s + Number(l.provento || 0) : s),
        0,
      );
      const totalDescFinal = linhas.reduce(
        (s, l) => (entraNoLiquidoLinhaFinal(l) ? s + Number(l.desconto || 0) : s),
        0,
      );
      const totalLiqFinal = Math.max(0, totalProvFinal - totalDescFinal);

      // Upsert holerite (sem PDF ainda)
      const payload = {
        empresa_id: empresaId,
        funcionario_id: funcId,
        mes_referencia: mes,
        ano_referencia: ano,
        folha_tipo: folhaTipo,
        periodo_inicio: periodoInicio || null,
        periodo_fim: periodoFim || null,
        data_pagamento: dataPagamento || null,
        banco_agencia: bancoAg || null,
        conta: conta || null,
        num_dep_irrf: numDepIrrf,
        num_dep_sal_fam: numDepSalFam,
        salario_contratual: salarioContratual,
        total_proventos: totalProvFinal,
        total_descontos: totalDescFinal,
        total_liquido: totalLiqFinal,
        sal_contrib_inss: salContribInss,
        base_fgts: baseFgts,
        fgts_mes: fgtsMes,
        base_irpf: baseIrpf,
        lotacao: lotacao || null,
        observacoes: observacoes || null,
        liberado: liberarJa,
        status: liberarJa ? "liberado" : "pendente",
        liberado_em: liberarJa ? now : null,
        liberado_por: liberarJa ? u.user?.id : null,
      };

      let hid = holeriteId;
      if (hid) {
        const { error } = await supabase.from("holerites").update(payload).eq("id", hid);
        if (error) throw error;
        const { error: delErr } = await supabase.from("holerite_lancamentos").delete().eq("holerite_id", hid);
        if (delErr) throw delErr;
      } else {
        const { data: ins, error } = await supabase
          .from("holerites")
          .upsert(payload, {
            onConflict: "funcionario_id,mes_referencia,ano_referencia,folha_tipo",
          })
          .select("id")
          .maybeSingle();
        if (error) throw error;
        hid = ins?.id ?? null;
        if (hid) {
          const { error: delErr } = await supabase.from("holerite_lancamentos").delete().eq("holerite_id", hid);
          if (delErr) throw delErr;
        }
      }
      if (!hid) throw new Error("Falha ao criar holerite");

      if (linhas.length > 0) {
        const { error } = await supabase.from("holerite_lancamentos").insert(
          linhas.map((l, i) => ({
            holerite_id: hid!,
            empresa_id: empresaId,
            ordem: i,
            codigo: l.codigo,
            descricao: l.descricao,
            qtde: l.qtde,
            provento: l.provento ?? 0,
            desconto: l.desconto ?? 0,
            resultado: l.resultado ?? 0,
          })),
        );
        if (error) throw error;
      }

      // Gerar e subir PDF
      const doc = gerarHoleritePdf(
        {
          nome_fantasia: emp?.nome_fantasia ?? "",
          razao_social: emp?.razao_social,
          cnpj: emp?.cnpj,
          endereco: emp?.endereco,
          logoDataUrl,
        },
        {
          nome: f.nome,
          cpf: f.cpf,
          rg: f.rg,
          endereco: f.endereco,
          cargo: f.cargo,
          data_admissao: f.data_admissao,
          matricula: f.matricula,
        },
        {
          folha_tipo: folhaTipo,
          mes_referencia: mes,
          ano_referencia: ano,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          data_pagamento: dataPagamento,
          banco_agencia: bancoAg,
          conta,
          num_dep_irrf: numDepIrrf,
          num_dep_sal_fam: numDepSalFam,
          salario_contratual: salarioContratual,
          total_proventos: totalProvFinal,
          total_descontos: totalDescFinal,
          total_liquido: totalLiqFinal,
          sal_contrib_inss: salContribInss,
          base_fgts: baseFgts,
          fgts_mes: fgtsMes,
          base_irpf: baseIrpf,
          lotacao,
          observacoes,
        },
        linhas,
      );
      const blob = doc.output("blob");

      // Caminho único a cada geração: evita baixar PDF antigo por cache do Storage/navegador.
      const pdfVersion = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, 14);
      const path = `${empresaId}/${funcId}/${ano}-${String(mes).padStart(2, "0")}-${folhaTipo}-${pdfVersion}.pdf`;

      const { error: upErr } = await supabase.storage.from("holerites").upload(path, blob, {
        upsert: false,
        contentType: "application/pdf",
        cacheControl: "0",
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("holerites").getPublicUrl(path);
      const pdfUrlAtualizado = `${pub.publicUrl}?v=${pdfVersion}`;

      const { error: pdfUpdateErr } = await supabase
        .from("holerites")
        .update({
          pdf_url: pdfUrlAtualizado,
          total_proventos: totalProvFinal,
          total_descontos: totalDescFinal,
          total_liquido: totalLiqFinal,
        })
        .eq("id", hid);

      if (pdfUpdateErr) throw pdfUpdateErr;

      toast.success("Holerite salvo e PDF atualizado");
      onSaved();
    } catch (e: unknown) {
      console.error("[holerites] erro ao salvar/gerar PDF", e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar e gerar PDF");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{holeriteId ? "Editar holerite" : "Novo holerite"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fld label="Funcionário">
              <Select value={funcId} onValueChange={setFuncId} disabled={!!holeriteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {funcs.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Fld>
            <Fld label="Tipo de folha">
              <Select value={folhaTipo} onValueChange={setFolhaTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MENSAL">Mensal</SelectItem>
                  <SelectItem value="ADIANTAMENTO">Adiantamento</SelectItem>
                  <SelectItem value="13_SALARIO">13º Salário</SelectItem>
                  <SelectItem value="FERIAS">Férias</SelectItem>
                  <SelectItem value="RESCISAO">Rescisão</SelectItem>
                </SelectContent>
              </Select>
            </Fld>
            <Fld label="Mês">
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {mesNome(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Fld>
            <Fld label="Ano">
              <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
            </Fld>
            <Fld label="Período início">
              <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
            </Fld>
            <Fld label="Período fim">
              <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
            </Fld>
            <Fld label="Data de pagamento">
              <Input
                type="date"
                value={dataPagamento}
                onChange={(e) => {
                  setDataPagamento(e.target.value);
                  setDataPagamentoTocada(true);
                }}
              />
            </Fld>
            <Fld label="Salário contratual">
              <Input
                type="number"
                step="0.01"
                value={salarioContratual}
                onChange={(e) => setSalarioContratual(Number(e.target.value))}
              />
            </Fld>
            <Fld label="Banco / Agência">
              <Input value={bancoAg} onChange={(e) => setBancoAg(e.target.value)} placeholder="237/02402" />
            </Fld>
            <Fld label="Conta">
              <Input value={conta} onChange={(e) => setConta(e.target.value)} />
            </Fld>
            <Fld label="Nº Dep. IRRF">
              <Input type="number" value={numDepIrrf} onChange={(e) => setNumDepIrrf(Number(e.target.value))} />
            </Fld>
            <Fld label="Nº Dep. Sal. Fam.">
              <Input type="number" value={numDepSalFam} onChange={(e) => setNumDepSalFam(Number(e.target.value))} />
            </Fld>
            <div className="col-span-2 sm:col-span-4">
              <Fld label="Lotação">
                <Input
                  value={lotacao}
                  onChange={(e) => setLotacao(e.target.value)}
                  placeholder="Ex.: 5001000105 - FABRIL - ANAPOLIS-GO"
                />
              </Fld>
            </div>
          </div>

          <div className="border rounded-md">
            <div className="flex items-center justify-between p-3 border-b gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">Lançamentos</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={recalculando}
                  onClick={async () => {
                    if (!funcId) return toast.error("Selecione o funcionário");
                    setRecalculando(true);
                    try {
                      const out = await engineRecalcular(
                        { empresaId, funcionarioId: funcId, ano, mes },
                        lancamentos.map((l) => ({
                          ...l,
                          qtde: l.qtde ?? null,
                          provento: l.provento ?? 0,
                          desconto: l.desconto ?? 0,
                          resultado: l.resultado ?? 0,
                        })),
                      );

                      const linhasBase = out.linhas.map((l) => ({
                        _k: l._k,
                        id: l.id,
                        codigo: l.codigo,
                        descricao: l.descricao,
                        qtde: l.qtde,
                        provento: l.provento,
                        desconto: l.desconto,
                        resultado: l.resultado,
                      }));

                      const funcionarioAtual = funcs.find((f) => f.id === funcId);
                      const rubricasObrigatorias = await adicionarRubricasNoturnoDsrObrigatorias({
                        funcionarioId: funcId,
                        ano,
                        mes,
                        salario: Number(funcionarioAtual?.salario ?? salarioContratual ?? 0),
                        linhas: linhasBase,
                      });

                      const linhasComValeTransporte = await adicionarValeTransporteAutomatico({
                        funcionarioId: funcId,
                        ano,
                        mes,
                        linhas: rubricasObrigatorias.linhas,
                      });

                      const fechamentoBancoHoras = await adicionarFechamentoBancoHorasHolerite({
                        funcionarioId: funcId,
                        ano,
                        mes,
                        salario: Number(funcionarioAtual?.salario ?? salarioContratual ?? 0),
                        linhas: linhasComValeTransporte.linhas,
                      });

                      const linhasComCompInsufAnterior = await aplicarCompInsufMesAnteriorHolerite({
                        empresaId,
                        funcionarioId: funcId,
                        ano,
                        mes,
                        linhas: fechamentoBancoHoras.linhas,
                      });

                      const linhasComInsuficiencia = aplicarInsuficienciaSaldoHolerite(linhasComCompInsufAnterior);
                      const linhasComDescricoesAtuais = sincronizarDescricoesRubricasHolerite(
                        linhasComInsuficiencia,
                        rubricas,
                      );
                      const linhasOrdenadas = ordenarLancamentosHolerite(linhasComDescricoesAtuais);

                      setLancamentos(linhasOrdenadas);

                      const totalProventos = linhasOrdenadas.reduce((s, l) => s + Number(l.provento || 0), 0);
                      const descontoInss = Number(linhasOrdenadas.find((l) => l.codigo === "07000")?.desconto || 0);

                      setSalContribInss(roundAutoHolerite(totalProventos));
                      setBaseFgts(roundAutoHolerite(totalProventos));
                      setFgtsMes(roundAutoHolerite(totalProventos * 0.08));
                      setBaseIrpf(roundAutoHolerite(Math.max(0, totalProventos - descontoInss)));

                      toast.success(
                        fechamentoBancoHoras.aplicado ? "Holerite calculado com fechamento BH" : "Holerite calculado",
                      );
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : "Erro ao recalcular");
                    } finally {
                      setRecalculando(false);
                    }
                  }}
                >
                  {recalculando ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Calculando...
                    </>
                  ) : (
                    "Calcular holerite"
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={addLinha}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar linha
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase">
                  <tr>
                    <th className="p-1 text-left w-40">Rubrica</th>
                    <th className="p-1 text-left w-20">Código</th>
                    <th className="p-1 text-left">Descrição</th>
                    <th className="p-1 text-right w-20">Qtde</th>
                    <th className="p-1 text-right w-24">Provento</th>
                    <th className="p-1 text-right w-24">Desconto</th>
                    <th className="p-1 text-right w-24">Resultado</th>
                    <th className="p-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => (
                    <tr key={l._k} className="border-t">
                      <td className="p-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-full justify-between text-xs font-normal"
                            >
                              <span className="truncate">
                                {l.codigo ? `${l.codigo} · ${l.descricao}` : "Selecionar..."}
                              </span>
                              <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0 w-[360px]" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar por código ou descrição..." />
                              <CommandList>
                                <CommandEmpty>Nenhuma rubrica encontrada.</CommandEmpty>
                                <CommandGroup>
                                  {rubricas.map((r) => (
                                    <CommandItem
                                      key={r.id}
                                      value={`${r.codigo} ${r.descricao}`}
                                      onSelect={() => void aplicarRubrica(l._k, r.id)}
                                    >
                                      <span className="font-mono mr-2">{r.codigo}</span>
                                      <span className="truncate flex-1">{r.descricao}</span>
                                      <span className="text-[10px] uppercase ml-2 opacity-70">
                                        {r.tipo === "provento" ? "P" : "D"}
                                      </span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-7 text-xs"
                          value={l.codigo}
                          onChange={(e) => updLinha(l._k, { codigo: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-7 text-xs"
                          value={l.descricao}
                          onChange={(e) => updLinha(l._k, { descricao: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-7 text-xs text-right"
                          type="number"
                          step="0.01"
                          value={l.qtde ?? ""}
                          onChange={(e) =>
                            updLinha(l._k, { qtde: e.target.value === "" ? null : Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-7 text-xs text-right"
                          type="number"
                          step="0.01"
                          value={l.provento ?? 0}
                          onChange={(e) => updLinha(l._k, { provento: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          className="h-7 text-xs text-right"
                          type="number"
                          step="0.01"
                          value={l.desconto ?? 0}
                          onChange={(e) => updLinha(l._k, { desconto: Number(e.target.value) })}
                        />
                      </td>
                      <td className="p-1">
                        {!Number(l.provento || 0) && !Number(l.desconto || 0) ? (
                          <Input className="h-7 text-xs text-right" readOnly value={formatResultado(l)} />
                        ) : (
                          <div className="h-7" />
                        )}
                      </td>
                      <td className="p-1 text-center">
                        <Button size="sm" variant="ghost" onClick={() => removerLinha(l._k)}>
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-bold text-xs">
                  <tr>
                    <td colSpan={4} className="p-2 text-right">
                      Totais:
                    </td>
                    <td className="p-2 text-right font-mono">
                      {totalProv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {totalDesc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-mono text-base bg-primary/10 text-foreground">
                      {Number(totalLiq || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fld label="Sal. contrib. INSS">
              <Input
                type="number"
                step="0.01"
                value={salContribInss}
                onChange={(e) => setSalContribInss(Number(e.target.value))}
              />
            </Fld>
            <Fld label="Base cal. FGTS">
              <Input type="number" step="0.01" value={baseFgts} onChange={(e) => setBaseFgts(Number(e.target.value))} />
            </Fld>
            <Fld label="FGTS mês">
              <Input type="number" step="0.01" value={fgtsMes} onChange={(e) => setFgtsMes(Number(e.target.value))} />
            </Fld>
            <Fld label="Base calc. IRPF">
              <Input type="number" step="0.01" value={baseIrpf} onChange={(e) => setBaseIrpf(Number(e.target.value))} />
            </Fld>
          </div>

          <Fld label="Observações">
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </Fld>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={liberarJa} onChange={(e) => setLiberarJa(e.target.checked)} />
            Liberar acesso ao funcionário imediatamente
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar e gerar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
