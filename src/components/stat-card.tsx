type StatTone = "default" | "positive" | "negative";

type StatCardProps = {
  label: string;
  value: string;
  sublabel?: string;
  tone?: StatTone;
};

const toneClass: Record<StatTone, string> = {
  default: "text-white",
  positive: "text-[#34d399]",
  negative: "text-[#fb7185]",
};

export function StatCard({
  label,
  value,
  sublabel,
  tone = "default",
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[#273449] bg-[#111827] p-4 shadow-lg shadow-black/20">
      <p className="text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass[tone]}`}>
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs text-[#94a3b8]">{sublabel}</p>
      ) : null}
    </div>
  );
}
