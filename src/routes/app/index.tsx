import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { role, loading, session } = useAuth();
  const navigate = useNavigate();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    if (role === null && !waited) return;
    navigate({ to: role === "funcionario" ? "/app/funcionario" : "/app/empresa", replace: true });
  }, [role, loading, session, waited, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Redirecionando...</div>
    </div>
  );
}
