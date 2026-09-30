import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, BadgeCheck, Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Brand, BrandMark } from "@/components/cardora/Brand";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function VerifyAccountPage() {
  const [, navigate] = useLocation();
  const { user, loading, refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const autoRequested = useRef(false);
  const utils = trpc.useUtils();
  const savePhone = trpc.cardora.profile.savePhone.useMutation({ onError: e => setError(e.message) });
  const requestPhone = trpc.cardora.profile.requestPhoneVerification.useMutation({ onSuccess: r => setMessage(r.message), onError: e => setError(e.message) });
  const verifyPhone = trpc.cardora.profile.verifyPhoneCode.useMutation({ onSuccess: async r => { setMessage(r.message); await refresh(); await utils.auth.me.invalidate(); navigate("/"); }, onError: e => setError(e.message) });
  const resendEmail = trpc.auth.resendEmailVerification.useMutation({ onSuccess: r => setMessage(r.message), onError: e => setError(e.message) });
  const verifyEmail = trpc.auth.verifyEmail.useMutation({ onSuccess: userResult => { utils.auth.me.setData(undefined, userResult); navigate("/"); }, onError: e => setError(e.message) });

  const token = new URLSearchParams(window.location.search).get("token");
  useEffect(() => {
    if (token && !autoRequested.current) {
      autoRequested.current = true;
      verifyEmail.mutate({ token });
    }
  }, [token]);
  useEffect(() => {
    if (!loading && !user && !token) navigate("/login?mode=signup");
  }, [loading, user, token, navigate]);
  useEffect(() => {
    if (user?.phoneCountryCode === "KE" && user.phoneE164 && !user.phoneVerifiedAt && !autoRequested.current) {
      autoRequested.current = true;
      requestPhone.mutate();
    }
  }, [user]);

  async function submitPhone(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if (!user?.phoneE164) {
        const saved = await savePhone.mutateAsync({ phone: phone.trim() });
        await refresh(); await utils.auth.me.invalidate();
        autoRequested.current = true;
        if (saved.phoneCountryCode === "KE") await requestPhone.mutateAsync();
        else await resendEmail.mutateAsync();
      } else await verifyPhone.mutateAsync({ code: code.trim() });
    } catch { /* Mutation errors are shown inline. */ }
  }

  if (loading || (token && verifyEmail.isPending)) return <div className="auth-loading"><BrandMark size="lg" /><span>Verifying your account…</span></div>;
  const needsPhone = user?.phoneCountryCode === "KE" || !user?.phoneE164;
  const verified = user && (user.phoneCountryCode === "KE" ? Boolean(user.phoneVerifiedAt) : Boolean(user.emailVerifiedAt));

  return <div className="auth-page">
    <header className="auth-header"><a href="/" aria-label="Cardora home"><Brand /></a><ThemeToggle /></header>
    <main className="auth-main">
      <a className="auth-back-link" href="/login"><ArrowLeft size={14} /> Back to sign in</a>
      <section className="auth-card" aria-labelledby="verify-title">
        <div className="auth-card-mark"><BrandMark size="md" /></div>
        <div className="eyebrow auth-eyebrow"><ShieldCheck size={13} /> ACCOUNT VERIFICATION</div>
        <h1 id="verify-title">{verified ? <>You’re all<br /><em>set.</em></> : needsPhone ? <>Verify your<br /><em>phone.</em></> : <>Verify your<br /><em>email.</em></>}</h1>
        <p className="auth-intro">{verified ? "Your account is verified. Taking you to Cardora…" : needsPhone ? "Kenyan accounts use SMS verification. Other phone numbers are required for account recovery; SMS features remain Kenya-only." : `We sent a secure verification link to ${user?.email ?? "your email address"}. Open it to verify your email and complete sign-up.`}</p>
        {!verified && needsPhone && <form className="auth-form" onSubmit={submitPhone}>
          {!user?.phoneE164 ? <div className="auth-field"><label htmlFor="verify-phone">Phone number</label><Input id="verify-phone" type="tel" autoComplete="tel" required minLength={6} maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254 7xx xxx xxx" /><span className="auth-field-hint">Use international format, including your country calling code.</span></div> : <>
            <div className="auth-security-note"><MessageSquareText size={16} /><p><strong>Code sent to {user.phoneE164}.</strong> Enter the six-digit code from the SMS. You can request another if needed.</p></div>
            <div className="auth-field"><label htmlFor="verify-code">SMS verification code</label><Input id="verify-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} onChange={e => setCode(e.target.value)} placeholder="000000" /></div>
          </>}
          {error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-security-note" role="status"><BadgeCheck size={16} /><p>{message}</p></div>}
          {user?.phoneE164 ? <div className="verification-actions"><Button type="submit" className="primary-button auth-submit" disabled={verifyPhone.isPending}>{verifyPhone.isPending ? "Checking…" : "Verify phone"}</Button><Button type="button" className="verification-resend" variant="outline" onClick={() => { setError(""); requestPhone.mutate(); }} disabled={requestPhone.isPending}>{requestPhone.isPending ? "Sending…" : "Resend code"}</Button></div> : <Button type="submit" className="primary-button auth-submit" disabled={savePhone.isPending || requestPhone.isPending}>{savePhone.isPending || requestPhone.isPending ? "Saving…" : "Save phone and send code"}</Button>}
        </form>}
        {!verified && !needsPhone && <div className="auth-form">
          <div className="auth-security-note"><Mail size={16} /><p><strong>Check your inbox and spam folder.</strong> The verification link expires after 24 hours.</p></div>
          {error && <div className="auth-error" role="alert">{error}</div>}{message && <div className="auth-security-note" role="status"><BadgeCheck size={16} /><p>{message}</p></div>}
          <Button type="button" className="primary-button auth-submit" onClick={() => { setError(""); resendEmail.mutate(); }} disabled={resendEmail.isPending}>{resendEmail.isPending ? "Sending…" : "Resend verification email"}</Button>
        </div>}
        {token && error && <div className="auth-error" role="alert">{error}</div>}
      </section>
    </main>
  </div>;
}
