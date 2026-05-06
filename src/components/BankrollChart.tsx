"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type BankrollBetInput = {
  id?: string;
  placed_at: string;
  profit: string;
};

type ChartPoint = {
  at: number;
  bankroll: number;
  delta: number;
};

export type BankrollPeriod = "1d" | "1w" | "1m" | "1y";

const PERIOD_OPTIONS: { id: BankrollPeriod; label: string }[] = [
  { id: "1d", label: "1G" },
  { id: "1w", label: "1S" },
  { id: "1m", label: "1M" },
  { id: "1y", label: "1A" },
];

const GREEN = "#34d399";
const RED = "#ef4444";

function periodMs(p: BankrollPeriod): number {
  switch (p) {
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "1w":
      return 7 * 24 * 60 * 60 * 1000;
    case "1m":
      return 30 * 24 * 60 * 60 * 1000;
    case "1y":
      return 365 * 24 * 60 * 60 * 1000;
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
}

function formatMoney(n: number): string {
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Serie cumulativa globale (tutte le giocate, cronologico). */
function buildFullSeries(bets: BankrollBetInput[]): ChartPoint[] {
  const sorted = [...bets].sort((a, b) => {
    const ta = new Date(a.placed_at).getTime();
    const tb = new Date(b.placed_at).getTime();
    if (ta !== tb) return ta - tb;
    const ida = a.id ?? "";
    const idb = b.id ?? "";
    return ida.localeCompare(idb);
  });

  let cum = 0;
  return sorted.map((bet) => {
    const delta = Number.parseFloat(bet.profit) || 0;
    cum += delta;
    return {
      at: new Date(bet.placed_at).getTime(),
      bankroll: Math.round(cum * 1e4) / 1e4,
      delta,
    };
  });
}

/** Bankroll cumulativa all’istante `cutoff` (escluso). */
function bankrollAtCutoff(full: ChartPoint[], cutoff: number): number {
  let y = 0;
  for (const p of full) {
    if (p.at < cutoff) y = p.bankroll;
    else break;
  }
  return y;
}

function padFlatLine(y: number, tMin: number, tMax: number): ChartPoint[] {
  const pad = Math.max(3_600_000, (tMax - tMin) * 0.05 || 86_400_000);
  return [
    { at: tMin - pad, bankroll: y, delta: 0 },
    { at: tMax + pad, bankroll: y, delta: 0 },
  ];
}

/** Punti nel grafico rispetto al periodo (bankroll reale, non reset a zero). */
function buildDisplaySeries(
  full: ChartPoint[],
  period: BankrollPeriod,
): ChartPoint[] {
  if (full.length === 0) return [];

  const now = Date.now();
  const cutoff = now - periodMs(period);
  const y0 = bankrollAtCutoff(full, cutoff);
  const inWindow = full.filter((p) => p.at >= cutoff);

  if (inWindow.length === 0) {
    return padFlatLine(y0, cutoff, now);
  }

  const points: ChartPoint[] = [];
  const first = inWindow[0];
  if (first.at > cutoff) {
    points.push({ at: cutoff, bankroll: y0, delta: 0 });
  }
  points.push(...inWindow);

  if (points.length < 2) {
    const y = points[0].bankroll;
    const t = points[0].at;
    const span = 86_400_000;
    return padFlatLine(y, Math.min(cutoff, t - span), Math.max(now, t + span));
  }

  return points;
}

type TooltipPayloadItem = {
  payload?: ChartPoint;
};

function BankrollTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const ts = typeof label === "number" ? label : row.at;
  const dateStr = new Date(ts).toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const pos = row.bankroll >= 0;
  return (
    <div
      className="rounded-xl border border-[#273449] px-3 py-2.5 shadow-xl"
      style={{
        backgroundColor: "rgba(17, 24, 39, 0.96)",
        backdropFilter: "blur(8px)",
      }}
    >
      <p className="text-[11px] font-medium text-[#94a3b8]">{dateStr}</p>
      <p
        className="mt-1 text-sm font-semibold tabular-nums"
        style={{ color: pos ? GREEN : RED }}
      >
        Bankroll {row.bankroll >= 0 ? "+" : ""}
        {formatMoney(row.bankroll)} €
      </p>
      <p className="mt-1 text-[11px] tabular-nums text-[#64748b]">
        Δ profit {row.delta >= 0 ? "+" : ""}
        {formatMoney(row.delta)} €
      </p>
    </div>
  );
}

type BankrollChartProps = {
  bets: BankrollBetInput[];
};

export function BankrollChart({ bets }: BankrollChartProps) {
  const gradId = useId().replace(/:/g, "");
  const fillGradId = `${gradId}-fill`;
  const [period, setPeriod] = useState<BankrollPeriod>("1m");

  const fullSeries = useMemo(() => buildFullSeries(bets), [bets]);
  const data = useMemo(
    () => buildDisplaySeries(fullSeries, period),
    [fullSeries, period],
  );

  const stroke = useMemo(() => {
    if (data.length === 0) return GREEN;
    const last = data[data.length - 1].bankroll;
    return last >= 0 ? GREEN : RED;
  }, [data]);

  const yDomain = useMemo(() => {
    if (data.length === 0) return undefined;
    const vals = data.map((d) => d.bankroll);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    if (mn === mx) {
      const pad = Math.max(5, Math.abs(mn) * 0.05 + 1);
      return [mn - pad, mx + pad] as [number, number];
    }
    const pad = (mx - mn) * 0.08;
    return [mn - pad, mx + pad] as [number, number];
  }, [data]);

  if (fullSeries.length === 0) {
    return (
      <div
        className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-[#273449] bg-transparent px-4 text-center text-sm text-[#94a3b8]"
        role="status"
      >
        Nessun dato disponibile
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-[#273449] bg-transparent px-1 pb-1 pt-3 sm:px-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
          Periodo
        </p>
        <div className="flex gap-1 rounded-xl border border-[#273449] bg-[#0d1321] p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === opt.id
                  ? "bg-[#1f2937] text-white shadow-sm"
                  : "text-[#94a3b8] hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260} minHeight={220}>
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 6 }}
          style={{ background: "transparent" }}
        >
          <defs>
            <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.42} />
              <stop offset="55%" stopColor={stroke} stopOpacity={0.08} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 6"
            stroke="rgba(39, 52, 73, 0.85)"
            vertical={false}
          />
          <XAxis
            dataKey="at"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tick={{
              fill: "#94a3b8",
              fontSize: 10,
            }}
            tickLine={false}
            axisLine={{ stroke: "#273449" }}
            tickFormatter={(v: number) =>
              new Date(v).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "short",
              })
            }
            minTickGap={24}
          />
          <YAxis
            dataKey="bankroll"
            domain={yDomain}
            tick={{
              fill: "#94a3b8",
              fontSize: 10,
            }}
            tickLine={false}
            axisLine={{ stroke: "#273449" }}
            tickFormatter={(v: number) => `${formatMoney(v)}`}
            width={56}
          />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
          <Tooltip
            content={<BankrollTooltip />}
            cursor={{
              stroke: "rgba(168, 85, 247, 0.45)",
              strokeWidth: 1,
            }}
          />
          <Area
            type="monotone"
            dataKey="bankroll"
            stroke="none"
            fill={`url(#${fillGradId})`}
            fillOpacity={1}
            isAnimationActive
            animationDuration={500}
            baseValue={0}
          />
          <Line
            type="monotone"
            dataKey="bankroll"
            stroke={stroke}
            strokeWidth={2.5}
            dot={{
              r: 4,
              fill: "#050816",
              stroke,
              strokeWidth: 2,
            }}
            activeDot={{
              r: 6,
              stroke,
              strokeWidth: 2,
              fill: "#050816",
            }}
            isAnimationActive
            animationDuration={600}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
