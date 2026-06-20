import type { UsageSummary as Data } from "@/lib/ai-usage";

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function UsageSummary({ data }: { data: Data | null }) {
  if (!data || data.totalTokens === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-base font-medium">Token usage</h2>
        <p className="mt-4 text-sm text-fg-subtle">No AI usage yet.</p>
      </section>
    );
  }

  const table = (title: string, rows: Data["byModel"]) => (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="overflow-hidden rounded-[8px] border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-elevated/40 text-fg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-right font-normal">Input</th>
              <th className="px-3 py-2 text-right font-normal">Output</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
              <th className="px-3 py-2 text-right font-normal">Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-hairline">
                <td className="px-3 py-2">{r.label}</td>
                <td className="px-3 py-2 text-right text-fg-muted">{fmt(r.inputTokens)}</td>
                <td className="px-3 py-2 text-right text-fg-muted">{fmt(r.outputTokens)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.totalTokens)}</td>
                <td className="px-3 py-2 text-right text-fg-muted">{r.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-medium">Token usage</h2>
        <span className="text-sm text-fg-muted">{fmt(data.totalTokens)} tokens total</span>
      </div>
      {table("By project", data.byProject)}
      {table("By model", data.byModel)}
    </section>
  );
}
