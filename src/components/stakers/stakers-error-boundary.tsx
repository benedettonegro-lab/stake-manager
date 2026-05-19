"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null };

/** Errore isolato alla pagina Staker — non sostituisce l’intera app. */
export class StakersErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[StakersErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="rounded-xl border border-[#fb7185]/35 bg-[#fb7185]/10 px-4 py-6 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-[#E6EAF2]">Errore elenco staker</p>
          <p className="mt-2 text-xs text-[#8B93A7]">
            {this.state.error.message || "Dati non validi"}
          </p>
          <button
            type="button"
            className="sm-touch mt-4 rounded-full border border-white/[0.12] px-4 py-2 text-xs font-semibold text-[#E6EAF2]"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Riprova
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
