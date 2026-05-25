"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
	ArrowRight,
	Check,
	LockKeyhole,
	Server,
	Waypoints,
} from "lucide-react";
import { Label as LabelPrimitive } from "radix-ui";
import { translate } from "@/i18n/runtime";
import { fetchJson, queryKeys } from "@/shared/query";

const accessPoints = [
	{ label: "Router", value: "127.0.0.1", icon: Server },
	{ label: "Policy", value: "password auth", icon: LockKeyhole },
	{ label: "Routes", value: "guarded", icon: Waypoints },
];

const trustChecks = [
	"Keys stay local",
	"Routing rules stay private",
	"Telemetry hydrates after login",
];

const shell = {
	page: {
		minHeight: "100dvh",
		display: "grid",
		gridTemplateColumns: "minmax(0, 1.18fr) minmax(360px, 520px)",
		background: "#09090b",
		color: "#fafafa",
		fontFamily:
			"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
	},
	left: {
		minHeight: "100dvh",
		padding: "56px",
		display: "flex",
		flexDirection: "column" as const,
		justifyContent: "space-between",
		gap: "48px",
		borderRight: "1px solid rgba(255,255,255,0.08)",
		background:
			"radial-gradient(circle at 20% 20%, rgba(236,72,153,0.16), transparent 30rem), linear-gradient(135deg, #18181b 0%, #09090b 70%)",
	},
	right: {
		minHeight: "100dvh",
		display: "grid",
		placeItems: "center",
		padding: "32px",
		background: "#111113",
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: "12px",
	},
	iconBox: {
		width: "42px",
		height: "42px",
		display: "grid",
		placeItems: "center",
		borderRadius: "14px",
		border: "1px solid rgba(255,255,255,0.14)",
		background: "rgba(255,255,255,0.06)",
		color: "#f5f5f5",
	},
	badge: {
		marginLeft: "auto",
		borderRadius: "999px",
		border: "1px solid rgba(236,72,153,0.32)",
		background: "rgba(236,72,153,0.12)",
		padding: "6px 10px",
		fontSize: "12px",
		fontWeight: 800,
		color: "#f9a8d4",
	},
	eyebrow: {
		margin: "0 0 14px",
		fontSize: "12px",
		fontWeight: 850,
		letterSpacing: "0.18em",
		textTransform: "uppercase" as const,
		color: "#a1a1aa",
	},
	title: {
		margin: 0,
		maxWidth: "11ch",
		fontSize: "clamp(52px, 8vw, 104px)",
		lineHeight: 0.88,
		letterSpacing: "-0.08em",
		fontWeight: 900,
	},
	subtitle: {
		margin: "26px 0 0",
		maxWidth: "680px",
		fontSize: "17px",
		lineHeight: 1.75,
		color: "#d4d4d8",
	},
	accessGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
		gap: "12px",
	},
	statCard: {
		borderRadius: "20px",
		border: "1px solid rgba(255,255,255,0.1)",
		background: "rgba(255,255,255,0.055)",
		padding: "18px",
		boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
	},
	authCard: {
		width: "100%",
		maxWidth: "420px",
		borderRadius: "26px",
		border: "1px solid rgba(255,255,255,0.12)",
		background: "#18181b",
		padding: "28px",
		boxShadow: "0 28px 90px rgba(0,0,0,0.48)",
	},
	input: {
		width: "100%",
		boxSizing: "border-box" as const,
		borderRadius: "15px",
		border: "1px solid rgba(255,255,255,0.14)",
		background: "#09090b",
		color: "#fafafa",
		padding: "15px 16px",
		fontSize: "16px",
		outline: "none",
	},
	button: {
		width: "100%",
		minHeight: "54px",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		gap: "10px",
		borderRadius: "15px",
		border: "0",
		background: "#fafafa",
		color: "#09090b",
		fontSize: "15px",
		fontWeight: 850,
		cursor: "pointer",
	},
};

