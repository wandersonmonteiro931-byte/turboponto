import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Lock, Unlock, CheckCircle2, FileText, Trash2, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  carregarCartao,
  DIAS_SEMANA_CURTO,
  formatMin,
  NOMES_MES,
  type DiaCartao,
  type ResumoCartao,
} from "@/lib/cartao";
import { gerarPdfCartao, salvarPdfArquivo } from "@/lib/cartao-pdf";
import { EditarPontoDialog, InserirPontoDialog, type RegistroEdit } from "@/components/EditarPontoDialog";
import { AplicarJustificativaDialog } from "@/components/AplicarJustificativaDialog";
import { BulkJustificarDialog } from "@/components/BulkJustificarDialog";
import { carregarVinculosAtivos, DIAS_SEMANA, resumirDiasJornada, type VinculoAtivoComDias } from "@/lib/jornadas";
import type { TipoPonto } from "@/lib/ponto";

export const Route = createFileRoute("/app/empresa/cartao-ponto")({
  component: CartaoEmpresaPage,
});

type Func = { id: string; nome: string; cpf: string | null; cargo: string | null; matricula: string | null };
type Cartao = {
  id: string;
  status: string;
  total_atraso_minutos: number;
  total_faltas: number;
  total_horas_trabalhadas_minutos: number;
  total_horas_extras_minutos: number;
  fechado_em: string | null;
  liberado_em: string | null;
};

