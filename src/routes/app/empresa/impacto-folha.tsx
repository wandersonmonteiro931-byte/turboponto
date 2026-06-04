import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pencil, Plus, Printer, Trash2, Wallet } from "lucide-react";

export const Route = createFileRoute("/app/empresa/impacto-folha")({
  component: ValePage,
});

type Funcionario = {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
};

type ValeLancamento = {
  id: string;
  empresa_id: string;
  funcionario_id: string;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  observacao: string | null;
  status: string;
  created_at: string;
  funcionarios?: {
    nome: string;
    matricula: string | null;
  } | null;
};

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));

const dataHoraBr = () =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

function chaveFolha(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function parseFolha(valor: string) {
  const [ano, mes] = valor.split("-").map(Number);
  return { ano, mes };
}

function gerarFolhasBase() {
  const hoje = new Date();
  const folhas: Array<{ ano: number; mes: number; label: string; value: string }> = [];

  for (let i = 0; i < 14; i++) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1;

    folhas.push({
      ano,
      mes,
      value: chaveFolha(ano, mes),
      label: `${MESES[mes - 1]}/${ano}`,
    });
  }

  return folhas;
}

function imprimirReciboVale(params: {
  funcionarioNome: string;
  matricula?: string | null;
  valor: number;
  ano: number;
  mes: number;
  observacao?: string | null;
}) {
  const popup = window.open("", "recibo_vale", "width=420,height=680");

  if (!popup) {
    toast.error("O navegador bloqueou a impressão. Permita pop-ups para imprimir o recibo.");
    return;
  }

  const folha = `${MESES[params.mes - 1]}/${params.ano}`;
  const observacao = params.observacao?.trim();

  popup.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recibo de Vale</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      width: 80mm;
      margin: 0;
      padding: 4mm;
      color: #000;
      font-family: "Courier New", monospace;
      font-size: 12px;
      line-height: 1.25;
    }
    .center { text-align: center; }
    .title {
      font-size: 18px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 2mm;
    }
    .sub {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .line {
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 2mm;
      margin: 1.5mm 0;
    }
    .label { font-weight: 700; }
    .value {
      text-align: right;
      font-weight: 700;
      word-break: break-word;
    }
    .amount {
      border: 2px solid #000;
      padding: 3mm 2mm;
      margin: 3mm 0;
      text-align: center;
      font-size: 22px;
      font-weight: 900;
    }
    .obs {
      border: 1px solid #000;
      padding: 2mm;
      margin-top: 2mm;
      min-height: 12mm;
      white-space: pre-wrap;
    }
    .signature {
      margin-top: 18mm;
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #000;
      margin-bottom: 1.5mm;
    }
    .small {
      font-size: 10px;
      text-align: center;
      margin-top: 3mm;
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">RECIBO DE VALE</div>
    <div class="sub">TURBO LANCHES</div>
  </div>

  <div class="line"></div>

  <div class="row">
    <span class="label">Data:</span>
    <span class="value">${dataHoraBr()}</span>
  </div>
  <div class="row">
    <span class="label">Funcionário:</span>
    <span class="value">${params.funcionarioNome}</span>
  </div>
  <div class="row">
    <span class="label">Matrícula:</span>
    <span class="value">${params.matricula || "-"}</span>
  </div>
  <div class="row">
    <span class="label">Folha desc.:</span>
    <span class="value">${folha}</span>
  </div>
  <div class="row">
    <span class="label">Rubrica:</span>
    <span class="value">07075</span>
  </div>

  <div class="amount">${moeda(params.valor)}</div>

  <div class="sub">Descrição</div>
  <div>
    Declaro que recebi o valor acima como vale/empréstimo interno e autorizo o desconto na folha indicada pela rubrica 07075 - VALE EMPREST INT.
  </div>

  ${observacao ? `<div class="sub" style="margin-top:3mm;">Observação</div><div class="obs">${observacao}</div>` : ""}

  <div class="signature">
    <div class="signature-line"></div>
    Assinatura do funcionário
  </div>

  <div class="small">Via do funcionário/empresa - impressão térmica 80mm</div>

  <script>
    window.onload = () => {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>
  `);

  popup.document.close();
}

function ValePage() {
  const { empresaId, role } = useAuth();
  const podeEditar = role === "admin" || role === "gerente";

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [vales, setVales] = useState<ValeLancamento[]>([]);
  const [fechamentos, setFechamentos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<ValeLancamento | null>(null);

  const hoje = new Date();
  const [filtroFuncionario, setFiltroFuncionario] = useState("todos");
  const [filtroFolha, setFiltroFolha] = useState(chaveFolha(hoje.getFullYear(), hoje.getMonth() + 1));

  const [form, setForm] = useState({
    funcionario_id: "",
    folha: chaveFolha(hoje.getFullYear(), hoje.getMonth() + 1),
    valor: "",
    observacao: "",
  });

  const folhasAbertas = useMemo(() => {
    const base = gerarFolhasBase();

    return base.filter((folha) => {
      const status = fechamentos[folha.value];
      return status !== "fechado" && status !== "liberado";
    });
  }, [fechamentos]);

  const totalFiltrado = useMemo(() => vales.reduce((s, item) => s + Number(item.valor || 0), 0), [vales]);

  const carregar = async () => {
    if (!empresaId) return;

    setLoading(true);

    const folhas = gerarFolhasBase();
    const menorAno = Math.min(...folhas.map((f) => f.ano));
    const maiorAno = Math.max(...folhas.map((f) => f.ano));

    const [{ data: funcs, error: funcError }, { data: fechData, error: fechError }] = await Promise.all([
      supabase
        .from("funcionarios")
        .select("id,nome,matricula,cargo")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .order("nome"),
      supabase
        .from("fechamentos_mensais")
        .select("ano_referencia,mes_referencia,status")
        .eq("empresa_id", empresaId)
        .gte("ano_referencia", menorAno)
        .lte("ano_referencia", maiorAno),
    ]);

    if (funcError) toast.error(funcError.message);
    if (fechError) toast.error(fechError.message);

    setFuncionarios((funcs ?? []) as Funcionario[]);

    const mapaFechamentos: Record<string, string> = {};
    (fechData ?? []).forEach((f: any) => {
      mapaFechamentos[chaveFolha(Number(f.ano_referencia), Number(f.mes_referencia))] = String(f.status || "aberto");
    });
    setFechamentos(mapaFechamentos);

    let query = (supabase as any)
      .from("vales_funcionarios")
      .select(
        "id,empresa_id,funcionario_id,mes_referencia,ano_referencia,valor,observacao,status,created_at,funcionarios(nome,matricula)",
      )
      .eq("empresa_id", empresaId)
      .eq("status", "ativo")
      .order("ano_referencia", { ascending: false })
      .order("mes_referencia", { ascending: false })
      .order("created_at", { ascending: false });

    if (filtroFuncionario !== "todos") query = query.eq("funcionario_id", filtroFuncionario);

    if (filtroFolha !== "todos") {
      const { ano, mes } = parseFolha(filtroFolha);
      query = query.eq("ano_referencia", ano).eq("mes_referencia", mes);
    }

    const { data: valesData, error: valesError } = await query;

    if (valesError) toast.error(valesError.message);
    setVales((valesData ?? []) as ValeLancamento[]);

    setLoading(false);
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, filtroFuncionario, filtroFolha]);

  const abrirNovo = () => {
    setEditando(null);

    const folhaDefault = folhasAbertas.some((f) => f.value === filtroFolha)
      ? filtroFolha
      : (folhasAbertas[0]?.value ?? chaveFolha(hoje.getFullYear(), hoje.getMonth() + 1));

    setForm({
      funcionario_id: filtroFuncionario !== "todos" ? filtroFuncionario : "",
      folha: folhaDefault,
      valor: "",
      observacao: "",
    });

    setOpen(true);
  };

  const abrirEditar = (vale: ValeLancamento) => {
    setEditando(vale);
    setForm({
      funcionario_id: vale.funcionario_id,
      folha: chaveFolha(vale.ano_referencia, vale.mes_referencia),
      valor: String(Number(vale.valor || 0).toFixed(2)),
      observacao: vale.observacao ?? "",
    });
    setOpen(true);
  };

  const salvar = async () => {
    if (!empresaId) return;
    if (!podeEditar) return toast.error("Sem permissão para alterar vales.");
    if (!form.funcionario_id) return toast.error("Selecione o funcionário.");
    if (!form.folha) return toast.error("Selecione a folha para desconto.");

    const valor = Number(String(form.valor).replace(",", "."));

    if (!Number.isFinite(valor) || valor <= 0) {
      return toast.error("Digite um valor válido maior que zero.");
    }

    const { ano, mes } = parseFolha(form.folha);
    const statusFolha = fechamentos[chaveFolha(ano, mes)];

    if (statusFolha === "fechado" || statusFolha === "liberado") {
      return toast.error("Essa folha já foi fechada/liberada. Escolha uma folha em aberto.");
    }

    const payload = {
      empresa_id: empresaId,
      funcionario_id: form.funcionario_id,
      ano_referencia: ano,
      mes_referencia: mes,
      valor,
      observacao: form.observacao.trim() || null,
      status: "ativo",
    };

    const { data, error } = editando
      ? await (supabase as any)
          .from("vales_funcionarios")
          .update(payload)
          .eq("id", editando.id)
          .select("id")
          .maybeSingle()
      : await (supabase as any).from("vales_funcionarios").insert(payload).select("id").maybeSingle();

    if (error) {
      toast.error(error.message);
      return;
    }

    const funcionario = funcionarios.find((f) => f.id === form.funcionario_id);

    toast.success(editando ? "Vale atualizado." : "Vale adicionado.");
    setOpen(false);
    await carregar();

    imprimirReciboVale({
      funcionarioNome: funcionario?.nome ?? "Funcionário",
      matricula: funcionario?.matricula,
      valor,
      ano,
      mes,
      observacao: form.observacao,
    });
  };

  const remover = async (vale: ValeLancamento) => {
    if (!podeEditar) return toast.error("Sem permissão para remover vales.");

    const nome = vale.funcionarios?.nome ?? "funcionário";
    const ok = confirm(`Remover o vale de ${moeda(Number(vale.valor))} de ${nome}?`);

    if (!ok) return;

    const { error } = await (supabase as any)
      .from("vales_funcionarios")
      .update({
        status: "removido",
        removido_em: new Date().toISOString(),
      })
      .eq("id", vale.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Vale removido.");
    await carregar();
  };

  if (!empresaId) {
    return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Vale / Empréstimo
          </h2>
          <p className="text-sm text-muted-foreground">
            Desconto automático no holerite pela rubrica 07075 - VALE EMPREST INT.
          </p>
        </div>

        {podeEditar && (
          <Button onClick={abrirNovo} className="font-semibold">
            <Plus className="h-4 w-4 mr-1" />
            Novo vale
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <Label className="text-xs">Funcionário</Label>
            <Select value={filtroFuncionario} onValueChange={setFiltroFuncionario}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os funcionários ativos</SelectItem>
                {funcionarios.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                    {f.matricula ? ` #${f.matricula}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-64">
            <Label className="text-xs">Folha de desconto</Label>
            <Select value={filtroFolha} onValueChange={setFiltroFolha}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as folhas</SelectItem>
                {folhasAbertas.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" onClick={() => void carregar()}>
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground font-semibold">Total filtrado</div>
            <div className="text-2xl font-bold text-red-600">{moeda(totalFiltrado)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground font-semibold">Lançamentos</div>
            <div className="text-2xl font-bold">{vales.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground font-semibold">Rubrica do holerite</div>
            <div className="text-lg font-bold">07075</div>
            <div className="text-xs text-muted-foreground">VALE EMPREST INT</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vales lançados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : vales.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum vale lançado para o filtro atual.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Funcionário</th>
                    <th className="p-3 text-left">Folha</th>
                    <th className="p-3 text-right">Valor</th>
                    <th className="p-3 text-left">Observação</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vales.map((vale) => (
                    <tr key={vale.id}>
                      <td className="p-3">
                        <div className="font-semibold">{vale.funcionarios?.nome ?? "Funcionário"}</div>
                        {vale.funcionarios?.matricula && (
                          <div className="text-xs text-muted-foreground">Matrícula #{vale.funcionarios.matricula}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {MESES[Number(vale.mes_referencia) - 1]}/{vale.ano_referencia}
                      </td>
                      <td className="p-3 text-right font-bold text-red-600">{moeda(Number(vale.valor))}</td>
                      <td className="p-3 text-muted-foreground">{vale.observacao || "—"}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              imprimirReciboVale({
                                funcionarioNome: vale.funcionarios?.nome ?? "Funcionário",
                                matricula: vale.funcionarios?.matricula,
                                valor: Number(vale.valor),
                                ano: vale.ano_referencia,
                                mes: vale.mes_referencia,
                                observacao: vale.observacao,
                              })
                            }
                          >
                            <Printer className="h-3 w-3 mr-1" />
                            Recibo
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => abrirEditar(vale)} disabled={!podeEditar}>
                            <Pencil className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => remover(vale)} disabled={!podeEditar}>
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar vale" : "Novo vale"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Funcionário ativo</Label>
              <Select
                value={form.funcionario_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, funcionario_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {funcionarios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                      {f.matricula ? ` #${f.matricula}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Folha para desconto</Label>
              <Select value={form.folha} onValueChange={(value) => setForm((prev) => ({ ...prev, folha: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a folha" />
                </SelectTrigger>
                <SelectContent>
                  {folhasAbertas.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Só aparecem folhas em aberto, sem fechamento/liberação.
              </p>
            </div>

            <div>
              <Label className="text-xs">Valor do vale</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(event) => setForm((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea
                value={form.observacao}
                onChange={(event) => setForm((prev) => ({ ...prev, observacao: event.target.value }))}
                placeholder="Ex.: vale solicitado em dinheiro, empréstimo interno, adiantamento extra..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar}>{editando ? "Salvar e imprimir recibo" : "Adicionar e imprimir recibo"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