export default function LoginPage() {
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [hasPassword, setHasPassword] = useState<boolean | null>(null);
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(() => {
		queryClient.clear();
	}, [queryClient]);

	useEffect(() => {
		async function checkAuth() {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			try {
				const data = await fetchJson<{ hasPassword?: boolean }>(
					"/api/settings",
					{ signal: controller.signal },
				);
				clearTimeout(timeoutId);
				queryClient.setQueryData(queryKeys.settings(), data);
				setHasPassword(!!data.hasPassword);
			} catch {
				clearTimeout(timeoutId);
				setHasPassword(true);
			}
		}
		checkAuth();
	}, [queryClient, router]);

	const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password }),
			});

			if (res.ok) {
				try {
					const settings = await fetchJson("/api/settings", {});
					queryClient.setQueryData(queryKeys.settings(), settings);
				} catch {
					// Ignore settings refresh failures; dashboard redirect still succeeds after login.
				}
				router.replace("/dashboard");
			} else {
				const data = await res.json();
				setError(data.error || translate("Invalid password"));
			}
		} catch {
			setError(translate("An error occurred. Please try again."));
		} finally {
			setLoading(false);
		}
	};

	if (hasPassword === null) {
		return (
			<main style={shell.right}>
				<section style={shell.authCard} aria-live="polite">
					<LockKeyhole size={26} aria-hidden="true" />
					<p style={{ margin: "16px 0 0", color: "#d4d4d8" }}>
						{translate("Loading...")}
					</p>
				</section>
			</main>
		);
	}

	return (
		<main style={shell.page}>
			<section style={shell.left}>
				<header style={shell.header}>
					<div style={shell.iconBox}>
						<LockKeyhole size={20} aria-hidden="true" />
					</div>
					<div>
						<p style={{ margin: 0, fontWeight: 850 }}>AxonRouter</p>
						<p
							style={{ margin: "2px 0 0", color: "#a1a1aa", fontSize: "13px" }}
						>
							provider routing control
						</p>
					</div>
					<span style={shell.badge}>auth.required</span>
				</header>

				<div>
					<p style={shell.eyebrow}>secure dashboard access</p>
					<h1 style={shell.title}>Route AI requests.</h1>
					<p style={shell.subtitle}>
						{hasPassword
							? `${translate("Enter your password to access the dashboard")}. Provider keys, routing policy, and telemetry unlock only after local verification.`
							: "First-run password is 12345677. Sign in, then change it immediately in Settings -> Security."}
					</p>
				</div>

				<div style={shell.accessGrid}>
					{accessPoints.map((item) => {
						const Icon = item.icon;
						return (
							<article key={item.label} style={shell.statCard}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										color: "#a1a1aa",
										fontSize: "12px",
										fontWeight: 850,
										textTransform: "uppercase",
										letterSpacing: "0.14em",
									}}
								>
									<span>{item.label}</span>
									<Icon size={16} aria-hidden="true" />
								</div>
								<p
									style={{
										margin: "20px 0 0",
										fontSize: "18px",
										fontWeight: 850,
									}}
								>
									{item.value}
								</p>
							</article>
						);
					})}
				</div>
			</section>

			<section style={shell.right} aria-labelledby="login-title">
				<div style={shell.authCard}>
					<div
						style={{
							display: "flex",
							alignItems: "start",
							justifyContent: "space-between",
							gap: "16px",
						}}
					>
						<div>
							<p style={shell.eyebrow}>control plane</p>
							<h2
								id="login-title"
								style={{
									margin: 0,
									fontSize: "34px",
									lineHeight: 1,
									letterSpacing: "-0.045em",
								}}
							>
								Login
							</h2>
						</div>
						<span style={{ ...shell.iconBox, fontWeight: 900 }}>RR</span>
					</div>

					<form
						onSubmit={handleLogin}
						style={{ marginTop: "32px", display: "grid", gap: "16px" }}
					>
						<div>
							<LabelPrimitive.Root
								htmlFor="password"
								style={{
									display: "block",
									marginBottom: "8px",
									fontSize: "14px",
									fontWeight: 850,
								}}
							>
								{translate("Password")}
							</LabelPrimitive.Root>
							<input
								id="password"
								type="password"
								placeholder={translate("Enter password")}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoFocus
								aria-invalid={!!error}
								autoComplete="current-password"
								style={shell.input}
							/>
							<p
								style={{
									margin: "10px 0 0",
									color: error ? "#fca5a5" : "#a1a1aa",
									fontSize: "13px",
								}}
							>
								{error ||
									(hasPassword
										? "Use your configured management password."
										: "Use default password 12345677, then change it in Settings -> Security.")}
							</p>
						</div>

						{error && (
							<div
								role="alert"
								style={{
									borderRadius: "15px",
									border: "1px solid rgba(248,113,113,0.28)",
									background: "rgba(127,29,29,0.28)",
									padding: "12px 14px",
									color: "#fecaca",
								}}
							>
								<strong>{translate("Invalid password")}</strong>
								<p style={{ margin: "4px 0 0" }}>{error}</p>
							</div>
						)}

						<button
							type="submit"
							disabled={loading}
							style={{ ...shell.button, opacity: loading ? 0.72 : 1 }}
						>
							<LockKeyhole size={18} aria-hidden="true" />
							<span>
								{loading ? "Checking password..." : translate("Login")}
							</span>
							{!loading && <ArrowRight size={18} aria-hidden="true" />}
						</button>
					</form>

					<div style={{ marginTop: "28px", display: "grid", gap: "10px" }}>
						{trustChecks.map((item) => (
							<div
								key={item}
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									color: "#d4d4d8",
									fontSize: "14px",
								}}
							>
								<Check size={16} aria-hidden="true" />
								<span>{item}</span>
							</div>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
