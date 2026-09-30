import { useState } from "react";
import { ArrowLeft, ArrowRight, CreditCard, Receipt, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function formatTransactionDate(value: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function transactionAmount(amountMinor: number, currency: string) {
  const fractionDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountMinor / (10 ** fractionDigits));
}

export function PaymentStatus({ status }: { status: string }) {
  const label = status === "initializing" ? "Starting" : status.replaceAll("_", " ");
  return <span className={`transaction-status ${status}`}><i />{label}</span>;
}

export function TransactionsView() {
  const [page, setPage] = useState(0);
  const history = trpc.cardora.subscription.payments.history.useQuery({ page, pageSize: 20 });
  const rows = history.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((history.data?.total ?? 0) / 20));

  return <div className="transactions-page">
    <div className="page-heading-row"><div><div className="eyebrow">YOUR CARDORA ACCOUNT</div><h1>Transactions</h1><p className="page-subtitle">Review your plan payments and their latest status.</p></div></div>
    {history.error ? <div className="subscription-error" role="alert">Transaction history could not be loaded.<button type="button" className="text-button" onClick={() => void history.refetch()}>Try again</button></div> : <section className="content-card transaction-card">
      <div className="transaction-card-heading"><span className="subscription-plan-icon"><Receipt size={18} /></span><div><h2>Payment history</h2><p>{history.isLoading ? "Loading your transactions…" : `${new Intl.NumberFormat().format(history.data?.total ?? 0)} transaction${history.data?.total === 1 ? "" : "s"}`}</p></div></div>
      {history.isLoading ? <div className="loading-row">Loading transactions…</div> : rows.length ? <>
        <div className="transaction-table-wrap"><table className="transaction-table"><thead><tr><th>Date</th><th>Plan</th><th>Reference</th><th>Method</th><th>Term</th><th>Status</th><th>Amount</th><th>Access through</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
          <td>{formatTransactionDate(row.createdAt)}</td><td><strong>{row.planName ?? "Plan unavailable"}</strong></td><td><code>{row.reference}</code></td>
          <td><span className="transaction-method">{row.providerChannel === "mobile_money" ? <Smartphone size={14} /> : <CreditCard size={14} />}{row.providerChannel === "mobile_money" ? "M-Pesa" : "Card"}</span></td>
          <td>{row.billingInterval}</td><td><PaymentStatus status={row.status} /></td><td><strong>{transactionAmount(row.amountMinor, row.currency)}</strong></td><td>{row.status === "paid" ? formatTransactionDate(row.periodEndAt) : "—"}</td>
        </tr>)}</tbody></table></div>
        <TransactionPager page={page} pages={pages} setPage={setPage} />
      </> : <div className="transaction-empty"><Receipt size={23} /><strong>No transactions yet</strong><p>Payments for your Cardora plans will appear here.</p></div>}
    </section>}
  </div>;
}

export function TransactionPager({ page, pages, setPage }: { page: number; pages: number; setPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <div className="transaction-pager"><span>Page {page + 1} of {pages}</span><div><Button type="button" variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}><ArrowLeft size={14} /> Previous</Button><Button type="button" variant="outline" size="sm" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>Next <ArrowRight size={14} /></Button></div></div>;
}
