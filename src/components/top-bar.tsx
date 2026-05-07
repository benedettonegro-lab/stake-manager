import Link from "next/link";

type TopBarProps = {
  title?: string;
  /** Mostra brand invece del titolo */
  showBrand?: boolean;
};

export function TopBar({ title, showBrand }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-gradient-to-b from-[#070B14]/98 to-[#070B14]/92 backdrop-blur-xl">
      <div className="sm-app-constrain flex min-h-[3.75rem] items-center justify-between px-4 py-2 sm:h-14 sm:min-h-0 sm:px-4 sm:py-0">
        <Link
          href="/dashboard"
          className="text-base font-semibold uppercase tracking-[0.15em] text-[#94a3b8] sm:text-xs sm:tracking-[0.2em]"
        >
          Stake
        </Link>
        <div className="flex min-w-0 flex-1 justify-center px-2">
          {showBrand ? (
            <span className="truncate text-[28px] font-bold leading-[1.1] sm:text-2xl sm:font-semibold sm-gradient-text">
              Stake Manager
            </span>
          ) : (
            <h1 className="truncate text-center text-[28px] font-bold leading-tight text-[#E6EAF2] sm:text-2xl sm:font-semibold">
              {title ?? "Stake Manager"}
            </h1>
          )}
        </div>
        <div className="w-8 shrink-0" aria-hidden />
      </div>
      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-[#a855f7]/18 to-transparent"
        aria-hidden
      />
    </header>
  );
}
