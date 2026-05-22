import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/empresa/empresa")({
  component: () => <Placeholder title="Empresa" />,
});
