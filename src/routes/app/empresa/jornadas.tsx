import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/empresa/jornadas")({
  component: () => <Placeholder title="Jornadas" />,
});
