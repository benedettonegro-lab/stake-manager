import Link from "next/link";

type TopBarProps = {
  title?: string;
  /** Mostra brand invece del titolo */
  showBrand?: boolean;
};

export function TopBar({ title, showBrand }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0B1224]/98 pt-[env(safe-area-inset-top,0px)] max-sm:backdrop-blur-none sm:bg-gradient-to-b sm:from-[#0B1224]/98 sm:to-[#0B1224]/92 sm:backdrop-blur-xl">
      <div className="sm-app-constrain flex min-h-[2.5rem] items-center justify-between px-2.5 py-0 sm:h-14 sm:min-h-0 sm:px-4 sm:py-0">
        <Link
          href="/dashboard"
          className="text-base font-semibold uppercase tracking-[0.15em] text-[#8B93A7] sm:text-xs sm:tracking-[0.2em]"
        >
          Stake
        </Link>
        <div className="flex min-w-0 flex-1 justify-center px-2">
          {showBrand ? (
            <span className="truncate text-2xl font-bold leading-tight sm:text-2xl sm:font-semibold sm-gradient-text">
              Stake Manager
            </span>
          ) : (
            <h1 className="truncate text-center text-[17px] font-bold leading-tight text-[#E6EAF2] sm:text-2xl sm:font-semibold">
              {title ?? "Stake Manager"}
            </h1>
          )}
        </div>
        <div className="w-8 shrink-0" aria-hidden />
      </div>
      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-[#A970FF]/10 to-transparent"
        aria-hidden
      />
    </header>
  );
}
