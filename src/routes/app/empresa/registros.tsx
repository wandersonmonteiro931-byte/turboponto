import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TIPOS_PONTO, tipoLabel, statusLabel, statusColor } from "@/lib/ponto";
import { EditarPontoDialog, InserirPontoDialog, type RegistroEdit } from "@/components/EditarPontoDialog";
import { Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/app/empresa/registros")({
  component: RegistrosPage,
});

type Registro = {
  id: string;
  funcionario_id: string;
  data_referencia: string;
  tipo_ponto: string;
  horario_programado: string | null;
  horario_registrado: string;
  atraso_minutos: number;
  status: string;
  origem: string;
  observacao: string | null;
  funcionarios: { nome: string } | null;
};

type Funcionario = { id: string; nome: string };

function RegistrosPage() {
  const { empresaId } = useAuth();
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [lista, setLista] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDoMes = hoje.slice(0, 8) + "01";

  const [dataIni, setDataIni] = useState(primeiroDoMes);
  const [dataFim, setDataFim] = useState(hoje);
  const [funcionarioId, setFuncionarioId] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [apenasAtraso, setApenasAtraso] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from("funcionarios").select("id,nome").eq("empresa_id", empresaId).order("nome")
      .then(({ data }) => setFuncs((data ?? []) as Funcionario[]));
  }, [empresaId]);

  const carregar = async () => {
    if (!empresaId) return;
    setLoading(true);
    let q = supabase.from("registros_ponto")
      .select("id,funcionario_id,data_referencia,tipo_ponto,horario_programado,horario_registrado,atraso_minutos,status,origem,observacao,funcionarios(nome)")
      .eq("empresa_id", empresaId)
      .gte("data_referencia", dataIni)
      .lte("data_referencia", dataFim)
      .order("data_referencia", { ascending: false })
      .order("horario_registrado", { ascending: false })
      .limit(500);
    if (funcionarioId !== "todos") q = q.eq("funcionario_id", funcionarioId);
    if (tipo !== "todos") q = q.eq("tipo_ponto", tipo);
    if (status !== "todos") q = q.eq("status", status);
    if (apenasAtraso) q = q.gt("atraso_minutos", 0);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setLista((data ?? []) as unknown as Registro[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empresaId]);

  const totais = useMemo(() => {
    return lista.reduce((acc, r) => {
      acc.total += 1;
      if (r.status === "atrasado") acc.atrasados += 1;
      if (r.status === "fora_do_horario") acc.fora += 1;
      if (r.status === "pendente") acc.pendentes += 1;
      acc.atrasoMin += r.atraso_minutos || 0;
      return acc;
    }, { total: 0, atrasados: 0, fora: 0, pendentes: 0, atrasoMin: 0 });
  }, [lista]);

  const fmtData = (s: string) => new Date(s + "T00:00").toLocaleDateString("pt-BR");
  const fmtHora = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro os dados da empresa.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Registros de ponto</h2>
        <p className="text-sm text-muted-foreground">Acompanhe todas as marcações dos funcionários.</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Fld label="De"><Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} /></Fld>
          <Fld label="Até"><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></Fld>
          <Fld label="Funcionário">
            <Select value={funcionarioId} onValueChange={setFuncionarioId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {funcs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Tipo">
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS_PONTO.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fld>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={apenasAtraso} onChange={(e) => setApenasAtraso(e.target.checked)} />
              Só atrasos
            </label>
            <Button onClick={carregar} className="ml-auto">Filtrar</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total" value={totais.total} />
        <Stat label="Atrasados" value={totais.atrasados} color="text-orange-600" />
        <Stat label="Fora do horário" value={totais.fora} color="text-red-600" />
        <Stat label="Pendentes" value={totais.pendentes} color="text-muted-foreground" />
        <Stat label="Atraso total" value={`${totais.atrasoMin} min`} />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado para os filtros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Funcionário</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Programado</th>
                    <th className="text-left p-2">Registrado</th>
                    <th className="text-left p-2">Atraso</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lista.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-2 whitespace-nowrap">{fmtData(r.data_referencia)}</td>
                      <td className="p-2">{r.funcionarios?.nome ?? "—"}</td>
                      <td className="p-2">{tipoLabel(r.tipo_ponto)}</td>
                      <td className="p-2 font-mono">{r.horario_programado?.slice(0, 5) ?? "—"}</td>
                      <td className="p-2 font-mono">{fmtHora(r.horario_registrado)}</td>
                      <td className="p-2">{r.atraso_minutos > 0 ? `${r.atraso_minutos} min` : "—"}</td>
                      <td className="p-2">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${statusColor[r.status] ?? "bg-muted"}`}>
                          {statusLabel[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="p-2 capitalize text-xs text-muted-foreground">{r.origem}</td>
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

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
