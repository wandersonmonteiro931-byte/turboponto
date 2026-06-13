import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import {
  STATUS_BENEFICIO,
  avaliarDireito,
  buscarDataDesligamentoBeneficio,
  calcBeneficioForaDoVinculo,
  estaForaDoVinculoBeneficio,
  fmtBRL,
  mesNome,
  proximoMesDisponivel,
  type Beneficio,
  type CicloBeneficio,
} from "@/lib/beneficios";
import { carregarCartao } from "@/lib/cartao";
import { AlertTriangle, CheckCircle2, Gift, XCircle } from "lucide-react";

const fmtHorasMin = (minutos: number | null | undefined) => {
  const min = Math.max(0, Math.round(Number(minutos ?? 0)));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
};

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
  motivo_admin: string | null;
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

type BeneficioCtx = {
  beneficio: Beneficio;
  mes: number;
  ano: number;
  calc: Calc | null;
  dataPrevista: string | null;
  cicloAprovado: boolean;
};

function MeusBeneficios() {
  const { user } = useAuth();
  const [funcId, setFuncId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [contextos, setContextos] = useState<BeneficioCtx[]>([]);
  const [historico, setHistorico] = useState<Entrega[]>([]);
  const [beneficios, setBeneficios] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: f } = await supabase
        .from("funcionarios")
        .select("id,empresa_id,status,data_admissao,data_desligamento")
        .eq("usuario_id", user.id)
        .maybeSingle();
      if (!f) {
        setLoading(false);
        return;
      }
      setFuncId(f.id);
      setEmpresaId(f.empresa_id);

      const { data: bens } = await supabase
        .from("beneficios")
        .select("*")
        .eq("empresa_id", f.empresa_id)
        .eq("status", "ativo")
        .order("created_at");
      const lista = (bens ?? []) as Beneficio[];
      setBeneficios(lista);

      if (lista.length === 0) {
        setLoading(false);
        return;
      }

      // Ciclos de todos os benefícios da empresa
      const { data: ciclosData } = await supabase
        .from("beneficios_ciclos")
        .select("*")
        .eq("empresa_id", f.empresa_id)
        .in(
          "beneficio_id",
          lista.map((b) => b.id),
        );
      const ciclos = (ciclosData ?? []) as CicloBeneficio[];

      // Cartão do mês corrente (referência para cálculo ao vivo)
      const hoje = new Date();
      let debito = 0;
      let faltas = 0;
      try {
        const cartao = await carregarCartao(f.id, hoje.getFullYear(), hoje.getMonth() + 1);
        faltas = cartao.totalFaltas;
        debito = cartao.dias.reduce((s, d) => (d.bancoHorasMinutos < 0 ? s + -d.bancoHorasMinutos : s), 0);
      } catch (err) {
        console.warn("[beneficios] falha ao carregar cartão", err);
      }

      // Para cada benefício, descobre o mês "aberto" do ciclo (após aprovações
      // o mês avança automaticamente para o funcionário).
      const ctxs: BeneficioCtx[] = [];
      for (const b of lista) {
        const ciclosBen = ciclos
          .filter((c) => c.beneficio_id === b.id)
          .sort((a, b2) =>
            a.ano_referencia !== b2.ano_referencia
              ? b2.ano_referencia - a.ano_referencia
              : b2.mes_referencia - a.mes_referencia,
          );
        const aberto = proximoMesDisponivel(ciclosBen);
        const cicloAtual = ciclosBen.find((c) => c.mes_referencia === aberto.mes && c.ano_referencia === aberto.ano);

        const { data: cs } = await supabase
          .from("beneficios_calculos")
          .select("*")
          .eq("funcionario_id", f.id)
          .eq("beneficio_id", b.id)
          .eq("mes_referencia", aberto.mes)
          .eq("ano_referencia", aberto.ano)
          .maybeSingle();
        const stored = (cs ?? null) as Calc | null;
        const manter =
          stored &&
          (["liberado", "entregue", "bloqueado", "em_analise"].includes(stored.status) || !!stored.motivo_admin);
        let calc: Calc | null = null;
        const dataDesligamentoEfetiva = await buscarDataDesligamentoBeneficio(
          f.id,
          aberto.ano,
          aberto.mes,
          (f as { data_desligamento?: string | null }).data_desligamento ?? null,
        );

        const foraDoVinculo = estaForaDoVinculoBeneficio({
          ano: aberto.ano,
          mes: aberto.mes,
          status: (f as { status?: string | null }).status,
          dataAdmissao: (f as { data_admissao?: string | null }).data_admissao ?? null,
          dataDesligamento: dataDesligamentoEfetiva,
        });

        if (foraDoVinculo) {
          const aval = calcBeneficioForaDoVinculo(b.valor_maximo);
          calc = {
            id: stored?.id ?? "live",
            beneficio_id: b.id,
            total_atraso_minutos: 0,
            dias_com_atraso: 0,
            faltas_injustificadas: 0,
            tem_direito: false,
            status: aval.status,
            motivo_perda: aval.motivo,
            motivo_admin: stored?.motivo_admin ?? null,
            valor_estimado: 0,
            mes_referencia: aberto.mes,
            ano_referencia: aberto.ano,
          };
        } else if (manter) {
          calc = stored;
        } else {
          const aval = avaliarDireito(b, debito, faltas);
          calc = {
            id: stored?.id ?? "live",
            beneficio_id: b.id,
            total_atraso_minutos: debito,
            dias_com_atraso: 0,
            faltas_injustificadas: faltas,
            tem_direito: aval.tem_direito,
            status: aval.status,
            motivo_perda: aval.motivo,
            motivo_admin: stored?.motivo_admin ?? null,
            valor_estimado: aval.valor,
            mes_referencia: aberto.mes,
            ano_referencia: aberto.ano,
          };
        }
        ctxs.push({
          beneficio: b,
          mes: aberto.mes,
          ano: aberto.ano,
          calc,
          dataPrevista: cicloAtual?.data_prevista_entrega ?? null,
          cicloAprovado: cicloAtual?.status === "aprovado",
        });
      }
      setContextos(ctxs);

      const { data: ent } = await supabase
        .from("beneficios_entregas")
        .select("id,beneficio_id,mes_referencia,ano_referencia,data_entrega,valor_estimado,entregue")
        .eq("funcionario_id", f.id)
        .order("ano_referencia", { ascending: false })
        .order("mes_referencia", { ascending: false })
        .limit(24);
      setHistorico((ent ?? []) as Entrega[]);
      setLoading(false);
    })();
  }, [user, recarga]);

  // Realtime: sem filtros (com filtro, postgres_changes exige REPLICA IDENTITY
  // FULL e às vezes não entrega eventos). Recarrega ao detectar qualquer
  // mudança nas tabelas relacionadas.
  useEffect(() => {
    if (!funcId || !empresaId) return;
    const reload = () => setRecarga((n) => n + 1);
    const ch = supabase
      .channel(`func-beneficios-${funcId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "beneficios_ciclos" } as never, reload)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "beneficios_calculos" } as never, reload)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "beneficios_entregas" } as never, reload)
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [funcId, empresaId]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!funcId) return <p className="text-sm text-muted-foreground">Cadastro de funcionário não encontrado.</p>;
  if (beneficios.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhum benefício cadastrado pela empresa.</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Meus Benefícios</h2>
        <p className="text-sm text-muted-foreground">Acompanhe o status dos seus benefícios por assiduidade.</p>
      </div>

      {contextos.map((ctx) => (
        <BeneficioCard key={ctx.beneficio.id} ctx={ctx} />
      ))}

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Histórico de entregas</h3>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrega registrada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Benefício</th>
                  <th className="text-left p-2">Mês</th>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Valor</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historico.map((e) => {
                  const ben = beneficios.find((x) => x.id === e.beneficio_id);
                  const semDireito = !e.entregue && Number(e.valor_estimado) === 0;
                  const statusLabel = e.entregue ? "PAGO" : semDireito ? "SEM DIREITO" : "PENDENTE";
                  const statusClass = e.entregue
                    ? "bg-emerald-500/20 text-emerald-700"
                    : semDireito
                      ? "bg-red-500/20 text-red-700"
                      : "bg-amber-500/20 text-amber-700";
                  return (
                    <tr key={e.id}>
                      <td className="p-2">{ben?.nome ?? "—"}</td>
                      <td className="p-2">
                        {mesNome(e.mes_referencia)}/{e.ano_referencia}
                      </td>
                      <td className="p-2">
                        {e.data_entrega ? new Date(e.data_entrega + "T00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="p-2 font-mono">{fmtBRL(Number(e.valor_estimado))}</td>
                      <td className="p-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BeneficioCard({ ctx }: { ctx: BeneficioCtx }) {
  const { beneficio, mes, ano, calc, dataPrevista } = ctx;
  const atraso = calc?.total_atraso_minutos ?? 0;
  const limite = beneficio.limite_atraso_minutos;
  const alerta = beneficio.limite_alerta_minutos;
  const pct = Math.min(100, Math.round((atraso / Math.max(limite, 1)) * 100));
  const proximo = atraso >= alerta && atraso <= limite;
  const perdeu = atraso > limite || calc?.tem_direito === false;
  const entregue = calc?.status === "entregue";
  const liberado = calc?.status === "liberado";

  const reprovadoAdmin = !!calc?.motivo_admin;
  const mensagem = !calc
    ? "Aguardando cálculo do mês."
    : reprovadoAdmin
      ? `Reprovado pela empresa: ${calc?.motivo_admin}`
      : entregue
        ? `${beneficio.nome} marcado como entregue.`
        : liberado
          ? `${beneficio.nome} liberado pela empresa.`
          : perdeu
            ? calc?.motivo_perda === "Fora do vínculo."
              ? "Sem direito: fora do vínculo."
              : `Você perdeu o direito a este benefício porque ${calc?.motivo_perda?.toLowerCase() ?? "ultrapassou o limite de atraso"}.`
            : proximo
              ? "Atenção: você está próximo do limite de atraso."
              : "Você ainda tem direito a este benefício este mês.";

  const dataPrev = dataPrevista
    ? new Date(dataPrevista + "T00:00:00").toLocaleDateString("pt-BR")
    : new Date(ano, mes - 1, beneficio.dia_entrega).toLocaleDateString("pt-BR");

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-full p-2 ${entregue || liberado ? "bg-green-500/20 text-green-700" : perdeu ? "bg-red-500/20 text-red-700" : proximo ? "bg-amber-500/20 text-amber-700" : "bg-blue-500/20 text-blue-700"}`}
          >
            {entregue || liberado ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : perdeu ? (
              <XCircle className="h-5 w-5" />
            ) : proximo ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Gift className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">
              {beneficio.nome} — {mesNome(mes)}/{ano}
            </div>
            <p className="text-sm text-muted-foreground">{mensagem}</p>
          </div>
          {calc && (
            <span
              className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${STATUS_BENEFICIO[calc.status]?.color ?? "bg-muted"}`}
            >
              {STATUS_BENEFICIO[calc.status]?.label ?? calc.status}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Info label="Atraso acumulado" value={fmtHorasMin(atraso)} />
          <Info label="Limite permitido" value={fmtHorasMin(limite)} />
          <Info label="Valor previsto" value={fmtBRL(perdeu ? 0 : beneficio.valor_maximo)} />
          <Info label="Data prevista" value={dataPrev} />
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Uso do limite de atraso</span>
            <span>
              {fmtHorasMin(atraso)} / {fmtHorasMin(limite)}
            </span>
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
