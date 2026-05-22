import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CreditCard, Gift, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/funcionario/")({
  component: FuncionarioHome,
});

function FuncionarioHome() {
  const { nome } = useAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dataStr = now.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const horaStr = now.toLocaleTimeString("pt-BR");

  const proximoPonto = "Entrada";

  return (
    <div className="space-y-6">
      <Card className="bg-black text-white border-primary/30">
        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/70 capitalize">{dataStr}</div>
            <div className="text-3xl sm:text-4xl font-bold mt-1">Olá, {nome || "funcionário"}</div>
            <div className="text-sm text-primary mt-2">Próximo ponto: {proximoPonto}</div>
          </div>
          <div className="text-right">
            <div className="text-4xl sm:text-5xl font-mono font-bold text-primary tabular-nums">{horaStr}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 flex flex-col items-center text-center">
          <Clock className="h-12 w-12 text-primary mb-3" />
          <h3 className="text-lg font-semibold mb-1">Registrar ponto</h3>
          <p className="text-sm text-muted-foreground mb-4">Toque no botão abaixo para registrar sua marcação</p>
          <Button
            size="lg"
            className="px-10 py-6 text-lg font-bold"
            onClick={() => toast.info("Funcionalidade chegará em breve")}
          >
            Bater Ponto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros de hoje</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum registro hoje.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Shortcut to="/app/funcionario/cartao-ponto" icon={CreditCard} label="Cartão de Ponto" />
        <Shortcut to="/app/funcionario/beneficios" icon={Gift} label="Benefícios" />
        <Shortcut to="/app/funcionario/holerites" icon={FileText} label="Holerites" />
      </div>
    </div>
  );
}

function Shortcut({ to, icon: Icon, label }: { to: string; icon: typeof Clock; label: string }) {
  return (
    <Link to={to}>
      <Card className="hover:border-primary transition-colors cursor-pointer">
        <CardContent className="p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/20 flex items-center justify-center">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="font-medium">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
