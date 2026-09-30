import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { ArrowRight, BadgeCheck, Check, Globe2, LockKeyhole, Mail, ShieldCheck, Smartphone, Users } from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/cardora/Brand";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";
import { CARDORA_MARK, COUNTRY_OPTIONS, flagForCountry } from "@/lib/cardora";
import { trpc } from "@/lib/trpc";

function isValidKenyanPhone(value: string) {
  try {
    const phone = parsePhoneNumberFromString(value);
    return phone?.country === "KE" && phone.isValid();
  } catch {
    return false;
  }
}

export default function CollectionPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [accountLimitReached, setAccountLimitReached] = useState(false);
  const [savedUnsubscribeToken, setSavedUnsubscribeToken] = useState("");
  const [unsubscribeMessage, setUnsubscribeMessage] = useState("");
  const contactPhoneIsKenyan = isValidKenyanPhone(phone);
  const unsubscribeToken = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("unsubscribe")
    : null;

  useEffect(() => {
    if (!contactPhoneIsKenyan) setSmsOptIn(false);
  }, [contactPhoneIsKenyan]);

  const collection = trpc.cardora.collection.publicDetail.useQuery(
    { slug },
    { enabled: Boolean(slug) && !unsubscribeToken, retry: false },
  );
  const submit = trpc.cardora.collection.submit.useMutation({
    onSuccess: result => {
      setSavedUnsubscribeToken(result.unsubscribeToken);
      setAccountLimitReached(result.accountLimitReached);
      setSubmitted(true);
      toast.success(result.message);
    },
    onError: error => toast.error(error.message),
  });
  const unsubscribe = trpc.cardora.notifications.unsubscribe.useMutation({
    onSuccess: result => setUnsubscribeMessage(result.message),
    onError: error => toast.error(error.message),
  });

  if (unsubscribeToken) {
    return <div className="public-page">
      <PublicHeader />
      <main className="unsubscribe-page">
        <span className="public-icon-circle"><Mail size={20} /></span>
        <div className="eyebrow">CARDORA PREFERENCES</div>
        <h1>Choose what reaches you.</h1>
        <p>{unsubscribeMessage || "Stop future notifications for this collection."}</p>
        {!unsubscribeMessage && <Button className="primary-button" onClick={() => unsubscribe.mutate({ token: unsubscribeToken })} disabled={unsubscribe.isPending}>
          {unsubscribe.isPending ? "Updating…" : "Unsubscribe from updates"}
        </Button>}
        <a href="/" className="public-back">Return to Cardora</a>
      </main>
    </div>;
  }

  if (collection.isLoading) {
    return <div className="public-page"><PublicHeader /><div className="public-loading">Loading this collection…</div></div>;
  }
  if (collection.error || !collection.data) {
    return <div className="public-page">
      <PublicHeader />
      <main className="public-not-found">
        <span className="public-icon-circle"><Globe2 size={20} /></span>
        <h1>This link isn’t available.</h1>
        <p>It may have been removed or the address could be incorrect.</p>
        <a href="/" className="public-back">Go to Cardora</a>
      </main>
    </div>;
  }

  const info = collection.data;
  const full = info.status === "full";
  const accountFull = info.fullReason === "account";
  const countries = info.allowedCountryCodes.map(code => ({
    code,
    name: COUNTRY_OPTIONS.find(item => item.code === code)?.name ?? code,
  }));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) {
      toast.error("Please confirm that you agree to share your details with the collection owner.");
      return;
    }
    if (emailOptIn && !email.trim()) {
      toast.error("Add your email address or turn off email updates.");
      return;
    }
    submit.mutate({
      slug,
      name: name.trim(),
      phone: phone.trim(),
      email: emailOptIn ? email.trim() : "",
      emailOptIn,
      smsOptIn: smsOptIn && contactPhoneIsKenyan,
      consent: true,
    });
  }

  return <div className="public-page">
    <PublicHeader />
    <main className="public-collection-layout">
      <section className="public-copy">
        <div className="eyebrow"><span className="sparkle-dot">✳</span> A CARDORA COLLECTION</div>
        <div className="public-title-mark"><img src={CARDORA_MARK} alt="Cardora" /></div>
        <h1>{info.title}</h1>
        <p className="public-description">{info.description}</p>
        <div className="public-meta">
          <span><Users size={15} /> {info.usedSlots} of {info.contactLimit} people</span>
          <span className={`public-status ${full ? "full" : "open"}`}><i />{full ? accountFull ? "Temporarily paused" : "At capacity" : "Accepting contacts"}</span>
        </div>
        <div className="public-progress">
          <span style={{ width: `${Math.min(100, Math.round((info.usedSlots / info.contactLimit) * 100))}%` }} />
        </div>
        <div className="allowed-countries">
          <div className="allowed-title"><Globe2 size={16} /><strong>Welcoming contacts from</strong></div>
          <div className="allowed-pills">{countries.map(country => <span key={country.code}>{flagForCountry(country.code)} {country.name}</span>)}</div>
          <p>Cardora checks your phone’s country calling code.</p>
        </div>
        <div className="public-trust">
          <span><LockKeyhole size={14} /> Your details go to this collection owner.</span>
          <span><ShieldCheck size={14} /> Update preferences are optional.</span>
        </div>
      </section>

      <section className="public-form-card">
        {full ? <div className="full-state">
          <span className="full-state-icon"><BadgeCheck size={23} /></span>
          <div className="eyebrow">COLLECTION CLOSED</div>
          <h2>{accountFull ? "This link is temporarily closed." : "This VCF link is at capacity."}</h2>
          <p>{accountFull ? "The collection owner has reached the account-wide contact allowance on their current Cardora plan, so their links are not accepting new contacts right now." : "The owner’s contact limit has been reached, so Cardora has stopped accepting new contacts."}</p>
          <a href="/" className="public-back">Find out about Cardora <ArrowRight size={14} /></a>
        </div> : submitted ? <div className="success-state">
          <span className="success-check"><Check size={25} /></span>
          <div className="eyebrow">YOU’RE ON THE LIST</div>
          <h2>Thanks for adding yourself.</h2>
          <p>{accountLimitReached ? "Your contact has been added. The owner's plan has now reached its account-wide contact limit." : "Your contact has been added to this VCF collection."}</p>
          {info.remaining === 1 && <div className="last-slot-note">This was the last available spot. The collection is now at capacity.</div>}
          {accountLimitReached && !info.remaining && <div className="last-slot-note">The account-wide plan limit has now been reached. Other Cardora links may stop accepting entries.</div>}
          <div className="success-summary">
            <span className="success-avatar">{name.slice(0, 1).toUpperCase()}</span>
            <div><strong>{name}</strong><span>{phone}</span></div>
            <BadgeCheck size={17} />
          </div>
          {savedUnsubscribeToken && <a className="public-back" href={`${window.location.pathname}?unsubscribe=${savedUnsubscribeToken}`}>
            Manage notification preferences <ArrowRight size={14} />
          </a>}
        </div> : <form onSubmit={handleSubmit} className="public-contact-form">
          <div className="form-card-heading">
            <span className="form-step">01 <i /> ADD YOUR DETAILS</span>
            <h2>Save your spot.</h2>
            <p>Just the essentials—no account needed.</p>
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="contact-name">Your name</label>
            <Input id="contact-name" autoComplete="name" placeholder="e.g. Amina Otieno" value={name} onChange={event => setName(event.target.value)} maxLength={100} required />
          </div>
          <div className="field-block">
            <label className="field-label" htmlFor="contact-phone">Phone number</label>
            <Input id="contact-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+254 712 345 678" value={phone} onChange={event => setPhone(event.target.value)} required minLength={6} maxLength={40} />
            <p className="field-hint">Include your country calling code. Cardora uses it to check eligibility.</p>
          </div>
          <div className="opt-in-box">
            <label className="consent-toggle">
              <input type="checkbox" checked={emailOptIn} onChange={event => setEmailOptIn(event.target.checked)} />
              <span className="custom-check"><Check size={12} /></span>
              <span><strong>Email me updates</strong><small>Optional. Your email is only collected if you opt in.</small></span>
              <Mail size={16} className="opt-icon" />
            </label>
            {emailOptIn && <div className="opt-in-email">
              <Input id="contact-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required />
              <span className="sr-only">Email for updates</span>
            </div>}
            {contactPhoneIsKenyan && <label className="consent-toggle">
              <input type="checkbox" checked={smsOptIn} onChange={event => setSmsOptIn(event.target.checked)} />
              <span className="custom-check"><Check size={12} /></span>
              <span><strong>Text me updates</strong><small>Optional. Only if you choose to receive texts.</small></span>
              <Smartphone size={16} className="opt-icon" />
            </label>}
          </div>
          <label className="required-consent">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />
            <span className="required-consent-box" aria-hidden="true" />
            <span className="required-consent-text">I agree to share my name and phone number with the collection owner so my contact can be added to their VCF.</span>
          </label>
          {submit.error && <div className="form-error">{submit.error.message}</div>}
          <Button type="submit" className="primary-button submit-contact" disabled={submit.isPending || !consent}>
            {submit.isPending ? "Adding you…" : <>Add my contact <ArrowRight size={16} /></>}
          </Button>
          <div className="privacy-note"><LockKeyhole size={13} /><span>Only your name and phone are needed for the VCF. You can change optional notification preferences at any time.</span></div>
        </form>}
      </section>
    </main>
    <footer className="public-footer"><Brand compact /><span>Thoughtful contact collecting.</span><a className="wolverex-credit" href="https://wolvarex.com">Powered by <strong>WOLVAREX</strong></a></footer>
  </div>;
}

function PublicHeader() {
  return <header className="public-header">
    <a href="/"><Brand compact /></a>
    <div className="public-header-actions"><ThemeToggle /><span className="public-header-label"><ShieldCheck size={14} /> A considered way to stay connected</span></div>
  </header>;
}
