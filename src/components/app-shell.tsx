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
    <div className="flex min-h-dvh flex-col bg-[#0B1224] text-[#E6EAF2]">
      <TopBar title={title} showBrand={showBrand} />
      <main
        className={`sm-app-constrain sm-app-scroll flex flex-1 flex-col px-2 pt-0 transition-opacity duration-200 ease-out max-sm:gap-3 motion-reduce:transition-none sm:block sm:gap-0 sm:px-4 sm:pt-4 ${showBottomNav ? "pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:pb-36" : "pb-6 sm:pb-10"}`}
      >
        {subtitle ? (
          <p className="mb-0 text-[12px] leading-snug text-[#8B93A7] sm:mb-4 sm:text-sm sm:leading-relaxed">
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
