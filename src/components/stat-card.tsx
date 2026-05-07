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
    <div className="flex min-h-[96px] flex-col justify-center rounded-xl border border-white/[0.06] bg-[#11182B] px-3 py-3 shadow-sm shadow-black/10 sm:min-h-0 sm:rounded-2xl sm:p-4 sm:shadow-md sm:shadow-black/12">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8B93A7] sm:text-xs sm:font-medium sm:tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1.5 min-w-0 overflow-x-auto whitespace-nowrap text-[28px] font-extrabold tabular-nums leading-none sm:mt-2 sm:text-2xl sm:font-semibold ${toneClass[tone]}`}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="mt-2 text-[14px] text-[#8B93A7] sm:mt-1 sm:text-sm">{sublabel}</p>
      ) : null}
    </div>
  );
}
