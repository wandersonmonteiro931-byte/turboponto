import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { role, loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session) return;
    // wait until role is resolved before deciding redirect target
    if (role === null) return;
    if (role === "funcionario") {
      navigate({ to: "/app/funcionario", replace: true });
    } else {
      navigate({ to: "/app/empresa", replace: true });
    }
  }, [role, loading, session, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Redirecionando...</div>
    </div>
  );
}
