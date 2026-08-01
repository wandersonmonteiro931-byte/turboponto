import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type FuncionarioStatus = "ativo" | "afastado" | "desligado";

export function useFuncionarioStatus() {
  const { user } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState<FuncionarioStatus | null>(null);
  const [dataDesligamento, setDataDesligamento] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("funcionarios")
        .select("status,data_desligamento")
        .eq("usuario_id", userId)
        .maybeSingle();
      if (cancel) return;
      const f = data as { status: FuncionarioStatus; data_desligamento: string | null } | null;
      setStatus(f?.status ?? null);
      setDataDesligamento(f?.data_desligamento ?? null);
      setCarregado(true);
    })();
    return () => {
      cancel = true;
    };
  }, [userId]);

  return { status, dataDesligamento, carregado, desligado: status === "desligado" };
}
