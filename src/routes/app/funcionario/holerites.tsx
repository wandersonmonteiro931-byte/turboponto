import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/funcionario/holerites")({
  component: () => <Placeholder title="Holerites" />,
});
