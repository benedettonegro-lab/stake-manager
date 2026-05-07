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
    <div className="flex min-h-dvh flex-col bg-[#070B14] text-[#E6EAF2]">
      <TopBar title={title} showBrand={showBrand} />
      <main
        className={`sm-app-constrain flex-1 px-4 pt-5 sm:px-4 sm:pt-4 ${showBottomNav ? "pb-40 sm:pb-36" : "pb-10"}`}
      >
        {subtitle ? (
          <p className="mb-5 text-[15px] leading-relaxed text-[#94a3b8] sm:mb-4 sm:text-sm">
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
