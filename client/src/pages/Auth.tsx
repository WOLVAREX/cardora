import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand, BrandMark } from "@/components/cardora/Brand";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type AuthMode = "signin" | "signup";

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const resolved = new URL(value, window.location.origin);
    if (resolved.origin !== window.location.origin || resolved.pathname === "/login") return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>(() => new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const utils = trpc.useUtils();
  const returnTo = useMemo(() => safeReturnPath(new URLSearchParams(window.location.search).get("returnTo")), []);

  const completeLogin = (result: { id: number; name: string | null; email: string | null; role: "user" | "admin" }) => {
    utils.auth.me.setData(undefined, result);
    void utils.auth.me.invalidate();
    navigate(returnTo);
  };

  const signIn = trpc.auth.signIn.useMutation({
    onSuccess: completeLogin,
    onError: error => setFormError(error.message),
  });
  const signUp = trpc.auth.signUp.useMutation({
    onSuccess: completeLogin,
    onError: error => setFormError(error.message),
  });
  const busy = signIn.isPending || signUp.isPending;

  useEffect(() => {
    if (user) navigate(returnTo);
  }, [user, returnTo, navigate]);

  function switchMode(next: AuthMode) {
    setMode(next);
    setFormError("");
    setPassword("");
    const params = new URLSearchParams(window.location.search);
    if (next === "signup") params.set("mode", "signup");
    else params.delete("mode");
    const suffix = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (mode === "signup") signUp.mutate({ name: name.trim(), email: email.trim(), password });
    else signIn.mutate({ email: email.trim(), password });
  }

  if (authLoading) return <div className="auth-loading"><BrandMark size="lg" /><span>Opening your Cardora workspace…</span></div>;

  return <div className="auth-page">
    <header className="auth-header"><a href="/" aria-label="Cardora home"><Brand /></a><ThemeToggle /></header>
    <main className="auth-main">
      <a className="auth-back-link" href="/"><ArrowLeft size={14} /> Back to Cardora</a>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-mark"><BrandMark size="md" /></div>
        <div className="eyebrow auth-eyebrow"><LockKeyhole size={13} /> PRIVATE OWNER WORKSPACE</div>
        <h1 id="auth-title">{mode === "signin" ? <>Good to have<br /><em>you back.</em></> : <>Make room for<br /><em>good connections.</em></>}</h1>
        <p className="auth-intro">{mode === "signin" ? "Sign in to manage your Cardora collections and contacts." : "Create your owner account to start gathering contacts with one clear link."}</p>

        <div className="auth-mode-switch" role="tablist" aria-label="Account action">
          <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>Create account</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && <div className="auth-field"><label htmlFor="auth-name">Your name</label><Input id="auth-name" name="name" autoComplete="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="How should we address you?" /></div>}
          <div className="auth-field"><label htmlFor="auth-email">Email address</label><Input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></div>
          <div className="auth-field"><label htmlFor="auth-password">Password</label><Input id="auth-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : undefined} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 12 characters" : "Enter your password"} /><span className="auth-field-hint">{mode === "signup" ? "Use 12 or more characters." : ""}</span></div>
          {formError && <div className="auth-error" role="alert">{formError}</div>}
          <Button type="submit" className="primary-button auth-submit" disabled={busy || authLoading}>{busy ? "Please wait…" : mode === "signin" ? <>Sign in securely <ArrowRight size={16} /></> : <>Create your account <ArrowRight size={16} /></>}</Button>
        </form>

        <div className="auth-security-note"><ShieldCheck size={16} /><p><strong>Your account stays yours.</strong> Passwords are hashed and sessions can be revoked. Cardora does not verify email in this flow.</p></div>
        {mode === "signup" && <p className="auth-legacy-note">Have a pre-existing Cardora account? Sign-up cannot claim or take it over by email. An operator must migrate legacy account access separately.</p>}
        {mode === "signin" && <p className="auth-legacy-note">Legacy accounts are available after the account owner completes the separate operator-run migration.</p>}
      </section>
      <p className="auth-footnote">Your collections remain private to your account. <a href="/privacy">Read the privacy disclosure</a>.</p>
    </main>
  </div>;
}
