"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translate } from "@/i18n/runtime";
import { fetchJson, queryKeys } from "@/shared/query";

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
				router.replace("/app");
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
			<main className="min-h-dvh bg-background flex items-center justify-center p-4">
				<Card className="w-full max-w-sm">
					<CardContent className="flex items-center gap-3 py-6">
						<LockKeyhole size={20} className="text-muted-foreground" aria-hidden="true" />
						<p className="text-muted-foreground text-sm">{translate("Loading...")}</p>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<main className="min-h-dvh bg-background flex items-center justify-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<LockKeyhole size={18} className="text-muted-foreground" aria-hidden="true" />
						<span className="font-bold">AxonRouter</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleLogin} className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="password">{translate("Password")}</Label>
							<Input
								id="password"
								type="password"
								placeholder={translate("Enter password")}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoFocus
								aria-invalid={!!error}
								autoComplete="current-password"
							/>
						</div>

						{error && (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						)}

						<Button type="submit" size="lg" loading={loading} className="w-full">
							<LockKeyhole size={16} aria-hidden="true" />
							<span>{translate("Login")}</span>
						</Button>
					</form>

					{hasPassword === false && (
						<p className="mt-4 text-muted-foreground text-sm">
							Default password: 12345677. Change it in Settings after login.
						</p>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
