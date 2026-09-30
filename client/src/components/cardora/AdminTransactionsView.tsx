import { useState } from "react";
import { CreditCard, Receipt, Search, Smartphone } from "lucide-react";
import { PaymentStatus, TransactionPager, formatTransactionDate, transactionAmount } from "./TransactionsView";
import { trpc } from "@/lib/trpc";

export function AdminTransactionsView() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"initializing" | "pending" | "paid" | "failed" | "">("");
  const transactions = trpc.admin.transactions.useQuery({ page, pageSize: 20, search, ...(status ? { status } : {}) }, { retry: false });
  const rows = transactions.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((transactions.data?.total ?? 0) / 20));

  return <section className="admin-panel admin-table-card admin-transactions-panel">
    <div className="admin-panel-head"><div><span className="admin-panel-icon"><Receipt size={16} /></span><div><h2>All transactions</h2><p>{new Intl.NumberFormat().format(transactions.data?.total ?? 0)} payments · status and provider reference</p></div></div></div>
    <div className="admin-transaction-filters"><label className="admin-transaction-search"><Search size={15} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search reference, plan, owner or email" aria-label="Search transactions" /></label><label className="admin-transaction-status-filter"><span>Status</span><select value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(0); }}><option value="">All statuses</option><option value="initializing">Starting</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="failed">Failed</option></select></label></div>
    {transactions.error ? <div className="admin-error">Transactions could not be loaded: {transactions.error.message}</div> : transactions.isLoading ? <div className="admin-empty">Loading transactions…</div> : rows.length ? <>
      <div className="admin-table-scroll"><table className="admin-table transaction-admin-table"><thead><tr><th>Created</th><th>Owner</th><th>Plan</th><th>Reference</th><th>Method</th><th>Term</th><th>Status</th><th>Amount</th><th>Access through</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td>{formatTransactionDate(row.createdAt)}</td><td><strong>{row.ownerName || `Owner #${row.ownerId}`}</strong><small>{row.ownerEmail || `Account #${row.ownerId}`}</small></td><td>{row.planName ?? "Plan unavailable"}</td><td><code>{row.reference}</code></td>
        <td><span className="transaction-method">{row.providerChannel === "mobile_money" ? <Smartphone size={13} /> : <CreditCard size={13} />}{row.providerChannel === "mobile_money" ? "M-Pesa" : "Card"}</span></td><td>{row.billingInterval}</td><td><PaymentStatus status={row.status} /></td><td><strong>{transactionAmount(row.amountMinor, row.currency)}</strong></td><td>{row.status === "paid" ? formatTransactionDate(row.periodEndAt) : "—"}</td>
      </tr>)}</tbody></table></div>
      <TransactionPager page={page} pages={pages} setPage={setPage} />
    </> : <div className="transaction-empty"><Receipt size={22} /><strong>No matching transactions</strong><p>Try another search or status filter.</p></div>}
  </section>;
}
