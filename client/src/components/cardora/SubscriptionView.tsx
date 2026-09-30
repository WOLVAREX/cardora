import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, CreditCard, Link2, LoaderCircle, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

declare global {
  interface Window { PaystackPop?: new () => { resumeTransaction: (accessCode: string) => unknown } }
}

function money(amountMinor: number, currency: string) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountMinor / (10 ** digits));
}

function shortDate(value: Date | string | null) {
  if (!value) return "No end date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function loadPaystackInline() {
  if (window.PaystackPop) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("paystack-inline-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Paystack checkout could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "paystack-inline-js";
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Paystack checkout could not load."));
    document.head.appendChild(script);
  });
}

export function SubscriptionView() {
  const query = trpc.cardora.subscription.status.useQuery();
  const utils = trpc.useUtils();
  const [stkPlan, setStkPlan] = useState<{ id: number; name: string; price: string } | null>(null);
  const [phone, setPhone] = useState("");
  const [pendingPayment, setPendingPayment] = useState<{ reference: string; message: string } | null>(null);
  const startCard = trpc.cardora.subscription.payments.startCard.useMutation();
  const startStk = trpc.cardora.subscription.payments.startStk.useMutation();
  const verifyPayment = trpc.cardora.subscription.payments.verify.useMutation();

  const checkPayment = async (reference: string) => {
    try {
      const result = await verifyPayment.mutateAsync({ reference });
      setPendingPayment({ reference, message: result.message });
      if (result.status === "paid") {
        toast.success(result.message);
        setPendingPayment(null);
        setStkPlan(null);
        await Promise.all([utils.cardora.subscription.status.invalidate(), utils.cardora.dashboard.invalidate()]);
      } else if (result.status === "failed") toast.error(result.message);
      else toast.message(result.message);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not check the payment yet."); }
  };

  const payByCard = async (planId: number) => {
    try {
      const checkout = await startCard.mutateAsync({ planId });
      await loadPaystackInline();
      if (!window.PaystackPop) throw new Error("Paystack checkout could not load.");
      const popup = new window.PaystackPop();
      popup.resumeTransaction(checkout.accessCode);
      setPendingPayment({ reference: checkout.reference, message: "Complete the card payment in the Paystack popup, then check its status here." });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start card checkout."); }
  };

  const beginStk = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stkPlan) return;
    try {
      const result = await startStk.mutateAsync({ planId: stkPlan.id, phone });
      setPendingPayment({ reference: result.reference, message: result.displayText });
      toast.success("M-Pesa request sent to your phone.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send the M-Pesa request."); }
  };

  if (query.isLoading) return <div className="subscription-page"><div className="loading-row">Loading your plan and usage…</div></div>;
  if (query.error || !query.data) return <div className="subscription-page"><div className="subscription-error" role="alert">Your plan details could not be loaded. Try again in a moment.<button type="button" className="text-button" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Retrying…" : "Try again"}</button></div></div>;

  const { plan, subscription, usage, availablePlans } = query.data;
  const paidPlans = availablePlans.filter(item => item.priceMinor > 0 && item.currency === "KES");
  const contactPercent = Math.min(100, Math.round((usage.acceptedContacts / plan.contactLimit) * 100));
  const collectionPercent = Math.min(100, Math.round((usage.collections / plan.collectionLimit) * 100));
  const currentLabel = subscription.status === "free" ? "Free plan" : subscription.status.replaceAll("_", " ");

  return <div className="subscription-page">
    <div className="page-heading-row"><div><div className="eyebrow">YOUR CARDORA ACCOUNT</div><h1>Plan &amp; usage</h1><p className="page-subtitle">See the limits that protect your collections and the people who contribute.</p></div></div>

    <section className="subscription-current content-card">
      <div className="subscription-current-top"><div className="subscription-plan-icon"><CreditCard size={19} /></div><div className="subscription-current-title"><span className="eyebrow">CURRENT PLAN</span><h2>{plan.name}</h2><p>{plan.description}</p></div><span className={`subscription-status ${subscription.status}`}><i />{currentLabel}</span></div>
      <div className="subscription-current-meta"><span><strong>{plan.priceMinor === 0 ? "Free" : money(plan.priceMinor, plan.currency)}</strong>{plan.priceMinor > 0 && <small> / {plan.billingInterval === "yearly" ? "year" : "month"}</small>}</span><span><ShieldCheck size={14} /> {subscription.source === "default" ? "Default plan" : subscription.source === "admin" ? "Managed by Cardora admin" : "Paystack plan"}</span>{subscription.currentPeriodEnd && <span>Access through {shortDate(subscription.currentPeriodEnd)}</span>}</div>
    </section>

    <div className="subscription-usage-grid">
      <UsageCard icon={Users} label="Accepted contacts" used={usage.acceptedContacts} limit={plan.contactLimit} remaining={usage.contactsRemaining} percent={contactPercent} message={usage.canAcceptContact ? "Across every collection link" : "New contributions are paused across your links."} />
      <UsageCard icon={Link2} label="Collection links" used={usage.collections} limit={plan.collectionLimit} remaining={usage.collectionsRemaining} percent={collectionPercent} message={usage.canCreateCollection ? "All retained links count toward your limit." : "New link creation is paused until your plan changes."} />
    </div>

    <section className="content-card subscription-plan-list">
      <div className="section-head"><div><h2>Available plans</h2><p>Choose a plan and pay securely with M-Pesa or card.</p></div><span className="subscription-managed-badge"><BadgeCheck size={14} /> Admin managed</span></div>
      <div className="subscription-available-grid">{availablePlans.map(item => <article className={`subscription-option ${item.id === plan.id ? "current" : ""}`} key={item.id}>
        <div className="subscription-option-head"><h3>{item.name}</h3>{item.id === plan.id && <span>YOUR PLAN</span>}</div>
        <strong className="subscription-option-price">{item.priceMinor === 0 ? "Free" : money(item.priceMinor, item.currency)}{item.priceMinor > 0 && <small> / {item.billingInterval === "yearly" ? "year" : "month"}</small>}</strong>
        <p>{item.description}</p>
        <div className="subscription-option-limits"><span>{new Intl.NumberFormat().format(item.contactLimit)} contacts</span><span>{new Intl.NumberFormat().format(item.collectionLimit)} links</span></div>
        {item.priceMinor > 0 && item.currency === "KES" && <div className="subscription-pay-actions">
          <Button type="button" className="primary-button" disabled={startCard.isPending || startStk.isPending} onClick={() => void payByCard(item.id)}>{startCard.isPending ? <LoaderCircle size={14} className="spin" /> : <CreditCard size={14} />} Pay by card</Button>
          {query.data.mpesaAvailable && <Button type="button" variant="outline" disabled={startCard.isPending || startStk.isPending} onClick={() => { setPendingPayment(null); setStkPlan({ id: item.id, name: item.name, price: money(item.priceMinor, item.currency) }); }}><Smartphone size={14} /> M-Pesa STK</Button>}
        </div>}
      </article>)}</div>
      <div className="subscription-checkout-note"><ShieldCheck size={16} /><p>{paidPlans.length ? <><strong>Secure Paystack checkout.</strong> Card checkout stays on this page; {query.data.mpesaAvailable ? "M-Pesa sends a request to your phone." : "card payment is available for your account."} Plans are paid for the listed term and do not renew automatically.</> : <><strong>Paid plans are currently unavailable.</strong> Your {plan.name} plan remains active. Contact support if you need a plan change or more capacity.</>}</p></div>
      {pendingPayment && <div className="subscription-payment-pending" role="status"><div><strong>Payment status</strong><p>{pendingPayment.message}</p><small>Reference: {pendingPayment.reference}</small></div><Button type="button" variant="outline" onClick={() => void checkPayment(pendingPayment.reference)} disabled={verifyPayment.isPending}>{verifyPayment.isPending ? <LoaderCircle size={14} className="spin" /> : null}{verifyPayment.isPending ? "Checking…" : "Check payment"}</Button></div>}
    </section>

    <Dialog open={Boolean(stkPlan)} onOpenChange={open => { if (!open) setStkPlan(null); }}>
      <DialogContent className="subscription-stk-dialog">
        <DialogHeader><DialogTitle>Pay with M-Pesa</DialogTitle><DialogDescription>{stkPlan && <>Pay {stkPlan.price} for {stkPlan.name}. We’ll send an STK Push to your phone; enter your M-Pesa PIN on your device to approve.</>}</DialogDescription></DialogHeader>
        <form className="subscription-stk-form" onSubmit={beginStk}>
          <label htmlFor="subscription-stk-phone">Kenyan M-Pesa number</label>
          <Input id="subscription-stk-phone" type="tel" autoComplete="tel" placeholder="+254 7XX XXX XXX" value={phone} onChange={event => setPhone(event.target.value)} required />
          <small>Include +254 or enter a local Kenyan mobile number.</small>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setStkPlan(null)}>Cancel</Button><Button type="submit" className="primary-button" disabled={startStk.isPending}>{startStk.isPending ? <><LoaderCircle size={14} className="spin" /> Sending…</> : <><Smartphone size={14} /> Send STK Push</>}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
