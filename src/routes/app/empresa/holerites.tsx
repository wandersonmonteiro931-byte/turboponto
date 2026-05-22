import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { mesNome } from "@/lib/beneficios";
import { CheckCircle2, Download, Plus, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/app/empresa/holerites")({
  component: HoleritesPage,
});

type Func = { id: string; nome: string; cargo: string | null };
type Holerite = {
  id: string;
  funcionario_id: string;
  mes_referencia: number;
  ano_referencia: number;
  pdf_url: string;
  liberado: boolean;
  liberado_em: string | null;
  acessado_em: string | null;
  created_at: string;
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!empresaId) return;
    void supabase.from("funcionarios").select("id,nome,cargo")
      .eq("empresa_id", empresaId).eq("status", "ativo").order("nome")
      .then(({ data }) => setFuncs((data ?? []) as Func[]));
  }, [empresaId]);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    let q = supabase.from("holerites")
      .select("id,funcionario_id,mes_referencia,ano_referencia,pdf_url,liberado,liberado_em,acessado_em,created_at,funcionarios(nome)")
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

  const remover = async (h: Holerite) => {
    if (!confirm("Remover este holerite?")) return;
    // remove arquivo
    const path = h.pdf_url.split(`/holerites/`)[1];
    if (path) await supabase.storage.from("holerites").remove([path]);
    const { error } = await supabase.from("holerites").delete().eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    await carregar();
  };

  const download = async (h: Holerite) => {
    const path = h.pdf_url.split(`/holerites/`)[1];
    if (!path) return;
    const { data, error } = await supabase.storage.from("holerites").createSignedUrl(path, 60);
    if (error || !data) return toast.error(error?.message ?? "Erro");
    window.open(data.signedUrl, "_blank");
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
          <p className="text-sm text-muted-foreground">Envie e libere holerites em PDF para os funcionários.</p>
        </div>
        {podeEditar && <Button onClick={() => setUploadOpen(true)}><Plus className="h-4 w-4 mr-1" />Enviar holerite</Button>}
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
                        <td className="p-2">
                          {h.liberado
                            ? <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-500/20 text-green-700">Liberado</span>
                            : <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700">Pendente</span>}
                        </td>
                        <td className="p-2 text-xs">{h.liberado_em ? new Date(h.liberado_em).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-xs">{h.acessado_em ? new Date(h.acessado_em).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-right whitespace-nowrap space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => download(h)}><Download className="h-3 w-3" /></Button>
                          {podeEditar && !h.liberado && (
                            <Button size="sm" variant="outline" onClick={() => liberar([h.id])}>Liberar</Button>
                          )}
                          {podeEditar && (
                            <Button size="sm" variant="ghost" onClick={() => remover(h)}><Trash2 className="h-3 w-3 text-red-600" /></Button>
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

      {empresaId && (
        <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)}
          empresaId={empresaId} funcs={funcs} onSaved={carregar} defaultMes={mes} defaultAno={ano} />
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

function UploadDialog({
  open, onClose, empresaId, funcs, onSaved, defaultMes, defaultAno,
}: { open: boolean; onClose: () => void; empresaId: string; funcs: Func[]; onSaved: () => void; defaultMes: number; defaultAno: number }) {
  const [funcId, setFuncId] = useState("");
  const [mes, setMes] = useState(defaultMes);
  const [ano, setAno] = useState(defaultAno);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [liberarJa, setLiberarJa] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (open) { setMes(defaultMes); setAno(defaultAno); setArquivo(null); setFuncId(""); setLiberarJa(false); } }, [open, defaultMes, defaultAno]);

  const salvar = async () => {
    if (!funcId) return toast.error("Selecione o funcionário");
    if (!arquivo) return toast.error("Selecione o PDF");
    setSalvando(true);
    try {
      const path = `${empresaId}/${funcId}/${ano}-${String(mes).padStart(2,"0")}.pdf`;
      const { error: upErr } = await supabase.storage.from("holerites").upload(path, arquivo, {
        upsert: true, contentType: "application/pdf",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("holerites").getPublicUrl(path);
      const now = new Date().toISOString();
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("holerites").upsert({
        empresa_id: empresaId,
        funcionario_id: funcId,
        mes_referencia: mes,
        ano_referencia: ano,
        pdf_url: pub.publicUrl,
        liberado: liberarJa,
        status: liberarJa ? "liberado" : "pendente",
        liberado_em: liberarJa ? now : null,
        liberado_por: liberarJa ? u.user?.id : null,
      }, { onConflict: "funcionario_id,mes_referencia,ano_referencia" });
      if (error) throw error;
      toast.success("Holerite enviado");
      onSaved(); onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setSalvando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar holerite</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Fld label="Funcionário">
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Fld>
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Mês">
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <SelectItem key={m} value={String(m)}>{mesNome(m)}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label="Ano"><Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></Fld>
          </div>
          <Fld label="Arquivo PDF">
            <Input type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </Fld>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={liberarJa} onChange={(e) => setLiberarJa(e.target.checked)} />
            Liberar para o funcionário agora
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}><Upload className="h-4 w-4 mr-1" />Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
