import { useState } from "react";
import { BadgeCheck, CreditCard, LoaderCircle, Save, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { CardoraOutputs } from "@/lib/cardora-types";

type ManagedPlan = CardoraOutputs["admin"]["subscriptions"]["plans"][number];
type AccountRow = CardoraOutputs["admin"]["subscriptions"]["accounts"]["rows"][number];
type PlanForm = {
  code: string;
  name: string;
  description: string;
  contactLimit: number;
  collectionLimit: number;
  priceMajor: number;
  currency: string;
  billingInterval: "monthly" | "yearly";
  isActive: boolean;
  isDefault: boolean;
};

const blankPlan: PlanForm = {
  code: "starter",
  name: "Starter",
  description: "A simple plan for growing contact lists.",
  contactLimit: 500,
  collectionLimit: 10,
  priceMajor: 0,
  currency: "KES",
  billingInterval: "monthly",
  isActive: true,
  isDefault: false,
};

function currencyDigits(currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency || "KES" }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { return 2; }
}
function majorAmount(minor: number, currency: string) { return minor / (10 ** currencyDigits(currency)); }
function displayAmount(minor: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(majorAmount(minor, currency)); }
  catch { return `${currency} ${majorAmount(minor, currency).toFixed(2)}`; }
}
function dateValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}
const formattedNumber = (value: number) => new Intl.NumberFormat().format(value);

