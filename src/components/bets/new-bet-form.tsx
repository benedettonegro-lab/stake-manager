"use client";

import { BET_TYPE_OPTIONS } from "@/lib/bet-constants";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import type { BetStatus } from "@/lib/repositories/bets-repository";
import type { FormEvent, ReactNode } from "react";

export const SPORT_OPTIONS = [
  "Calcio",
  "Tennis",
  "Basket",
  "Pallavolo",
  "Hockey",
  "Baseball",
  "Altro",
] as const;

const STATUS_OPTIONS: { value: BetStatus; label: string }[] = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "void", label: "Rimborsata" },
  { value: "cashout", label: "Cashout" },
];

const labelCls =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#8B93A7]";
const inputCls =
  "sm-input min-h-11 w-full min-w-0 text-[15px] leading-snug sm:min-h-[44px] sm:text-sm";
const cardCls =
  "rounded-[18px] border border-white/[0.08] bg-[#11182B] p-3.5 shadow-sm shadow-black/10";

type AccountOption = {
  id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
};

type StakerOption = { id: string; name: string };

export type NewBetFormProps = {
  formId: string;
  onSubmit: (e: FormEvent) => void;
  placedDate: string;
  onPlacedDateChange: (v: string) => void;
  placedTime: string;
  onPlacedTimeChange: (v: string) => void;
  accountId: string;
  onAccountIdChange: (v: string) => void;
  accounts: AccountOption[];
  stakerId: string;
  onStakerIdChange: (v: string) => void;
  stakers: StakerOption[];
  eventName: string;
  onEventNameChange: (v: string) => void;
  oddsStr: string;
  onOddsStrChange: (v: string) => void;
  formSport: string;
  onFormSportChange: (v: string) => void;
  status: BetStatus;
  onStatusChange: (v: BetStatus) => void;
  formBetType: string;
  onFormBetTypeChange: (v: string) => void;
  stakeStr: string;
  onStakeStrChange: (v: string) => void;
  formNote: string;
  onFormNoteChange: (v: string) => void;
  submitting: boolean;
  formError: string | null;
  newBetStakeExceedsBalance: boolean;
  profitPreview: ReactNode;
  /** Nasconde il submit interno se il CTA è nel footer sticky (mobile). */
  hideSubmit?: boolean;
};

export function NewBetForm({
  formId,
  onSubmit,
  placedDate,
  onPlacedDateChange,
  placedTime,
  onPlacedTimeChange,
  accountId,
  onAccountIdChange,
  accounts,
  stakerId,
  onStakerIdChange,
  stakers,
  eventName,
  onEventNameChange,
  oddsStr,
  onOddsStrChange,
  formSport,
  onFormSportChange,
  status,
  onStatusChange,
  formBetType,
  onFormBetTypeChange,
  stakeStr,
  onStakeStrChange,
  formNote,
  onFormNoteChange,
  submitting,
  formError,
  newBetStakeExceedsBalance,
  profitPreview,
  hideSubmit = false,
}: NewBetFormProps) {
  return (
    <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-3 pb-1">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="min-w-0">
          <label htmlFor={`${formId}-date`} className={labelCls}>
            Data
          </label>
          <input
            id={`${formId}-date`}
            type="date"
            value={placedDate}
            onChange={(e) => onPlacedDateChange(e.target.value)}
            required
            disabled={submitting}
            className={inputCls}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${formId}-time`} className={labelCls}>
            Ora
          </label>
          <input
            id={`${formId}-time`}
            type="time"
            value={placedTime}
            onChange={(e) => onPlacedTimeChange(e.target.value)}
            required
            disabled={submitting}
            className={inputCls}
          />
        </div>
      </div>

      <div className="min-w-0">
        <label htmlFor={`${formId}-account`} className={labelCls}>
          Bookmaker / conto
        </label>
        <select
          id={`${formId}-account`}
          required
          value={accountId}
          onChange={(e) => onAccountIdChange(e.target.value)}
          disabled={submitting}
          className={inputCls}
        >
          <option value="">Seleziona conto…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_name}
              {gamingAccountBookmakerDisplay(a)
                ? ` · ${gamingAccountBookmakerDisplay(a)}`
                : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0">
        <label htmlFor={`${formId}-staker`} className={labelCls}>
          Staker
        </label>
        <select
          id={`${formId}-staker`}
          required
          value={stakerId}
          onChange={(e) => onStakerIdChange(e.target.value)}
          disabled={submitting}
          className={inputCls}
        >
          <option value="">Seleziona staker…</option>
          {stakers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <section className={cardCls} aria-labelledby={`${formId}-sel-heading`}>
        <h2
          id={`${formId}-sel-heading`}
          className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[#E6EAF2]"
        >
          Selezione 1
        </h2>
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <label htmlFor={`${formId}-event`} className={labelCls}>
              Titolo della scommessa
            </label>
            <input
              id={`${formId}-event`}
              value={eventName}
              onChange={(e) => onEventNameChange(e.target.value)}
              required
              disabled={submitting}
              placeholder="Es. Inter — Juve 1X2"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label htmlFor={`${formId}-odds`} className={labelCls}>
                Quote
              </label>
              <input
                id={`${formId}-odds`}
                value={oddsStr}
                onChange={(e) => onOddsStrChange(e.target.value)}
                required
                inputMode="decimal"
                disabled={submitting}
                placeholder="2,50"
                className={inputCls}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${formId}-sport`} className={labelCls}>
                Sport
              </label>
              <select
                id={`${formId}-sport`}
                value={formSport}
                onChange={(e) => onFormSportChange(e.target.value)}
                disabled={submitting}
                className={inputCls}
              >
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label htmlFor={`${formId}-status`} className={labelCls}>
                Stato
              </label>
              <select
                id={`${formId}-status`}
                value={status}
                onChange={(e) => onStatusChange(e.target.value as BetStatus)}
                disabled={submitting}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${formId}-type`} className={labelCls}>
                Tipo
              </label>
              <select
                id={`${formId}-type`}
                value={formBetType}
                onChange={(e) => onFormBetTypeChange(e.target.value)}
                disabled={submitting}
                className={inputCls}
              >
                {BET_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <div className="min-w-0">
        <label htmlFor={`${formId}-stake`} className={labelCls}>
          Stake (€)
        </label>
        <input
          id={`${formId}-stake`}
          value={stakeStr}
          onChange={(e) => onStakeStrChange(e.target.value)}
          required
          inputMode="decimal"
          disabled={submitting}
          placeholder="10"
          className={inputCls}
        />
      </div>

      <div className="min-w-0">
        <label htmlFor={`${formId}-note`} className={labelCls}>
          Note (opzionale)
        </label>
        <textarea
          id={`${formId}-note`}
          value={formNote}
          onChange={(e) => onFormNoteChange(e.target.value)}
          disabled={submitting}
          rows={2}
          className={`${inputCls} min-h-[4.5rem] resize-y`}
        />
      </div>

      {profitPreview}

      {newBetStakeExceedsBalance && !formError ? (
        <p
          className="rounded-[14px] border border-[#fb7185]/35 bg-[#fb7185]/10 px-3 py-2 text-sm text-[#fb7185]"
          role="status"
        >
          Saldo conto insufficiente
        </p>
      ) : null}

      {formError ? (
        <p
          className="rounded-[14px] border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-sm text-[#fb7185]"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      {!hideSubmit ? (
        <button
          type="submit"
          disabled={submitting || newBetStakeExceedsBalance}
          className="sm-btn-primary min-h-11 w-full rounded-full disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? "Salvataggio…" : "Aggiungi scommessa"}
        </button>
      ) : null}
    </form>
  );
}
