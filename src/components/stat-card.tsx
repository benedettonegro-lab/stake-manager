type StatTone = "default" | "positive" | "negative";

type StatCardProps = {
  label: string;
  value: string;
  sublabel?: string;
  tone?: StatTone;
};

const toneClass: Record<StatTone, string> = {
  default: "text-[#E6EAF2]",
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
    <div className="flex min-h-[148px] flex-col justify-center rounded-2xl border border-white/[0.08] bg-[#0E1525] p-7 shadow-md shadow-black/12 sm:min-h-0 sm:p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#94a3b8] sm:text-xs sm:font-medium sm:tracking-wide">
        {label}
      </p>
      <p
        className={`mt-3 text-4xl font-extrabold tabular-nums leading-none sm:mt-2 sm:text-2xl sm:font-semibold ${toneClass[tone]}`}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-2 text-base text-[#94a3b8] sm:mt-1 sm:text-sm">{sublabel}</p>
      ) : null}
    </div>
  );
}
