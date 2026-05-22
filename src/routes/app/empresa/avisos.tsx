import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Bell, Pencil, Plus, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/app/empresa/avisos")({
  component: AvisosPage,
});

type Aviso = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo_destino: "todos" | "cargo" | "individual";
  cargo_destino: string | null;
  funcionario_id: string | null;
  status: string;
  created_at: string;
};

type Func = { id: string; nome: string; cargo: string | null };

function AvisosPage() {
  const { empresaId, role, user } = useAuth();
  const podeEditar = role === "admin" || role === "gerente";
  const [lista, setLista] = useState<Aviso[]>([]);
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [loading, setLoading] = useState(true);
  const [editar, setEditar] = useState<Aviso | null>(null);
  const [novo, setNovo] = useState(false);
  const [leitoresOpen, setLeitoresOpen] = useState<Aviso | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    void supabase.from("funcionarios").select("id,nome,cargo").eq("empresa_id", empresaId).eq("status","ativo").order("nome")
      .then(({ data }) => setFuncs((data ?? []) as Func[]));
  }, [empresaId]);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    const { data, error } = await supabase.from("avisos")
      .select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setLista((data ?? []) as Aviso[]);
    setLoading(false);
  };
  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, [empresaId]);

  const remover = async (a: Aviso) => {
    if (!confirm("Excluir aviso?")) return;
    const { error } = await supabase.from("avisos").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído"); void carregar();
  };

  const cargos = Array.from(new Set(funcs.map((f) => f.cargo).filter(Boolean) as string[]));

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Avisos</h2>
          <p className="text-sm text-muted-foreground">Comunique seus funcionários com avisos gerais, por cargo ou individuais.</p>
        </div>
        {podeEditar && <Button onClick={() => setNovo(true)}><Plus className="h-4 w-4 mr-1" />Novo aviso</Button>}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p>
        : lista.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum aviso criado ainda.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {lista.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 text-primary p-2"><Bell className="h-5 w-5" /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold">{a.titulo}</div>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted">
                          {a.tipo_destino === "todos" ? "Todos"
                            : a.tipo_destino === "cargo" ? `Cargo: ${a.cargo_destino}`
                            : `Individual: ${funcs.find((f) => f.id === a.funcionario_id)?.nome ?? "—"}`}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{a.mensagem}</p>
                      <div className="text-xs text-muted-foreground mt-2">
                        {new Date(a.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    {podeEditar && (
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setLeitoresOpen(a)}><Users className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditar(a)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remover(a)}><Trash2 className="h-3 w-3 text-red-600" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      {(novo || editar) && empresaId && user && (
        <AvisoDialog
          open={true} onClose={() => { setNovo(false); setEditar(null); }}
          empresaId={empresaId} usuarioId={user.id} funcs={funcs} cargos={cargos}
          aviso={editar} onSaved={carregar}
        />
      )}
      {leitoresOpen && <LeitoresDialog open={true} onClose={() => setLeitoresOpen(null)} aviso={leitoresOpen} funcs={funcs} />}
    </div>
  );
}

function AvisoDialog({
  open, onClose, empresaId, usuarioId, funcs, cargos, aviso, onSaved,
}: {
  open: boolean; onClose: () => void; empresaId: string; usuarioId: string;
  funcs: Func[]; cargos: string[]; aviso: Aviso | null; onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? "");
  const [mensagem, setMensagem] = useState(aviso?.mensagem ?? "");
  const [tipo, setTipo] = useState<"todos"|"cargo"|"individual">(aviso?.tipo_destino ?? "todos");
  const [cargo, setCargo] = useState(aviso?.cargo_destino ?? "");
  const [funcId, setFuncId] = useState(aviso?.funcionario_id ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!titulo || !mensagem) return toast.error("Preencha título e mensagem");
    if (tipo === "cargo" && !cargo) return toast.error("Selecione o cargo");
    if (tipo === "individual" && !funcId) return toast.error("Selecione o funcionário");
    setSalvando(true);
    const payload = {
      empresa_id: empresaId,
      titulo, mensagem,
      tipo_destino: tipo,
      cargo_destino: tipo === "cargo" ? cargo : null,
      funcionario_id: tipo === "individual" ? funcId : null,
      criado_por: usuarioId,
    };
    const { error } = aviso
      ? await supabase.from("avisos").update(payload).eq("id", aviso.id)
      : await supabase.from("avisos").insert(payload);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(aviso ? "Atualizado" : "Aviso criado");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{aviso ? "Editar aviso" : "Novo aviso"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Título</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div><Label className="text-xs">Mensagem</Label><Textarea rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)} /></div>
          <div><Label className="text-xs">Destinatário</Label>
            <Select value={tipo} onValueChange={(v: "todos"|"cargo"|"individual") => setTipo(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os funcionários</SelectItem>
                <SelectItem value="cargo">Por cargo</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tipo === "cargo" && (
            <div><Label className="text-xs">Cargo</Label>
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {tipo === "individual" && (
            <div><Label className="text-xs">Funcionário</Label>
              <Select value={funcId} onValueChange={setFuncId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeitoresDialog({
  open, onClose, aviso, funcs,
}: { open: boolean; onClose: () => void; aviso: Aviso; funcs: Func[] }) {
  const [leituras, setLeituras] = useState<{ funcionario_id: string; lido_em: string }[]>([]);
  useEffect(() => {
    void supabase.from("avisos_leituras").select("funcionario_id,lido_em").eq("aviso_id", aviso.id)
      .then(({ data }) => setLeituras(data ?? []));
  }, [aviso.id]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Leitores — {aviso.titulo}</DialogTitle></DialogHeader>
        {leituras.length === 0
          ? <p className="text-sm text-muted-foreground">Ninguém leu este aviso ainda.</p>
          : (
            <ul className="text-sm divide-y">
              {leituras.map((l) => (
                <li key={l.funcionario_id} className="py-2 flex justify-between">
                  <span>{funcs.find((f) => f.id === l.funcionario_id)?.nome ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(l.lido_em).toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
      </DialogContent>
    </Dialog>
  );
}
