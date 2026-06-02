"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

function LabeledInput({ label, ...props }) {
	return (
		<Field className={props.className}>
			<FieldLabel>{label}</FieldLabel>
			<Input {...props} className={undefined} />
		</Field>
	);
}

export default function AddApiKeyModal({
	isOpen,
	provider,
	providerName,
	isCompatible,
	isAnthropic,
	authType,
	authHint,
	website,
	proxyPools,
	defaultProxyPoolId,
	onSave,
	onClose,
}) {
	const NONE_PROXY_POOL_VALUE = "__none__";
	const isOllamaLocal = provider === "ollama-local";
	const isCookie = authType === "cookie";
	const credentialLabel = isCookie ? "Cookie Value" : "API Key";
	const credentialPlaceholder = isCookie ? "eyJhbGciOi..." : "";
	const isAzure = provider === "azure";
	const isMimo = provider === "mimo";
	const MIMO_ENDPOINTS = [
		{ label: "Public API", value: "https://api.xiaomimimo.com/v1" },
		{
			label: "Token Plan - China",
			value: "https://token-plan-cn.xiaomimimo.com/v1",
		},
		{
			label: "Token Plan - Singapore",
			value: "https://token-plan-sgp.xiaomimimo.com/v1",
		},
		{
			label: "Token Plan - Europe",
			value: "https://token-plan-ams.xiaomimimo.com/v1",
		},
	];

	const [formData, setFormData] = useState({
		name: "",
		apiKey: "",
		priority: 1,
		proxyPoolId: defaultProxyPoolId || NONE_PROXY_POOL_VALUE,
		ollamaHostUrl: "",
		mimoBaseUrl: MIMO_ENDPOINTS[0].value,
	});
	const [azureData, setAzureData] = useState({
		azureEndpoint: "",
		apiVersion: "2024-10-01-preview",
		deployment: "",
		organization: "",
	});
	const [validating, setValidating] = useState(false);
	const [validationResult, setValidationResult] = useState(null);
	const [saving, setSaving] = useState(false);

	const normalizedDefaultProxyPoolId =
		defaultProxyPoolId || NONE_PROXY_POOL_VALUE;

	const buildProviderSpecificData = () => {
		if (isAzure)
			return {
				azureEndpoint: azureData.azureEndpoint,
				apiVersion: azureData.apiVersion,
				deployment: azureData.deployment,
				organization: azureData.organization,
			};
		if (isMimo)
			return {
				baseUrl: formData.mimoBaseUrl.trim() || MIMO_ENDPOINTS[0].value,
			};
		if (isOllamaLocal && formData.ollamaHostUrl.trim())
			return { baseUrl: formData.ollamaHostUrl.trim() };
		return undefined;
	};

	const handleValidate = async () => {
		setValidating(true);
		try {
			const res = await fetch("/api/providers/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider,
					apiKey: formData.apiKey,
					providerSpecificData: buildProviderSpecificData(),
				}),
			});
			const data = await res.json();
			setValidationResult(data.valid ? "success" : "failed");
		} catch {
			setValidationResult("failed");
		} finally {
			setValidating(false);
		}
	};

	const handleSubmit = async () => {
		if (!provider) return;
		if (!isOllamaLocal && !formData.apiKey) return;
		if (!isOllamaLocal && !formData.name) return;
		setSaving(true);
		try {
			let isValid = false;
			try {
				setValidating(true);
				setValidationResult(null);
				const res = await fetch("/api/providers/validate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						provider,
						apiKey: formData.apiKey,
						providerSpecificData: buildProviderSpecificData(),
					}),
				});
				const data = await res.json();
				isValid = !!data.valid;
				setValidationResult(isValid ? "success" : "failed");
			} catch {
				setValidationResult("failed");
			} finally {
				setValidating(false);
			}
			await onSave({
				name:
					formData.name ||
					(isOllamaLocal
						? "Ollama Local"
						: isCompatible && formData.apiKey
							? `****${formData.apiKey.slice(-6)}`
							: ""),
				apiKey: formData.apiKey,
				priority: formData.priority,
				proxyPoolId:
					formData.proxyPoolId === NONE_PROXY_POOL_VALUE
						? null
						: formData.proxyPoolId,
				...(isValid
					? {
							routingStatus: "eligible",
							healthStatus: "healthy",
							quotaState: "ok",
							authState: "ok",
							reasonCode: null,
							reasonDetail: null,
							nextRetryAt: null,
							resetAt: null,
							lastCheckedAt: new Date().toISOString(),
						}
					: {}),
				providerSpecificData: buildProviderSpecificData(),
			});
		} finally {
			setSaving(false);
		}
	};

	if (!provider) return null;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{`Add ${providerName || provider} ${credentialLabel}`}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<LabeledInput
						label="Name"
						value={formData.name}
						onChange={(e) => setFormData({ ...formData, name: e.target.value })}
						placeholder={isOllamaLocal ? "Ollama Local" : "Production Key"}
					/>
					{isOllamaLocal && (
						<div className="flex gap-2">
							<LabeledInput
								label="Ollama Host URL"
								value={formData.ollamaHostUrl}
								onChange={(e) =>
									setFormData({ ...formData, ollamaHostUrl: e.target.value })
								}
								placeholder="http://localhost:11434"
								className="flex-1"
							/>
							<div className="pt-6">
								<Button
									onClick={handleValidate}
									disabled={validating || saving}
									variant="secondary"
								>
									{validating ? <Spinner className="size-4" /> : null}
									{validating ? "Checking..." : "Check"}
								</Button>
							</div>
						</div>
					)}
					{!isOllamaLocal && (
						<div className="flex gap-2">
							<LabeledInput
								label={credentialLabel}
								type={isCookie ? "text" : "password"}
								value={formData.apiKey}
								onChange={(e) =>
									setFormData({ ...formData, apiKey: e.target.value })
								}
								placeholder={credentialPlaceholder}
								className="flex-1"
							/>
							<div className="pt-6">
								<Button
									onClick={handleValidate}
									disabled={!formData.apiKey || validating || saving}
									variant="secondary"
								>
									{validating ? <Spinner className="size-4" /> : null}
									{validating ? "Checking..." : "Check"}
								</Button>
							</div>
						</div>
					)}
					{isCookie && authHint && (
						<p className="text-xs text-text-muted">
							{authHint}
							{website && (
								<>
									{" "}
									<a
										href={website}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary underline"
									>
										Open {website.replace(/^https?:\/\//, "")}
									</a>
								</>
							)}
						</p>
					)}
					{isOllamaLocal && (
						<p className="text-xs text-text-muted">
							Leave blank to use <code>http://localhost:11434</code>. For remote
							Ollama, enter the full host URL.
						</p>
					)}
					{isMimo && (
						<Field>
							<FieldLabel>Base URL</FieldLabel>
							<Select
								value={formData.mimoBaseUrl}
								onValueChange={(value) =>
									setFormData({ ...formData, mimoBaseUrl: value })
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select Xiaomi MiMo endpoint" />
								</SelectTrigger>
								<SelectContent>
									{MIMO_ENDPOINTS.map((endpoint) => (
										<SelectItem key={endpoint.value} value={endpoint.value}>
											{endpoint.label} - {endpoint.value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-text-muted">
								Choose the Xiaomi MiMo public API or a Token Plan
								OpenAI-compatible regional cluster.
							</p>
						</Field>
					)}
					{validationResult && (
						<Badge
							variant={
								validationResult === "success" ? "default" : "destructive"
							}
						>
							{validationResult === "success" ? "Valid" : "Invalid"}
						</Badge>
					)}
					{isCompatible && (
						<p className="text-xs text-text-muted">
							{isAnthropic
								? `Validation checks ${providerName || "Anthropic Compatible"} by verifying the API key.`
								: `Validation checks ${providerName || "OpenAI Compatible"} via /models on your base URL.`}
						</p>
					)}
					{isAzure && (
						<div className="rounded-lg border border-accent/20 bg-sidebar/50 p-4">
							<h3 className="mb-3 text-sm font-semibold">
								Azure OpenAI Configuration
							</h3>
							<div className="flex flex-col gap-3">
								<LabeledInput
									label="Azure Endpoint"
									value={azureData.azureEndpoint}
									onChange={(e) =>
										setAzureData({
											...azureData,
											azureEndpoint: e.target.value,
										})
									}
									placeholder="https://your-resource.openai.azure.com"
								/>
								<LabeledInput
									label="Deployment Name"
									value={azureData.deployment}
									onChange={(e) =>
										setAzureData({ ...azureData, deployment: e.target.value })
									}
									placeholder="gpt-4"
								/>
								<LabeledInput
									label="API Version"
									value={azureData.apiVersion}
									onChange={(e) =>
										setAzureData({ ...azureData, apiVersion: e.target.value })
									}
									placeholder="2024-10-01-preview"
								/>
								<LabeledInput
									label="Organization"
									value={azureData.organization}
									onChange={(e) =>
										setAzureData({ ...azureData, organization: e.target.value })
									}
									placeholder="Organization ID"
								/>
							</div>
						</div>
					)}
					<LabeledInput
						label="Priority"
						type="number"
						value={formData.priority}
						onChange={(e) =>
							setFormData({
								...formData,
								priority: Number.parseInt(e.target.value) || 1,
							})
						}
					/>
					<Field>
						<FieldLabel>Proxy Pool</FieldLabel>
						<Select
							value={formData.proxyPoolId}
							onValueChange={(value) =>
								setFormData({ ...formData, proxyPoolId: value })
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="None" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE_PROXY_POOL_VALUE}>None</SelectItem>
								{(proxyPools || []).map((pool) => (
									<SelectItem key={pool.id} value={pool.id}>
										{pool.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					{normalizedDefaultProxyPoolId !== NONE_PROXY_POOL_VALUE && (
						<p className="text-xs text-text-muted">
							This provider has a default proxy pool. New accounts will use it
							unless you override it here.
						</p>
					)}
					{(proxyPools || []).length === 0 && (
						<p className="text-xs text-text-muted">
							No enabled proxy pools available. Create one in Proxy Pools page
							first.
						</p>
					)}
					<div className="flex gap-2">
						<Button
							onClick={handleSubmit}
							className="w-full"
							disabled={
								saving ||
								(!isOllamaLocal && (!formData.name || !formData.apiKey)) ||
								(isAzure &&
									(!azureData.azureEndpoint ||
										!azureData.deployment ||
										!azureData.organization))
							}
						>
							{saving ? <Spinner className="size-4" /> : null}
							{saving ? "Saving..." : "Save"}
						</Button>
						<Button onClick={onClose} variant="ghost" className="w-full">
							Cancel
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

AddApiKeyModal.propTypes = {
	isOpen: PropTypes.bool.isRequired,
	provider: PropTypes.string,
	providerName: PropTypes.string,
	isCompatible: PropTypes.bool,
	isAnthropic: PropTypes.bool,
	authType: PropTypes.string,
	authHint: PropTypes.string,
	website: PropTypes.string,
	proxyPools: PropTypes.arrayOf(
		PropTypes.shape({ id: PropTypes.string, name: PropTypes.string }),
	),
	defaultProxyPoolId: PropTypes.string,
	onSave: PropTypes.func.isRequired,
	onClose: PropTypes.func.isRequired,
};
