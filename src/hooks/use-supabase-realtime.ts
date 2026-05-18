"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

type PostgresChangePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type UseSupabaseRealtimeOpts = {
  userId: string | null;
  enabled?: boolean;
  onBetChange?: (payload: PostgresChangePayload) => void;
  onGamingAccountChange?: (payload: PostgresChangePayload) => void;
};

/**
 * Realtime multi-device sync con debounce e reconnect automatico (Supabase client).
 */
export function useSupabaseRealtime({
  userId,
  enabled = true,
  onBetChange,
  onGamingAccountChange,
}: UseSupabaseRealtimeOpts) {
  const onBetRef = useRef(onBetChange);
  const onAccountRef = useRef(onGamingAccountChange);

  useEffect(() => {
    onBetRef.current = onBetChange;
    onAccountRef.current = onGamingAccountChange;
  });

  useEffect(() => {
    if (!enabled || !userId) return;

    const supabase = getSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const emitBet = (payload: PostgresChangePayload) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onBetRef.current?.(payload);
      }, 120);
    };

    const emitAccount = (payload: PostgresChangePayload) => {
      onAccountRef.current?.(payload);
    };

    channel = supabase
      .channel(`sm-sync-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bets",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          emitBet({
            eventType: payload.eventType as PostgresChangePayload["eventType"],
            new: (payload.new ?? {}) as Record<string, unknown>,
            old: (payload.old ?? {}) as Record<string, unknown>,
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gaming_accounts",
        },
        (payload) => {
          emitAccount({
            eventType: payload.eventType as PostgresChangePayload["eventType"],
            new: (payload.new ?? {}) as Record<string, unknown>,
            old: (payload.old ?? {}) as Record<string, unknown>,
          });
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);
}
