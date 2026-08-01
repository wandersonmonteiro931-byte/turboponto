import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useFuncionarioStatus } from "@/lib/funcionario-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ClipboardList, CalendarDays } from "lucide-react";
import { statusColor, statusLabel, tipoLabel } from "@/lib/ponto";
import { formatMinutos } from "@/lib/format";

export const Route = createFileRoute("/app/funcionario/registros")({
  component: MeusRegistrosPage,
});

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Registro = {
  id: string;
  data_referencia: string;
  horario_registrado: string;
  horario_programado: string | null;
  tipo_ponto: string;
  status: string;
  atraso_minutos: number;
  origem: string;
  observacao: string | null;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "—");

function MeusRegistrosPage() {
  const { user } = useAuth();
  const { desligado } = useFuncionarioStatus();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [funcId, setFuncId] = useState<string | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("funcionarios")
      .select("id")
      .eq("usuario_id", user.id)
      .maybeSingle()
      .then(({ data }) => setFuncId((data as { id: string } | null)?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (!funcId) return;
    setLoading(true);
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fimDate = new Date(ano, mes, 0);
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDate.getDate()).padStart(2, "0")}`;
    (async () => {
      const { data } = await supabase
        .from("registros_ponto")
        .select("id,data_referencia,horario_registrado,horario_programado,tipo_ponto,status,atraso_minutos,origem,observacao")
        .eq("funcionario_id", funcId)
        .gte("data_referencia", inicio)
        .lte("data_referencia", fim)
        .order("data_referencia", { ascending: false })
        .order("horario_registrado", { ascending: true });
      setRegistros((data ?? []) as Registro[]);
      setLoading(false);
    })();
  }, [funcId, ano, mes]);

  const dias = useMemo(() => {
    const map = new Map<string, Registro[]>();
    for (const r of registros) {
      const arr = map.get(r.data_referencia) ?? [];
      arr.push(r);
      map.set(r.data_referencia, arr);
    }
    return Array.from(map.entries());
  }, [registros]);

  const totalAtraso = registros.reduce((s, r) => s + (r.atraso_minutos || 0), 0);
  const anos = [hoje.getFullYear() + 1, hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{desligado ? "Histórico de Pontos" : "Meus Registros"}</h1>
          <p className="text-sm text-muted-foreground">Marcações registradas no período selecionado.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOMES_MES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground uppercase">Marcações</div>
            <div className="text-xl font-bold tabular-nums">{registros.length}</div>
          </div>
          {!desligado && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase">Atraso no mês</div>
              <div className="text-xl font-bold tabular-nums text-orange-600">{formatMinutos(totalAtraso)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : dias.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma marcação encontrada em {NOMES_MES[mes - 1]}/{ano}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dias.map(([data, regs]) => {
            const d = new Date(`${data}T12:00:00`);
            return (
              <Card key={data}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <span className="capitalize">
                      {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left">Marcação</th>
                          <th className="px-4 py-2 text-left">Registrado</th>
                          <th className="px-4 py-2 text-left">Previsto</th>
                          {!desligado && <th className="px-4 py-2 text-left">Situação</th>}
                          <th className="px-4 py-2 text-left">Origem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regs.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-4 py-2 font-medium">{tipoLabel(r.tipo_ponto)}</td>
                            <td className="px-4 py-2 font-mono tabular-nums">{hhmm(r.horario_registrado)}</td>
                            <td className="px-4 py-2 font-mono tabular-nums text-muted-foreground">
                              {hhmm(r.horario_programado)}
                            </td>
                            {!desligado && (
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${statusColor[r.status] ?? "bg-muted"}`}>
                                  {statusLabel[r.status] ?? r.status}
                                </span>
                                {r.atraso_minutos > 0 && (
                                  <span className="ml-2 text-xs text-orange-600">+{r.atraso_minutos} min</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-2 text-xs text-muted-foreground capitalize">{r.origem}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
