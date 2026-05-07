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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] flex justify-center pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
      <div className="sm-app-constrain flex w-full justify-center px-3">
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#3d4558] to-[#5c4d7a] text-[28px] font-light leading-none text-white shadow-md shadow-black/30 transition duration-200 hover:scale-105 hover:shadow-lg active:scale-[0.97] sm:h-14 sm:w-14 sm:text-2xl"
        >
          +
        </button>
      </div>
    </div>
  );
}
