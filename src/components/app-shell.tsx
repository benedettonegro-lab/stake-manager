import { BottomNav } from "@/components/bottom-nav";
import { FabSlot } from "@/components/fab-slot";
import { TopBar } from "@/components/top-bar";

type AppShellProps = {
  children: React.ReactNode;
  /** Titolo nell’header (opzionale) */
  title?: string;
  /** Sottotitolo sotto l’area scroll (opzionale, dentro main) */
  subtitle?: string;
  showBottomNav?: boolean;
  /** Mostra “Stake Manager” con gradient al posto del titolo */
  showBrand?: boolean;
};

export function AppShell({
  children,
  title,
  subtitle,
  showBottomNav = true,
  showBrand,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0A1020] text-[#E6EAF2]">
      <TopBar title={title} showBrand={showBrand} />
      <main
        className={`sm-app-constrain flex-1 px-3 pt-3 sm:px-4 sm:pt-4 ${showBottomNav ? "pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] sm:pb-36" : "pb-8 sm:pb-10"}`}
      >
        {subtitle ? (
          <p className="mb-3 text-[14px] leading-snug text-[#8B93A7] sm:mb-4 sm:text-sm sm:leading-relaxed">
            {subtitle}
          </p>
        ) : null}
        {children}
      </main>
      {showBottomNav ? (
        <>
          <FabSlot />
          <BottomNav />
        </>
      ) : null}
    </div>
  );
}
