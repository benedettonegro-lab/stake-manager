"use client";

type FloatingActionButtonProps = {
  onClick: () => void;
  label?: string;
};

/** FAB “+” per questa pagina (sostituisce il FAB globale su /bookmakers). */
export function FloatingActionButton({
  onClick,
  label = "Aggiungi bookmaker",
}: FloatingActionButtonProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] flex justify-center pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
      <div className="sm-app-constrain flex w-full justify-center px-3">
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#5b5cff] to-[#a855f7] text-2xl font-light text-white shadow-lg shadow-[#5b5cff]/35 transition duration-200 hover:scale-105 hover:shadow-xl active:scale-[0.97]"
        >
          +
        </button>
      </div>
    </div>
  );
}
