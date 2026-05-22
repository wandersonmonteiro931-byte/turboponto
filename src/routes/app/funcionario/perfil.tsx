import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/funcionario/perfil")({
  component: () => <Placeholder title="Meu Perfil" />,
});
