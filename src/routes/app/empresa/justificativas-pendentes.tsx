import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Paperclip, FileText } from "lucide-react";

export const Route = createFileRoute("/app/empresa/justificativas-pendentes")({
  component: PendentesPage,
});

type Linha = {
  id: string;
  data: string;
  observacao: string | null;
  anexo_url: string | null;
  status: string;
  created_at: string;
  funcionario_id: string;
  funcionarios: { nome: string; cargo: string | null } | null;
  justificativas_tipos: { nome: string; codigo: string; categoria: string } | null;
};

function PendentesPage() {
  const { empresaId, role, user } = useAuth();
  const podeAprovar = role === "admin" || role === "gerente";
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("justificativas_aplicadas")
      .select("id,data,observacao,anexo_url,status,created_at,funcionario_id,funcionarios(nome,cargo),justificativas_tipos(nome,codigo,categoria)")
      .eq("empresa_id", empresaId)
      .eq("status", "pendente")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setLinhas((data ?? []) as unknown as Linha[]);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const decidir = async (id: string, status: "aprovada" | "rejeitada") => {
    if (!user) return;
    const { error } = await supabase.from("justificativas_aplicadas").update({
      status,
      aprovado_por: user.id,
      aprovado_em: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "aprovada" ? "Aprovada" : "Rejeitada");
    await carregar();
  };

  const verAnexo = async (path: string) => {
    const { data, error } = await supabase.storage.from("justificativas-anexos").createSignedUrl(path, 300);
    if (error || !data) return toast.error(error?.message || "Não foi possível abrir");
    window.open(data.signedUrl, "_blank");
  };

  if (!empresaId) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Justificativas pendentes</h2>
        <p className="text-sm text-muted-foreground">Aprovar ou rejeitar justificativas que exigem aprovação.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : linhas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Nenhuma justificativa pendente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Funcionário</th>
                    <th className="text-left p-2">Dia</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Observação</th>
                    <th className="text-left p-2">Anexo</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="p-2">
                        <div className="font-medium">{l.funcionarios?.nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{l.funcionarios?.cargo ?? "—"}</div>
                      </td>
                      <td className="p-2 font-mono">{l.data.split("-").reverse().join("/")}</td>
                      <td className="p-2">{l.justificativas_tipos?.nome ?? "—"}</td>
                      <td className="p-2 text-xs">{l.observacao ?? "—"}</td>
                      <td className="p-2">
                        {l.anexo_url ? (
                          <Button size="sm" variant="ghost" onClick={() => verAnexo(l.anexo_url!)}>
                            <Paperclip className="h-3 w-3 mr-1" />Ver
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap space-x-1">
                        {podeAprovar && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => decidir(l.id, "rejeitada")} className="text-destructive">
                              <X className="h-3 w-3 mr-1" />Rejeitar
                            </Button>
                            <Button size="sm" onClick={() => decidir(l.id, "aprovada")}>
                              <Check className="h-3 w-3 mr-1" />Aprovar
                            </Button>
                          </>
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
    </div>
  );
}
