"use client";

import { create } from "zustand";

const DEFAULT_STALE_MS = 45_000;

type AppCacheState = {
  userId: string | null;
  lastFetchAt: Record<string, number>;
  setUserId: (id: string | null) => void;
  markFetched: (page: string) => void;
  markStale: (page: string) => void;
  isFresh: (page: string, maxAgeMs?: number) => boolean;
  clear: () => void;
};

export const useAppCacheStore = create<AppCacheState>((set, get) => ({
  userId: null,
  lastFetchAt: {},
  setUserId: (userId) => set({ userId }),
  markFetched: (page) =>
    set((s) => ({
      lastFetchAt: { ...s.lastFetchAt, [page]: Date.now() },
    })),
  markStale: (page) =>
    set((s) => {
      const next = { ...s.lastFetchAt };
      delete next[page];
      return { lastFetchAt: next };
    }),
  isFresh: (page, maxAgeMs = DEFAULT_STALE_MS) => {
    const at = get().lastFetchAt[page];
    if (!at) return false;
    return Date.now() - at < maxAgeMs;
  },
  clear: () => set({ userId: null, lastFetchAt: {} }),
}));
