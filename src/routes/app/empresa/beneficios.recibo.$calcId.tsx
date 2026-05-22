import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRL, mesNome } from "@/lib/beneficios";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/app/empresa/beneficios/recibo/$calcId")({
  component: ReciboPage,
});

type Dados = {
  funcionario: { nome: string; cpf: string | null; cargo: string | null } | null;
  empresa: { nome_fantasia: string; cnpj: string | null } | null;
  mes: number; ano: number; valor: number; dataEntrega: string | null;
} | null;

function ReciboPage() {
  const { calcId } = Route.useParams();
  const [dados, setDados] = useState<Dados>(null);

  useEffect(() => {
    void (async () => {
      const { data: calc } = await supabase.from("beneficios_calculos")
        .select("empresa_id,funcionario_id,mes_referencia,ano_referencia,valor_estimado,beneficio_id")
        .eq("id", calcId).maybeSingle();
      if (!calc) return;
      const [{ data: func }, { data: emp }, { data: ent }] = await Promise.all([
        supabase.from("funcionarios").select("nome,cpf,cargo").eq("id", calc.funcionario_id).maybeSingle(),
        supabase.from("empresas").select("nome_fantasia,cnpj").eq("id", calc.empresa_id).maybeSingle(),
        supabase.from("beneficios_entregas").select("data_entrega")
          .eq("funcionario_id", calc.funcionario_id).eq("beneficio_id", calc.beneficio_id)
          .eq("mes_referencia", calc.mes_referencia).eq("ano_referencia", calc.ano_referencia).maybeSingle(),
      ]);
      setDados({
        funcionario: func,
        empresa: emp,
        mes: calc.mes_referencia,
        ano: calc.ano_referencia,
        valor: calc.valor_estimado,
        dataEntrega: ent?.data_entrega ?? null,
      });
    })();
  }, [calcId]);

  if (!dados) return <p className="p-8 text-sm text-muted-foreground">Carregando recibo...</p>;

  const dataEntregaFmt = dados.dataEntrega
    ? new Date(dados.dataEntrega + "T00:00").toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto print:hidden mb-4 flex justify-end">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Imprimir / PDF</Button>
      </div>
      <div className="max-w-3xl mx-auto bg-white p-10 shadow print:shadow-none text-black">
        <header className="border-b pb-4 mb-6">
          <h1 className="text-2xl font-bold">{dados.empresa?.nome_fantasia ?? "—"}</h1>
          <p className="text-sm text-gray-600">CNPJ: {dados.empresa?.cnpj ?? "—"}</p>
        </header>

        <h2 className="text-xl font-bold text-center mb-6">RECIBO DE ENTREGA — CESTA BÁSICA</h2>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <Linha label="Funcionário" value={dados.funcionario?.nome ?? "—"} />
          <Linha label="CPF" value={dados.funcionario?.cpf ?? "—"} />
          <Linha label="Cargo" value={dados.funcionario?.cargo ?? "—"} />
          <Linha label="Mês de referência" value={`${mesNome(dados.mes)}/${dados.ano}`} />
          <Linha label="Data da entrega" value={dataEntregaFmt} />
          <Linha label="Valor estimado" value={`até ${fmtBRL(dados.valor || 300)}`} />
        </div>

        <p className="text-sm leading-relaxed mb-2"><strong>Descrição:</strong> Cesta Básica por Assiduidade</p>

        <p className="text-sm leading-relaxed mt-6 text-justify">
          Declaro, para os devidos fins, que recebi da empresa <strong>{dados.empresa?.nome_fantasia ?? "Turbo Lanches"}</strong> a
          cesta básica referente ao mês de <strong>{mesNome(dados.mes)}/{dados.ano}</strong>, concedida conforme as regras
          internas de assiduidade e pontualidade.
        </p>

        <div className="grid grid-cols-2 gap-12 mt-20">
          <div className="text-center">
            <div className="border-t border-black pt-2 text-xs">Assinatura do Funcionário</div>
          </div>
          <div className="text-center">
            <div className="border-t border-black pt-2 text-xs">Assinatura da Empresa</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