export function SubscriptionManagementView() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(blankPlan);
  const utils = trpc.useUtils();
  const plans = trpc.admin.subscriptions.plans.useQuery(undefined, { retry: false });
  const accounts = trpc.admin.subscriptions.accounts.useQuery({ page, pageSize: 20, search }, { retry: false });
  const savePlan = trpc.admin.subscriptions.savePlan.useMutation({
    onSuccess: async () => {
      toast.success("Subscription plan saved.");
      setEditingId(null);
      setForm(blankPlan);
      await Promise.all([utils.admin.subscriptions.plans.invalidate(), utils.admin.subscriptions.accounts.invalidate(), utils.cardora.dashboard.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  function edit(plan: ManagedPlan) {
    setEditingId(plan.id);
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      contactLimit: plan.contactLimit,
      collectionLimit: plan.collectionLimit,
      priceMajor: majorAmount(plan.priceMinor, plan.currency),
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isActive: plan.isActive,
      isDefault: plan.isDefault,
    });
    document.getElementById("subscription-plan-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function set<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function submitPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePlan.mutate({ ...form, id: editingId ?? undefined, currency: form.currency.trim().toUpperCase() });
  }

  const activePlans = (plans.data ?? []).filter(plan => plan.isActive);
  const pageCount = Math.max(1, Math.ceil((accounts.data?.total ?? 0) / 20));

  return <div className="admin-subscription-page">
    <div className="admin-subscription-intro"><span className="admin-plan-icon"><CreditCard size={18} /></span><div><strong>Plans, limits and account assignments</strong><p>Edit what each tier includes, then assign or change a user's plan. Account-wide caps are enforced by the server; existing contacts and links are preserved if a cap is lowered.</p></div></div>

    <div className="admin-subscription-grid">
      <section className="admin-panel admin-plan-panel">
        <div className="admin-panel-head"><div><span className="admin-panel-icon"><CreditCard size={16} /></span><div><h2>Subscription plans</h2><p>{plans.data?.length ?? 0} configured · {plans.data?.filter(plan => plan.isActive).length ?? 0} available</p></div></div><Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(blankPlan); }}>New plan</Button></div>
        {plans.error && <div className="admin-error">{plans.error.message}</div>}
        <div className="admin-plan-list">{(plans.data ?? []).map(plan => <PlanCard key={plan.id} plan={plan} onEdit={() => edit(plan)} />)}</div>
      </section>

      <section className="admin-panel admin-plan-editor" id="subscription-plan-editor">
        <div className="admin-panel-head"><div><span className="admin-panel-icon citrus"><Save size={16} /></span><div><h2>{editingId ? "Edit plan" : "Create plan"}</h2><p>Limits and pricing are set in this workspace.</p></div></div></div>
        <form className="admin-plan-form" onSubmit={submitPlan}>
          <div className="admin-plan-form-grid">
            <label className="admin-plan-field"><span>Plan name</span><Input value={form.name} onChange={event => set("name", event.target.value)} required maxLength={100} /></label>
            <label className="admin-plan-field"><span>Plan code</span><Input value={form.code} onChange={event => set("code", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} required minLength={2} maxLength={40} disabled={editingId !== null} /><small>Short stable code; locked after creation.</small></label>
            <label className="admin-plan-field"><span>Maximum accepted contacts per owner</span><Input type="number" min={1} max={1000000} step={1} value={form.contactLimit} onChange={event => set("contactLimit", Number(event.target.value))} required /></label>
            <label className="admin-plan-field"><span>Maximum collection links per owner</span><Input type="number" min={1} max={10000} step={1} value={form.collectionLimit} onChange={event => set("collectionLimit", Number(event.target.value))} required /></label>
            <label className="admin-plan-field"><span>Price (major currency units)</span><Input type="number" min={0} max={50000000} step={1 / (10 ** currencyDigits(form.currency))} value={form.priceMajor} onChange={event => set("priceMajor", Number(event.target.value))} required /></label>
            <label className="admin-plan-field"><span>Currency · ISO 4217</span><Input value={form.currency} onChange={event => set("currency", event.target.value.toUpperCase().slice(0, 3))} minLength={3} maxLength={3} required /></label>
            <label className="admin-plan-field"><span>Billing interval</span><select value={form.billingInterval} onChange={event => set("billingInterval", event.target.value as PlanForm["billingInterval"])}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          </div>
          <label className="admin-plan-field"><span>Plan description</span><Textarea value={form.description} onChange={event => set("description", event.target.value)} maxLength={1000} rows={3} /></label>
          <div className="admin-plan-flags"><label><input type="checkbox" checked={form.isActive} onChange={event => set("isActive", event.target.checked)} /> Available to assign</label><label><input type="checkbox" checked={form.isDefault} onChange={event => set("isDefault", event.target.checked)} disabled={!form.isActive || form.priceMajor !== 0} /> Default free plan</label></div>
          <p className="admin-plan-hint">The default plan must remain active and free. Lowering a limit never deletes existing data; new collection links and contacts are paused until the account is under its current cap.</p>
          <div className="admin-plan-actions"><Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(blankPlan); }}>Reset</Button><Button type="submit" className="primary-button" disabled={savePlan.isPending}>{savePlan.isPending ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <><Save size={15} /> Save plan</>}</Button></div>
        </form>
      </section>
    </div>

    <section className="admin-panel admin-table-card admin-account-plans">
      <div className="admin-panel-head"><div><span className="admin-panel-icon"><Users size={16} /></span><div><h2>Owner plan assignments</h2><p>{formattedNumber(accounts.data?.total ?? 0)} accounts · usage counts accepted contacts and retained links</p></div></div><label className="admin-plan-search"><Search size={15} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search name, email or account ID" aria-label="Search subscription accounts" /></label></div>
      {accounts.error && <div className="admin-error">{accounts.error.message}</div>}
      <div className="admin-table-scroll"><table className="admin-table admin-subscription-table"><thead><tr><th>Account</th><th>Current plan</th><th>Accepted contacts</th><th>Collection links</th><th>New assignment</th><th>Access ends</th><th>Action</th></tr></thead><tbody>{(accounts.data?.rows ?? []).map(account => <AccountAssignmentRow key={account.id} account={account} plans={activePlans} onSaved={async () => { await Promise.all([utils.admin.subscriptions.accounts.invalidate(), utils.cardora.dashboard.invalidate()]); }} />)}</tbody></table>{!accounts.data?.rows.length && !accounts.isLoading && <div className="admin-empty">No accounts match that search.</div>}</div>
      <div className="admin-pager"><span>{formattedNumber(accounts.data?.total ?? 0)} accounts · page {page + 1} of {pageCount}</span><div><button type="button" disabled={page <= 0} onClick={() => setPage(value => Math.max(0, value - 1))} aria-label="Previous page">‹</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} aria-label="Next page">›</button></div></div>
    </section>
  </div>;
}

