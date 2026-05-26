import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/empresa/lotacoes")({
  component: LotacoesPage,
});

type Lotacao = { id: string; codigo: string; nome: string; ativo: boolean };

function LotacoesPage() {
  const { empresaId, role } = useAuth();
  const podeEditar = role === "admin";
  const [lista, setLista] = useState<Lotacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Lotacao | null>(null);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    const { data, error } = await supabase.from("lotacoes")
      .select("id,codigo,nome,ativo").eq("empresa_id", empresaId).order("codigo");
    if (error) toast.error(error.message);
    setLista((data ?? []) as Lotacao[]);
    setLoading(false);
  };
  useEffect(() => { void carregar(); /* eslint-disable-next-line */ }, [empresaId]);

  const remover = async (l: Lotacao) => {
    if (!confirm(`Remover lotação ${l.codigo}?`)) return;
    const { error } = await supabase.from("lotacoes").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Removida");
    await carregar();
  };

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Lotações</h2>
          <p className="text-sm text-muted-foreground">Cadastre os locais de trabalho da empresa. Eles aparecerão como opções ao editar o funcionário.</p>
        </div>
        {podeEditar && <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nova lotação</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
            : lista.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma lotação cadastrada.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 w-32">Código</th>
                      <th className="text-left p-2">Nome</th>
                      <th className="text-left p-2 w-20">Status</th>
                      {podeEditar && <th className="text-right p-2 w-24">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lista.map((l) => (
                      <tr key={l.id} className="hover:bg-muted/30">
                        <td className="p-2 font-mono">{l.codigo}</td>
                        <td className="p-2">{l.nome}</td>
                        <td className="p-2 text-xs">{l.ativo ? "Ativa" : "Inativa"}</td>
                        {podeEditar && (
                          <td className="p-2 text-right whitespace-nowrap space-x-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEdit(l); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => remover(l)}><Trash2 className="h-3 w-3 text-red-600" /></Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>

      {open && empresaId && (
        <EditorLotacao
          empresaId={empresaId}
          lotacao={edit}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); void carregar(); }}
        />
      )}
    </div>
  );
}

function EditorLotacao({ empresaId, lotacao, onClose, onSaved }: {
  empresaId: string; lotacao: Lotacao | null; onClose: () => void; onSaved: () => void;
}) {
  const [codigo, setCodigo] = useState(lotacao?.codigo ?? "");
  const [nome, setNome] = useState(lotacao?.nome ?? "");
  const [ativo, setAtivo] = useState(lotacao?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!codigo.trim() || !nome.trim()) return toast.error("Preencha código e nome");
    setSalvando(true);
    const payload = { empresa_id: empresaId, codigo: codigo.trim(), nome: nome.trim(), ativo };
    const q = lotacao
      ? supabase.from("lotacoes").update(payload).eq("id", lotacao.id)
      : supabase.from("lotacoes").insert(payload);
    const { error } = await q;
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{lotacao ? "Editar lotação" : "Nova lotação"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Código</Label><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="5001000105" /></div>
          <div><Label className="text-xs">Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="FABRIL - ANAPOLIS-GO" /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
