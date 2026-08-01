import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { mesNome } from "@/lib/beneficios";
import { Download, FileText } from "lucide-react";

export const Route = createFileRoute("/app/funcionario/holerites")({
  component: MeusHolerites,
});

type Holerite = {
  id: string;
  mes_referencia: number;
  ano_referencia: number;
  pdf_url: string;
  liberado_em: string | null;
  acessado_em: string | null;
};

function MeusHolerites() {
  const { user } = useAuth();
  const [funcId, setFuncId] = useState<string | null>(null);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState<number | "todos">("todos");
  const [lista, setLista] = useState<Holerite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("funcionarios")
      .select("id")
      .eq("usuario_id", user.id)
      .maybeSingle()
      .then(({ data }) => setFuncId(data?.id ?? null));
  }, [user]);

  const carregar = async () => {
    if (!funcId) return;
    setLoading(true);
    let q = supabase
      .from("holerites")
      .select("id,mes_referencia,ano_referencia,pdf_url,liberado_em,acessado_em")
      .eq("funcionario_id", funcId)
      .eq("liberado", true)
      .eq("ano_referencia", ano)
      .order("mes_referencia", { ascending: false });
    if (mes !== "todos") q = q.eq("mes_referencia", mes);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setLista((data ?? []) as Holerite[]);
    setLoading(false);
  };
  useEffect(() => {
    if (funcId) void carregar(); /* eslint-disable-next-line */
  }, [funcId, ano, mes]);

  const abrir = async (h: Holerite) => {
    if (!h.pdf_url) {
      toast.error("PDF ainda não foi gerado.");
      return;
    }

    try {
      const { resolverUrlHoleritePdf } = await import("@/lib/holerite-storage");
      const url = new URL(await resolverUrlHoleritePdf(h.pdf_url));
      url.searchParams.set("download", "1");
      url.searchParams.set("v", String(Date.now()));

      const resp = await fetch(url.toString(), { cache: "no-store" });
      if (!resp.ok) {
        toast.error("Não foi possível baixar o PDF deste holerite.");
        return;
      }

      const data = await resp.blob();

      if (!h.acessado_em) {
        await supabase.from("holerites").update({ acessado_em: new Date().toISOString() }).eq("id", h.id);
      }

      const blobUrl = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `holerite-${h.mes_referencia}-${h.ano_referencia}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      void carregar();
    } catch (e) {
      console.error("[funcionario/holerites] erro ao baixar PDF", e);
      toast.error("Erro ao baixar o PDF do holerite.");
    }
  };

  if (!funcId) return <p className="text-sm text-muted-foreground">Cadastro de funcionário não encontrado.</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Meus Holerites</h2>
        <p className="text-sm text-muted-foreground">Visualize e baixe seus holerites liberados pela empresa.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Ano</Label>
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(v === "todos" ? "todos" : Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {mesNome(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum holerite liberado para esse período.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {lista.map((h) => (
            <Card key={h.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="rounded-md bg-primary/10 text-primary p-2">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="font-bold">
                    {mesNome(h.mes_referencia)} / {h.ano_referencia}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Liberado em {h.liberado_em ? new Date(h.liberado_em).toLocaleDateString("pt-BR") : "—"}
                  </div>
                </div>
                <Button size="sm" onClick={() => abrir(h)}>
                  <Download className="h-4 w-4 mr-1" />
                  Abrir
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