function PlanCard({ plan, onEdit }: { plan: ManagedPlan; onEdit: () => void }) {
  return <article className={`admin-plan-card ${plan.isActive ? "" : "inactive"}`}>
    <div className="admin-plan-card-head"><div><h3>{plan.name}</h3><code>{plan.code}</code></div><div className="admin-plan-badges">{plan.isDefault && <span className="default">Default</span>}<span className={plan.isActive ? "active" : "inactive-badge"}>{plan.isActive ? "Active" : "Inactive"}</span></div></div>
    <p>{plan.description}</p>
    <div className="admin-plan-facts"><span><strong>{formattedNumber(plan.contactLimit)}</strong> contacts</span><span><strong>{formattedNumber(plan.collectionLimit)}</strong> links</span><span><strong>{plan.priceMinor === 0 ? "Free" : displayAmount(plan.priceMinor, plan.currency)}</strong>{plan.priceMinor > 0 && ` / ${plan.billingInterval === "yearly" ? "year" : "month"}`}</span></div>
    <div className="admin-plan-card-footer"><span>{formattedNumber(plan.activeSubscribers)} active assignment{plan.activeSubscribers === 1 ? "" : "s"}</span><Button type="button" variant="outline" onClick={onEdit}>Edit</Button></div>
  </article>;
}

function AccountAssignmentRow({ account, plans, onSaved }: { account: AccountRow; plans: ManagedPlan[]; onSaved: () => Promise<void> }) {
  const [planId, setPlanId] = useState(account.plan.id);
  const initialStatus = account.subscription.status;
  const [status, setStatus] = useState<"active" | "past_due" | "canceled" | "expired">(initialStatus === "past_due" || initialStatus === "canceled" || initialStatus === "expired" ? initialStatus : "active");
  const [endsOn, setEndsOn] = useState(dateValue(account.subscription.currentPeriodEnd));
  const utils = trpc.useUtils();
  const assign = trpc.admin.subscriptions.assign.useMutation({
    onSuccess: async () => {
      toast.success(`Plan assignment updated for ${account.name || account.email || `Account ${account.id}`}.`);
      await onSaved();
    },
    onError: error => toast.error(error.message),
  });
  const currentLimits = `${formattedNumber(account.acceptedContacts)} / ${formattedNumber(account.plan.contactLimit)}`;
  const currentCollections = `${formattedNumber(account.collections)} / ${formattedNumber(account.plan.collectionLimit)}`;

  return <tr>
    <td><strong>{account.name || `Account ${account.id}`}</strong><small>{account.email || `User #${account.id}`}{account.role === "admin" ? " · Admin" : ""}</small></td>
    <td><strong>{account.plan.name}</strong><small className="admin-plan-row-status">{account.subscription.status.replaceAll("_", " ")}</small></td>
    <td><span className={account.acceptedContacts >= account.plan.contactLimit ? "quota-exhausted" : ""}>{currentLimits}</span></td>
    <td><span className={account.collections >= account.plan.collectionLimit ? "quota-exhausted" : ""}>{currentCollections}</span></td>
    <td><div className="admin-assignment-inputs"><select value={planId} onChange={event => setPlanId(Number(event.target.value))} aria-label={`Plan for account ${account.id}`}>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formattedNumber(plan.contactLimit)} contacts</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as typeof status)} aria-label={`Subscription status for account ${account.id}`}><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled</option><option value="expired">Expired</option></select></div></td>
    <td><input className="admin-date-input" type="date" value={endsOn} onChange={event => setEndsOn(event.target.value)} aria-label={`Plan end date for account ${account.id}`} /><small>Blank means no expiry</small></td>
    <td><Button type="button" className="admin-assign-button" onClick={() => assign.mutate({ ownerId: account.id, planId, status, endsOn: endsOn || null })} disabled={assign.isPending || !plans.length}>{assign.isPending ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />} Apply</Button></td>
  </tr>;
}
