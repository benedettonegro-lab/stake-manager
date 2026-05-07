import { QuickActionButton, StatPill } from "@/components/app";
import { formatAccountRoi } from "@/lib/account-bet-metrics";
import Link from "next/link";

function formatMoney(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function toneClass(n: number): string {
  if (n > 0) return "text-[#34d399]";
  if (n < 0) return "text-[#fb7185]";
  return "text-[#94a3b8]";
}

export type GamingAccountStatus = "active" | "paused" | "closed";

const STATUS_LABEL: Record<GamingAccountStatus, string> = {
  active: "Attivo",
  paused: "In pausa",
  closed: "Chiuso",
};

function statusBadgeClass(s: GamingAccountStatus): string {
  if (s === "active") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (s === "paused") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-[#64748b]/50 bg-[#151d2e] text-[#94a3b8]";
}

export type GamingAccountCardProps = {
  accountId: string;
  accountName: string;
  bookmaker: string;
  playerName?: string | null;
  initialBalance?: string | null;
  currentBalance: string;
  totalDeposits: number;
  totalWithdrawals: number;
  totalProfit: number;
  totalStake: number;
  linkLabel?: string;
  playerIdShort?: string | null;
  accountStatus?: GamingAccountStatus | null;
  onEdit?: () => void;
  onDelete?: () => void;
  movementsHrefBase?: string | null;
};

export function GamingAccountCard({
  accountId,
  accountName,
  bookmaker,
  playerName,
  initialBalance,
  currentBalance,
  totalDeposits,
  totalWithdrawals,
  totalProfit,
  totalStake,
  playerIdShort,
  accountStatus,
  onEdit,
  onDelete,
  movementsHrefBase,
}: GamingAccountCardProps) {
  const bal = Number.parseFloat(currentBalance) || 0;
  const roiStr = formatAccountRoi(totalProfit, totalStake);
  const initBal =
    initialBalance != null && initialBalance !== ""
      ? Number.parseFloat(initialBalance)
      : NaN;
  const showInitial = !Number.isNaN(initBal);

  const identityParts: string[] = [];
  if (playerName) identityParts.push(playerName);
  if (playerIdShort) identityParts.push(`ID ${playerIdShort}`);
  const identityLine = identityParts.length ? identityParts.join(" · ") : null;

  const roiTone =
    totalStake <= 0
      ? ("default" as const)
      : totalProfit > 0
        ? ("positive" as const)
        : totalProfit < 0
          ? ("negative" as const)
          : ("default" as const);

  return (
    <article className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1525] shadow-sm shadow-black/15 transition hover:border-white/[0.12]">
      <Link
        href={`/accounts/${accountId}`}
        className="block p-5 transition active:bg-[#0E1525]/80 sm:px-3.5 sm:pb-3 sm:pt-3.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[22px] font-bold leading-tight text-[#E6EAF2] sm:text-xl sm:font-semibold">
              {accountName}
            </h3>
            {bookmaker ? (
              <p className="mt-1.5 truncate text-[15px] text-[#94a3b8] sm:mt-1 sm:text-sm">{bookmaker}</p>
            ) : null}
          </div>
          {accountStatus ? (
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.14em] sm:px-2 sm:py-0.5 sm:text-xs sm:tracking-wide ${statusBadgeClass(accountStatus)}`}
            >
              {STATUS_LABEL[accountStatus]}
            </span>
          ) : null}
        </div>
        {identityLine ? (
          <p className="mt-2 truncate text-[15px] text-[#64748b] sm:mt-2 sm:text-sm">{identityLine}</p>
        ) : null}
        <p
          className={`mt-4 min-w-0 overflow-x-auto whitespace-nowrap text-[30px] font-extrabold tabular-nums leading-none tracking-tight sm:mt-3 sm:text-2xl sm:font-bold ${toneClass(bal)}`}
        >
          {formatMoney(currentBalance)} €
        </p>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#475569] sm:text-xs sm:font-medium sm:tracking-wide">
          Saldo conto
        </p>

        {showInitial ? (
          <p className="mt-3 text-[15px] text-[#64748b] sm:mt-3 sm:text-sm">
            Iniziale{" "}
            <span className={`whitespace-nowrap text-[22px] font-bold tabular-nums sm:text-xl sm:font-semibold ${toneClass(initBal)}`}>
              {formatMoney(initialBalance!)} €
            </span>
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-4 gap-2 sm:mt-3 sm:gap-1.5">
          <StatPill
            className="!px-2 !py-1.5"
            label="Dep."
            value={`${formatMoney(totalDeposits)} €`}
            tone="positive"
          />
          <StatPill
            className="!px-2 !py-1.5"
            label="Prel."
            value={`${formatMoney(totalWithdrawals)} €`}
            tone="warn"
          />
          <StatPill
            className="!px-2 !py-1.5"
            label="P/L"
            value={`${totalProfit >= 0 ? "+" : ""}${formatMoney(totalProfit)} €`}
            tone={
              totalProfit > 0 ? "positive" : totalProfit < 0 ? "negative" : "default"
            }
          />
          <StatPill className="!px-2 !py-1.5" label="ROI" value={roiStr} tone={roiTone} />
        </div>
      </Link>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.08] p-4 sm:gap-1.5 sm:px-3 sm:py-2.5">
        {movementsHrefBase ? (
          <>
            <QuickActionButton
              href={`${movementsHrefBase}?account=${encodeURIComponent(accountId)}&type=deposit`}
              variant="secondary"
              className="min-h-[48px] border-emerald-500/30 bg-emerald-500/10 text-[16px] font-semibold text-emerald-200 sm:min-h-9 sm:text-sm"
            >
              Deposita
            </QuickActionButton>
            <QuickActionButton
              href={`${movementsHrefBase}?account=${encodeURIComponent(accountId)}&type=withdrawal`}
              variant="secondary"
              className="min-h-[48px] border-amber-500/30 bg-amber-500/10 text-[16px] font-semibold text-amber-100 sm:min-h-9 sm:text-sm"
            >
              Preleva
            </QuickActionButton>
          </>
        ) : null}
        {onEdit ? (
          <QuickActionButton onClick={onEdit} variant="ghost" className="min-h-[48px] text-[16px] sm:min-h-9 sm:text-sm">
            Modifica
          </QuickActionButton>
        ) : null}
        {onDelete ? (
          <QuickActionButton onClick={onDelete} variant="danger" className="min-h-[48px] text-[16px] sm:min-h-9 sm:text-sm">
            Elimina
          </QuickActionButton>
        ) : null}
      </div>
    </article>
  );
}
