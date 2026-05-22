import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/funcionario/avisos")({
  component: () => <Placeholder title="Avisos" />,
});
