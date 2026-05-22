import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { listarNotificacoes, marcarLida, marcarTodasLidas, type Notificacao } from "@/lib/notificacoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/funcionario/notificacoes")({
  component: NotificacoesPage,
});

function NotificacoesPage() {
  const { user } = useAuth();
  const [funcId, setFuncId] = useState<string | null>(null);
  const [items, setItems] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("funcionarios").select("id")
        .eq("usuario_id", user.id).maybeSingle();
      if (data?.id) {
        setFuncId(data.id);
        const list = await listarNotificacoes(data.id);
        setItems(list);
      }
      setLoading(false);
    })();
  }, [user]);

  const abrir = async (n: Notificacao) => {
    if (!n.lida) {
      await marcarLida(n.id);
      setItems((arr) => arr.map((x) => x.id === n.id ? { ...x, lida: true } : x));
    }
    if (n.link) window.location.href = n.link;
  };

  const lerTodas = async () => {
    if (!funcId) return;
    try {
      await marcarTodasLidas(funcId);
      setItems((arr) => arr.map((x) => ({ ...x, lida: true })));
      toast.success("Notificações marcadas como lidas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const naoLidas = items.filter((i) => !i.lida).length;

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" /> Notificações
          {naoLidas > 0 && <Badge variant="destructive">{naoLidas}</Badge>}
        </h1>
        {naoLidas > 0 && (
          <Button variant="outline" size="sm" onClick={lerTodas}>
            <CheckCheck className="h-4 w-4 mr-1" /> Marcar todas como lidas
          </Button>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Nenhuma notificação.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id}
              className={`p-3 cursor-pointer hover:bg-accent ${n.lida ? "opacity-60" : "border-primary/50"}`}
              onClick={() => abrir(n)}>
              <div className="flex justify-between gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm">{n.titulo}</div>
                  <div className="text-sm text-muted-foreground">{n.mensagem}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(n.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
