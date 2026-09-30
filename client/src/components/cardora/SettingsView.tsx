import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, CircleAlert, ExternalLink, LockKeyhole, Mail, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import type { PublicUser } from "../../../../drizzle/schema";
import type { DashboardProfile } from "@/lib/cardora-types";

function gmailFromAccount(user: PublicUser) {
  return user.email?.toLowerCase().endsWith("@gmail.com") ? user.email : "";
}

export function SettingsView({ user, profile, onSaved }: { user: PublicUser; profile?: DashboardProfile; onSaved: () => void }) {
  const [phone, setPhone] = useState(profile?.phoneE164 ?? "");
  const [gmail, setGmail] = useState(profile?.notificationEmail ?? gmailFromAccount(user));
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  useEffect(() => { setPhone(profile?.phoneE164 ?? ""); setCodeSent(false); setVerificationCode(""); }, [profile?.phoneE164]);
  useEffect(() => { setGmail(profile?.notificationEmail ?? gmailFromAccount(user)); }, [profile?.notificationEmail, user.email]);

  const save = trpc.cardora.profile.savePhone.useMutation({
    onSuccess: result => {
      toast.success(result.verified ? "Your verified phone number is saved." : "Phone number saved. It is not verified yet.");
      setCodeSent(false); setVerificationCode(""); onSaved();
    },
    onError: error => toast.error(error.message),
  });
  const saveGmail = trpc.cardora.profile.saveNotificationEmail.useMutation({
    onSuccess: () => { toast.success("Gmail address saved."); onSaved(); },
    onError: error => toast.error(error.message),
  });
  const requestCode = trpc.cardora.profile.requestPhoneVerification.useMutation({
    onSuccess: result => { setCodeSent(result.status === "code_sent"); toast.message(result.message); },
    onError: error => toast.error(error.message),
  });
  const verifyCode = trpc.cardora.profile.verifyPhoneCode.useMutation({
    onSuccess: result => { setCodeSent(false); setVerificationCode(""); toast.success(result.message); onSaved(); },
    onError: error => toast.error(error.message),
  });
  const connectGmail = trpc.cardora.profile.connectGmail.useMutation({
    onSuccess: result => { window.location.assign(result.authorizationUrl); },
    onError: error => toast.error(error.message),
  });
  const disconnectGmail = trpc.cardora.profile.disconnectGmail.useMutation({
    onSuccess: result => { toast.message(result.message); onSaved(); },
    onError: error => toast.error(error.message),
  });
  const provider = trpc.cardora.notifications.providerStatus.useQuery(undefined, { enabled: false, retry: false });

  const hasPhone = Boolean(profile?.phoneE164);
  const kenyaNumber = profile?.phoneCountryCode === "KE" && profile.phoneE164?.startsWith("+254");
  const verified = Boolean(profile?.phoneVerifiedAt && kenyaNumber);
  const validGmail = /^[^\s@]+@gmail\.com$/i.test(gmail.trim());
  const googleConnected = Boolean(profile?.gmailConnected);
  const googleConfigured = Boolean(profile?.gmailConfigured);
  const providerState = provider.data;
  const providerDenied = providerState?.wallet === "denied" || providerState?.sender === "denied";
  const providerReady = providerState?.wallet === "available" && providerState?.sender === "available";

  async function checkProvider() {
    const result = await provider.refetch();
    if (result.error) { toast.error(result.error.message); return; }
    if (result.data?.configured && result.data.wallet === "denied") toast.error("Nena denied API access. No SMS was sent; check the server token permissions with Nena.");
    else if (result.data?.sender === "not_assigned") toast.error("The active NENA. sender ID is not assigned to this Nena account.");
    else if (result.data?.sender === "available" && result.data.wallet === "available") toast.success("Nena API access and the active NENA. sender ID are available.");
    else toast.message("Nena provider health was checked. See the status below.");
  }

  return <>
    <div className="page-heading-row">
      <div><div className="eyebrow">YOUR CARDORA ACCOUNT</div><h1>Account settings</h1><p className="page-subtitle">Keep your details current and manage which channels you can use.</p></div>
    </div>
    <div className="settings-grid">
      <section className="content-card settings-card">
        <div className="settings-section-heading"><span className="settings-icon"><UserRound size={17} /></span><div><h2>Your profile</h2><p>Your details are used to manage your collections.</p></div></div>
        <div className="settings-field"><label className="field-label" htmlFor="account-name">Name</label><Input id="account-name" value={user.name ?? ""} readOnly /></div>
        <div className="settings-field"><label className="field-label" htmlFor="account-email">Sign-in email</label><div className="input-with-icon"><Mail size={15} /><Input id="account-email" value={user.email ?? ""} readOnly /></div><p className="field-hint">This address comes from your sign-in identity and is not changed here.</p></div>
        <div className="settings-field">
          <label className="field-label" htmlFor="account-gmail">Gmail address <span className="label-required">required</span></label>
          <div className="input-with-icon"><Mail size={15} /><Input id="account-gmail" type="email" autoComplete="email" placeholder="you@gmail.com" value={gmail} onChange={event => setGmail(event.target.value)} /></div>
          <p className="field-hint">This address receives account notices. Contributor email campaigns are sent through Cardora’s verified Brevo sender.</p>
          <Button className="primary-button settings-save" onClick={() => saveGmail.mutate({ email: gmail.trim() })} disabled={!validGmail || saveGmail.isPending}>{saveGmail.isPending ? "Saving…" : "Save Gmail address"}</Button>
        </div>
        <div className="settings-field">
          <label className="field-label" htmlFor="account-phone">Phone number <span className="label-required">required</span></label>
          <div className="input-with-icon"><Smartphone size={15} /><Input id="account-phone" type="tel" autoComplete="tel" placeholder="+254 712 345 678" value={phone} onChange={event => { setPhone(event.target.value); setCodeSent(false); setVerificationCode(""); }} /></div>
          <p className="field-hint">This saved number is used for Cardora notifications. Use international format including the + country calling code; changing it may require verification again.</p>
          <Button className="primary-button settings-save" onClick={() => save.mutate({ phone })} disabled={!phone.trim() || save.isPending}>{save.isPending ? "Saving…" : "Save phone number"}</Button>
        </div>
      </section>

      <section className="content-card settings-card gmail-settings">
        <div className="settings-section-heading"><span className="settings-icon"><Mail size={17} /></span><div><h2>Gmail connection</h2><p>Optional Gmail integration. Contributor campaigns use Cardora’s Brevo sender.</p></div></div>
        {googleConnected ? <div className="verification-state verified"><BadgeCheck size={19} /><div><strong>Gmail connected</strong><span>{profile?.gmailAddress} · Send-only permission</span></div></div> : <div className="verification-state pending"><CircleAlert size={19} /><div><strong>{googleConfigured ? "Ready to connect" : "Gmail sending isn’t enabled here yet"}</strong><span>{googleConfigured ? "Google will ask you to authorize Cardora’s send-only Gmail access." : "Your saved notification email remains available above. Gmail connection can be enabled when OAuth setup is ready."}</span></div></div>}
        <div className="provider-notice gmail-provider-notice"><div><span className={`status-dot ${googleConnected ? "ready" : "muted"}`} /><strong>{googleConnected ? "Authorized Gmail account" : googleConfigured ? "Gmail integration ready" : "Gmail integration unavailable"}</strong></div><p>Cardora requests Gmail sending permission only for any future Gmail features. Contributor email campaigns are sent using Cardora’s verified Brevo sender. You can disconnect this Gmail account here at any time.</p>
          {googleConnected ? <Button variant="outline" onClick={() => disconnectGmail.mutate()} disabled={disconnectGmail.isPending}>{disconnectGmail.isPending ? "Disconnecting…" : "Disconnect Gmail"}</Button> : googleConfigured ? <Button className="primary-button" onClick={() => connectGmail.mutate()} disabled={!validGmail || connectGmail.isPending}>{connectGmail.isPending ? "Starting secure connection…" : <>Connect {gmail.trim() || "Gmail"} <ExternalLink size={15} /></>}</Button> : null}
        </div>
      </section>

      {kenyaNumber && <section className="content-card settings-card sms-settings">
        <div className="settings-section-heading"><span className="settings-icon sms"><Smartphone size={17} /></span><div><h2>SMS access</h2><p>Kenyan SMS requires a verified +254 account number and the active NENA. sender.</p></div></div>
        {verified ? <div className="verification-state verified"><BadgeCheck size={19} /><div><strong>Verified Kenyan number</strong><span>{profile?.phoneE164} · SMS controls enabled</span></div></div> : <div className="verification-state pending"><CircleAlert size={19} /><div><strong>Verify your Kenyan number</strong><span>We send a six-digit code using Nena. The code expires after 10 minutes.</span></div></div>}
        {!verified && <div className="provider-notice"><div><span className={`status-dot ${providerReady ? "ready" : providerDenied ? "error" : "muted"}`} /><strong>{providerReady ? "Nena API and NENA. sender available" : providerDenied ? "Nena denied API access" : providerState?.sender === "not_assigned" ? "NENA. sender not assigned" : "Nena status not checked"}</strong></div><p>{providerDenied ? "No SMS was sent. The configured server key is not authorized by Nena for these API requests." : providerReady ? "Nena reported an available wallet and the required active sender." : "Check the current provider token and NENA. sender assignment before requesting a verification code."}</p><Button variant="outline" onClick={() => void checkProvider()} disabled={provider.isFetching}>{provider.isFetching ? "Checking Nena…" : "Check Nena status"}</Button></div>}
        {!verified && !codeSent && <Button className="primary-button settings-save" onClick={() => requestCode.mutate()} disabled={!hasPhone || requestCode.isPending}>{requestCode.isPending ? "Requesting code…" : "Send verification code"}</Button>}
        {!verified && codeSent && <div className="settings-field verification-code-field"><label className="field-label" htmlFor="verification-code">Six-digit verification code</label><div className="verification-code-row"><Input id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /><Button className="primary-button" onClick={() => verifyCode.mutate({ code: verificationCode })} disabled={verificationCode.length !== 6 || verifyCode.isPending}>{verifyCode.isPending ? "Verifying…" : "Verify number"}</Button></div><p className="field-hint">Never share your verification code. If it expires, request another code.</p></div>}
        {!hasPhone && <div className="settings-tip"><CheckCircle2 size={15} /> Add your international phone number above to enable collection links and phone notifications.</div>}
        {providerReady && providerState?.credits !== null && <p className="field-hint provider-credit-hint">Nena balance reported: {providerState.credits} SMS credit{providerState.credits === 1 ? "" : "s"}.</p>}
      </section>}

      <section className="content-card settings-card privacy-settings">
        <div className="settings-section-heading"><span className="settings-icon privacy"><LockKeyhole size={17} /></span><div><h2>Privacy at a glance</h2><p>Simple rules for your contact data.</p></div></div>
        <div className="privacy-rule"><span>01</span><div><strong>Only collect what you need</strong><p>Public collection links ask for a name and international phone number. Email is optional and is collected only for email updates.</p></div></div>
        <div className="privacy-rule"><span>02</span><div><strong>Country comes from the number</strong><p>Cardora checks the contact’s actual phone country calling code against the link’s allowed countries.</p></div></div>
        <div className="privacy-rule"><span>03</span><div><strong>Each channel requires consent</strong><p>Only people who opt in are eligible for messages. Every email includes a way to stop future updates.</p></div></div>
        <div className="settings-tip"><ShieldCheck size={15} /> <a href="/privacy">Read Cardora's privacy disclosure</a></div>
      </section>
    </div>
  </>;
}
