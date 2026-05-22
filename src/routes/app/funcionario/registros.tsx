import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/funcionario/registros")({
  component: () => <Placeholder title="Meus Registros" />,
});
