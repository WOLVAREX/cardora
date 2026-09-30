import { BadgeCheck, CreditCard, Link2, ShieldCheck, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

function money(amountMinor: number, currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountMinor / (10 ** digits));
}

function shortDate(value: Date | string | null) {
  if (!value) return "No end date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function SubscriptionView() {
  const query = trpc.cardora.subscription.status.useQuery();
  if (query.isLoading) return <div className="subscription-page"><div className="loading-row">Loading your plan and usage…</div></div>;
  if (query.error || !query.data) return <div className="subscription-page"><div className="subscription-error">Your plan details could not be loaded. Refresh the page and try again.</div></div>;

  const { plan, subscription, usage, availablePlans } = query.data;
  const contactPercent = Math.min(100, Math.round((usage.acceptedContacts / plan.contactLimit) * 100));
  const collectionPercent = Math.min(100, Math.round((usage.collections / plan.collectionLimit) * 100));
  const currentLabel = subscription.status === "free" ? "Free plan" : subscription.status.replaceAll("_", " ");

  return <div className="subscription-page">
    <div className="page-heading-row"><div><div className="eyebrow">YOUR CARDORA ACCOUNT</div><h1>Plan &amp; usage</h1><p className="page-subtitle">See the limits that protect your collections and the people who contribute.</p></div></div>

    <section className="subscription-current content-card">
      <div className="subscription-current-top"><div className="subscription-plan-icon"><CreditCard size={19} /></div><div className="subscription-current-title"><span className="eyebrow">CURRENT PLAN</span><h2>{plan.name}</h2><p>{plan.description}</p></div><span className={`subscription-status ${subscription.status}`}><i />{currentLabel}</span></div>
      <div className="subscription-current-meta"><span><strong>{plan.priceMinor === 0 ? "Free" : money(plan.priceMinor, plan.currency)}</strong>{plan.priceMinor > 0 && <small> / {plan.billingInterval === "yearly" ? "year" : "month"}</small>}</span><span><ShieldCheck size={14} /> {subscription.source === "default" ? "Default plan" : subscription.source === "admin" ? "Managed by Cardora admin" : "Paystack subscription"}</span>{subscription.currentPeriodEnd && <span>Access through {shortDate(subscription.currentPeriodEnd)}</span>}</div>
    </section>

    <div className="subscription-usage-grid">
      <UsageCard icon={Users} label="Accepted contacts" used={usage.acceptedContacts} limit={plan.contactLimit} remaining={usage.contactsRemaining} percent={contactPercent} message={usage.canAcceptContact ? "Across every collection link" : "New contributions are paused across your links."} />
      <UsageCard icon={Link2} label="Collection links" used={usage.collections} limit={plan.collectionLimit} remaining={usage.collectionsRemaining} percent={collectionPercent} message={usage.canCreateCollection ? "All retained links count toward your limit." : "New link creation is paused until your plan changes."} />
    </div>

    <section className="content-card subscription-plan-list">
      <div className="section-head"><div><h2>Available plans</h2><p>Plan limits and pricing are set by Cardora administrators.</p></div><span className="subscription-managed-badge"><BadgeCheck size={14} /> Admin managed</span></div>
      <div className="subscription-available-grid">{availablePlans.map(item => <article className={`subscription-option ${item.id === plan.id ? "current" : ""}`} key={item.id}>
        <div className="subscription-option-head"><h3>{item.name}</h3>{item.id === plan.id && <span>YOUR PLAN</span>}</div>
        <strong className="subscription-option-price">{item.priceMinor === 0 ? "Free" : money(item.priceMinor, item.currency)}{item.priceMinor > 0 && <small> / {item.billingInterval === "yearly" ? "year" : "month"}</small>}</strong>
        <p>{item.description}</p>
        <div className="subscription-option-limits"><span>{new Intl.NumberFormat().format(item.contactLimit)} contacts</span><span>{new Intl.NumberFormat().format(item.collectionLimit)} links</span></div>
      </article>)}</div>
      <div className="subscription-checkout-note"><ShieldCheck size={16} /><p><strong>Billing checkout is not active yet.</strong> Cardora's Paystack checkout and automatic renewals will be enabled for production after the merchant account and server webhook configuration are ready. For now, an administrator manages plan changes; no payment is taken here.</p></div>
    </section>
  </div>;
}

function UsageCard({ icon: Icon, label, used, limit, remaining, percent, message }: { icon: typeof Users; label: string; used: number; limit: number; remaining: number; percent: number; message: string }) {
  return <section className="content-card subscription-usage-card">
    <div className="subscription-usage-heading"><span className="subscription-usage-icon"><Icon size={18} /></span><div><span>{label}</span><strong>{new Intl.NumberFormat().format(used)} <small>/ {new Intl.NumberFormat().format(limit)}</small></strong></div></div>
    <div className="subscription-progress" role="progressbar" aria-label={`${label} usage`} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}><span style={{ width: `${percent}%` }} /></div>
    <div className="subscription-usage-foot"><strong>{new Intl.NumberFormat().format(remaining)} remaining</strong><span>{percent}% used</span></div>
    <p>{message}</p>
  </section>;
}
