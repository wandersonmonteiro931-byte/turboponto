import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export function InstallPWAButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    setIos(isIOS());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("App instalado!");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "dismissed") {
        toast.message("Instalação cancelada");
      }
      setDeferred(null);
      return;
    }
    if (ios) {
      toast.message("Para instalar no iPhone", {
        description: "Toque em Compartilhar e depois em 'Adicionar à Tela de Início'.",
        duration: 8000,
      });
      return;
    }
    toast.message("Como instalar", {
      description:
        "No menu do navegador, toque em 'Instalar app' ou 'Adicionar à Tela de Início'.",
      duration: 8000,
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={handleClick}
    >
      <Download className="h-4 w-4 mr-2" />
      Baixar app
    </Button>
  );
}
