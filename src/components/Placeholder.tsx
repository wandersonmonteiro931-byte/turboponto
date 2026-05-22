import { Card, CardContent } from "@/components/ui/card";

export function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {description ?? "Esta tela será implementada nas próximas etapas do projeto."}
        </p>
      </CardContent>
    </Card>
  );
}
