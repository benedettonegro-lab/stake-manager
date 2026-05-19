"use client";

import { BottomSheet, QuickActionButton, SearchInput, StatPill } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { gamingAccountBookmakerDisplay } from "@/lib/bookmaker-filters";
import { legacyLabelParts, paymentMethodTitle } from "@/lib/payment-methods";
import {
  assertGamingAccountCoversWithdrawalCompletion,
  assertPaymentMethodCoversDeposit,
} from "@/lib/balance-validation";
import { recalculatePaymentMethodBalanceFromLedger } from "@/lib/recalculate-movement-balances";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { readStaleCache, writeFreshCache } from "@/lib/swr-cache";
import { type TransactionStatus } from "@/lib/transaction-status";
import { usePageLoad } from "@/hooks/use-page-load";
import { useAppCacheStore } from "@/stores/app-cache-store";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

const IDENTITIES_CACHE_NS = "identities_bundle_v1";

type IdentitiesCacheBundle = {
  identities: IdentityRow[];
  accounts: GamingAccountRow[];
  paymentMethods: PaymentMethodRow[];
  bookmakers: BookmakerOption[];
};

const PAYMENT_TYPES = [
  "Revolut",
  "PayPal",
  "Cash",
  "Skrill",
  "Bonifico",
  "Crypto",
  "Altro",
] as const;

/** Card glass — info only, azioni in sheet separato */
const idnGlassCard =
  "w-full rounded-2xl border border-white/[0.06] bg-[#11182B]/72 backdrop-blur-md text-left shadow-sm outline-none transition-all duration-200 ease-out hover:border-emerald-500/22 hover:shadow-sm hover:scale-[1.005] active:scale-[0.98] sm:rounded-xl";

const idnActionBtn =
  "flex min-h-10 w-full items-center justify-center rounded-xl border text-sm font-semibold transition duration-150 ease-out active:scale-[0.98] sm:min-h-12 sm:text-sm";

type PaymentType = (typeof PAYMENT_TYPES)[number];

type IdentityRow = {
  id: string;
  name: string;
};

type BookmakerOption = { id: string; name: string };

type GamingAccountRow = {
  id: string;
  player_id: string;
  identity_id: string;
  account_name: string;
  bookmaker: string;
  bookmaker_id: string | null;
  bookmakers: { name: string } | { name: string }[] | null;
  current_balance: string | number;
};

type PaymentMethodRow = {
  id: string;
  label: string | null;
  method_name: string;
  balance: string;
  created_at: string;
  type: string;
  note: string | null;
  player_id: string;
  identity_id: string;
};

type TxModalState = {
  identityId: string;
  accountId: string;
  mode: "deposit" | "withdrawal";
  /** Se true, il conto non è cambiabile (aperto dalla riga conto). */
  lockAccount: boolean;
  presetPmId?: string;
};

