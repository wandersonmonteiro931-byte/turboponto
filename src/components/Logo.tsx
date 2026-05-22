import logo from "@/assets/turbo-logo.webp";

export function Logo({ size = 48, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src={logo} alt="Turbo Lanches" style={{ width: size, height: size }} className="rounded-md object-contain" />
      {withText && (
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight">Turbo Ponto</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Turbo Lanches</div>
        </div>
      )}
    </div>
  );
}
