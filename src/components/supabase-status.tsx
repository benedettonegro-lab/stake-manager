import { isSupabaseConfigured, pingSupabaseAuth } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase.server";

export async function SupabaseStatus() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="space-y-2" aria-labelledby="conn-test-heading">
        <h2
          id="conn-test-heading"
          className="text-lg sm:text-base sm:text-sm font-semibold text-white"
        >
          Test di connessione Supabase
        </h2>
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm text-amber-100">
          Variabili mancanti. In <code className="font-mono text-sm sm:text-xs text-[#fde68a]">.env.local</code>{" "}
          imposta{" "}
          <code className="font-mono text-sm sm:text-xs text-[#fde68a]">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code className="font-mono text-sm sm:text-xs text-[#fde68a]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
          (Dashboard progetto → Settings → API).
        </p>
      </section>
    );
  }

  const ping = await pingSupabaseAuth();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;

  if (!ping.ok || error) {
    return (
      <section className="space-y-2" aria-labelledby="conn-test-heading">
        <h2
          id="conn-test-heading"
          className="text-lg sm:text-base sm:text-sm font-semibold text-white"
        >
          Test di connessione Supabase
        </h2>
        <div className="space-y-1.5 rounded-lg border border-[#fb7185]/35 bg-[#fb7185]/10 px-3 py-2 text-sm sm:space-y-2 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm text-[#fecdd3]">
          <p>
            <span className="font-medium text-white">Ping Auth:</span>{" "}
            {ping.ok ? "OK" : `fallito — ${ping.detail}`} ({ping.latencyMs}
            ms)
          </p>
          {error ? (
            <p>
              <span className="font-medium text-white">getUser():</span>{" "}
              {error.message}
            </p>
          ) : null}
          <p className="text-sm sm:text-xs text-[#8B93A7]">
            Host: <span className="font-mono text-[#B4BCCC]">{host}</span>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2" aria-labelledby="conn-test-heading">
      <h2
        id="conn-test-heading"
        className="text-lg sm:text-base sm:text-sm font-semibold text-white"
      >
        Test di connessione Supabase
      </h2>
      <div className="rounded-lg border border-[#34d399]/30 bg-[#34d399]/10 px-3 py-2 text-sm sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm text-[#a7f3d0]">
        <p className="font-medium text-[#ecfdf5]">
          Connesso — {ping.detail} ({ping.latencyMs} ms)
        </p>
        <p className="mt-1 text-sm sm:text-xs text-[#8B93A7]">
          Progetto: <span className="font-mono text-[#B4BCCC]">{host}</span>
        </p>
        <p className="mt-1 text-sm sm:text-xs text-[#8B93A7]">
          <span className="font-medium text-[#B4BCCC]">getUser():</span>{" "}
          {data.user ? (
            <span className="font-mono text-[#e2e8f0]">
              {data.user.email ?? data.user.id}
            </span>
          ) : (
            <span>nessuna sessione (anon)</span>
          )}
        </p>
      </div>
    </section>
  );
}
