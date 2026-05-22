import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/app/funcionario/avisos")({
  component: MeusAvisos,
});

type Aviso = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo_destino: string;
  created_at: string;
};

function MeusAvisos() {
  const { user } = useAuth();
  const [funcId, setFuncId] = useState<string | null>(null);
  const [lista, setLista] = useState<Aviso[]>([]);
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: f } = await supabase.from("funcionarios").select("id").eq("usuario_id", user.id).maybeSingle();
      if (!f) { setLoading(false); return; }
      setFuncId(f.id);
      const [{ data: avs }, { data: ls }] = await Promise.all([
        supabase.from("avisos").select("id,titulo,mensagem,tipo_destino,created_at")
          .order("created_at", { ascending: false }),
        supabase.from("avisos_leituras").select("aviso_id").eq("funcionario_id", f.id),
      ]);
      setLista((avs ?? []) as Aviso[]);
      setLidos(new Set((ls ?? []).map((l) => l.aviso_id as string)));
      setLoading(false);

      // marca todos como lidos
      const naoLidos = (avs ?? []).filter((a) => !(ls ?? []).some((l) => l.aviso_id === a.id));
      if (naoLidos.length > 0) {
        await supabase.from("avisos_leituras").upsert(
          naoLidos.map((a) => ({ aviso_id: a.id, funcionario_id: f.id })),
          { onConflict: "aviso_id,funcionario_id" }
        );
        setLidos(new Set([...(ls ?? []).map((l) => l.aviso_id as string), ...naoLidos.map((a) => a.id)]));
      }
    })();
  }, [user]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!funcId) return <p className="text-sm text-muted-foreground">Cadastro de funcionário não encontrado.</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Avisos</h2>
        <p className="text-sm text-muted-foreground">Comunicados enviados pela empresa.</p>
      </div>

      {lista.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum aviso no momento.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {lista.map((a) => {
            const novo = !lidos.has(a.id);
            return (
              <Card key={a.id} className={novo ? "border-primary" : ""}>
                <CardContent className="p-4 flex gap-3 items-start">
                  <div className="rounded-md bg-primary/10 text-primary p-2"><Bell className="h-5 w-5" /></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-bold">{a.titulo}</div>
                      {novo && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Novo</span>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap mt-1">{a.mensagem}</p>
                    <div className="text-xs text-muted-foreground mt-2">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
