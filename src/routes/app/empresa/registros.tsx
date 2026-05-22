import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/empresa/registros")({
  component: () => <Placeholder title="Registros de Ponto" />,
});
