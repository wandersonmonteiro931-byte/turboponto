import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, UserCircle2, Power, PowerOff, Pencil, Trash2 } from "lucide-react";
import { criarFuncionario } from "@/lib/funcionarios.functions";
import { getAccessToken } from "@/lib/session";

export const Route = createFileRoute("/app/empresa/funcionarios/")({
  component: FuncionariosPage,
});

type Funcionario = {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  cargo: string | null;
  status: string;
  foto_url: string | null;
  usuario_id: string | null;
  matricula: string | null;
};

const statusColor: Record<string, string> = {
  ativo: "bg-green-500/20 text-green-700",
  afastado: "bg-orange-500/20 text-orange-700",
  desligado: "bg-red-500/20 text-red-700",
};

function FuncionariosPage() {
  const { empresaId, role } = useAuth();
  const isAdmin = role === "admin";
  const [list, setList] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [openNew, setOpenNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = async () => {
    const excluirFuncionario = async (funcionario: Funcionario) => {
      if (!isAdmin) return;

      const nome = funcionario.nome || "este funcionário";

      const confirmar = window.confirm(
        `Excluir definitivamente ${nome}?\n\n` +
          "Essa ação vai apagar o funcionário e remover os dados vinculados dele do sistema, como registros de ponto, cartão de ponto, banco de horas, faltas, justificativas, holerites, benefícios, jornadas vinculadas, notificações e demais históricos.\n\n" +
          "Essa ação não pode ser desfeita.",
      );

      if (!confirmar) return;

      const texto = window.prompt(`Para confirmar a exclusão definitiva de ${nome}, digite EXCLUIR.`);

      if ((texto ?? "").trim().toUpperCase() !== "EXCLUIR") {
        toast.info("Exclusão cancelada.");
        return;
      }

      setDeletingId(funcionario.id);

      try {
        const { error } = await (supabase as any).rpc("excluir_funcionario_completo", {
          p_funcionario_id: funcionario.id,
        });

        if (error) throw error;

        toast.success("Funcionário excluído do sistema.");
        setList((prev) => prev.filter((item) => item.id !== funcionario.id));
        await reload();
      } catch (err) {
        console.error("[funcionarios] erro ao excluir funcionário", err);
        toast.error(err instanceof Error ? err.message : "Erro ao excluir funcionário.");
      } finally {
        setDeletingId(null);
      }
    };

    if (!empresaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("funcionarios")
      .select("id,nome,cpf,email,cargo,status,foto_url,usuario_id,matricula")
      .eq("empresa_id", empresaId)
      .order("nome");
    if (error) toast.error(error.message);
    setList((data ?? []) as Funcionario[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [empresaId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.filter((f) => {
      if (statusFilter !== "todos" && f.status !== statusFilter) return false;
      if (!s) return true;
      return (
        f.nome.toLowerCase().includes(s) ||
        (f.cpf ?? "").toLowerCase().includes(s) ||
        (f.cargo ?? "").toLowerCase().includes(s) ||
        (f.matricula ?? "").toLowerCase().includes(s)
      );
    });
  }, [list, search, statusFilter]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("funcionarios")
      .update({
        status,
        permite_bater_ponto: status === "ativo",
        ...(status === "desligado" ? { data_desligamento: new Date().toISOString().slice(0, 10) } : {}),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    reload();
  };

  const excluirFuncionario = async (funcionario: Funcionario) => {
    if (!isAdmin) return;

    const nome = funcionario.nome || "este funcionário";

    const confirmar = window.confirm(
      `Excluir definitivamente ${nome}?\n\n` +
        "Essa ação vai apagar o funcionário e remover os dados vinculados dele do sistema, como registros de ponto, cartão de ponto, banco de horas, faltas, justificativas, holerites, benefícios, jornadas vinculadas, notificações e demais históricos.\n\n" +
        "Essa ação não pode ser desfeita.",
    );

    if (!confirmar) return;

    const texto = window.prompt(`Para confirmar a exclusão definitiva de ${nome}, digite EXCLUIR.`);

    if ((texto ?? "").trim().toUpperCase() !== "EXCLUIR") {
      toast.info("Exclusão cancelada.");
      return;
    }

    setDeletingId(funcionario.id);

    try {
      const { error } = await (supabase as any).rpc("excluir_funcionario_completo", {
        p_funcionario_id: funcionario.id,
      });

      if (error) throw error;

      toast.success("Funcionário excluído do sistema.");
      setList((prev) => prev.filter((item) => item.id !== funcionario.id));
      await reload();
    } catch (err) {
      console.error("[funcionarios] erro ao excluir funcionário", err);
      toast.error(err instanceof Error ? err.message : "Erro ao excluir funcionário.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!empresaId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">Cadastre primeiro os dados da empresa.</p>
          <Link to="/app/empresa/empresa">
            <Button>Ir para Empresa</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, matrícula, CPF ou cargo"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="afastado">Afastados</SelectItem>
              <SelectItem value="desligado">Desligados</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button className="font-semibold">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo
                </Button>
              </DialogTrigger>
              <NovoFuncionarioDialog
                onDone={() => {
                  setOpenNew(false);
                  reload();
                }}
              />
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum funcionário encontrado.</div>
          ) : (
            <ul className="divide-y">
              {filtered.map((f) => (
                <li key={f.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                  <Link
                    to="/app/empresa/funcionarios/$id"
                    params={{ id: f.id }}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="h-10 w-10 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
                      {f.foto_url ? (
                        <img src={f.foto_url} className="h-full w-full object-cover" />
                      ) : (
                        <UserCircle2 className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {f.nome}
                        {f.matricula ? (
                          <span className="ml-2 text-xs text-muted-foreground font-mono">#{f.matricula}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {f.cargo ?? "—"} · {f.email ?? f.cpf ?? "—"}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusColor[f.status] ?? "bg-muted"}`}
                    >
                      {f.status}
                    </span>
                  </Link>
                  <div className="flex gap-1 items-center">
                    <Button size="sm" variant="outline" asChild title="Editar">
                      <Link to="/app/empresa/funcionarios/$id" params={{ id: f.id }}>
                        <span className="inline-flex items-center">
                          <Pencil className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Editar</span>
                        </span>
                      </Link>
                    </Button>
                    {isAdmin && (
                      <div className="hidden sm:flex gap-1">
                        {f.status !== "ativo" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(f.id, "ativo")} title="Reativar">
                            <Power className="h-4 w-4" />
                          </Button>
                        )}
                        {f.status === "ativo" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(f.id, "afastado")} title="Afastar">
                            <PowerOff className="h-4 w-4" />
                          </Button>
                        )}
                        {f.status !== "desligado" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Desligar este funcionário?")) setStatus(f.id, "desligado");
                            }}
                            title="Desligar"
                          >
                            <PowerOff className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deletingId === f.id}
                          onClick={() => excluirFuncionario(f)}
                          title="Excluir definitivamente"
                        >
                          <Trash2 className="h-4 w-4 text-red-700" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NovoFuncionarioDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    rg: "",
    data_nascimento: "",
    telefone: "",
    email: "",
    endereco: "",
    cargo: "",
    salario: "",
    data_admissao: "",
    senha: "",
  });
  const [saving, setSaving] = useState(false);

  const upd = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getAccessToken();
      await criarFuncionario({
        data: {
          token,
          nome: form.nome,
          cpf: form.cpf || null,
          rg: form.rg || null,
          data_nascimento: form.data_nascimento || null,
          telefone: form.telefone || null,
          email: form.email,
          endereco: form.endereco || null,
          cargo: form.cargo || null,
          salario: form.salario ? Number(form.salario) : null,
          data_admissao: form.data_admissao || null,
          status: "ativo" as const,
          foto_url: null,
          observacoes: null,
          senha: form.senha,
        },
      });
      toast.success("Funcionário cadastrado");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Novo funcionário</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <F label="Nome completo *" full>
          <Input required value={form.nome} onChange={(e) => upd("nome", e.target.value)} />
        </F>
        <F label="CPF">
          <Input value={form.cpf} onChange={(e) => upd("cpf", e.target.value)} />
        </F>
        <F label="RG">
          <Input value={form.rg} onChange={(e) => upd("rg", e.target.value)} />
        </F>
        <F label="Data de nascimento">
          <Input type="date" value={form.data_nascimento} onChange={(e) => upd("data_nascimento", e.target.value)} />
        </F>
        <F label="Telefone">
          <Input value={form.telefone} onChange={(e) => upd("telefone", e.target.value)} />
        </F>
        <F label="E-mail de acesso *" full>
          <Input type="email" required value={form.email} onChange={(e) => upd("email", e.target.value)} />
        </F>
        <F label="Endereço" full>
          <Input value={form.endereco} onChange={(e) => upd("endereco", e.target.value)} />
        </F>
        <F label="Cargo / função">
          <Input value={form.cargo} onChange={(e) => upd("cargo", e.target.value)} />
        </F>
        <F label="Salário (R$)">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={form.salario}
            onChange={(e) => upd("salario", e.target.value)}
          />
        </F>
        <F label="Data de admissão">
          <Input type="date" value={form.data_admissao} onChange={(e) => upd("data_admissao", e.target.value)} />
        </F>
        <F label="Senha inicial *">
          <Input type="text" minLength={6} required value={form.senha} onChange={(e) => upd("senha", e.target.value)} />
        </F>
        <DialogFooter className="md:col-span-2 mt-2">
          <Button type="submit" disabled={saving} className="font-semibold">
            {saving ? "Cadastrando..." : "Cadastrar funcionário"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function F({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
