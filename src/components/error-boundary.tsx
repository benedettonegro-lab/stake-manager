"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="mx-auto max-w-md rounded-2xl border border-[#fb7185]/35 bg-[#fb7185]/10 px-4 py-6 text-center"
          role="alert"
        >
          <p className="text-sm font-semibold text-[#E6EAF2]">Qualcosa è andato storto</p>
          <p className="mt-2 text-xs text-[#8B93A7]">
            {this.state.error.message || "Errore imprevisto"}
          </p>
          <button
            type="button"
            className="sm-touch sm-btn-primary mt-4 min-h-11 px-6"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Ricarica
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
