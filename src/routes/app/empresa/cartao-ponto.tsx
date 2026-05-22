import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/empresa/cartao-ponto")({
  component: () => <Placeholder title="Cartão de Ponto" />,
});
