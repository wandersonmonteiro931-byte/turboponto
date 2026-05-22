import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/empresa/configuracoes")({
  component: () => <Placeholder title="Configurações" />,
});
