import type { ReactNode } from "react";

type BankrollCardProps = {
  title: string;
  note?: string | null;
  balanceLabel: string;
  /** Valore numerico grezzo per colore */
  balanceAmount: number;
  balanceFormatted: string;
  meta?: string;
  action?: ReactNode;
};

export function BankrollCard({
  title,
  note,
  balanceLabel,
  balanceAmount,
  balanceFormatted,
  meta,
  action,
}: BankrollCardProps) {
  const balClass =
    balanceAmount > 0
      ? "text-[#34d399]"
      : balanceAmount < 0
        ? "text-[#fb7185]"
        : "text-[#8B93A7]";

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#11182B] px-2.5 py-2 shadow-sm shadow-black/12 sm:rounded-2xl sm:p-4 sm:shadow-md sm:shadow-black/15">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug text-[#E6EAF2] sm:text-xl sm:font-semibold sm:leading-normal">{title}</p>
          {note ? (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-[#8B93A7] sm:mt-1 sm:text-sm sm:leading-normal">{note}</p>
          ) : null}
          <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:mt-2 sm:text-xs sm:tracking-[0.14em]">
            {balanceLabel}
          </p>
          <p className={`mt-0.5 whitespace-nowrap text-xl font-bold tabular-nums leading-none sm:text-2xl sm:font-semibold ${balClass}`}>
            {balanceFormatted} €
          </p>
          {meta ? (
            <p className="mt-1.5 text-xs text-[#8B93A7] sm:mt-2 sm:text-sm">{meta}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center sm:pt-0.5">{action}</div>
        ) : null}
      </div>
    </div>
  );
}
