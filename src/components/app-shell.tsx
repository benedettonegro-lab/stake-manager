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
    <div className="flex min-h-dvh flex-col bg-[#050816] text-white">
      <TopBar title={title} showBrand={showBrand} />
      <main
        className={`sm-app-constrain flex-1 px-3 pt-3 sm:px-4 sm:pt-4 ${showBottomNav ? "pb-36" : "pb-10"}`}
      >
        {subtitle ? (
          <p className="mb-4 text-sm leading-relaxed text-[#94a3b8]">{subtitle}</p>
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