function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function paymentMethodsForIdentity(
  identityId: string,
  methods: PaymentMethodRow[],
): PaymentMethodRow[] {
  return methods
    .filter((pm) => pm.player_id === identityId || pm.identity_id === identityId)
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export default function IdentitiesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [accounts, setAccounts] = useState<GamingAccountRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [bookmakers, setBookmakers] = useState<BookmakerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newIdentityName, setNewIdentityName] = useState("");
  const [newIdSubmitting, setNewIdSubmitting] = useState(false);
  const [newIdError, setNewIdError] = useState<string | null>(null);
  const [newIdentityOpen, setNewIdentityOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  /** Dettaglio identità (conti / metodi / form) nel bottom sheet */
  const [detailSheetId, setDetailSheetId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addMethodOpen, setAddMethodOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [accountActions, setAccountActions] = useState<GamingAccountRow | null>(null);
  const [methodActions, setMethodActions] = useState<PaymentMethodRow | null>(null);

  const [accName, setAccName] = useState("");
  const [accBookmakerId, setAccBookmakerId] = useState("");
  const [accInitStr, setAccInitStr] = useState("");
  const [accSubmitting, setAccSubmitting] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);
  const [accDeleteLoadingId, setAccDeleteLoadingId] = useState<string | null>(null);
  const [accDeleteError, setAccDeleteError] = useState<string | null>(null);

  const [pmNome, setPmNome] = useState("");
  const [pmTipo, setPmTipo] = useState<PaymentType>("Revolut");
  const [pmBalanceStr, setPmBalanceStr] = useState("");
  const [pmSubmitting, setPmSubmitting] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);

  const [editingMethod, setEditingMethod] = useState<PaymentMethodRow | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTipo, setEditTipo] = useState<PaymentType>("Revolut");
  const [editBalanceStr, setEditBalanceStr] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PaymentMethodRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [identityDeleteTarget, setIdentityDeleteTarget] = useState<IdentityRow | null>(null);
  const [identityDeleteLoading, setIdentityDeleteLoading] = useState(false);
  const [identityDeleteError, setIdentityDeleteError] = useState<string | null>(null);

  const [identityNameEditing, setIdentityNameEditing] = useState(false);
  const [identityEditName, setIdentityEditName] = useState("");
  const [identityEditSaving, setIdentityEditSaving] = useState(false);
  const [identityEditError, setIdentityEditError] = useState<string | null>(null);

  const [txModal, setTxModal] = useState<TxModalState | null>(null);
  const [txPmId, setTxPmId] = useState("");
  const [txAmountStr, setTxAmountStr] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txWithdrawStatus, setTxWithdrawStatus] =
    useState<TransactionStatus>("completed");
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const loadData = useCallback(async (uid: string) => {
    setLoadError(null);
    const [pRes, gaRes, pmRes, bmRes] = await Promise.all([
      supabase.from("players").select("id, name").order("name"),
      supabase
        .from("gaming_accounts")
        .select(
          `
          id,
          player_id,
          identity_id,
          account_name,
          bookmaker,
          bookmaker_id,
          current_balance,
          bookmakers ( name )
        `,
        )
        .order("account_name"),
      supabase
        .from("payment_methods")
        .select(
          'id, label, method_name, balance, created_at, note, player_id, identity_id, "type"',
        )
        .order("method_name"),
      supabase.from("bookmakers").select("id, name").order("name"),
    ]);

    if (pRes.error || gaRes.error || pmRes.error || bmRes.error) {
      setLoadError(
        pRes.error?.message ??
          gaRes.error?.message ??
          pmRes.error?.message ??
          bmRes.error?.message ??
          "Errore",
      );
      setIdentities([]);
      setAccounts([]);
      setPaymentMethods([]);
      setBookmakers([]);
      return;
    }

    const bundle: IdentitiesCacheBundle = {
      identities: (pRes.data as IdentityRow[]) ?? [],
      accounts: (gaRes.data as GamingAccountRow[]) ?? [],
      paymentMethods: (pmRes.data as PaymentMethodRow[]) ?? [],
      bookmakers: (bmRes.data as BookmakerOption[]) ?? [],
    };
    setIdentities(bundle.identities);
    setAccounts(bundle.accounts);
    setPaymentMethods(bundle.paymentMethods);
    setBookmakers(bundle.bookmakers);
    void writeFreshCache(uid, IDENTITIES_CACHE_NS, bundle);
  }, [supabase]);

  const { userId } = usePageLoad({
    page: "identities",
    hydrateFromCache: async (uid) => {
      const cached = await readStaleCache<IdentitiesCacheBundle>(uid, IDENTITIES_CACHE_NS);
      if (!cached.data) return false;
      setIdentities(cached.data.identities);
      setAccounts(cached.data.accounts);
      setPaymentMethods(cached.data.paymentMethods);
      setBookmakers(cached.data.bookmakers);
      return cached.data.identities.length > 0;
    },
    fetch: loadData,
  });

  const reloadData = useCallback(async () => {
    const uid =
      userId ??
      useAppCacheStore.getState().userId ??
      (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    useAppCacheStore.getState().markStale("identities");
    await loadData(uid);
  }, [userId, loadData, supabase]);

  const accountsByPlayer = useMemo(() => {
    const m = new Map<string, GamingAccountRow[]>();
    for (const a of accounts) {
      const list = m.get(a.player_id) ?? [];
      list.push(a);
      m.set(a.player_id, list);
    }
    return m;
  }, [accounts]);

  const txAmountParsedIdent = useMemo(() => {
    const n = Number.parseFloat(txAmountStr.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }, [txAmountStr]);

  const txSelectedPmBalIdent = useMemo(() => {
    const pm = paymentMethods.find((m) => m.id === txPmId);
    if (!pm) return NaN;
    return Number.parseFloat(pm.balance) || 0;
  }, [paymentMethods, txPmId]);

  const txActiveAccountForModal = useMemo(() => {
    if (!txModal) return null;
    const list = accountsByPlayer.get(txModal.identityId) ?? [];
    return list.find((a) => a.id === txModal.accountId) ?? list[0] ?? null;
  }, [txModal, accountsByPlayer]);

  const txSaveDisabledByBalanceIdent =
    txModal !== null &&
    !Number.isNaN(txAmountParsedIdent) &&
    txAmountParsedIdent > 0 &&
    ((txModal.mode === "deposit" &&
      !Number.isNaN(txSelectedPmBalIdent) &&
      txAmountParsedIdent > txSelectedPmBalIdent) ||
      (txModal.mode === "withdrawal" &&
        txWithdrawStatus === "completed" &&
        txActiveAccountForModal !== null &&
        txAmountParsedIdent >
          (Number.parseFloat(String(txActiveAccountForModal.current_balance)) || 0)));

  const filteredIdentities = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return identities;
    const q = raw.toLowerCase();
    return identities.filter((idn) => {
      if (idn.name.toLowerCase().includes(q)) return true;
      const accList = accountsByPlayer.get(idn.id) ?? [];
      for (const a of accList) {
        const bm = gamingAccountBookmakerDisplay(a).toLowerCase();
        if (a.account_name.toLowerCase().includes(q) || bm.includes(q)) return true;
      }
      const methods = paymentMethodsForIdentity(idn.id, paymentMethods);
      for (const m of methods) {
        const hay = `${m.method_name} ${m.label ?? ""} ${paymentMethodTitle(m)}`.toLowerCase();
        if (hay.includes(q)) return true;
      }
      return false;
    });
  }, [accountsByPlayer, identities, paymentMethods, searchQuery]);

  async function handleNewIdentity(e: React.FormEvent) {
    e.preventDefault();
    setNewIdError(null);
    const n = newIdentityName.trim();
    if (!n) {
      setNewIdError("Nome obbligatorio.");
      return;
    }
    setNewIdSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNewIdSubmitting(false);
      return;
    }
    const { error } = await supabase.from("players").insert({
      user_id: user.id,
      name: n,
    });
    setNewIdSubmitting(false);
    if (error) {
      setNewIdError(error.message);
      return;
    }
    setNewIdentityName("");
    setNewIdentityOpen(false);
    await reloadData();
  }

  const openDetailSheet = useCallback((id: string) => {
    setAddAccountOpen(false);
    setAddMethodOpen(false);
    setFabMenuOpen(false);
    setAccountActions(null);
    setMethodActions(null);
    setDetailSheetId((prev) => {
      if (prev !== id) {
        setPmError(null);
        setAccError(null);
        setAccDeleteError(null);
        setPmNome("");
        setPmTipo("Revolut");
        setPmBalanceStr("");
        setAccName("");
        setAccBookmakerId("");
        setAccInitStr("");
        setIdentityNameEditing(false);
        setIdentityEditName("");
        setIdentityEditError(null);
      }
      return id;
    });
  }, []);

  const closeDetailSheet = useCallback(() => {
    setAddAccountOpen(false);
    setAddMethodOpen(false);
    setFabMenuOpen(false);
    setAccountActions(null);
    setMethodActions(null);
    setDetailSheetId(null);
    setIdentityNameEditing(false);
    setIdentityEditName("");
    setIdentityEditError(null);
  }, []);

  async function handleAddAccount(e: React.FormEvent, playerId: string) {
    e.preventDefault();
    setAccError(null);
    setAccDeleteError(null);
    const name = accName.trim();
    if (!name) {
      setAccError("Nome conto obbligatorio.");
      return;
    }
    const rawBal = accInitStr.trim();
    const initialBalance = rawBal === "" ? 0 : Number(rawBal.replace(",", "."));
    if (rawBal !== "" && (Number.isNaN(initialBalance) || initialBalance < 0)) {
      setAccError("Saldo iniziale non valido.");
      return;
    }
    if (!accBookmakerId) {
      setAccError("Seleziona un bookmaker.");
      return;
    }
    setAccSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAccSubmitting(false);
      return;
    }
    const { error } = await supabase.from("gaming_accounts").insert({
      user_id: user.id,
      player_id: playerId,
      identity_id: playerId,
      account_name: name,
      bookmaker_id: accBookmakerId,
      bookmaker: "",
      initial_balance: initialBalance,
      current_balance: initialBalance,
    });
    setAccSubmitting(false);
    if (error) {
      setAccError(error.message);
      return;
    }
    setAccName("");
    setAccBookmakerId("");
    setAccInitStr("");
    setAddAccountOpen(false);
    await reloadData();
  }

  async function handleDeleteGamingAccount(account: GamingAccountRow) {
    const label = account.account_name.trim() || "questo conto";
    if (
      !window.confirm(
        `Eliminare il conto gioco «${label}»? L'operazione non è reversibile.`,
      )
    ) {
      return;
    }
    setAccDeleteError(null);
    setAccDeleteLoadingId(account.id);
    const { error } = await supabase.from("gaming_accounts").delete().eq("id", account.id);
    setAccDeleteLoadingId(null);
    if (error) {
      setAccDeleteError(error.message);
      return;
    }
    await reloadData();
  }

  function closeTxModal() {
    setTxModal(null);
    setTxPmId("");
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxError(null);
    setTxSubmitting(false);
  }

  function openTxDeposit(identityId: string, account: GamingAccountRow) {
    const pms = paymentMethodsForIdentity(identityId, paymentMethods);
    setTxModal({
      identityId,
      accountId: account.id,
      mode: "deposit",
      lockAccount: true,
    });
    setTxPmId(pms[0]?.id ?? "");
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxError(null);
  }

  function openTxWithdraw(identityId: string, account: GamingAccountRow) {
    const pms = paymentMethodsForIdentity(identityId, paymentMethods);
    setTxModal({
      identityId,
      accountId: account.id,
      mode: "withdrawal",
      lockAccount: true,
    });
    setTxPmId(pms[0]?.id ?? "");
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxError(null);
  }

  function openTxDepositFromMethod(identityId: string, pm: PaymentMethodRow) {
    const accList = accountsByPlayer.get(identityId) ?? [];
    if (!accList[0]) return;
    setTxModal({
      identityId,
      accountId: accList[0].id,
      mode: "deposit",
      lockAccount: false,
      presetPmId: pm.id,
    });
    setTxPmId(pm.id);
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxError(null);
  }

  function openTxWithdrawFromMethod(identityId: string, pm: PaymentMethodRow) {
    const accList = accountsByPlayer.get(identityId) ?? [];
    if (!accList[0]) return;
    setTxModal({
      identityId,
      accountId: accList[0].id,
      mode: "withdrawal",
      lockAccount: false,
      presetPmId: pm.id,
    });
    setTxPmId(pm.id);
    setTxAmountStr("");
    setTxNotes("");
    setTxWithdrawStatus("completed");
    setTxError(null);
  }

  async function handleTxSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!txModal) return;
    setTxError(null);
    const amount = Number.parseFloat(txAmountStr.replace(",", "."));
    if (Number.isNaN(amount) || amount <= 0) {
      setTxError("Importo non valido.");
      return;
    }
    if (!txPmId) {
      setTxError("Seleziona un metodo di pagamento.");
      return;
    }
    const { identityId, accountId, mode } = txModal;
    if (mode === "deposit") {
      const depOk = await assertPaymentMethodCoversDeposit(supabase, txPmId, amount);
      if (!depOk.ok) {
        setTxError(depOk.message);
        return;
      }
    }
    if (mode === "withdrawal" && txWithdrawStatus === "completed") {
      const wOk = await assertGamingAccountCoversWithdrawalCompletion(
        supabase,
        accountId,
        amount,
      );
      if (!wOk.ok) {
        setTxError(wOk.message);
        return;
      }
    }
    setTxSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTxSubmitting(false);
      return;
    }
    const note = txNotes.trim() ? txNotes.trim() : null;
    const base = {
      user_id: user.id,
      player_id: identityId,
      gaming_account_id: accountId,
      payment_method_id: txPmId,
      amount,
      note,
    };
    const row =
      mode === "deposit"
        ? { ...base, type: "deposit" as const, status: "completed" as const }
        : {
            ...base,
            type: "withdrawal" as const,
            status: txWithdrawStatus,
          };
    const { error } = await supabase.from("transactions").insert(row);
    setTxSubmitting(false);
    if (error) {
      setTxError(error.message);
      return;
    }

    const affectsBalances =
      row.status === "completed" &&
      (mode === "deposit" ||
        (mode === "withdrawal" && txWithdrawStatus === "completed"));
    if (affectsBalances) {
      setAccounts((prev) =>
        prev.map((acc) => {
          if (acc.id !== accountId) return acc;
          const cur = Number.parseFloat(String(acc.current_balance)) || 0;
          const next =
            mode === "deposit" ? cur + amount : Math.max(0, cur - amount);
          return { ...acc, current_balance: String(next) };
        }),
      );
      const pmRecalc = await recalculatePaymentMethodBalanceFromLedger(
        supabase,
        txPmId,
      );
      if (!pmRecalc.ok) {
        setTxError(pmRecalc.message);
        console.error("[identità] ricalcolo saldo metodo fallito", pmRecalc.message);
      }
    }

    closeTxModal();
    await reloadData();
  }

  async function handleAddMethod(e: React.FormEvent, playerId: string) {
    e.preventDefault();
    setPmError(null);
    const nome = pmNome.trim();
    if (!nome) {
      setPmError("Nome obbligatorio.");
      return;
    }
    const bal = Number.parseFloat(pmBalanceStr.replace(",", "."));
    if (Number.isNaN(bal) || bal < 0) {
      setPmError("Saldo non valido.");
      return;
    }

    setPmSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPmSubmitting(false);
      return;
    }

    const { data: inserted, error } = await supabase
      .from("payment_methods")
      .insert({
        user_id: user.id,
        player_id: playerId,
        identity_id: playerId,
        method_name: nome,
        type: pmTipo,
        balance: bal,
        initial_balance: bal,
        note: null,
      })
      .select(
        'id, label, method_name, balance, created_at, note, player_id, identity_id, "type"',
      )
      .single();

    setPmSubmitting(false);
    if (error) {
      setPmError(error.message);
      return;
    }
    setPmNome("");
    setPmTipo("Revolut");
    setPmBalanceStr("");
    if (inserted) {
      setPaymentMethods((prev) => [...prev, inserted as PaymentMethodRow]);
    }
    setAddMethodOpen(false);
    await reloadData();
  }

  function openEdit(m: PaymentMethodRow) {
    setEditingMethod(m);
    const parsed = legacyLabelParts(m.label);
    const tipoRaw = (m.type || parsed.tipo || "").trim();
    const isKnown = tipoRaw && (PAYMENT_TYPES as readonly string[]).includes(tipoRaw);
    setEditTipo(isKnown ? (tipoRaw as PaymentType) : "Altro");
    setEditNome(
      (m.method_name || "").trim() ||
        (parsed.nome || "").trim() ||
        (m.label ?? "").trim(),
    );
    setEditBalanceStr(String(Number.parseFloat(m.balance) || 0).replace(".", ","));
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMethod) return;
    const nome = editNome.trim();
    if (!nome) {
      setEditError("Nome obbligatorio.");
      return;
    }
    const bal = Number.parseFloat(editBalanceStr.replace(",", "."));
    if (Number.isNaN(bal) || bal < 0) {
      setEditError("Saldo non valido.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const { error } = await supabase
      .from("payment_methods")
      .update({
        type: editTipo,
        balance: bal,
        method_name: nome,
      })
      .eq("id", editingMethod.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    setEditingMethod(null);
    await reloadData();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    const { error } = await supabase.from("payment_methods").delete().eq("id", deleteTarget.id);
    setDeleteLoading(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setDeleteTarget(null);
    await reloadData();
  }

  async function handleConfirmDeleteIdentity() {
    if (!identityDeleteTarget) return;
    setIdentityDeleteError(null);
    setIdentityDeleteLoading(true);
    const removedId = identityDeleteTarget.id;
    const { error } = await supabase.from("players").delete().eq("id", removedId);
    setIdentityDeleteLoading(false);
    if (error) {
      setIdentityDeleteError(error.message);
      return;
    }
    setIdentityDeleteTarget(null);
    if (detailSheetId === removedId) {
      closeDetailSheet();
    }
    setTxModal((prev) => (prev?.identityId === removedId ? null : prev));
    setEditingMethod((prev) =>
      prev && (prev.player_id === removedId || prev.identity_id === removedId) ? null : prev,
    );
    setDeleteTarget((prev) =>
      prev && (prev.player_id === removedId || prev.identity_id === removedId) ? null : prev,
    );
    setDeleteError(null);
    await reloadData();
  }

  async function handleSaveIdentityName() {
    if (!detailSheetId) return;
    const name = identityEditName.trim();
    if (!name) {
      setIdentityEditError("Nome obbligatorio.");
      return;
    }
    setIdentityEditSaving(true);
    setIdentityEditError(null);
    const { error } = await supabase.from("players").update({ name }).eq("id", detailSheetId);
    setIdentityEditSaving(false);
    if (error) {
      setIdentityEditError(error.message);
      return;
    }
    setIdentityNameEditing(false);
    await reloadData();
  }

  const txAccList =
    txModal != null ? (accountsByPlayer.get(txModal.identityId) ?? []) : [];
  const txShowAccPicker = Boolean(
    txModal && !txModal.lockAccount && txAccList.length > 1,
  );
  const txAccountRow =
    txModal != null
      ? (txAccList.find((a) => a.id === txModal.accountId) ?? txAccList[0] ?? null)
      : null;

  const detailIdn =
    detailSheetId !== null ? (identities.find((i) => i.id === detailSheetId) ?? null) : null;
  const detailAccList =
    detailSheetId !== null ? (accountsByPlayer.get(detailSheetId) ?? []) : [];
  const detailMethods =
    detailSheetId !== null
      ? paymentMethodsForIdentity(detailSheetId, paymentMethods)
      : [];
  const detailCassa =
    detailAccList.reduce(
      (s, a) => s + (Number.parseFloat(String(a.current_balance)) || 0),
      0,
    ) +
    detailMethods.reduce((s, m) => s + (Number.parseFloat(String(m.balance)) || 0), 0);

  return (
    <AuthGate>
      <AppShell title="Identità">
        {loadError ? (
          <p className="mb-2 rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-[16px] text-[#fb7185] sm:mb-3 sm:py-2 sm:text-sm">
            {loadError}
          </p>
        ) : null}

        <div className="sm-page-search-sticky backdrop-blur-md sm:-mx-4 sm:px-4">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Cerca identità..."
          />
        </div>

        <div className="sm-page-block-after-search sm:mb-3">
          <QuickActionButton variant="primary" onClick={() => setNewIdentityOpen(true)}>
            + Identità
          </QuickActionButton>
        </div>

        <BottomSheet
          open={newIdentityOpen}
          title="Nuova identità"
          dismissDisabled={newIdSubmitting}
          onClose={() => {
            if (!newIdSubmitting) setNewIdentityOpen(false);
          }}
        >
          <form onSubmit={(e) => void handleNewIdentity(e)} className="flex flex-col gap-4 sm:gap-3">
            <input
              value={newIdentityName}
              onChange={(e) => setNewIdentityName(e.target.value)}
              placeholder="Nome identità"
              className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
            />
            {newIdError ? <p className="text-sm sm:text-xs text-[#fb7185]">{newIdError}</p> : null}
            <button type="submit" disabled={newIdSubmitting} className="sm-btn-primary w-full rounded-full">
              {newIdSubmitting ? "…" : "Crea"}
            </button>
          </form>
        </BottomSheet>

        {identities.length === 0 && !loadError ? (
          <p className="rounded-xl border border-dashed border-white/[0.06] py-6 text-center text-[16px] text-[#8B93A7] sm:py-8 sm:text-xs">
            Nessuna identità. Tocca + Identità.
          </p>
        ) : filteredIdentities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/[0.06] py-12 text-center text-[16px] text-[#8B93A7] sm:py-10 sm:text-xs">
            Nessun risultato
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0 sm:gap-2">
            {filteredIdentities.map((idn) => {
              const accList = accountsByPlayer.get(idn.id) ?? [];
              const methods = paymentMethodsForIdentity(idn.id, paymentMethods);
              const sumAcc = accList.reduce(
                (s, a) => s + (Number.parseFloat(String(a.current_balance)) || 0),
                0,
              );
              const sumMeth = methods.reduce(
                (s, m) => s + (Number.parseFloat(String(m.balance)) || 0),
                0,
              );
              const cassa = sumAcc + sumMeth;
              return (
                <li key={idn.id}>
                  <button
                    type="button"
                    onClick={() => openDetailSheet(idn.id)}
                    className="w-full rounded-2xl border border-white/[0.06] bg-[#11182B] px-2.5 py-2.5 text-left shadow-sm transition hover:border-white/[0.06] active:scale-[0.99] sm:p-3"
                  >
                    <p className="truncate text-base font-bold leading-snug text-white sm:text-sm sm:font-semibold">
                      {idn.name}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-1 sm:mt-2 sm:gap-1.5">
                      <StatPill label="Conti" value={String(accList.length)} />
                      <StatPill label="Metodi" value={String(methods.length)} />
                      <StatPill
                        label="Cassa"
                        value={`${formatMoney(cassa)} €`}
                        tone={cassa > 0 ? "positive" : cassa < 0 ? "negative" : "default"}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <BottomSheet
          open={detailSheetId !== null && detailIdn !== null}
          title={detailIdn?.name ?? "Identità"}
          dismissDisabled={accSubmitting || pmSubmitting || identityEditSaving}
          panelClassName="!max-w-[420px]"
          headerExtra={
            <div className="space-y-1 sm:space-y-0.5">
              <p className="text-sm sm:text-base font-semibold uppercase tracking-[0.12em] text-[#8B93A7] sm:text-xs sm:tracking-[0.16em]">
                Cassa totale
              </p>
              <p
                className={`text-2xl font-bold leading-none tracking-tight tabular-nums whitespace-nowrap sm:text-[1.85rem] sm:font-bold ${
                  detailCassa > 0
                    ? "text-emerald-400"
                    : detailCassa < 0
                      ? "text-[#fb7185]"
                      : "text-[#8B93A7]"
                }`}
              >
                {formatMoney(detailCassa)} €
              </p>
              <p className="pt-1.5 text-xs leading-snug text-[#8B93A7] sm:pt-1.5 sm:text-xs sm:leading-normal">
                <span className="font-semibold tabular-nums text-[#B4BCCC]">
                  {detailAccList.length}
                </span>{" "}
                conti
                <span className="mx-2 text-[#6B7385]">·</span>
                <span className="font-semibold tabular-nums text-[#B4BCCC]">
                  {detailMethods.length}
                </span>{" "}
                metodi
              </p>
            </div>
          }
          onClose={() => {
            if (!accSubmitting && !pmSubmitting && !identityEditSaving) closeDetailSheet();
          }}
        >
          {detailSheetId && detailIdn ? (
            <div className="relative mx-auto flex min-h-[40vh] max-w-[420px] flex-col pb-2">
              <div className="flex flex-1 flex-col gap-3 sm:gap-6">
              <section>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-[#8B93A7] sm:mb-2 sm:text-xs sm:tracking-[0.16em]">
                  Conti
                </h3>
                {accDeleteError ? (
                  <p className="mb-2 text-sm sm:text-xs text-[#fb7185]">{accDeleteError}</p>
                ) : null}
                {detailAccList.length === 0 ? (
                  <p className="py-1 text-sm sm:text-xs text-[#8B93A7]">Nessun conto.</p>
                ) : (
                  <ul className="flex flex-col gap-2 sm:gap-3">
                    {detailAccList.map((a) => {
                      const bal = Number.parseFloat(String(a.current_balance)) || 0;
                      const balCls =
                        bal > 0
                          ? "text-emerald-400"
                          : bal < 0
                            ? "text-[#fb7185]"
                            : "text-[#8B93A7]";
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            className={idnGlassCard}
                            onClick={() => {
                              setFabMenuOpen(false);
                              setMethodActions(null);
                              setAccountActions(a);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 px-2 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
                              <div className="min-w-0 text-left">
                                <p className="truncate text-base font-bold leading-snug text-white sm:text-sm sm:font-semibold">
                                  {a.account_name}
                                </p>
                                <p className="mt-0.5 truncate text-xs leading-snug text-[#8B93A7] sm:mt-0.5 sm:text-xs sm:leading-normal">
                                  {gamingAccountBookmakerDisplay(a) || "—"}
                                </p>
                              </div>
                              <p
                                className={`shrink-0 whitespace-nowrap text-xl font-bold tabular-nums leading-none sm:text-2xl sm:font-bold ${balCls}`}
                              >
                                {formatMoney(a.current_balance)} €
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-[#8B93A7] sm:mb-2 sm:text-xs sm:tracking-[0.16em]">
                  Metodi
                </h3>
                {detailMethods.length === 0 ? (
                  <p className="py-1 text-sm sm:text-xs text-[#8B93A7]">Nessun metodo.</p>
                ) : (
                  <ul className="flex flex-col gap-2 sm:gap-3">
                    {detailMethods.map((m) => {
                      const mb = Number.parseFloat(m.balance) || 0;
                      const tipo = (m.type || "").trim();
                      const balCls =
                        mb > 0
                          ? "text-emerald-400"
                          : mb < 0
                            ? "text-[#fb7185]"
                            : "text-[#8B93A7]";
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            className={idnGlassCard}
                            onClick={() => {
                              setFabMenuOpen(false);
                              setAccountActions(null);
                              setMethodActions(m);
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 px-2 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
                              <div className="min-w-0 text-left">
                                <p className="truncate text-base font-bold leading-snug text-white sm:text-sm sm:font-semibold">
                                  {(m.method_name || "").trim() || "—"}
                                </p>
                                {tipo ? (
                                  <p className="mt-0.5 truncate text-xs leading-snug text-[#8B93A7] sm:mt-0.5 sm:text-xs sm:leading-normal">
                                    {tipo}
                                  </p>
                                ) : null}
                              </div>
                              <p
                                className={`shrink-0 whitespace-nowrap text-xl font-bold tabular-nums leading-none sm:text-2xl sm:font-bold ${balCls}`}
                              >
                                {formatMoney(m.balance)} €
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="border-t border-[#141C2A] pt-3 sm:pt-5">
                {identityNameEditing ? (
                  <div className="mx-auto flex max-w-xs flex-col gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#8B93A7]">
                        Nome identità
                      </span>
                      <input
                        value={identityEditName}
                        onChange={(e) => setIdentityEditName(e.target.value)}
                        className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
                        autoComplete="off"
                        disabled={identityEditSaving}
                      />
                    </label>
                    {identityEditError ? (
                      <p className="text-sm sm:text-xs text-[#fb7185]">{identityEditError}</p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={identityEditSaving}
                        onClick={() => {
                          setIdentityNameEditing(false);
                          setIdentityEditError(null);
                        }}
                        className="h-11 flex-1 rounded-full border border-white/[0.06] text-lg sm:text-sm font-semibold text-[#e2e8f0] transition hover:bg-[#1e293b] disabled:opacity-50"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        disabled={identityEditSaving}
                        onClick={() => void handleSaveIdentityName()}
                        className="sm-btn-primary h-11 flex-1 rounded-full text-lg sm:text-sm font-semibold disabled:opacity-50"
                      >
                        {identityEditSaving ? "…" : "Salva"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
                    <QuickActionButton
                      variant="secondary"
                      className="min-h-11 flex-1 px-4 text-lg sm:text-sm font-semibold sm:max-w-[200px]"
                      disabled={accSubmitting || pmSubmitting || identityDeleteLoading}
                      onClick={() => {
                        setIdentityEditError(null);
                        setIdentityEditName(detailIdn.name);
                        setIdentityNameEditing(true);
                      }}
                    >
                      Modifica
                    </QuickActionButton>
                    <QuickActionButton
                      variant="danger"
                      className="min-h-11 flex-1 px-4 text-lg sm:text-sm font-semibold sm:max-w-[200px]"
                      disabled={accSubmitting || pmSubmitting || identityDeleteLoading}
                      onClick={() => {
                        setIdentityDeleteError(null);
                        setIdentityDeleteTarget(detailIdn);
                      }}
                    >
                      Elimina
                    </QuickActionButton>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-[2] mt-3 flex justify-center bg-gradient-to-t from-[#0A1020] via-[#0A1020]/92 to-transparent pb-1 pt-3 sm:mt-8 sm:pt-8">
              <button
                type="button"
                disabled={accSubmitting || pmSubmitting || identityEditSaving}
                aria-label="Aggiungi conto o metodo"
                onClick={() => {
                  setAccountActions(null);
                  setMethodActions(null);
                  setFabMenuOpen(true);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/35 bg-gradient-to-br from-emerald-500/18 to-emerald-600/8 text-xl font-light text-emerald-100 shadow-sm transition duration-200 ease-out hover:scale-[1.02] hover:shadow-md active:scale-[0.94] disabled:opacity-40 sm:h-14 sm:w-14 sm:text-2xl"
              >
                +
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={fabMenuOpen && detailSheetId !== null}
        title="Aggiungi"
        stackClassName="z-[95]"
        dismissDisabled={accSubmitting || pmSubmitting}
        onClose={() => {
          if (!accSubmitting && !pmSubmitting) setFabMenuOpen(false);
        }}
      >
        <div className="mx-auto flex max-w-[320px] flex-col gap-2">
          <button
            type="button"
            disabled={accSubmitting || pmSubmitting}
            className={`${idnActionBtn} border-emerald-500/35 bg-emerald-500/12 text-emerald-100 hover:border-emerald-400/50 hover:shadow-sm`}
            onClick={() => {
              setFabMenuOpen(false);
              setAccError(null);
              setAccDeleteError(null);
              setAddMethodOpen(false);
              setAddAccountOpen(true);
            }}
          >
            Nuovo conto
          </button>
          <button
            type="button"
            disabled={accSubmitting || pmSubmitting}
            className={`${idnActionBtn} border-sky-500/35 bg-sky-500/10 text-sky-100 hover:border-sky-400/45 hover:shadow-sm`}
            onClick={() => {
              setFabMenuOpen(false);
              setPmError(null);
              setAddAccountOpen(false);
              setAddMethodOpen(true);
            }}
          >
            Nuovo metodo
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={accountActions !== null && detailSheetId !== null}
        title={accountActions?.account_name?.trim() || "Conto"}
        stackClassName="z-[100]"
        onClose={() => setAccountActions(null)}
      >
        {accountActions && detailSheetId ? (
          <div className="mx-auto flex max-w-[360px] flex-col gap-3">
            {(() => {
              const bal =
                Number.parseFloat(String(accountActions.current_balance)) || 0;
              const balCls =
                bal > 0
                  ? "text-emerald-400"
                  : bal < 0
                    ? "text-[#fb7185]"
                    : "text-[#8B93A7]";
              const txDisabled =
                detailMethods.length === 0 || accDeleteLoadingId !== null;
              return (
                <>
                  <div className="rounded-xl border border-white/[0.06] bg-[#11182B]/60 px-3 py-3 text-center backdrop-blur-sm">
                    <p className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                      Saldo
                    </p>
                    <p className={`mt-1 whitespace-nowrap text-[28px] font-bold tabular-nums sm:text-3xl ${balCls}`}>
                      {formatMoney(accountActions.current_balance)} €
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={txDisabled}
                    title={
                      detailMethods.length === 0
                        ? "Aggiungi un metodo di pagamento"
                        : undefined
                    }
                    className={`${idnActionBtn} border-emerald-500/40 bg-emerald-500/12 text-emerald-100 hover:shadow-sm disabled:opacity-35`}
                    onClick={() => {
                      const a = accountActions;
                      setAccountActions(null);
                      openTxDeposit(detailSheetId, a);
                    }}
                  >
                    Deposita
                  </button>
                  <button
                    type="button"
                    disabled={txDisabled}
                    title={
                      detailMethods.length === 0
                        ? "Aggiungi un metodo di pagamento"
                        : undefined
                    }
                    className={`${idnActionBtn} border-amber-500/45 bg-amber-500/12 text-amber-100 hover:shadow-sm disabled:opacity-35`}
                    onClick={() => {
                      const a = accountActions;
                      setAccountActions(null);
                      openTxWithdraw(detailSheetId, a);
                    }}
                  >
                    Preleva
                  </button>
                  <Link
                    href={`/movimenti?player=${encodeURIComponent(detailSheetId)}&account=${encodeURIComponent(accountActions.id)}`}
                    className={`${idnActionBtn} border-white/[0.06] bg-[#151c2a] text-[#e2e8f0] hover:border-white/[0.12]`}
                    onClick={() => setAccountActions(null)}
                  >
                    Movimenti
                  </Link>
                  <button
                    type="button"
                    disabled={accDeleteLoadingId !== null}
                    className={`${idnActionBtn} border-red-500/35 bg-red-500/8 text-red-200 hover:border-red-400/45 hover:shadow-sm disabled:opacity-40`}
                    onClick={() => {
                      void handleDeleteGamingAccount(accountActions);
                      setAccountActions(null);
                    }}
                  >
                    {accDeleteLoadingId === accountActions.id ? "…" : "Elimina conto"}
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={methodActions !== null && detailSheetId !== null}
        title={(methodActions && paymentMethodTitle(methodActions)) || "Metodo"}
        stackClassName="z-[100]"
        onClose={() => setMethodActions(null)}
      >
        {methodActions && detailSheetId ? (
          <div className="mx-auto flex max-w-[360px] flex-col gap-3">
            {(() => {
              const mb = Number.parseFloat(methodActions.balance) || 0;
              const balCls =
                mb > 0
                  ? "text-emerald-400"
                  : mb < 0
                    ? "text-[#fb7185]"
                    : "text-[#8B93A7]";
              const txFromPmDisabled = detailAccList.length === 0;
              const m = methodActions;
              return (
                <>
                  <div className="rounded-xl border border-white/[0.06] bg-[#11182B]/60 px-3 py-3 text-center backdrop-blur-sm">
                    <p className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                      Saldo
                    </p>
                    <p className={`mt-1 whitespace-nowrap text-[28px] font-bold tabular-nums sm:text-3xl ${balCls}`}>
                      {formatMoney(methodActions.balance)} €
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={txFromPmDisabled}
                    className={`${idnActionBtn} border-emerald-500/40 bg-emerald-500/12 text-emerald-100 hover:shadow-sm disabled:opacity-35`}
                    onClick={() => {
                      setMethodActions(null);
                      openTxDepositFromMethod(detailSheetId, m);
                    }}
                  >
                    Deposita
                  </button>
                  <button
                    type="button"
                    disabled={txFromPmDisabled}
                    className={`${idnActionBtn} border-amber-500/45 bg-amber-500/12 text-amber-100 hover:shadow-sm disabled:opacity-35`}
                    onClick={() => {
                      setMethodActions(null);
                      openTxWithdrawFromMethod(detailSheetId, m);
                    }}
                  >
                    Preleva
                  </button>
                  <button
                    type="button"
                    className={`${idnActionBtn} border-white/12 bg-transparent text-[#B4BCCC] hover:border-white/25 hover:bg-white/[0.04]`}
                    onClick={() => {
                      setMethodActions(null);
                      openEdit(m);
                    }}
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    className={`${idnActionBtn} border-red-500/35 bg-red-500/8 text-red-200 hover:border-red-400/45 hover:shadow-sm`}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(m);
                      setMethodActions(null);
                    }}
                  >
                    Elimina
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={addAccountOpen && detailSheetId !== null}
        title="Nuovo conto"
        stackClassName="z-[110]"
        dismissDisabled={accSubmitting}
        onClose={() => {
          if (!accSubmitting) setAddAccountOpen(false);
        }}
      >
        <form
          className="mx-auto max-w-md space-y-2"
          onSubmit={(e) => void handleAddAccount(e, detailSheetId!)}
        >
          <input
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
            placeholder="Nome conto"
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          />
          <select
            required
            value={accBookmakerId}
            onChange={(e) => setAccBookmakerId(e.target.value)}
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          >
            <option value="">Bookmaker —</option>
            {bookmakers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            value={accInitStr}
            onChange={(e) => setAccInitStr(e.target.value)}
            placeholder="Saldo iniziale (opzionale)"
            inputMode="decimal"
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          />
          {bookmakers.length === 0 ? (
            <p className="text-sm sm:text-xs text-[#8B93A7]">
              <Link href="/bookmakers" className="text-[#A970FF] underline-offset-2 hover:underline">
                Configura bookmaker
              </Link>
            </p>
          ) : null}
          {accError ? <p className="text-sm sm:text-xs text-[#fb7185]">{accError}</p> : null}
          <button
            type="submit"
            disabled={accSubmitting}
            className="sm-btn-primary mt-1 w-full min-h-10 rounded-full text-lg sm:text-sm disabled:opacity-60"
          >
            {accSubmitting ? "Salvataggio…" : "Crea conto"}
          </button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={addMethodOpen && detailSheetId !== null}
        title="Nuovo metodo"
        stackClassName="z-[110]"
        dismissDisabled={pmSubmitting}
        onClose={() => {
          if (!pmSubmitting) setAddMethodOpen(false);
        }}
      >
        <form
          className="mx-auto max-w-md space-y-2"
          onSubmit={(e) => void handleAddMethod(e, detailSheetId!)}
        >
          <input
            value={pmNome}
            onChange={(e) => setPmNome(e.target.value)}
            placeholder="Nome metodo"
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          />
          <select
            value={pmTipo}
            onChange={(e) => setPmTipo(e.target.value as PaymentType)}
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          >
            {PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={pmBalanceStr}
            onChange={(e) => setPmBalanceStr(e.target.value)}
            placeholder="Saldo iniziale"
            inputMode="decimal"
            className="sm-input min-h-11 text-lg sm:min-h-10 sm:text-sm"
          />
          {pmError ? <p className="text-sm sm:text-xs text-[#fb7185]">{pmError}</p> : null}
          <button
            type="submit"
            disabled={pmSubmitting}
            className="sm-btn-primary mt-1 w-full min-h-10 rounded-full text-lg sm:text-sm disabled:opacity-60"
          >
            {pmSubmitting ? "Salvataggio…" : "Crea metodo"}
          </button>
        </form>
      </BottomSheet>

      <BottomSheet
        open={txModal !== null}
        title={txModal?.mode === "deposit" ? "Deposito sul conto" : "Prelievo dal conto"}
        stackClassName="z-[110]"
        dismissDisabled={txSubmitting}
        onClose={() => {
          if (!txSubmitting) closeTxModal();
        }}
      >
        {txModal ? (
          <form className="space-y-3" onSubmit={(e) => void handleTxSubmit(e)}>
            {txShowAccPicker ? (
              <div className="space-y-1">
                <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                  Conto gioco
                </label>
                <select
                  required
                  value={txModal.accountId}
                  onChange={(e) =>
                    setTxModal((prev) =>
                      prev ? { ...prev, accountId: e.target.value } : prev,
                    )
                  }
                  className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
                >
                  {txAccList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_name}
                      {gamingAccountBookmakerDisplay(a)
                        ? ` · ${gamingAccountBookmakerDisplay(a)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm sm:text-xs text-[#8B93A7]">
                Conto:{" "}
                <span className="font-medium text-white">
                  {txAccountRow?.account_name ?? "—"}
                  {txAccountRow && gamingAccountBookmakerDisplay(txAccountRow)
                    ? ` · ${gamingAccountBookmakerDisplay(txAccountRow)}`
                    : ""}
                </span>
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                Metodo di pagamento
              </label>
              <select
                required
                value={txPmId}
                onChange={(e) => setTxPmId(e.target.value)}
                className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
              >
                <option value="">—</option>
                {paymentMethodsForIdentity(txModal.identityId, paymentMethods).map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {paymentMethodTitle(pm)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                Importo (€)
              </label>
              <input
                value={txAmountStr}
                onChange={(e) => setTxAmountStr(e.target.value)}
                inputMode="decimal"
                required
                placeholder="0,00"
                className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
              />
            </div>
            {txModal.mode === "withdrawal" ? (
              <div className="space-y-1">
                <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                  Stato
                </label>
                <select
                  value={txWithdrawStatus}
                  onChange={(e) =>
                    setTxWithdrawStatus(e.target.value as TransactionStatus)
                  }
                  className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
                >
                  <option value="completed">Completato</option>
                  <option value="pending">In attesa</option>
                  <option value="rejected">Rifiutato</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-sm sm:text-xs font-semibold uppercase tracking-wide text-[#8B93A7]">
                Note (opzionale)
              </label>
              <input
                value={txNotes}
                onChange={(e) => setTxNotes(e.target.value)}
                placeholder="Riferimento interno…"
                className="sm-input min-h-11 w-full text-lg sm:min-h-10 sm:text-sm"
              />
            </div>
            {txSaveDisabledByBalanceIdent && !txError ? (
              <p
                className="rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm sm:text-xs text-[#fb7185]"
                role="status"
              >
                {txModal.mode === "deposit"
                  ? "Saldo metodo insufficiente"
                  : "Saldo conto insufficiente per completare il prelievo"}
              </p>
            ) : null}
            {txError ? (
              <p
                className="rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-2.5 py-1.5 text-sm sm:text-xs text-[#fb7185]"
                role="alert"
              >
                {txError}
              </p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={txSubmitting}
                onClick={() => {
                  if (!txSubmitting) closeTxModal();
                }}
                className="h-10 flex-1 rounded-full border border-white/[0.06] text-lg sm:text-sm font-semibold text-[#e2e8f0]"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={txSubmitting || txSaveDisabledByBalanceIdent}
                className="sm-btn-primary h-10 flex-1 rounded-full text-lg sm:text-sm disabled:cursor-not-allowed disabled:opacity-45"
              >
                {txSubmitting ? "…" : "Registra"}
              </button>
            </div>
          </form>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={editingMethod !== null}
        title="Metodo"
        stackClassName="z-[110]"
        dismissDisabled={editSaving}
        onClose={() => {
          if (!editSaving) setEditingMethod(null);
        }}
      >
        <form className="space-y-3" onSubmit={(e) => void handleSaveEdit(e)}>
          <input
            value={editNome}
            onChange={(e) => setEditNome(e.target.value)}
            required
            className="sm-input"
          />
          <select
            value={editTipo}
            onChange={(e) => setEditTipo(e.target.value as PaymentType)}
            className="sm-input"
          >
            {PAYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={editBalanceStr}
            onChange={(e) => setEditBalanceStr(e.target.value)}
            required
            inputMode="decimal"
            className="sm-input"
          />
          {editError ? <p className="text-lg sm:text-sm text-[#fb7185]">{editError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editSaving}
              onClick={() => setEditingMethod(null)}
              className="h-10 flex-1 rounded-full border border-white/[0.06] text-lg sm:text-sm font-semibold text-[#e2e8f0]"
            >
              Annulla
            </button>
            <button type="submit" disabled={editSaving} className="sm-btn-primary flex-1 rounded-full">
              Salva
            </button>
          </div>
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminare?"
        message={deleteTarget ? paymentMethodTitle(deleteTarget) : ""}
        confirmText="Elimina"
        cancelText="Annulla"
        variant="danger"
        loading={deleteLoading}
        error={deleteError}
        onCancel={() => {
          if (!deleteLoading) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleConfirmDelete()}
      />

      <ConfirmDialog
        open={identityDeleteTarget !== null}
        title="Eliminare identità?"
        message="Vuoi davvero eliminare questa identità?"
        confirmText="Elimina"
        cancelText="Annulla"
        variant="danger"
        loading={identityDeleteLoading}
        error={identityDeleteError}
        onCancel={() => {
          if (!identityDeleteLoading) {
            setIdentityDeleteTarget(null);
            setIdentityDeleteError(null);
          }
        }}
        onConfirm={() => void handleConfirmDeleteIdentity()}
      />
      </AppShell>
    </AuthGate>
  );
}
