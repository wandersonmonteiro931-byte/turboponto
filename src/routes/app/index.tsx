import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { role, loading, session, profileLoaded } = useAuth();
  const navigate = useNavigate();
  const destino = role === "admin" || role === "gerente" ? "/app/empresa" : "/app/funcionario";

  useEffect(() => {
    if (loading || !session) return;
    if (!profileLoaded) return;
    navigate({ to: destino, replace: true });
  }, [destino, loading, session, profileLoaded, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Redirecionando...</div>
    </div>
  );
}
