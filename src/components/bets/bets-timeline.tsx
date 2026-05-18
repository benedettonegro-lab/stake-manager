"use client";

import { VariableVirtualList } from "@/components/ui/variable-virtual-list";
import { flattenBetTimeline, type BetTimelineRow } from "@/lib/flatten-bet-timeline";
import type { BetListRow } from "@/lib/repositories/bets-repository";
import { memo, useMemo, type ReactNode } from "react";

const VIRTUAL_THRESHOLD = 40;

type BetsTimelineProps = {
  bets: BetListRow[];
  enableVirtual: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  formatSignedProfitEuro: (n: number) => string;
  headerProfitClass: (n: number) => string;
  renderBetCard: (bet: BetListRow) => ReactNode;
};

function MonthHeader({
  title,
  profitTotal,
  formatSignedProfitEuro,
  headerProfitClass,
}: {
  title: string;
  profitTotal: number;
  formatSignedProfitEuro: (n: number) => string;
  headerProfitClass: (n: number) => string;
}) {
  return (
    <header className="flex items-end justify-between gap-2 border-b border-white/10 pb-1 sm:pb-2">
      <h3 className="text-base font-bold capitalize leading-tight tracking-tight text-[#E6EAF2] sm:text-xl">
        {title}
      </h3>
      <p
        className={`shrink-0 whitespace-nowrap text-lg font-bold tabular-nums sm:text-2xl ${headerProfitClass(profitTotal)}`}
      >
        {formatSignedProfitEuro(profitTotal)}
      </p>
    </header>
  );
}

function DayHeader({
  title,
  profitTotal,
  formatSignedProfitEuro,
  headerProfitClass,
}: {
  title: string;
  profitTotal: number;
  formatSignedProfitEuro: (n: number) => string;
  headerProfitClass: (n: number) => string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-l-2 border-emerald-500/35 pl-2 sm:pl-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#8B93A7] sm:text-lg sm:font-semibold">
        {title}
      </h4>
      <p
        className={`shrink-0 whitespace-nowrap text-sm font-bold tabular-nums sm:text-xl ${headerProfitClass(profitTotal)}`}
      >
        {formatSignedProfitEuro(profitTotal)}
      </p>
    </div>
  );
}

export const BetsTimeline = memo(function BetsTimeline({
  bets,
  enableVirtual,
  loadingMore,
  hasMore,
  onLoadMore,
  formatSignedProfitEuro,
  headerProfitClass,
  renderBetCard,
}: BetsTimelineProps) {
  const rows = useMemo(() => flattenBetTimeline(bets), [bets]);
  const useVirtual = enableVirtual && bets.length >= VIRTUAL_THRESHOLD;

  const renderRow = (row: BetTimelineRow) => {
    if (row.kind === "month") {
      return (
        <MonthHeader
          title={row.title}
          profitTotal={row.profitTotal}
          formatSignedProfitEuro={formatSignedProfitEuro}
          headerProfitClass={headerProfitClass}
        />
      );
    }
    if (row.kind === "day") {
      return (
        <DayHeader
          title={row.title}
          profitTotal={row.profitTotal}
          formatSignedProfitEuro={formatSignedProfitEuro}
          headerProfitClass={headerProfitClass}
        />
      );
    }
    return <div className="pb-1.5 sm:pb-3">{renderBetCard(row.bet)}</div>;
  };

  if (useVirtual) {
    return (
      <>
        <VariableVirtualList
          rows={rows}
          className="max-h-[min(68dvh,720px)]"
          onEndReached={hasMore ? onLoadMore : undefined}
          renderRow={(row) => renderRow(row)}
        />
        {loadingMore ? (
          <p className="py-2 text-center text-xs text-[#8B93A7]">Caricamento…</p>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-8">
      {rows.map((row) => (
        <div key={row.key}>{renderRow(row)}</div>
      ))}
      {hasMore ? (
        <div className="flex justify-center pt-1 sm:pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="sm-touch min-h-11 w-full max-w-xs rounded-full border border-white/[0.08] bg-[#131C31] px-4 text-sm font-semibold text-[#E6EAF2] transition-opacity active:scale-[0.98] disabled:opacity-50"
          >
            {loadingMore ? "Caricamento…" : "Carica altre giocate"}
          </button>
        </div>
      ) : null}
    </div>
  );
});
