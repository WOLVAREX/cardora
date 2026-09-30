import { useState } from "react";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { Brand, BrandMark } from "@/components/cardora/Brand";
import { AdminDashboard } from "@/components/cardora/AdminDashboard";
import { ThemeToggle } from "@/components/cardora/ThemeToggle";

export default function AdminPage() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="auth-loading"><BrandMark size="lg" /><span>Checking administrator access…</span></div>;
  if (!user) return <div className="admin-access-page"><header><a href="/"><Brand /></a><ThemeToggle /></header><main><span className="admin-access-icon"><LockKeyhole size={23} /></span><div className="eyebrow">PRIVATE ADMINISTRATION</div><h1>Sign in to continue.</h1><p>This workspace is available only to authenticated Cardora administrators.</p><Button className="primary-button" onClick={() => window.location.assign("/login?returnTo=%2Fadmin")}>Sign in securely</Button><a href="/" className="admin-return"><ArrowLeft size={14} /> Return to Cardora</a></main></div>;
  if (user.role !== "admin") return <div className="admin-access-page"><header><a href="/"><Brand /></a><ThemeToggle /></header><main><span className="admin-access-icon denied"><ShieldCheck size={23} /></span><div className="eyebrow">ACCESS RESTRICTED</div><h1>This area is for admins.</h1><p>Your Cardora account does not have the administrator role. Your collections and contacts remain available in your workspace.</p><a href="/" className="admin-return"><ArrowLeft size={14} /> Return to your workspace</a></main></div>;
  return <AdminDashboard user={user} onLogout={() => void logout()} />;
}
