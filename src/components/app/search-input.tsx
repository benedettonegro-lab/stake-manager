"use client";

type SearchInputProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Cerca bookmaker...",
}: SearchInputProps) {
  const hasText = value.length > 0;

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-[#64748b] opacity-60 sm:left-3"
        aria-hidden
      >
        <svg
          className="h-6 w-6 sm:h-4 sm:w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
      </span>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-[3.25rem] w-full rounded-xl border border-white/[0.08] bg-[#121B2F] py-2.5 pl-14 pr-14 text-[16px] text-[#E6EAF2] outline-none transition placeholder:text-[16px] placeholder:text-[#64748b] focus:border-[#a855f7]/35 focus:ring-2 focus:ring-[#a855f7]/08 sm:min-h-[2.75rem] sm:py-2.5 sm:pl-10 sm:pr-10 sm:text-sm sm:placeholder:text-sm"
      />

      <button
        type="button"
        aria-label="Cancella ricerca"
        onClick={() => onChange("")}
        className={`absolute right-2 top-1/2 z-[1] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#94a3b8] transition duration-200 ease-out hover:bg-white/[0.05] hover:text-[#E6EAF2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[#a855f7]/22 sm:h-8 sm:w-8 ${
          hasText ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        tabIndex={hasText ? 0 : -1}
      >
        <svg className="h-6 w-6 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
