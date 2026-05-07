"use client";

type Chip<T extends string> = { value: T; label: string };

type FilterChipsProps<T extends string> = {
  items: readonly Chip<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
};

export function FilterChips<T extends string>({
  items,
  value,
  onChange,
  className = "",
}: FilterChipsProps<T>) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5 sm:pb-1 ${className}`.trim()}
      role="tablist"
      aria-label="Filtri"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`shrink-0 rounded-full border px-4 py-2 text-[16px] font-semibold transition duration-150 active:scale-[0.97] sm:px-3 sm:py-1.5 sm:text-sm ${
              active
                ? "border-[#a855f7]/50 bg-[#a855f7]/20 text-white"
                : "border-white/[0.08] bg-[#121B2F] text-[#94a3b8] hover:border-white/[0.14] hover:text-[#e2e8f0]"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
