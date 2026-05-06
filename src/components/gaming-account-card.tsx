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
  return "border-[#64748b]/50 bg-[#1f2937] text-[#94a3b8]";
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
    <article className="overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0c101c] shadow-sm shadow-black/20 transition hover:border-[#334155]">
      <Link
        href={`/accounts/${accountId}`}
        className="block px-3.5 pb-3 pt-3.5 transition active:bg-[#111827]/80"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-white">{accountName}</h3>
            {bookmaker ? (
              <p className="mt-0.5 truncate text-[11px] text-[#94a3b8]">{bookmaker}</p>
            ) : null}
          </div>
          {accountStatus ? (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusBadgeClass(accountStatus)}`}
            >
              {STATUS_LABEL[accountStatus]}
            </span>
          ) : null}
        </div>
        {identityLine ? (
          <p className="mt-1 truncate text-[10px] text-[#64748b]">{identityLine}</p>
        ) : null}
        <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${toneClass(bal)}`}>
          {formatMoney(currentBalance)} €
        </p>
        <p className="text-[9px] font-medium uppercase tracking-wide text-[#475569]">Saldo conto</p>

        {showInitial ? (
          <p className="mt-2 text-[10px] text-[#64748b]">
            Iniziale{" "}
            <span className={`font-semibold tabular-nums ${toneClass(initBal)}`}>
              {formatMoney(initialBalance!)} €
            </span>
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-4 gap-1.5">
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

      <div className="flex flex-wrap gap-1.5 border-t border-[#1a2230] px-3 py-2.5">
        {movementsHrefBase ? (
          <>
            <QuickActionButton
              href={`${movementsHrefBase}?account=${encodeURIComponent(accountId)}&type=deposit`}
              variant="secondary"
              className="min-h-9 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
            >
              Deposita
            </QuickActionButton>
            <QuickActionButton
              href={`${movementsHrefBase}?account=${encodeURIComponent(accountId)}&type=withdrawal`}
              variant="secondary"
              className="min-h-9 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-100"
            >
              Preleva
            </QuickActionButton>
          </>
        ) : null}
        {onEdit ? (
          <QuickActionButton onClick={onEdit} variant="ghost" className="min-h-9 text-[10px]">
            Modifica
          </QuickActionButton>
        ) : null}
        {onDelete ? (
          <QuickActionButton onClick={onDelete} variant="danger" className="min-h-9 text-[10px]">
            Elimina
          </QuickActionButton>
        ) : null}
      </div>
    </article>
  );
}