function CartaoEmpresaPage() {
  const { empresaId, role } = useAuth();
  const hoje = new Date();
  const [funcs, setFuncs] = useState<Func[]>([]);
  const [funcId, setFuncId] = useState<string>("");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [resumo, setResumo] = useState<ResumoCartao | null>(null);
  const [cartao, setCartao] = useState<Cartao | null>(null);
  const [vinculos, setVinculos] = useState<VinculoAtivoComDias[]>([]);
  const [empresaInfo, setEmpresaInfo] = useState<{
    nome_fantasia: string;
    cnpj: string | null;
    endereco: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const podeEditar = role === "admin";
  const [editReg, setEditReg] = useState<RegistroEdit | null>(null);
  const [inserirOpen, setInserirOpen] = useState(false);
  const [prefill, setPrefill] = useState<
    { funcionarioId?: string; data?: string; tipo?: string; hora?: string } | undefined
  >();
  const [justDia, setJustDia] = useState<DiaCartao | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [bulkJustOpen, setBulkJustOpen] = useState(false);

  const toggleSel = (data: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(data)) next.delete(data);
      else next.add(data);
      return next;
    });
  };
  const limparSel = () => setSelecionados(new Set());

  const removerJustificativasSel = async () => {
    if (selecionados.size === 0 || !funcId) return;
    if (!window.confirm(`Remover justificativas de ${selecionados.size} dia(s) selecionado(s)?`)) return;
    const { error } = await supabase
      .from("justificativas_aplicadas")
      .delete()
      .eq("funcionario_id", funcId)
      .in("data", Array.from(selecionados));
    if (error) toast.error(error.message);
    else {
      toast.success("Justificativas removidas.");
      limparSel();
      carregar();
    }
  };

  const excluirMarcacoesSel = async () => {
    if (selecionados.size === 0 || !funcId) return;
    if (!window.confirm(`Excluir TODAS as marcações de ponto dos ${selecionados.size} dia(s) selecionado(s)?`)) return;
    const { error } = await supabase
      .from("registros_ponto")
      .delete()
      .eq("funcionario_id", funcId)
      .in("data_referencia", Array.from(selecionados));
    if (error) toast.error(error.message);
    else {
      toast.success("Marcações excluídas.");
      limparSel();
      carregar();
    }
  };

  const abrirCelula = async (d: DiaCartao, tipo: TipoPonto) => {
    if (!podeEditar || !empresaId) return;
    const regId = d.registroIds[tipo];
    if (regId) {
      const { data: r } = await supabase
        .from("registros_ponto")
        .select("id,empresa_id,funcionario_id,data_referencia,tipo_ponto,horario_registrado,observacao")
        .eq("id", regId)
        .maybeSingle();
      if (r) setEditReg(r as RegistroEdit);
      return;
    }
    const horaProg =
      d.programado[
        tipo === "entrada"
          ? "entrada"
          : tipo === "saida_intervalo"
            ? "saida_intervalo"
            : tipo === "retorno_intervalo"
              ? "retorno_intervalo"
              : "saida_final"
      ];
    setPrefill({ funcionarioId: funcId, data: d.data, tipo, hora: horaProg ?? "08:00" });
    setInserirOpen(true);
  };

  useEffect(() => {
    if (!empresaId) return;
    supabase
      .from("funcionarios")
      .select("id,nome,cpf,cargo,matricula")
      .eq("empresa_id", empresaId)
      .order("nome")
      .then(({ data }) => {
        const list = (data ?? []) as Func[];
        setFuncs(list);
        if (list.length && !funcId) setFuncId(list[0].id);
      });
    supabase
      .from("empresas")
      .select("nome_fantasia,cnpj,endereco")
      .eq("id", empresaId)
      .maybeSingle()
      .then(({ data }) => setEmpresaInfo(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const carregar = async () => {
    if (!funcId || !empresaId) return;
    setLoading(true);
    const [r, c, v] = await Promise.all([
      carregarCartao(funcId, ano, mes),
      supabase
        .from("cartoes_ponto")
        .select("*")
        .eq("funcionario_id", funcId)
        .eq("ano_referencia", ano)
        .eq("mes_referencia", mes)
        .maybeSingle(),
      carregarVinculosAtivos(funcId),
    ]);
    setResumo(r);
    setCartao((c.data ?? null) as Cartao | null);
    setVinculos(v);
    setLoading(false);
  };

  useEffect(() => {
    limparSel();
    if (funcId) carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [funcId, ano, mes]);

  const extrairMatriculaFuncionario = (registro: Record<string, unknown> | null | undefined): string | null => {
    if (!registro) return null;

    const chavesDiretas = [
      "matricula",
      "matrícula",
      "numero_matricula",
      "numeroMatricula",
      "matricula_funcionario",
      "matriculaFuncionario",
      "codigo_matricula",
      "codigoMatricula",
    ];

    for (const chave of chavesDiretas) {
      const valor = registro[chave];

      if (valor !== null && valor !== undefined && String(valor).trim()) {
        return String(valor).trim();
      }
    }

    for (const [chave, valor] of Object.entries(registro)) {
      const chaveNormalizada = chave
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      if (chaveNormalizada.includes("matric") && valor !== null && valor !== undefined && String(valor).trim()) {
        return String(valor).trim();
      }
    }

    return null;
  };

  const persistir = async (status: "aberto" | "fechado" | "liberado") => {
    if (!empresaId || !resumo || !funcId) return;
    const payload = {
      empresa_id: empresaId,
      funcionario_id: funcId,
      mes_referencia: mes,
      ano_referencia: ano,
      total_atraso_minutos: resumo.totalAtraso,
      total_faltas: resumo.totalFaltas,
      total_horas_trabalhadas_minutos: resumo.totalTrabalhado,
      total_horas_extras_minutos: resumo.totalExtras,
      status,
      fechado_em: status === "fechado" || status === "liberado" ? new Date().toISOString() : null,
      liberado_em: status === "liberado" ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("cartoes_ponto")
      .upsert(payload, { onConflict: "funcionario_id,ano_referencia,mes_referencia" });
    if (error) toast.error(error.message);
    else {
      toast.success("Cartão atualizado.");
      carregar();
    }
  };

  const baixarPdf = async () => {
    try {
      if (!funcId) {
        toast.error("Selecione um funcionário.");
        return;
      }

      const fLista = funcs.find((x) => x.id === funcId);

      const { data: funcionarioBanco, error: funcPdfError } = await supabase
        .from("funcionarios")
        .select("id,nome,cpf,cargo,matricula")
        .eq("id", funcId)
        .maybeSingle();

      if (funcPdfError) {
        toast.error(funcPdfError.message);
        return;
      }

      const matriculaDaTela = fLista?.matricula ? String(fLista.matricula).trim() : "";
      const matriculaDoBanco = funcionarioBanco?.matricula ? String(funcionarioBanco.matricula).trim() : "";
      const matriculaFinal = matriculaDaTela || matriculaDoBanco;

      if (!matriculaFinal) {
        toast.error(
          "V9: matrícula não encontrada. Abra o cadastro do funcionário, salve a matrícula novamente e tente gerar o PDF.",
        );
        return;
      }

      const f = {
        id: funcionarioBanco?.id ?? fLista?.id ?? funcId,
        nome: funcionarioBanco?.nome ?? fLista?.nome ?? "-",
        cpf: funcionarioBanco?.cpf ?? fLista?.cpf ?? null,
        cargo: funcionarioBanco?.cargo ?? fLista?.cargo ?? null,
        matricula: matriculaFinal,
      } as Func;

      const emp = empresaInfo ?? { nome_fantasia: "-", cnpj: null, endereco: null };
      const resumoAtual = await carregarCartao(funcId, ano, mes);
      setResumo(resumoAtual);

      const { data: vinc } = await supabase
        .from("funcionarios_jornadas")
        .select("jornadas(nome), jornada_id")
        .eq("funcionario_id", f.id)
        .eq("ativo", true)
        .order("data_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();

      const v = vinc as { jornadas: { nome: string } | null; jornada_id: string } | null;

      let jornada: {
        nome: string;
        entrada: string | null;
        saida: string | null;
        intervalo_saida: string | null;
        intervalo_retorno: string | null;
      } | null = null;

      if (v?.jornada_id) {
        const { data: jd } = await supabase
          .from("jornadas_dias")
          .select("dia_semana,horario_entrada,horario_saida,horario_intervalo_saida,horario_intervalo_retorno,trabalha")
          .eq("jornada_id", v.jornada_id);

        const refDia = (jd ?? []).find((x) => x.trabalha) as
          | {
              horario_entrada: string | null;
              horario_saida: string | null;
              horario_intervalo_saida: string | null;
              horario_intervalo_retorno: string | null;
            }
          | undefined;

        jornada = {
          nome: v.jornadas?.nome ?? "JORNADA",
          entrada: refDia?.horario_entrada?.slice(0, 5) ?? null,
          saida: refDia?.horario_saida?.slice(0, 5) ?? null,
          intervalo_saida: refDia?.horario_intervalo_saida?.slice(0, 5) ?? null,
          intervalo_retorno: refDia?.horario_intervalo_retorno?.slice(0, 5) ?? null,
        };
      }

      const vincs = await carregarVinculosAtivos(f.id);

      const doc = gerarPdfCartao({
        empresa: emp,
        funcionario: f,
        matriculaPdf: matriculaFinal,
        jornada,
        jornadas: vincs,
        ano,
        mes,
        resumo: resumoAtual,
        status: cartao?.status ?? "aberto",
      });

      salvarPdfArquivo(doc, `V9-cartao-${f.nome}-${matriculaFinal}-${ano}-${String(mes).padStart(2, "0")}.pdf`);
      toast.success(`PDF V9 gerado com matrícula ${matriculaFinal}.`);
    } catch (e) {
      console.error("Erro ao gerar PDF", e);
      toast.error("Erro ao gerar PDF: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const totaisStr = useMemo(() => {
    if (!resumo) return null;
    const bh = resumo.totalBancoHoras;
    const bhLabel = bh === 0 ? "—" : `${bh > 0 ? "+" : "-"}${formatMin(Math.abs(bh))}`;
    return {
      atraso: formatMin(resumo.totalAtraso),
      faltas: resumo.totalFaltas,
      trab: formatMin(resumo.totalTrabalhado),
      ext: formatMin(resumo.totalExtras),
      banco: bhLabel,
    };
  }, [resumo]);

  if (!empresaId) return <p className="text-sm text-muted-foreground">Cadastre primeiro a empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Cartão de ponto</h2>
          <p className="text-sm text-muted-foreground">Consulte, feche e libere o cartão mensal de cada funcionário.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={baixarPdf} disabled={!resumo}>
            <Download className="h-4 w-4 mr-1" />
            PDF V9 TESTE
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Funcionário</Label>
            <Select value={funcId} onValueChange={setFuncId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {funcs.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                    {f.matricula ? ` #${f.matricula}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOMES_MES.map((n, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            {podeEditar && (
              <>
                {cartao?.status !== "fechado" && cartao?.status !== "liberado" && (
                  <Button size="sm" onClick={() => persistir("fechado")}>
                    <Lock className="h-4 w-4 mr-1" />
                    Fechar
                  </Button>
                )}
                {cartao?.status === "fechado" && (
                  <Button size="sm" onClick={() => persistir("liberado")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Liberar
                  </Button>
                )}
                {(cartao?.status === "fechado" || cartao?.status === "liberado") && (
                  <Button size="sm" variant="outline" onClick={() => persistir("aberto")}>
                    <Unlock className="h-4 w-4 mr-1" />
                    Reabrir
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {totaisStr && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Atrasos" value={totaisStr.atraso} />
          <Stat label="Faltas" value={totaisStr.faltas} />
          <Stat label="Horas trabalhadas" value={totaisStr.trab} />
          <Stat label="Horas extras" value={totaisStr.ext} />
          <Stat label="Banco de horas" value={totaisStr.banco} />
        </div>
      )}

      {vinculos.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="text-xs uppercase font-bold text-muted-foreground mb-2">
              Horário de trabalho · jornadas ativas
            </div>
            <div className="space-y-2">
              {vinculos.map((v) => (
                <div key={v.vinculoId} className="flex items-start gap-2 text-sm flex-wrap">
                  <span className="inline-flex items-center justify-center min-w-[42px] px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-mono font-bold tracking-wider">
                    {v.codigo}
                  </span>
                  <span className="font-semibold">{v.nome}</span>
                  <span className="text-xs text-muted-foreground">{resumirDiasJornada(v.dias)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {podeEditar && selecionados.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center gap-2 flex-wrap bg-primary text-primary-foreground rounded-md px-3 py-2 shadow">
          <span className="text-sm font-semibold">{selecionados.size} dia(s) selecionado(s)</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => setBulkJustOpen(true)}>
              <FileText className="h-4 w-4 mr-1" />
              Aplicar justificativa
            </Button>
            <Button size="sm" variant="secondary" onClick={removerJustificativasSel}>
              <X className="h-4 w-4 mr-1" />
              Remover justificativa
            </Button>
            <Button size="sm" variant="destructive" onClick={excluirMarcacoesSel}>
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir marcações
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={limparSel}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              Limpar
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : !resumo ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Selecione um funcionário.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  {podeEditar && (
                    <th className="p-2 w-8">
                      <Checkbox
                        checked={resumo.dias.length > 0 && selecionados.size === resumo.dias.length}
                        onCheckedChange={(c) => {
                          if (c) setSelecionados(new Set(resumo.dias.map((x) => x.data)));
                          else limparSel();
                        }}
                      />
                    </th>
                  )}
                  <th className="p-2 text-left">Dia</th>
                  <th className="p-2 text-left">Entrada</th>
                  <th className="p-2 text-left">Saída int.</th>
                  <th className="p-2 text-left">Retorno</th>
                  <th className="p-2 text-left">Saída</th>
                  <th className="p-2 text-left">Atraso</th>
                  <th className="p-2 text-left">Trab.</th>
                  <th className="p-2 text-left">Extras</th>
                  <th className="p-2 text-left">Obs</th>
                  {podeEditar && <th className="p-2 text-left">Ação</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumo.dias.map((d) => {
                  const cellClass = (_val: string | null) =>
                    `p-2 font-mono ${podeEditar ? "cursor-pointer hover:bg-accent/50" : ""}`;
                  const semRegistro =
                    !d.registrado.entrada &&
                    !d.registrado.saida_intervalo &&
                    !d.registrado.retorno_intervalo &&
                    !d.registrado.saida_final;
                  const renderEmpty = () =>
                    d.justificativa ? (
                      <span className="text-blue-700 font-semibold text-xs">{d.justificativa.tipo.nome}</span>
                    ) : d.falta ? (
                      <span className="text-red-600 font-bold">FALTA</span>
                    ) : d.trabalha && semRegistro && (d.marcacaoNaoRegistrada || d.pendente) ? (
                      <span className="text-yellow-700 text-xs">marcação não registrada</span>
                    ) : d.trabalha && semRegistro && d.bancoHorasMinutos < 0 ? (
                      <span className="text-red-600 font-bold text-xs">DÉBITO BH</span>
                    ) : d.trabalha ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {podeEditar ? "folga · clique p/ inserir" : "folga"}
                      </span>
                    );
                  const rowBg = d.justificativa
                    ? "bg-blue-500/5"
                    : d.falta
                      ? "bg-red-500/5"
                      : d.pendente && d.trabalha
                        ? "bg-yellow-500/5"
                        : !d.trabalha
                          ? "bg-muted/30"
                          : "";
                  return (
                    <tr key={d.data} className={rowBg}>
                      {podeEditar && (
                        <td className="p-2">
                          <Checkbox checked={selecionados.has(d.data)} onCheckedChange={() => toggleSel(d.data)} />
                        </td>
                      )}
                      <td className="p-2 whitespace-nowrap font-mono">
                        {d.data.slice(8, 10)}{" "}
                        <span className="text-xs text-muted-foreground">{DIAS_SEMANA_CURTO[d.diaSemana]}</span>
                        {d.jornadaCodigo && (
                          <span
                            className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold tracking-wider align-middle"
                            title={d.jornadaNome ?? ""}
                          >
                            {d.jornadaCodigo}
                          </span>
                        )}
                      </td>
                      <td className={cellClass(d.registrado.entrada)} onClick={() => abrirCelula(d, "entrada")}>
                        {d.registrado.entrada ?? renderEmpty()}
                      </td>
                      <td
                        className={cellClass(d.registrado.saida_intervalo)}
                        onClick={() => abrirCelula(d, "saida_intervalo")}
                      >
                        {d.registrado.saida_intervalo ?? "—"}
                      </td>
                      <td
                        className={cellClass(d.registrado.retorno_intervalo)}
                        onClick={() => abrirCelula(d, "retorno_intervalo")}
                      >
                        {d.registrado.retorno_intervalo ?? "—"}
                      </td>
                      <td className={cellClass(d.registrado.saida_final)} onClick={() => abrirCelula(d, "saida_final")}>
                        {d.registrado.saida_final ?? "—"}
                      </td>
                      <td className="p-2">{d.atrasoMinutos ? `${d.atrasoMinutos}m` : "—"}</td>
                      <td className="p-2">{d.trabalhadoMinutos ? formatMin(d.trabalhadoMinutos) : "—"}</td>
                      <td className="p-2 text-orange-600">{d.extrasMinutos ? formatMin(d.extrasMinutos) : "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {d.justificativa && (
                          <div className="text-blue-700 font-semibold">{d.justificativa.tipo.nome}</div>
                        )}
                        {d.observacao && <div>{d.observacao}</div>}
                      </td>
                      {podeEditar && (
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant={d.justificativa ? "secondary" : "outline"}
                            onClick={() => setJustDia(d)}
                            className="h-6 px-2 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {d.justificativa ? "Editar just." : "Justificar"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <EditarPontoDialog open={!!editReg} onClose={() => setEditReg(null)} registro={editReg} onSaved={carregar} />
      {empresaId && (
        <InserirPontoDialog
          open={inserirOpen}
          onClose={() => setInserirOpen(false)}
          empresaId={empresaId}
          funcionarios={funcs}
          onSaved={carregar}
          prefill={prefill}
        />
      )}
      {empresaId && justDia && funcId && (
        <AplicarJustificativaDialog
          open={!!justDia}
          onClose={() => setJustDia(null)}
          empresaId={empresaId}
          funcionarioId={funcId}
          data={justDia.data}
          justificativaAtualId={justDia.justificativa?.id ?? null}
          onSaved={carregar}
        />
      )}
      {empresaId && funcId && (
        <BulkJustificarDialog
          open={bulkJustOpen}
          onClose={() => setBulkJustOpen(false)}
          empresaId={empresaId}
          funcionarioId={funcId}
          datas={Array.from(selecionados).sort()}
          onSaved={() => {
            limparSel();
            carregar();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
