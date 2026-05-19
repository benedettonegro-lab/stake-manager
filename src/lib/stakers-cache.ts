import { safeArray, warnInvalidShape } from "@/lib/safe-array";

export type StakerRow = {
  id: string;
  name: string;
  balance: string;
  player_id: string | null;
};

export type BetMini = {
  staker_id: string;
  stake: string;
  profit: string;
  status: string;
  odds: string | number;
};

export type StakersListCache = {
  stakers: StakerRow[];
  bets: BetMini[];
};

const STAKERS_LIST_NS = "stakers_list_v1";

/** Normalizza cache prefetch (array) o bundle pagina `{ stakers, bets }`. */
export function parseStakersListCache(value: unknown, context = STAKERS_LIST_NS): StakersListCache {
  if (Array.isArray(value)) {
    warnInvalidShape(
      context,
      "expected { stakers, bets }; received array (legacy prefetch) — using as stakers only",
    );
    return { stakers: safeArray<StakerRow>(value), bets: [] };
  }

  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return {
      stakers: safeArray<StakerRow>(o.stakers),
      bets: safeArray<BetMini>(o.bets),
    };
  }

  if (value != null) {
    warnInvalidShape(context, value);
  }

  return { stakers: [], bets: [] };
}

export { STAKERS_LIST_NS };
