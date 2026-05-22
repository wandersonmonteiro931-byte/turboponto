import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";

export const Route = createFileRoute("/app/funcionario/cartao-ponto")({
  component: () => <Placeholder title="Cartão de Ponto" />,
});
