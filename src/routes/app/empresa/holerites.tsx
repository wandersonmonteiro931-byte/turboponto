import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { mesNome } from "@/lib/beneficios";
import { CheckCircle2, Download, Plus, Trash2, Pencil } from "lucide-react";
import { gerarHoleritePdf, type HolerLancamento } from "@/lib/holerite-pdf";
import { calcularRubrica, type TipoCalculo } from "@/lib/holerite-rubricas";

export const Route = createFileRoute("/app/empresa/holerites")({
  component: HoleritesPage,
});

type Func = {
  id: string; nome: string; cargo: string | null; cpf: string | null;
  data_admissao: string | null; salario: number | null;
  banco_agencia: string | null; conta: string | null; lotacao: string | null;
  num_dep_irrf: number | null; num_dep_sal_fam: number | null;
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
    void supabase.from("funcionarios").select("id,nome,cargo,cpf,data_admissao,salario,banco_agencia,conta,lotacao,num_dep_irrf,num_dep_sal_fam")
      .eq("empresa_id", empresaId).eq("status", "ativo").order("nome")
      .then(({ data }) => setFuncs((data ?? []) as Func[]));
  }, [empresaId]);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    let q = supabase.from("holerites")
      .select("id,funcionario_id,mes_referencia,ano_referencia,pdf_url,liberado,liberado_em,acessado_em,total_liquido,funcionarios(nome)")
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
  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, [empresaId, mes, ano, funcionarioId, status]);

  const liberar = async (ids: string[]) => {
    if (!user || ids.length === 0) return;
    const { error } = await supabase.from("holerites").update({
      liberado: true, status: "liberado",
      liberado_por: user.id, liberado_em: new Date().toISOString(),
    }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} holerite(s) liberado(s)`);
    await carregar();
  };

  const negarAcesso = async (h: Holerite) => {
    if (!confirm("Revogar acesso do funcionário a este holerite?")) return;
    const { error } = await supabase.from("holerites").update({
      liberado: false, status: "pendente", liberado_em: null, liberado_por: null,
    }).eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Acesso revogado");
    await carregar();
  };

  const remover = async (h: Holerite) => {
    if (!confirm("Remover este holerite?")) return;
    if (h.pdf_url) {
      const path = h.pdf_url.split(`/holerites/`)[1];
      if (path) await supabase.storage.from("holerites").remove([path]);
    }
    const { error } = await supabase.from("holerites").delete().eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    await carregar();
  };

  const download = async (h: Holerite) => {
    if (!h.pdf_url) return toast.error("PDF ainda não foi gerado");
    const path = h.pdf_url.split(`/holerites/`)[1];
    if (!path) return;
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

  const totais = useMemo(() => ({
    total: lista.length,
    liberados: lista.filter((h) => h.liberado).length,
    pendentes: lista.filter((h) => !h.liberado).length,
    acessados: lista.filter((h) => h.acessado_em).length,
  }), [lista]);

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Holerites</h2>
          <p className="text-sm text-muted-foreground">Crie holerites detalhados e libere o acesso para o funcionário baixar o PDF.</p>
        </div>
        {podeEditar && <Button onClick={() => { setEditandoId(null); setEditorOpen(true); }}><Plus className="h-4 w-4 mr-1" />Novo holerite</Button>}
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Fld label="Mês">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{mesNome(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Ano"><Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></Fld>
          <Fld label="Funcionário">
            <Select value={funcionarioId} onValueChange={setFuncionarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
                <CheckCircle2 className="h-4 w-4 mr-1" />Liberar ({selecionados.size})
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
          {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
            : lista.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhum holerite para esse período.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      {podeEditar && <th className="p-2 w-8">
                        <input type="checkbox"
                          checked={selecionados.size > 0 && selecionados.size === lista.filter((h) => !h.liberado).length}
                          onChange={(e) => {
                            if (e.target.checked) setSelecionados(new Set(lista.filter((h) => !h.liberado).map((h) => h.id)));
                            else setSelecionados(new Set());
                          }} />
                      </th>}
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
                        {podeEditar && <td className="p-2">
                          {!h.liberado && <input type="checkbox" checked={selecionados.has(h.id)} onChange={(e) => {
                            const s = new Set(selecionados);
                            if (e.target.checked) s.add(h.id); else s.delete(h.id);
                            setSelecionados(s);
                          }} />}
                        </td>}
                        <td className="p-2 font-medium">{h.funcionarios?.nome ?? "—"}</td>
                        <td className="p-2">{mesNome(h.mes_referencia)}/{h.ano_referencia}</td>
                        <td className="p-2 text-right font-mono">{Number(h.total_liquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2">
                          {h.liberado
                            ? <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-700">Liberado</span>
                            : <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700">Pendente</span>}
                        </td>
                        <td className="p-2 text-xs">{h.liberado_em ? new Date(h.liberado_em).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-xs">{h.acessado_em ? new Date(h.acessado_em).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-right whitespace-nowrap space-x-1">
                          {h.pdf_url && <Button size="sm" variant="ghost" onClick={() => download(h)} title="Baixar PDF"><Download className="h-3 w-3" /></Button>}
                          {podeEditar && <Button size="sm" variant="ghost" onClick={() => { setEditandoId(h.id); setEditorOpen(true); }} title="Editar"><Pencil className="h-3 w-3" /></Button>}
                          {podeEditar && !h.liberado && (
                            <Button size="sm" variant="outline" onClick={() => liberar([h.id])}>Liberar</Button>
                          )}
                          {podeEditar && h.liberado && (
                            <Button size="sm" variant="outline" onClick={() => negarAcesso(h)}>Revogar</Button>
                          )}
                          {podeEditar && (
                            <Button size="sm" variant="ghost" onClick={() => remover(h)} title="Remover"><Trash2 className="h-3 w-3 text-red-600" /></Button>
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
          onSaved={() => { setEditorOpen(false); void carregar(); }}
        />
      )}
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1 block text-xs">{label}</Label>{children}</div>;
}
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div></CardContent></Card>;
}

type LancEdit = HolerLancamento & { id?: string; _k: string };

function EditorDialog({
  empresaId, holeriteId, funcs, defaultMes, defaultAno, onClose, onSaved,
}: {
  empresaId: string; holeriteId: string | null; funcs: Func[];
  defaultMes: number; defaultAno: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [funcId, setFuncId] = useState("");
  const [mes, setMes] = useState(defaultMes);
  const [ano, setAno] = useState(defaultAno);
  const [folhaTipo, setFolhaTipo] = useState("MENSAL");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [dataPagamento, setDataPagamento] = useState("");
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
  const [rubricas, setRubricas] = useState<Array<{ id: string; codigo: string; descricao: string; tipo: "provento" | "desconto"; tipo_calculo: TipoCalculo; valor_referencia: number }>>([]);

  useEffect(() => {
    void supabase.from("holerite_rubricas")
      .select("id,codigo,descricao,tipo,tipo_calculo,valor_referencia")
      .eq("empresa_id", empresaId).eq("ativo", true).order("codigo")
      .then(({ data }) => setRubricas((data ?? []) as typeof rubricas));
    // eslint-disable-next-line
  }, [empresaId]);

  const aplicarRubrica = async (k: string, rubricaId: string) => {
    const r = rubricas.find((x) => x.id === rubricaId);
    if (!r) return;
    const f = funcs.find((x) => x.id === funcId);
    const salario = Number(f?.salario ?? salarioContratual ?? 0);
    const calc = await calcularRubrica(r.tipo, r.tipo_calculo, Number(r.valor_referencia), {
      salario, funcionarioId: funcId, ano, mes,
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
      setPeriodoInicio(`${ano}-${String(mes).padStart(2,"0")}-01`);
      setPeriodoFim(`${ano}-${String(mes).padStart(2,"0")}-${String(ult).padStart(2,"0")}`);
      return;
    }
    void (async () => {
      const { data: h } = await supabase.from("holerites").select("*").eq("id", holeriteId).maybeSingle();
      if (!h) return;
      setFuncId(h.funcionario_id);
      setMes(h.mes_referencia); setAno(h.ano_referencia);
      setFolhaTipo(h.folha_tipo ?? "MENSAL");
      setPeriodoInicio(h.periodo_inicio ?? "");
      setPeriodoFim(h.periodo_fim ?? "");
      setDataPagamento(h.data_pagamento ?? "");
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
      const { data: ls } = await supabase.from("holerite_lancamentos")
        .select("*").eq("holerite_id", holeriteId).order("ordem");
      setLancamentos((ls ?? []).map((l) => ({
        _k: l.id, id: l.id, codigo: l.codigo, descricao: l.descricao,
        qtde: l.qtde != null ? Number(l.qtde) : null,
        provento: Number(l.provento ?? 0), desconto: Number(l.desconto ?? 0), resultado: Number(l.resultado ?? 0),
      })));
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

  const totalProv = useMemo(() => lancamentos.reduce((s, l) => s + Number(l.provento || 0), 0), [lancamentos]);
  const totalDesc = useMemo(() => lancamentos.reduce((s, l) => s + Number(l.desconto || 0), 0), [lancamentos]);
  const totalLiq = totalProv - totalDesc;

  const addLinha = () => setLancamentos((prev) => [...prev, { _k: crypto.randomUUID(), codigo: "", descricao: "", qtde: null, provento: 0, desconto: 0, resultado: 0 }]);
  const removerLinha = (k: string) => setLancamentos((prev) => prev.filter((l) => l._k !== k));
  const updLinha = (k: string, patch: Partial<LancEdit>) => setLancamentos((prev) => prev.map((l) => l._k === k ? { ...l, ...patch } : l));

  const salvar = async () => {
    if (!funcId) return toast.error("Selecione o funcionário");
    const f = funcs.find((x) => x.id === funcId);
    if (!f) return;
    setSalvando(true);
    try {
      const { data: emp } = await supabase.from("empresas")
        .select("nome_fantasia,razao_social,cnpj,endereco").eq("id", empresaId).maybeSingle();

      const now = new Date().toISOString();
      const { data: u } = await supabase.auth.getUser();

      // Upsert holerite (sem PDF ainda)
      const payload = {
        empresa_id: empresaId, funcionario_id: funcId,
        mes_referencia: mes, ano_referencia: ano,
        folha_tipo: folhaTipo,
        periodo_inicio: periodoInicio || null,
        periodo_fim: periodoFim || null,
        data_pagamento: dataPagamento || null,
        banco_agencia: bancoAg || null,
        conta: conta || null,
        num_dep_irrf: numDepIrrf,
        num_dep_sal_fam: numDepSalFam,
        salario_contratual: salarioContratual,
        total_proventos: totalProv,
        total_descontos: totalDesc,
        total_liquido: totalLiq,
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
        await supabase.from("holerite_lancamentos").delete().eq("holerite_id", hid);
      } else {
        const { data: ins, error } = await supabase.from("holerites").upsert(payload, {
          onConflict: "funcionario_id,mes_referencia,ano_referencia",
        }).select("id").maybeSingle();
        if (error) throw error;
        hid = ins?.id ?? null;
        if (hid) await supabase.from("holerite_lancamentos").delete().eq("holerite_id", hid);
      }
      if (!hid) throw new Error("Falha ao criar holerite");

      const linhas = lancamentos.filter((l) => l.codigo.trim() || l.descricao.trim());
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
          cnpj: emp?.cnpj, endereco: emp?.endereco,
        },
        {
          nome: f.nome, cpf: f.cpf, cargo: f.cargo,
          data_admissao: f.data_admissao,
        },
        {
          folha_tipo: folhaTipo,
          mes_referencia: mes, ano_referencia: ano,
          periodo_inicio: periodoInicio, periodo_fim: periodoFim,
          data_pagamento: dataPagamento,
          banco_agencia: bancoAg, conta,
          num_dep_irrf: numDepIrrf, num_dep_sal_fam: numDepSalFam,
          salario_contratual: salarioContratual,
          total_proventos: totalProv, total_descontos: totalDesc, total_liquido: totalLiq,
          sal_contrib_inss: salContribInss, base_fgts: baseFgts, fgts_mes: fgtsMes, base_irpf: baseIrpf,
          lotacao, observacoes,
        },
        linhas,
      );
      const blob = doc.output("blob");
      const path = `${empresaId}/${funcId}/${ano}-${String(mes).padStart(2,"0")}.pdf`;
      const { error: upErr } = await supabase.storage.from("holerites").upload(path, blob, {
        upsert: true, contentType: "application/pdf",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("holerites").getPublicUrl(path);
      await supabase.from("holerites").update({ pdf_url: pub.publicUrl }).eq("id", hid);

      toast.success("Holerite salvo");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{holeriteId ? "Editar holerite" : "Novo holerite"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fld label="Funcionário">
              <Select value={funcId} onValueChange={setFuncId} disabled={!!holeriteId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label="Tipo de folha">
              <Select value={folhaTipo} onValueChange={setFolhaTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{mesNome(m)}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label="Ano"><Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></Fld>
            <Fld label="Período início"><Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} /></Fld>
            <Fld label="Período fim"><Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} /></Fld>
            <Fld label="Data de pagamento"><Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} /></Fld>
            <Fld label="Salário contratual"><Input type="number" step="0.01" value={salarioContratual} onChange={(e) => setSalarioContratual(Number(e.target.value))} /></Fld>
            <Fld label="Banco / Agência"><Input value={bancoAg} onChange={(e) => setBancoAg(e.target.value)} placeholder="237/02402" /></Fld>
            <Fld label="Conta"><Input value={conta} onChange={(e) => setConta(e.target.value)} /></Fld>
            <Fld label="Nº Dep. IRRF"><Input type="number" value={numDepIrrf} onChange={(e) => setNumDepIrrf(Number(e.target.value))} /></Fld>
            <Fld label="Nº Dep. Sal. Fam."><Input type="number" value={numDepSalFam} onChange={(e) => setNumDepSalFam(Number(e.target.value))} /></Fld>
            <div className="col-span-2 sm:col-span-4">
              <Fld label="Lotação"><Input value={lotacao} onChange={(e) => setLotacao(e.target.value)} placeholder="Ex.: 5001000105 - FABRIL - ANAPOLIS-GO" /></Fld>
            </div>
          </div>

          <div className="border rounded-md">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="font-semibold text-sm">Lançamentos</h3>
              <Button size="sm" variant="outline" onClick={addLinha}><Plus className="h-3 w-3 mr-1" />Adicionar linha</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase">
                  <tr>
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
                      <td className="p-1"><Input className="h-7 text-xs" value={l.codigo} onChange={(e) => updLinha(l._k, { codigo: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-7 text-xs" value={l.descricao} onChange={(e) => updLinha(l._k, { descricao: e.target.value })} /></td>
                      <td className="p-1"><Input className="h-7 text-xs text-right" type="number" step="0.01" value={l.qtde ?? ""} onChange={(e) => updLinha(l._k, { qtde: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td className="p-1"><Input className="h-7 text-xs text-right" type="number" step="0.01" value={l.provento ?? 0} onChange={(e) => updLinha(l._k, { provento: Number(e.target.value) })} /></td>
                      <td className="p-1"><Input className="h-7 text-xs text-right" type="number" step="0.01" value={l.desconto ?? 0} onChange={(e) => updLinha(l._k, { desconto: Number(e.target.value) })} /></td>
                      <td className="p-1"><Input className="h-7 text-xs text-right" type="number" step="0.01" value={l.resultado ?? 0} onChange={(e) => updLinha(l._k, { resultado: Number(e.target.value) })} /></td>
                      <td className="p-1 text-center"><Button size="sm" variant="ghost" onClick={() => removerLinha(l._k)}><Trash2 className="h-3 w-3 text-red-600" /></Button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 font-bold text-xs">
                  <tr>
                    <td colSpan={3} className="p-2 text-right">Totais:</td>
                    <td className="p-2 text-right font-mono">{totalProv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-right font-mono">{totalDesc.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-right font-mono text-green-700">{totalLiq.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fld label="Sal. contrib. INSS"><Input type="number" step="0.01" value={salContribInss} onChange={(e) => setSalContribInss(Number(e.target.value))} /></Fld>
            <Fld label="Base cal. FGTS"><Input type="number" step="0.01" value={baseFgts} onChange={(e) => setBaseFgts(Number(e.target.value))} /></Fld>
            <Fld label="FGTS mês"><Input type="number" step="0.01" value={fgtsMes} onChange={(e) => setFgtsMes(Number(e.target.value))} /></Fld>
            <Fld label="Base calc. IRPF"><Input type="number" step="0.01" value={baseIrpf} onChange={(e) => setBaseIrpf(Number(e.target.value))} /></Fld>
          </div>

          <Fld label="Observações"><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} /></Fld>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={liberarJa} onChange={(e) => setLiberarJa(e.target.checked)} />
            Liberar acesso ao funcionário imediatamente
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar e gerar PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
