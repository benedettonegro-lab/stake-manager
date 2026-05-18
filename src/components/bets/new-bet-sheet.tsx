"use client";

import { BottomSheet } from "@/components/app/bottom-sheet";
import { FullScreenSheet } from "@/components/app/full-screen-sheet";
import type { ReactNode } from "react";

const NEW_BET_FORM_ID = "new-bet-form";

type NewBetSheetProps = {
  open: boolean;
  onClose: () => void;
  dismissDisabled?: boolean;
  children: ReactNode;
  submitFooter: ReactNode;
};

/** Mobile: full-screen BetAnalytix. Desktop: modale centrata più larga. */
export function NewBetSheet({
  open,
  onClose,
  dismissDisabled = false,
  children,
  submitFooter,
}: NewBetSheetProps) {
  if (!open) return null;

  return (
    <>
      <div className="sm:hidden">
        <FullScreenSheet
          open
          title="Aggiungi scommessa"
          onBack={onClose}
          dismissDisabled={dismissDisabled}
          footer={submitFooter}
        >
          {children}
        </FullScreenSheet>
      </div>

      <div className="hidden sm:block">
        <BottomSheet
          open
          title="Aggiungi scommessa"
          onClose={onClose}
          dismissDisabled={dismissDisabled}
          panelClassName="!max-h-[min(92dvh,720px)] !max-w-[520px]"
          footer={submitFooter}
        >
          {children}
        </BottomSheet>
      </div>
    </>
  );
}

export { NEW_BET_FORM_ID };
