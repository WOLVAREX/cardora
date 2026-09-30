import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Check, ChevronDown, CircleAlert, Mail, MessageSquareText, Send, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { CollectionList } from "@/lib/cardora-types";

type Collections = CollectionList;
type Channel = "email" | "sms";
type DraftRecipient = { id: number; name: string; destination: string };
type Draft = {
  id: number;
  collectionId: number;
  channel: Channel;
  subject: string;
  message: string;
  recipientCount: number;
  collectionTitle: string;
  recipientSnapshotHash: string;
  reviewHash: string;
  recipients: DraftRecipient[];
};

export function NotificationsView({ collections, smsEligible, smsVisible, gmailConnected, gmailConfigured }: { collections: Collections; smsEligible: boolean; smsVisible: boolean; gmailConnected: boolean; gmailConfigured: boolean }) {
  const [collectionId, setCollectionId] = useState<number | undefined>(collections[0]?.id);
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewStale, setReviewStale] = useState(false);
  const [sendResult, setSendResult] = useState<{ status: string; message: string; queuedCount: number; eligibleCount: number } | null>(null);
  useEffect(() => { if (!collectionId && collections.length) setCollectionId(collections[0].id); }, [collectionId, collections]);
  useEffect(() => { if (!smsEligible && channel === "sms") setChannel("email"); }, [channel, smsEligible]);
  const contactsQuery = trpc.cardora.collection.listContacts.useQuery({ collectionId: collectionId ?? 0 }, { enabled: Boolean(collectionId) });
  const contacts = contactsQuery.data ?? [];
  const eligible = useMemo(() => contacts.filter(person => channel === "email" ? person.emailOptIn && Boolean(person.email) : person.smsOptIn && person.countryCode === "KE"), [contacts, channel]);
  const provider = trpc.cardora.notifications.providerStatus.useQuery(undefined, { enabled: smsVisible, retry: false, refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const prepare = trpc.cardora.notifications.prepare.useMutation({
    onSuccess: result => {
      setDraft({
        id: result.campaignId,
        collectionId: result.collectionId,
        channel: result.channel,
        subject: result.subject,
        message: result.message,
        recipientCount: result.recipientCount,
        collectionTitle: result.collectionTitle,
        recipientSnapshotHash: result.recipientSnapshotHash,
        reviewHash: result.reviewHash,
        recipients: result.recipients,
      });
      setReviewStale(false);
      setSendResult(null);
      toast.success("Unsent campaign draft saved. Review the exact recipient set before sending.");
    },
    onError: error => toast.error(error.message),
  });
  const send = trpc.cardora.notifications.send.useMutation({
    onSuccess: result => {
      setSendResult({ status: result.status, message: result.message, queuedCount: result.queuedCount, eligibleCount: result.eligibleCount });
      setDraft(null);
      setReviewStale(false);
      void utils.cardora.dashboard.invalidate();
      void contactsQuery.refetch();
      toast.message(result.message);
    },
    onError: error => {
      if (/changed after review/i.test(error.message)) setReviewStale(true);
      toast.error(error.message);
      void utils.cardora.dashboard.invalidate();
    },
  });
  const canSendSms = smsEligible && provider.data?.configured === true && provider.data.wallet === "available" && provider.data.sender === "available";
  const canSendEmail = gmailConnected && gmailConfigured;
  const providerReady = channel === "email" ? canSendEmail : canSendSms;
  const statusMessage = channel === "email"
    ? gmailConnected ? "The connected owner Gmail can send this message." : gmailConfigured ? "Connect the same Gmail address in Account settings before sending." : "Google OAuth is intentionally not configured in Preview; set it up on the production VPS."
    : provider.data?.wallet === "denied" || provider.data?.sender === "denied" ? "Nena denied API access. No SMS will be sent; review the server token permissions." : provider.data?.sender === "not_assigned" ? "The active NENA. sender ID is not assigned. No SMS will be sent." : provider.data?.sender === "available" && provider.data.wallet === "available" ? `Nena is available${provider.data.credits === null ? "" : ` · ${provider.data.credits} credits`}.` : "Check the configured Nena key and active NENA. sender before sending.";

  function saveDraft() {
    if (!collectionId) return;
    prepare.mutate({ collectionId, channel, subject: subject.trim() || (channel === "email" ? "A quick update" : "Cardora update"), message });
  }

  function refreshReview() {
    if (!draft) return;
    prepare.mutate({ collectionId: draft.collectionId, channel: draft.channel, subject: draft.subject, message: draft.message });
  }

  return <>
    <div className="page-heading-row"><div><div className="eyebrow">STAY IN TOUCH, WITH PERMISSION</div><h1>Notifications</h1><p className="page-subtitle">Reach people who opted in—never surprise them.</p></div></div>
    {sendResult && <div className={`campaign-result ${sendResult.status}`} role="status"><span className="campaign-result-icon">{sendResult.status === "queued" ? <Check size={17} /> : <AlertTriangle size={17} />}</span><div><strong>{sendResult.status === "queued" ? "Provider accepted the campaign" : sendResult.status === "partial" ? "Campaign partially accepted" : "No campaign was confirmed"}</strong><p>{sendResult.message}</p>{sendResult.status !== "failed" && <small>{sendResult.queuedCount} accepted · {Math.max(0, sendResult.eligibleCount - sendResult.queuedCount)} not accepted</small>}</div></div>}
    <div className="notification-layout"><section className="content-card notification-compose">
      <div className="section-head"><div><h2>Prepare a message</h2><p>Save a draft, inspect the exact recipient set and message, then explicitly confirm sending.</p></div><span className="provider-not-connected"><i /> CONSENT REQUIRED</span></div>
      {!collections.length ? <div className="empty-simple"><Bell size={24} /><h3>Create a collection first</h3><p>People who opt into updates can be notified here.</p></div> : <>
        <div className="field-block"><label className="field-label" htmlFor="notify-collection">Collection</label><div className="notification-select-wrap"><select id="notify-collection" className="select-input" value={collectionId ?? ""} onChange={event => { setCollectionId(Number(event.target.value)); setDraft(null); setReviewStale(false); setSendResult(null); }}><option value="" disabled>Select a collection</option>{collections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={15} /></div></div>
        <div className="field-block"><span className="field-label">Delivery channel</span><div className="channel-toggle"><button type="button" className={channel === "email" ? "selected" : ""} onClick={() => { setChannel("email"); setDraft(null); setReviewStale(false); }}><Mail size={16} /> Email</button>{smsVisible && smsEligible && <button type="button" className={channel === "sms" ? "selected" : ""} onClick={() => { setChannel("sms"); setDraft(null); setReviewStale(false); }}><Smartphone size={16} /> SMS · Kenya</button>}</div>{smsVisible && !smsEligible && <p className="field-hint">Kenyan SMS tools appear after your +254 account number is verified.</p>}</div>
        <div className="recipient-estimate"><div className="recipient-count"><strong>{contactsQuery.isLoading ? "—" : eligible.length}</strong><span>eligible recipients</span></div><p>{channel === "email" ? "Only accepted contacts with an email address and explicit email consent are included." : "Only accepted Kenyan (+254) contacts who explicitly opted in to SMS are included."}</p></div>
        <div className="field-block"><label className="field-label" htmlFor="notify-subject">Subject</label><Input id="notify-subject" value={subject} onChange={event => setSubject(event.target.value)} placeholder={channel === "email" ? "A quick update from your group" : "Message title"} maxLength={160} /></div>
        <div className="field-block"><label className="field-label" htmlFor="notify-body">Message</label><Textarea id="notify-body" value={message} onChange={event => setMessage(event.target.value)} placeholder="Write a clear, helpful update…" rows={5} maxLength={4000} /><div className="character-count">{message.length}/4000</div></div>
        <div className={`notification-warning ${providerReady ? "provider-ready" : ""}`}><ShieldCheck size={17} /><p><strong>{providerReady ? "Provider is ready." : "Delivery is not ready."}</strong> {statusMessage} No message leaves Cardora until you review the saved draft and confirm sending.</p></div>
        <Button className="primary-button prepare-button" onClick={saveDraft} disabled={!collectionId || !message.trim() || !eligible.length || prepare.isPending || send.isPending}>{prepare.isPending ? "Saving draft…" : <>Save unsent draft <MessageSquareText size={16} /></>}</Button>
        {draft && <div className="campaign-review" aria-live="polite"><div className="campaign-review-head"><span className="campaign-review-icon">{draft.channel === "email" ? <Mail size={16} /> : <Smartphone size={16} />}</span><div><div className="eyebrow">FINAL REVIEW · DRAFT #{draft.id}</div><h3>Confirm this campaign?</h3></div></div><dl><div><dt>Collection</dt><dd>{draft.collectionTitle}</dd></div><div><dt>Channel</dt><dd>{draft.channel === "email" ? "Gmail" : "Nena SMS · Kenya"}</dd></div><div><dt>Exact recipient count</dt><dd>{draft.recipientCount}</dd></div><div><dt>Subject</dt><dd>{draft.subject}</dd></div></dl><blockquote>{draft.message}</blockquote>
          <div className="campaign-recipient-heading"><span>EXACT REVIEWED RECIPIENT SET</span><code>{draft.recipientCount} people</code></div>
          <ul className="campaign-recipient-list" aria-label="Exact recipients for this campaign">{draft.recipients.map(person => <li key={person.id}><span>{person.name}</span><code>{person.destination}</code></li>)}</ul>
          <p className="campaign-review-fingerprint">Recipient snapshot: <code>{draft.recipientSnapshotHash}</code></p>
          {reviewStale && <div className="campaign-review-stale" role="alert">Contacts, consent, destinations, or the saved message changed after this review. No message was sent. Refresh the recipient review and confirm the updated draft again.</div>}
          {draft.channel === "email" && <p className="campaign-review-note">Each accepted email includes a link to manage notification preferences.</p>}
          <div className="campaign-review-actions"><Button variant="outline" onClick={() => { setDraft(null); setReviewStale(false); }} disabled={send.isPending}>Cancel</Button>{reviewStale && <Button variant="outline" onClick={refreshReview} disabled={prepare.isPending || send.isPending}>{prepare.isPending ? "Refreshing…" : "Refresh review"}</Button>}<Button className="primary-button" onClick={() => send.mutate({ campaignId: draft.id, reviewHash: draft.reviewHash })} disabled={!providerReady || send.isPending || reviewStale}>{send.isPending ? "Sending…" : <>Confirm &amp; send <Send size={15} /></>}</Button></div>
          {!providerReady && <p className="field-hint campaign-blocked">{statusMessage}</p>}
        </div>}
      </>}
    </section>
    <aside className="notification-side"><div className="provider-card"><div className="provider-card-icon"><Mail size={18} /></div><div><strong>Owner Gmail</strong><span>{gmailConnected ? "Connected · send-only" : gmailConfigured ? "Not connected" : "Production setup pending"}</span></div><p>{gmailConnected ? "Messages are sent separately to each person using the Gmail account you authorized." : "Each owner connects their own Gmail through Google OAuth on the production deployment. Preview does not send email."}</p>{smsVisible && <><div className="provider-divider" /><div className="provider-card-icon sms"><Smartphone size={17} /></div><div><strong>Nena · Kenya</strong><span>{provider.isLoading ? "Checking provider…" : providerReady ? "NENA. sender available" : providerDeniedText(provider.data)}</span></div><p>{provider.data?.wallet === "denied" || provider.data?.sender === "denied" ? "Nena returned HTTP 403 to read-only wallet and sender checks. No SMS was sent; the provider key/account needs authorization." : provider.data?.sender === "not_assigned" ? "The active NENA. sender is not assigned to this provider account." : "SMS is shown only to owners with Kenyan account numbers; sending requires phone verification and Kenyan recipient consent."}</p></>}</div>
      <div className="consent-card"><div className="consent-card-title"><ShieldCheck size={17} /><strong>Consent is built in</strong></div><div className="consent-step"><span><Check size={12} /></span>Recipients opt into each channel separately.</div><div className="consent-step"><span><Check size={12} /></span>Only currently eligible contacts are counted.</div><div className="consent-step"><span><Check size={12} /></span>Unsubscribe requests suppress future updates.</div><p>Keep every message relevant, expected, and easy to stop.</p></div></aside></div>
  </>;
}

function providerDeniedText(status: { configured: boolean; wallet: string; sender: string } | undefined) {
  if (!status) return "Status not checked";
  if (status.wallet === "denied" || status.sender === "denied") return "Provider access denied";
  if (status.sender === "not_assigned") return "NENA. sender not assigned";
  if (status.sender === "available" && status.wallet === "available") return "Ready · active NENA. sender";
  if (status.configured === false) return "API key not configured";
  return "Provider unavailable";
}
