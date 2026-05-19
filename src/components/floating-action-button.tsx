"use client";

import { startTransition } from "react";

type FloatingActionButtonProps = {
  onClick: () => void;
  label?: string;
};

/** FAB “+” pagina-specifico (sostituisce il FAB globale su route dedicate). */
export function FloatingActionButton({
  onClick,
  label = "Aggiungi",
}: FloatingActionButtonProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] flex justify-center pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(3.25rem+env(safe-area-inset-bottom,0px))]">
      <div className="sm-app-constrain flex w-full justify-center px-3">
        <button
          type="button"
          onClick={() => startTransition(() => onClick())}
          aria-label={label}
          className="pointer-events-auto flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-gradient-to-br from-[#3A4254] to-[#4F4A68] text-xl font-light leading-none text-white shadow-md shadow-black/22 transition duration-150 hover:scale-[1.03] active:scale-95 sm:h-14 sm:w-14 sm:text-2xl [-webkit-tap-highlight-color:transparent]"
        >
          +
        </button>
      </div>
    </div>
  );
}
