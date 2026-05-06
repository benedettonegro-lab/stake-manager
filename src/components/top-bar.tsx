import Link from "next/link";

type TopBarProps = {
  title?: string;
  /** Mostra brand invece del titolo */
  showBrand?: boolean;
};

export function TopBar({ title, showBrand }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#1a1f2e] bg-gradient-to-b from-[#0a0e1a]/98 to-[#050816]/92 backdrop-blur-xl">
      <div className="sm-app-constrain flex h-14 items-center justify-between px-3 sm:px-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-[#94a3b8]"
        >
          Stake
        </Link>
        <div className="flex min-w-0 flex-1 justify-center px-2">
          {showBrand ? (
            <span className="truncate text-base font-semibold sm:text-lg sm-gradient-text">
              Stake Manager
            </span>
          ) : (
            <h1 className="truncate text-center text-base font-semibold text-white">
              {title ?? "Stake Manager"}
            </h1>
          )}
        </div>
        <div className="w-8 shrink-0" aria-hidden />
      </div>
      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-[#5b5cff]/60 to-transparent"
        aria-hidden
      />
    </header>
  );
}
