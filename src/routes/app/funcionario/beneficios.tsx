import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_BENEFICIO, fmtBRL, mesNome, type Beneficio } from "@/lib/beneficios";
import { AlertTriangle, CheckCircle2, Gift, XCircle } from "lucide-react";

export const Route = createFileRoute("/app/funcionario/beneficios")({
  component: MeusBeneficios,
});

type Calc = {
  id: string;
  beneficio_id: string;
  total_atraso_minutos: number;
  dias_com_atraso: number;
  faltas_injustificadas: number;
  tem_direito: boolean;
  status: string;
  motivo_perda: string | null;
  valor_estimado: number;
  mes_referencia: number;
  ano_referencia: number;
};

type Entrega = {
  id: string;
  beneficio_id: string;
  mes_referencia: number;
  ano_referencia: number;
  data_entrega: string | null;
  valor_estimado: number;
  entregue: boolean;
};

function MeusBeneficios() {
  const { user } = useAuth();
  const [funcId, setFuncId] = useState<string | null>(null);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [calcAtual, setCalcAtual] = useState<Calc | null>(null);
  const [historico, setHistorico] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);

  const hoje = new Date();
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: f } = await supabase.from("funcionarios").select("id,empresa_id").eq("usuario_id", user.id).maybeSingle();
      if (!f) { setLoading(false); return; }
      setFuncId(f.id);
      const { data: bens } = await supabase.from("beneficios").select("*").eq("empresa_id", f.empresa_id).eq("status", "ativo");
      const cesta = (bens ?? []).find((b) => b.tipo === "cesta_basica") ?? bens?.[0];
      setBeneficios((bens ?? []) as Beneficio[]);

      if (cesta) {
        const { data: c } = await supabase.from("beneficios_calculos")
          .select("*").eq("funcionario_id", f.id).eq("beneficio_id", cesta.id)
          .eq("mes_referencia", mes).eq("ano_referencia", ano).maybeSingle();
        setCalcAtual(c as Calc | null);

        const { data: ent } = await supabase.from("beneficios_entregas")
          .select("id,beneficio_id,mes_referencia,ano_referencia,data_entrega,valor_estimado,entregue")
          .eq("funcionario_id", f.id)
          .order("ano_referencia", { ascending: false })
          .order("mes_referencia", { ascending: false })
          .limit(12);
        setHistorico((ent ?? []) as Entrega[]);
      }
      setLoading(false);
    })();
  }, [user, mes, ano]);

  const cesta = beneficios.find((b) => b.tipo === "cesta_basica") ?? beneficios[0];

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!funcId) return <p className="text-sm text-muted-foreground">Cadastro de funcionário não encontrado.</p>;
  if (!cesta) return <p className="text-sm text-muted-foreground">Nenhum benefício cadastrado pela empresa.</p>;

  const atraso = calcAtual?.total_atraso_minutos ?? 0;
  const limite = cesta.limite_atraso_minutos;
  const alerta = cesta.limite_alerta_minutos;
  const pct = Math.min(100, Math.round((atraso / limite) * 100));
  const proximo = atraso >= alerta && atraso <= limite;
  const perdeu = atraso > limite || calcAtual?.tem_direito === false;
  const entregue = calcAtual?.status === "entregue";
  const liberado = calcAtual?.status === "liberado";

  const mensagem = entregue
    ? "Sua cesta básica foi marcada como entregue."
    : liberado
    ? "Sua cesta básica foi liberada pela empresa."
    : perdeu
    ? `Você perdeu o direito à cesta básica este mês porque ${calcAtual?.motivo_perda?.toLowerCase() ?? "ultrapassou o limite de atraso"}.`
    : proximo
    ? "Atenção: você está próximo do limite de atraso para perder a cesta básica."
    : "Você ainda tem direito à cesta básica este mês.";

  const dataPrev = new Date(ano, mes - 1, cesta.dia_entrega).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Meus Benefícios</h2>
        <p className="text-sm text-muted-foreground">Acompanhe o status da sua cesta básica por assiduidade.</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2 ${entregue || liberado ? "bg-green-500/20 text-green-700" : perdeu ? "bg-red-500/20 text-red-700" : proximo ? "bg-amber-500/20 text-amber-700" : "bg-blue-500/20 text-blue-700"}`}>
              {entregue || liberado ? <CheckCircle2 className="h-5 w-5" /> : perdeu ? <XCircle className="h-5 w-5" /> : proximo ? <AlertTriangle className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">{cesta.nome} — {mesNome(mes)}/{ano}</div>
              <p className="text-sm text-muted-foreground">{mensagem}</p>
            </div>
            {calcAtual && (
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${STATUS_BENEFICIO[calcAtual.status]?.color ?? "bg-muted"}`}>
                {STATUS_BENEFICIO[calcAtual.status]?.label ?? calcAtual.status}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info label="Atraso acumulado" value={`${atraso} min`} />
            <Info label="Limite permitido" value={`${limite} min`} />
            <Info label="Valor previsto" value={fmtBRL(perdeu ? 0 : cesta.valor_maximo)} />
            <Info label="Data prevista" value={dataPrev} />
          </div>

          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Uso do limite de atraso</span>
              <span>{atraso}/{limite} min</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${perdeu ? "bg-red-500" : proximo ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Histórico</h3>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrega registrada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Mês</th>
                  <th className="text-left p-2">Data entrega</th>
                  <th className="text-left p-2">Valor</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historico.map((e) => (
                  <tr key={e.id}>
                    <td className="p-2">{mesNome(e.mes_referencia)}/{e.ano_referencia}</td>
                    <td className="p-2">{e.data_entrega ? new Date(e.data_entrega + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-2 font-mono">{fmtBRL(e.valor_estimado)}</td>
                    <td className="p-2">{e.entregue ? "Entregue" : "Pendente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
