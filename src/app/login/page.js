"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Image from "@/lib/ui/image.jsx";
import { translate } from "@/i18n/runtime.js";
import {
  Eye,
  EyeOff,
  Lock,
  ArrowRight,
  Shield,
  KeyRound,
  AlertCircle,
  Terminal,
  CheckCircle2,
} from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copiedDefault, setCopiedDefault] = useState(false);
  const [version, setVersion] = useState(typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "");

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.version) {
            setVersion(data.version);
          }
          if (data.authenticated === true || data.requireLogin === false) {
            navigate("/dashboard", { replace: true });
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, [navigate]);

  const handleLogin = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (loading || retryAfter > 0) return;
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        navigate("/dashboard", { replace: true });
      } else {
        setError(data.error || translate("Invalid password. Please try again."));
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError(translate("Failed to connect to authentication endpoint. Check network."));
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        navigate("/dashboard", { replace: true });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || translate("Failed to set new password"));
      }
    } catch (err) {
      setError(translate("An error occurred. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDefault = () => {
    const defaultPass = "12345677";
    navigator.clipboard?.writeText(defaultPass);
    setPassword(defaultPass);
    setCopiedDefault(true);
    setTimeout(() => setCopiedDefault(false), 2000);
  };

  const isSsoEnabled = ["sso", "oidc", "saml", "both"].includes(authMode);
  const activeSsoType = ssoType || (authMode === "saml" ? "saml" : "oidc");
  const samlAvailable = isSsoEnabled && activeSsoType === "saml" && samlConfigured;
  const oidcAvailable = isSsoEnabled && activeSsoType === "oidc" && oidcConfigured;
  const ssoAvailable = samlAvailable || oidcAvailable;
  const passwordAvailable = authMode === "password" || authMode === "both" || !ssoAvailable;

  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-text-muted tracking-wider uppercase">
            {translate("Initializing Gateway")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white relative overflow-hidden px-4 selection:bg-primary/20 selection:text-primary">
      {/* Background Cyber Ambient & Subtle Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 30%, rgba(6, 182, 212, 0.12) 0%, rgba(0, 0, 0, 0) 70%), linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 32px 32px, 32px 32px",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px] flex flex-col items-center">
        {/* Node Connectivity Status */}
        <div className="mb-6 flex items-center gap-2 px-3 py-1 rounded-sm bg-[#0c0c0f] border border-[#222228] shadow-sm">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-mono tracking-wider text-text-muted uppercase">
            {translate("Gateway Node • Online")}
          </span>
        </div>

        {/* Brand Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="relative mb-3 group">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary to-accent opacity-30 blur-md group-hover:opacity-60 transition duration-500" />
            <div className="relative size-14 rounded-sm bg-[#0e0e12] border border-[#2a2a32] flex items-center justify-center p-2.5">
              <Image src="/favicon.svg" alt="AxonRouter" width={40} height={40} className="size-full shrink-0" priority />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            AxonRouter
            {version ? (
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-sm bg-primary/10 border border-primary/30 text-primary">
                v{version}
              </span>
            ) : null}
          </h1>
          <p className="text-xs text-text-muted mt-1.5 max-w-[320px] leading-relaxed">
            {samlAvailable
              ? translate("Sign in with SAML 2.0 Single Sign-On")
              : oidcAvailable
              ? translate("Sign in with your enterprise OIDC identity provider")
              : translate("Authentication required to access the neural routing console")}
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full relative rounded-sm bg-[#0c0c10] border border-[#22222a] shadow-2xl p-6 sm:p-7 backdrop-blur-md">
          {/* Top highlight gradient line */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />

          {mustChange ? (
            /* Force Password Change Form */
            <form onSubmit={handleSetNewPassword} className="flex flex-col gap-4">
              <div className="p-3 rounded-sm bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                <AlertCircle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  {translate("Security policy: default password rotation required before remote console access.")}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-password" className="text-xs font-medium text-text-muted">
                  {translate("New Password")}
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder={translate("Enter secure new password")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full h-10 px-3 pr-10 rounded-sm bg-[#14141a] border border-[#2c2c36] text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition p-1"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-sm bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !newPassword}
                className="w-full h-10 mt-2 rounded-sm bg-primary hover:bg-primary-hover active:scale-[0.99] text-black font-semibold text-xs tracking-wide uppercase flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <div className="size-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>{translate("Confirm & Enter Dashboard")}</span>
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Standard Login Form */
            <div className="flex flex-col gap-4">
              {/* SSO Buttons if configured */}
              {samlAvailable && (
                <button
                  type="button"
                  onClick={() => (window.location.href = "/api/auth/saml/start")}
                  className="w-full h-10 rounded-sm bg-[#161620] hover:bg-[#1f1f2c] border border-[#2f2f3d] hover:border-primary text-xs font-medium text-white flex items-center justify-center gap-2 transition"
                >
                  <Shield className="size-3.5 text-primary" />
                  <span>{samlLoginLabel}</span>
                </button>
              )}

              {oidcAvailable && (
                <button
                  type="button"
                  onClick={() => (window.location.href = "/api/auth/oidc/start")}
                  className="w-full h-10 rounded-sm bg-[#161620] hover:bg-[#1f1f2c] border border-[#2f2f3d] hover:border-primary text-xs font-medium text-white flex items-center justify-center gap-2 transition"
                >
                  <KeyRound className="size-3.5 text-primary" />
                  <span>{oidcLoginLabel}</span>
                </button>
              )}

              {ssoAvailable && passwordAvailable && (
                <div className="relative flex items-center justify-center my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#22222a]" />
                  </div>
                  <span className="relative px-2 bg-[#0c0c10] text-[10px] uppercase font-mono tracking-wider text-text-muted">
                    {translate("or password")}
                  </span>
                </div>
              )}

              {passwordAvailable && (
                <form
                  onSubmit={handleLogin}
                  className="flex flex-col gap-4"
                  noValidate
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="login-password" className="text-xs font-medium text-text-muted flex items-center gap-1.5">
                        <Lock className="size-3 text-primary" />
                        <span>{translate("Master Password")}</span>
                      </label>
                      {retryAfter > 0 && (
                        <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-sm border border-amber-500/20">
                          {translate("Lockout")}: {retryAfter}s
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder={translate("Enter master password")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus={!oidcAvailable}
                        disabled={retryAfter > 0}
                        className="w-full h-10 px-3 pr-10 rounded-sm bg-[#14141a] border border-[#262630] text-sm text-white placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition disabled:opacity-50 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition p-1"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>

                    {error && (
                      <div className="mt-1 p-2.5 rounded-sm bg-red-500/15 border border-red-500/35 text-red-400 text-xs flex items-start gap-2">
                        <AlertCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
                        <span className="leading-relaxed font-mono">{error}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || retryAfter > 0}
                    className="w-full h-10 rounded-sm bg-primary hover:bg-primary-hover active:scale-[0.99] text-black font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-primary/20"
                  >
                    {loading ? (
                      <div className="size-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <span>{retryAfter > 0 ? `${translate("Wait")} ${retryAfter}s` : translate("Authenticate & Connect")}</span>
                        <ArrowRight className="size-3.5" />
                      </>
                    )}
                  </button>

                  {/* Default Password Quick-Action Pill */}
                  <div className="pt-2 border-t border-[#1b1b22] flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>{translate("Default Password:")}</span>
                      <button
                        type="button"
                        onClick={handleCopyDefault}
                        className="group flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-primary/10 border border-primary/20 hover:border-primary/40 transition text-primary font-mono"
                        title={translate("Click to auto-fill password")}
                      >
                        {copiedDefault ? (
                          <>
                            <CheckCircle2 className="size-3 text-emerald-400" />
                            <span className="text-emerald-400">{translate("Filled!")}</span>
                          </>
                        ) : (
                          <>
                            <span>12345677</span>
                            <span className="text-[10px] text-text-muted opacity-60 group-hover:opacity-100">
                              ({translate("Auto-fill")})
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    {resetHint && (
                      <div className="mt-1 p-2.5 rounded-sm bg-[#121218] border border-[#22222a] text-[11px] text-text-muted flex items-start gap-2">
                        <Terminal className="size-3.5 text-primary shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          {translate("Reset via CLI: Open axonrouter on server host → Settings → Reset Password to Default.")}
                        </p>
                      </div>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-text-muted/60 font-mono">
            {translate("AxonRouter AI Neural Proxy • Encrypted Session Token")}
          </p>
        </div>
      </div>
    </div>
  );
}
