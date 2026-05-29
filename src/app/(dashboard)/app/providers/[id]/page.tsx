"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
	ArrowLeft,
	ArrowRightIcon,
	CookieIcon,
	Info,
	PlusIcon,
	PencilIcon,
	SearchIcon,
	TrashIcon,
	TriangleAlert,
} from "lucide-react";
import AppIcon from "@/shared/components/AppIcon";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
	OAuthModal,
	KiroOAuthWrapper,
	CursorAuthModal,
	FreebuffAuthModal,
	IFlowCookieModal,
	GitLabAuthModal,
	EditConnectionModal,
} from "@/shared/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card as ShadcnCard, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input as ShadcnInput } from "@/components/ui/input";
import {
	Select as ShadcnSelect,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Switch } from "@/components/ui/switch";
import Pagination from "@/shared/components/Pagination";
import {
	OAUTH_PROVIDERS,
	APIKEY_PROVIDERS,
	FREE_PROVIDERS,
	FREE_TIER_PROVIDERS,
	WEB_COOKIE_PROVIDERS,
	getProviderAlias,
	isOpenAICompatibleProvider,
	isAnthropicCompatibleProvider,
	isMorphManagedProvider,
	AI_PROVIDERS,
	THINKING_CONFIG,
} from "@/shared/constants/providers";
import {
	getModelsByProviderId,
	getMorphFastModels,
} from "@/shared/constants/models";
import { filterCodexModelsForConnections } from "@/lib/codexModelAccess";
import {
	getConnectionFilterStatus,
	normalizeConnectionFilterStatus,
	getConnectionCentralizedStatus,
	getConnectionProviderCooldownUntil,
} from "@/lib/connectionStatus";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useUrlQueryControls } from "@/shared/hooks";
import { fetchSuggestedModels } from "@/shared/utils/providerModelsFetcher";
import ModelRow from "./ModelRow";
import PassthroughModelsSection from "./PassthroughModelsSection";
import CompatibleModelsSection from "./CompatibleModelsSection";
import ConnectionRow from "./ConnectionRow";
import AddApiKeyModal from "./AddApiKeyModal";
import EditCompatibleNodeModal from "./EditCompatibleNodeModal";
import AddCustomModelModal from "./AddCustomModelModal";
import ModelsCard from "../components/ModelsCard";
import CodexInstructionsCard from "./CodexInstructionsCard";
import CommandCodeInstructionsCard from "./CommandCodeInstructionsCard";
import MorphInstructionsCard from "../../morph/MorphInstructionsCard";
import { useNotificationStore } from "@/store/notificationStore";
import { translate } from "@/i18n/runtime";
import { fetchJson, queryKeys, useInvalidate } from "@/shared/query";
import { compareConnectionsByUsageAvailability } from "@/lib/connectionUsageRank";

export default function ProviderDetailPage() {
	const params: any = useParams();
	const router = useRouter();
	const providerId = String(
		Array.isArray(params?.id) ? params.id[0] : params?.id || "",
	);
	const { getQueryValue, updateQueryParams } = useUrlQueryControls({
		fallbackPath: `/app/providers/${providerId}`,
		normalizers: {
			statusFilter: (value) => {
				const normalizedValue = normalizeConnectionFilterStatus(value || "all");
				return normalizedValue === "all" ? "" : normalizedValue;
			},
			accountTypeFilter: (value) => {
				const normalizedValue = String(value || "all")
					.trim()
					.toLowerCase();
				return normalizedValue === "all" ? "" : normalizedValue;
			},
		},
	});
	const [connections, setConnections] = useState([]);
	const [loading, setLoading] = useState(true);
	const [providerNode, setProviderNode] = useState(null);
	const [proxyPools, setProxyPools] = useState([]);
	const [showOAuthModal, setShowOAuthModal] = useState(false);
	const [showIFlowCookieModal, setShowIFlowCookieModal] = useState(false);
	const [showAddApiKeyModal, setShowAddApiKeyModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showEditNodeModal, setShowEditNodeModal] = useState(false);
	const [showBulkProxyModal, setShowBulkProxyModal] = useState(false);
	const [selectedConnection, setSelectedConnection] = useState(null);
	const [modelAliases, setModelAliases] = useState({});
	const [modelTestResults, setModelTestResults] = useState({});
	const [modelsTestError, setModelsTestError] = useState("");
	const [testingModelId, setTestingModelId] = useState(null);
	const [showAddCustomModel, setShowAddCustomModel] = useState(false);
	const [selectedConnectionIds, setSelectedConnectionIds] = useState([]);
	const [bulkProxyPoolId, setBulkProxyPoolId] = useState("__none__");
	const [testingAllConnections, setTestingAllConnections] = useState(false);
	const [testAllResults, setTestAllResults] = useState(null);
	const [bulkUpdatingProxy, setBulkUpdatingProxy] = useState(false);
	const [providerStrategy, setProviderStrategy] = useState(null); // null = use global, "round-robin" = override
	const [providerStickyLimit, setProviderStickyLimit] = useState("");
	const [thinkingMode, setThinkingMode] = useState("auto");
	const [providerDefaultProxyPoolId, setProviderDefaultProxyPoolId] =
		useState<string>("__none__");
	const [savingProviderDefaultProxy, setSavingProviderDefaultProxy] =
		useState(false);
	const [suggestedModels, setSuggestedModels] = useState([]);
	const [kiloFreeModels, setKiloFreeModels] = useState([]);
	const [providerModels, setProviderModels] = useState([]);
	const [syncingProviderModels, setSyncingProviderModels] = useState(false);
	const [providerModelsSyncNotice, setProviderModelsSyncNotice] = useState("");
	const [providerModelsSyncError, setProviderModelsSyncError] = useState("");

	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const { copied, copy } = useCopyToClipboard();
	const notify = useNotificationStore();
	const inv = useInvalidate();
	const searchQuery = getQueryValue("searchQuery", "");
	const statusFilter = getQueryValue("statusFilter", "all") || "all";
	const accountTypeFilter = getQueryValue("accountTypeFilter", "all") || "all";
	const modelAliasesQuery = useQuery({
		queryKey: queryKeys.modelAliases(),
		queryFn: ({ signal }) =>
			fetchJson<{ aliases?: Record<string, string> }>("/api/models/alias", {
				signal,
			}),
	});
	const kiloFreeModelsQuery = useQuery({
		queryKey: queryKeys.kiloFreeModels(),
		queryFn: ({ signal }) =>
			fetchJson<{ models?: any[] }>("/api/providers/kilo/free-models", {
				signal,
			}),
		enabled: providerId === "kilocode",
	});
	const providerDetailQuery = useQuery({
		queryKey: queryKeys.providerDetail(providerId),
		staleTime: 30_000,
		queryFn: async ({ signal }) => {
			const [
				connectionsData,
				nodesData,
				proxyPoolsData,
				settingsData,
				providerModelsData,
			] = await Promise.all([
				fetchJson<{ connections?: any[] }>("/api/providers", {
					signal,
					cache: "no-store",
				}),
				fetchJson<{ nodes?: any[] }>("/api/provider-nodes", {
					signal,
					cache: "no-store",
				}),
				fetchJson<{ proxyPools?: any[] }>("/api/proxy-pools?isActive=true", {
					signal,
					cache: "no-store",
				}),
				fetchJson<any>("/api/settings", { signal, cache: "no-store" }),
				fetchJson<any>(
					`/api/provider-models?provider=${encodeURIComponent(providerId)}`,
					{ signal, cache: "no-store" },
				).catch(() => ({ models: [] })),
			]);
			return {
				connectionsData,
				nodesData,
				proxyPoolsData,
				settingsData,
				providerModelsData,
			};
		},
		enabled: !!providerId,
	});

	useEffect(() => {
		if (!modelAliasesQuery.data) return;
		queueMicrotask(() =>
			setModelAliases(modelAliasesQuery.data?.aliases || {}),
		);
	}, [modelAliasesQuery.data]);

	useEffect(() => {
		if (providerId !== "kilocode") return;
		const models = kiloFreeModelsQuery.data?.models;
		if (models?.length) queueMicrotask(() => setKiloFreeModels(models));
	}, [kiloFreeModelsQuery.data, providerId]);

	useEffect(() => {
		if (providerDetailQuery.isPending) {
			queueMicrotask(() => setLoading(true));
			return;
		}
		if (providerDetailQuery.isError) {
			console.log("Error fetching connections:", providerDetailQuery.error);
			queueMicrotask(() => setLoading(false));
			return;
		}
		if (!providerDetailQuery.data) return;
		const {
			connectionsData,
			nodesData,
			proxyPoolsData,
			settingsData,
			providerModelsData,
		} = providerDetailQuery.data;
		queueMicrotask(() => {
			setConnections(
				(connectionsData.connections || []).filter(
					(c) => c.provider === providerId,
				),
			);
			setProxyPools(proxyPoolsData.proxyPools || []);
			setProviderModels(
				Array.isArray(providerModelsData?.models)
					? providerModelsData.models
					: [],
			);
			const override =
				(settingsData.providerStrategies || {})[providerId] || {};
			setProviderStrategy(
				override.strategy || override.fallbackStrategy || null,
			);
			setProviderStickyLimit(
				override.stickyLimit != null
					? String(override.stickyLimit)
					: override.stickyRoundRobinLimit != null
						? String(override.stickyRoundRobinLimit)
						: "1",
			);
			const thinkingCfg =
				(settingsData.providerThinking || {})[providerId] || {};
			setThinkingMode(thinkingCfg.mode || "auto");
			const providerProxyDefault =
				settingsData.providerProxyDefaults?.[providerId]?.proxyPoolId ||
				"__none__";
			setProviderDefaultProxyPoolId(providerProxyDefault || "__none__");
			const node =
				(nodesData.nodes || []).find((entry) => entry.id === providerId) ||
				null;
			setProviderNode(node);
			setLoading(false);
		});
	}, [
		providerDetailQuery.data,
		providerDetailQuery.error,
		providerDetailQuery.isError,
		providerDetailQuery.isPending,
		providerId,
	]);

	const providerInfo = providerNode
		? {
				id: providerNode.id,
				name:
					providerNode.name ||
					(providerNode.type === "anthropic-compatible"
						? "Anthropic Compatible"
						: "OpenAI Compatible"),
				color:
					providerNode.type === "anthropic-compatible" ? "#D97757" : "#10A37F",
				textIcon: providerNode.type === "anthropic-compatible" ? "AC" : "OC",
				apiType: providerNode.apiType,
				baseUrl: providerNode.baseUrl,
				type: providerNode.type,
			}
		: OAUTH_PROVIDERS[providerId] ||
			APIKEY_PROVIDERS[providerId] ||
			FREE_PROVIDERS[providerId] ||
			FREE_TIER_PROVIDERS[providerId] ||
			WEB_COOKIE_PROVIDERS[providerId];
	const isOAuth =
		!!OAUTH_PROVIDERS[providerId] ||
		!!FREE_PROVIDERS[providerId] ||
		providerId === "freebuff";
	const isFreeNoAuth = !!FREE_PROVIDERS[providerId]?.noAuth;
	const isMorphManaged = isMorphManagedProvider(providerId);
	const models =
		providerModels.length > 0
			? providerModels
			: isMorphManaged
				? getMorphFastModels()
				: [];
	const providerAlias = getProviderAlias(providerId);

	const isOpenAICompatible = isOpenAICompatibleProvider(providerId);
	const isAnthropicCompatible = isAnthropicCompatibleProvider(providerId);
	const isCompatible = isOpenAICompatible || isAnthropicCompatible;
	const thinkingConfig =
		AI_PROVIDERS[providerId]?.thinkingConfig || THINKING_CONFIG.extended;

	const providerStorageAlias = isCompatible ? providerId : providerAlias;
	const providerDisplayAlias = isCompatible
		? providerNode?.prefix || providerId
		: providerAlias;

	const availableAccountTypeOptions = useMemo(() => {
		const optionMap = new Map();

		for (const connection of connections) {
			const rawPlanType = connection?.providerSpecificData?.planType;
			const normalizedPlanType =
				typeof rawPlanType === "string" ? rawPlanType.trim().toLowerCase() : "";
			if (!normalizedPlanType) continue;
			if (!optionMap.has(normalizedPlanType)) {
				optionMap.set(normalizedPlanType, {
					value: normalizedPlanType,
					label: rawPlanType.trim(),
				});
			}
		}

		return [
			{ value: "all", label: translate("All account types") },
			...optionMap.values(),
		];
	}, [connections]);

	const filteredConnections = useMemo(() => {
		let result = connections;

		if (statusFilter !== "all") {
			result = result.filter((connection) => {
				const filterStatus = getConnectionFilterStatus(connection);
				return filterStatus === statusFilter;
			});
		}

		if (accountTypeFilter !== "all") {
			result = result.filter((connection) => {
				const planType =
					typeof connection?.providerSpecificData?.planType === "string"
						? connection.providerSpecificData.planType.trim().toLowerCase()
						: "";
				return planType === accountTypeFilter;
			});
		}

		const query = searchQuery.trim().toLowerCase();
		if (!query) return [...result].sort(compareConnectionsByUsageAvailability);

		return result
			.filter((connection) => {
				const searchableValues = [
					connection.provider,
					connection.name,
					connection.displayName,
					connection.email,
					connection.connectionName,
					connection.id,
					connection.providerSpecificData?.planType,
				]
					.filter(Boolean)
					.map((value) => String(value).toLowerCase());

				return searchableValues.some((value) => value.includes(query));
			})
			.sort(compareConnectionsByUsageAvailability);
	}, [accountTypeFilter, connections, searchQuery, statusFilter]);

	const quotaSummary = useMemo(() => {
		if (connections.length === 0) {
			return {
				eligible: 0,
				exhausted: 0,
				blocked: 0,
				disabled: 0,
				unknown: 0,
				nextResetAt: null,
			};
		}

		const summary = {
			eligible: 0,
			exhausted: 0,
			blocked: 0,
			disabled: 0,
			unknown: 0,
			nextResetAt: null,
		};

		for (const connection of connections) {
			const status = getConnectionCentralizedStatus(connection);
			const cooldownUntil = getConnectionProviderCooldownUntil(connection);

			switch (status) {
				case "eligible":
				case "exhausted":
				case "blocked":
				case "disabled":
				case "unknown":
					summary[status] += 1;
					break;
				default:
					summary.unknown += 1;
					break;
			}

			if (
				status === "exhausted" &&
				cooldownUntil &&
				(!summary.nextResetAt || cooldownUntil < summary.nextResetAt)
			) {
				summary.nextResetAt = cooldownUntil;
			}
		}

		return summary;
	}, [connections]);

	const quotaSummaryItems = useMemo(
		() => [
			{
				key: "eligible",
				label: "Eligible",
				value: quotaSummary.eligible,
				tone: "text-emerald-600 dark:text-emerald-400",
			},
			{
				key: "exhausted",
				label: "Exhausted",
				value: quotaSummary.exhausted,
				tone: "text-amber-600 dark:text-amber-400",
			},
			{
				key: "blocked",
				label: "Blocked",
				value: quotaSummary.blocked,
				tone: "text-rose-600 dark:text-rose-400",
			},
			{
				key: "disabled",
				label: "Disabled",
				value: quotaSummary.disabled,
				tone: "text-[var(--color-text-muted)]",
			},
			{
				key: "unknown",
				label: "Unknown",
				value: quotaSummary.unknown,
				tone: "text-[var(--color-text-muted)]",
			},
		],
		[quotaSummary],
	);

	const totalConnections = filteredConnections.length;
	const totalPages = Math.max(1, Math.ceil(totalConnections / pageSize));

	const visibleCurrentPage = Math.min(currentPage, totalPages);

	const paginatedConnections = useMemo(() => {
		const start = (visibleCurrentPage - 1) * pageSize;
		return filteredConnections.slice(start, start + pageSize);
	}, [filteredConnections, pageSize, visibleCurrentPage]);

	const normalizedSelectedConnectionIds = useMemo(
		() =>
			selectedConnectionIds.filter((id) =>
				connections.some((conn) => conn.id === id),
			),
		[connections, selectedConnectionIds],
	);

	// Define callbacks BEFORE the useEffect that uses them
	const fetchConnections = useCallback(async () => {
		await providerDetailQuery.refetch();
	}, [providerDetailQuery]);

	const updateNodeMutation = useMutation({
		retry: false,
		mutationFn: async (formData: any) => {
			const res = await fetch(`/api/provider-nodes/${providerId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to update node");
			return data;
		},
		onSuccess: (data) => {
			setProviderNode(data.node);
			inv.allProviders(providerId);
			setShowEditNodeModal(false);
		},
		onError: (error) => {
			console.log("Error updating provider node:", error);
		},
	});

	const handleUpdateNode = (formData) => {
		updateNodeMutation.mutate(formData);
	};

	const deleteNodeMutation = useMutation({
		retry: false,
		mutationFn: async () => {
			const res = await fetch(`/api/provider-nodes/${providerId}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete provider node");
		},
		onSuccess: () => {
			inv.allProviders(providerId);
			router.push("/app/providers");
		},
		onError: (error) => {
			console.log("Error deleting provider node:", error);
		},
	});

	const saveStrategyMutation = useMutation({
		retry: false,
		mutationFn: async ({
			strategy,
			stickyLimit,
		}: {
			strategy: string | null;
			stickyLimit: string;
		}) => {
			const settingsRes = await fetch("/api/settings", { cache: "no-store" });
			const settingsData = settingsRes.ok ? await settingsRes.json() : {};
			const current =
				settingsData.routing?.providerStrategies ||
				settingsData.providerStrategies ||
				{};
			const override: any = {};
			if (strategy) override.strategy = strategy;
			if (strategy === "round-robin" && stickyLimit !== "") {
				override.stickyLimit = Number(stickyLimit) || 3;
			}
			const updated = { ...current };
			if (Object.keys(override).length === 0) {
				delete updated[providerId];
			} else {
				updated[providerId] = override;
			}
			const res = await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ routing: { providerStrategies: updated } }),
			});
			if (!res.ok) throw new Error("Failed to save strategy");
		},
		onSuccess: () => {
			inv.settings();
		},
		onError: (error) => {
			console.log("Error saving provider strategy:", error);
		},
	});

	const saveProviderStrategy = (strategy, stickyLimit) => {
		saveStrategyMutation.mutate({ strategy, stickyLimit });
	};

	const handleRoundRobinToggle = (enabled) => {
		const strategy = enabled ? "round-robin" : null;
		const sticky = enabled ? providerStickyLimit || "1" : providerStickyLimit;
		if (enabled && !providerStickyLimit) setProviderStickyLimit("1");
		setProviderStrategy(strategy);
		saveProviderStrategy(strategy, sticky);
	};

	const handleStickyLimitChange = (value) => {
		setProviderStickyLimit(value);
		saveProviderStrategy("round-robin", value);
	};

	const saveThinkingMutation = useMutation({
		retry: false,
		mutationFn: async (mode: string) => {
			const settingsRes = await fetch("/api/settings", { cache: "no-store" });
			const settingsData = settingsRes.ok ? await settingsRes.json() : {};
			const current = settingsData.providerThinking || {};
			const updated = { ...current };
			if (!mode || mode === "auto") {
				delete updated[providerId];
			} else {
				updated[providerId] = { mode };
			}
			const res = await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ providerThinking: updated }),
			});
			if (!res.ok) throw new Error("Failed to save thinking config");
		},
		onSuccess: () => {
			inv.settings();
		},
		onError: (error) => {
			console.log("Error saving thinking config:", error);
		},
	});

	const saveThinkingConfig = (mode) => {
		saveThinkingMutation.mutate(mode);
	};

	const handleThinkingModeChange = (mode) => {
		setThinkingMode(mode);
		saveThinkingConfig(mode);
	};

	const saveProviderDefaultProxy = async (proxyPoolId: string) => {
		setSavingProviderDefaultProxy(true);
		try {
			const patch: Record<string, any> = {};
			if (!proxyPoolId || proxyPoolId === "__none__") {
				patch[providerId] = null;
			} else {
				patch[providerId] = { proxyPoolId };
			}

			const res = await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ providerProxyDefaults: patch }),
			});
			if (!res.ok) throw new Error("Failed to save provider default proxy");

			setProviderDefaultProxyPoolId(proxyPoolId || "__none__");
			inv.settings();
			inv.providerDetail(providerId);
			notify.success(
				proxyPoolId && proxyPoolId !== "__none__"
					? "Provider default proxy saved"
					: "Provider default proxy cleared",
			);
		} catch (error: any) {
			notify.error(error?.message || "Failed to save provider default proxy");
		} finally {
			setSavingProviderDefaultProxy(false);
		}
	};

	const applyProviderDefaultToUnassignedAccounts = async () => {
		if (
			!providerDefaultProxyPoolId ||
			providerDefaultProxyPoolId === "__none__"
		) {
			notify.warning("Set a provider default proxy pool first");
			return;
		}

		const unassignedConnections = connections.filter(
			(connection) => !connection.providerSpecificData?.proxyPoolId,
		);
		if (unassignedConnections.length === 0) {
			notify.success(
				"All accounts already have an explicit proxy override or inherit automatically",
			);
			return;
		}

		const confirmed = confirm(
			`This will set an explicit proxy override on ${unassignedConnections.length} account(s). They will no longer inherit the provider default automatically. Continue?`,
		);
		if (!confirmed) return;

		setBulkUpdatingProxy(true);
		try {
			const results = await Promise.all(
				unassignedConnections.map((connection) =>
					fetch(`/api/providers/${connection.id}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ proxyPoolId: providerDefaultProxyPoolId }),
					}),
				),
			);
			const failedCount = results.filter((res) => !res.ok).length;
			if (failedCount > 0) {
				throw new Error(`Updated with ${failedCount} failed request(s).`);
			}
			await fetchConnections();
			inv.providers();
			inv.providerDetail(providerId);
			notify.success(
				`Applied provider proxy to ${unassignedConnections.length} account(s)`,
			);
		} catch (error: any) {
			notify.error(error?.message || "Failed to apply provider default proxy");
		} finally {
			setBulkUpdatingProxy(false);
		}
	};

	const removeProviderProxyFromAllAccounts = async () => {
		const connectionsUsingAnyProxy = connections.filter(
			(connection) => !!connection.providerSpecificData?.proxyPoolId,
		);
		const totalAffected =
			connectionsUsingAnyProxy.length +
			(providerDefaultProxyPoolId !== "__none__" ? 1 : 0);

		if (totalAffected === 0) {
			notify.success("No provider proxy configuration to remove");
			return;
		}

		const confirmed = confirm(
			`This will clear the provider default proxy and remove per-account proxy overrides from ${connectionsUsingAnyProxy.length} account(s). Continue?`,
		);
		if (!confirmed) return;

		setBulkUpdatingProxy(true);
		try {
			const patch: Record<string, any> = { [providerId]: null };
			const settingsRes = await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ providerProxyDefaults: patch }),
			});
			if (!settingsRes.ok) {
				throw new Error("Failed to clear provider default proxy");
			}

			const results = await Promise.all(
				connectionsUsingAnyProxy.map((connection) =>
					fetch(`/api/providers/${connection.id}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ proxyPoolId: null }),
					}),
				),
			);
			const failedCount = results.filter((res) => !res.ok).length;
			if (failedCount > 0) {
				throw new Error(`Removed with ${failedCount} failed request(s).`);
			}

			setProviderDefaultProxyPoolId("__none__");
			await fetchConnections();
			inv.settings();
			inv.providers();
			inv.providerDetail(providerId);
			notify.success(
				`Removed proxy configuration from ${connectionsUsingAnyProxy.length} account(s) and cleared provider default`,
			);
		} catch (error: any) {
			notify.error(
				error?.message || "Failed to remove provider proxy from all accounts",
			);
		} finally {
			setBulkUpdatingProxy(false);
		}
	};

	// Queries with enabled: !!providerId already fetch on mount — no manual refetch needed.

	// Fetch suggested models from provider's public API (if configured)
	useEffect(() => {
		const fetcher = (
			OAUTH_PROVIDERS[providerId] ||
			APIKEY_PROVIDERS[providerId] ||
			FREE_PROVIDERS[providerId] ||
			FREE_TIER_PROVIDERS[providerId]
		)?.modelsFetcher;
		if (!fetcher) return;
		fetchSuggestedModels(fetcher).then(setSuggestedModels);
	}, [providerId]);

	const setAliasMutation = useMutation({
		retry: false,
		mutationFn: async ({
			fullModel,
			alias,
		}: {
			fullModel: string;
			alias: string;
		}) => {
			const res = await fetch("/api/models/alias", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: fullModel, alias }),
			});
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Failed to set alias");
			}
		},
		onSuccess: () => {
			modelAliasesQuery.refetch();
			inv.modelAliases();
		},
		onError: (error) => {
			alert(error.message);
		},
	});

	const handleSetAlias = (
		modelId,
		alias,
		providerAliasOverride = providerAlias,
	) => {
		setAliasMutation.mutate({
			fullModel: `${providerAliasOverride}/${modelId}`,
			alias,
		});
	};

	const deleteAliasMutation = useMutation({
		retry: false,
		mutationFn: async (alias: string) => {
			const res = await fetch(
				`/api/models/alias?alias=${encodeURIComponent(alias)}`,
				{ method: "DELETE" },
			);
			if (!res.ok) throw new Error("Failed to delete alias");
		},
		onSuccess: () => {
			modelAliasesQuery.refetch();
			inv.modelAliases();
		},
		onError: (error) => {
			console.log("Error deleting alias:", error);
		},
	});

	const handleDeleteAlias = (alias) => {
		deleteAliasMutation.mutate(alias);
	};

	const deleteConnectionMutation = useMutation({
		retry: false,
		mutationFn: async (id: string) => {
			const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Failed to delete connection");
			return id;
		},
		onSuccess: (id) => {
			setConnections((prev) => prev.filter((c) => c.id !== id));
			inv.allProviders(providerId);
		},
		onError: (error) => {
			console.log("Error deleting connection:", error);
		},
	});

	const handleDelete = (id) => {
		if (!confirm("Delete this connection?")) return;
		deleteConnectionMutation.mutate(id);
	};

	const buildConnectionAddedMessage = (connection) => {
		if (!connection) {
			return {
				level: "success",
				title: "Connection added",
				message: "Connection saved and validation started.",
			};
		}

		const label =
			connection.displayName ||
			connection.name ||
			connection.email ||
			connection.id ||
			"Connection";
		if (
			connection.reasonCode === "rate_limited" ||
			connection.reasonCode === "quota_exhausted" ||
			connection.quotaState === "cooldown" ||
			connection.quotaState === "exhausted"
		) {
			return {
				level: "warning",
				title: "Connection added",
				message: `${label} connected. Test passed, but the account is currently rate limited or cooling down.`,
			};
		}

		if (
			connection.reasonCode === "auth_invalid" ||
			connection.authState === "invalid"
		) {
			return {
				level: "warning",
				title: "Connection added with auth issue",
				message: `${label} was saved, but validation found an authentication issue.`,
			};
		}

		if (connection.reasonCode && connection.reasonCode !== "unknown") {
			return {
				level: "warning",
				title: "Connection added with warnings",
				message: `${label} was saved. Validation reported: ${connection.reasonDetail || connection.reasonCode}.`,
			};
		}

		return {
			level: "success",
			title: "Connection added",
			message: `${label} connected, tested, and usage synced.`,
		};
	};

	const showConnectionAddedNotification = (connection) => {
		const payload = buildConnectionAddedMessage(connection);
		notify[payload.level]?.(payload.message, payload.title);
	};

	const handleOAuthSuccess = (connection) => {
		fetchConnections();
		showConnectionAddedNotification(connection);
		setShowOAuthModal(false);
	};

	const handleIFlowCookieSuccess = (connection) => {
		fetchConnections();
		showConnectionAddedNotification(connection);
		setShowIFlowCookieModal(false);
	};

	const addConnectionMutation = useMutation({
		retry: false,
		mutationFn: async (formData: any) => {
			const res = await fetch("/api/providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: providerId, ...formData }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Failed to add connection");
			return data;
		},
		onSuccess: (data) => {
			fetchConnections();
			showConnectionAddedNotification(data.connection || null);
			inv.allProviders(providerId);
			setShowAddApiKeyModal(false);
		},
		onError: (error) => {
			notify.error(error?.message || "Failed to add connection");
		},
	});

	const handleSaveApiKey = (formData) => {
		if (isMorphManaged) {
			notify.warning("Morph Fast Models is managed in the Morph page");
			return;
		}
		addConnectionMutation.mutate(formData);
	};

	const updateConnectionMutation = useMutation({
		retry: false,
		mutationFn: async (formData: any) => {
			const res = await fetch(`/api/providers/${selectedConnection.id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(formData),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || "Failed to update connection");
			}
		},
		onSuccess: () => {
			fetchConnections();
			inv.providers();
			inv.providerDetail(providerId);
			setShowEditModal(false);
		},
		onError: (error) => {
			notify.error(error?.message || "Failed to update connection");
		},
	});

	const handleUpdateConnection = (formData) => {
		if (isMorphManaged) {
			notify.warning("Morph Fast Models is managed in the Morph page");
			return;
		}
		updateConnectionMutation.mutate(formData);
	};

	const syncModelsMutation = useMutation({
		retry: false,
		mutationFn: async (connectionId: string) => {
			const res = await fetch(
				`/api/providers/${connectionId}/sync-models?mode=import`,
				{ method: "POST" },
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok)
				throw new Error(data.error || "Failed to sync provider models");
			return data;
		},
		onSuccess: (data) => {
			setProviderModelsSyncNotice(
				`Synced ${data.syncedCount || 0} model${data.syncedCount === 1 ? "" : "s"} from live /models.`,
			);
			inv.providerModels();
			inv.providerDetail(providerId);
			fetchConnections();
		},
		onError: (error) => {
			setProviderModelsSyncError(
				error?.message || "Failed to sync provider models",
			);
		},
		onSettled: () => {
			setSyncingProviderModels(false);
		},
	});

	const handleSyncProviderModels = () => {
		const firstConnection = (connections || []).find(
			(conn) => conn.provider === providerId,
		);
		if (!firstConnection?.id) {
			setProviderModelsSyncError(
				"No active connection available for model sync.",
			);
			setProviderModelsSyncNotice("");
			return;
		}
		setSyncingProviderModels(true);
		setProviderModelsSyncError("");
		setProviderModelsSyncNotice("");
		syncModelsMutation.mutate(firstConnection.id);
	};

	const updateConnectionStatusMutation = useMutation({
		retry: false,
		mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
			const res = await fetch(`/api/providers/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isActive }),
			});
			if (!res.ok) throw new Error("Failed to update connection status");
			return { id, isActive };
		},
		onSuccess: ({ id, isActive }) => {
			setConnections((prev) =>
				prev.map((c) => (c.id === id ? { ...c, isActive } : c)),
			);
			inv.providers();
		},
		onError: (error) => {
			console.log("Error updating connection status:", error);
		},
	});

	const handleUpdateConnectionStatus = (id, isActive) => {
		if (isMorphManaged) {
			notify.warning("Morph Fast Models is managed in the Morph page");
			return;
		}
		updateConnectionStatusMutation.mutate({ id, isActive });
	};

	const selectedConnections = connections.filter((conn) =>
		normalizedSelectedConnectionIds.includes(conn.id),
	);
	const allSelected =
		connections.length > 0 &&
		normalizedSelectedConnectionIds.length === connections.length;

	const toggleSelectConnection = (connectionId) => {
		setSelectedConnectionIds((prev) =>
			prev.includes(connectionId)
				? prev.filter((id) => id !== connectionId)
				: [...prev, connectionId],
		);
	};

	const toggleSelectAllConnections = () => {
		if (allSelected) {
			setSelectedConnectionIds([]);
			return;
		}
		setSelectedConnectionIds(connections.map((conn) => conn.id));
	};

	const clearSelection = () => {
		setSelectedConnectionIds([]);
		setBulkProxyPoolId("__none__");
	};

	const selectedProxySummary = (() => {
		if (selectedConnections.length === 0) return "";
		const poolIds = new Set(
			selectedConnections.map(
				(conn) => conn.providerSpecificData?.proxyPoolId || "__none__",
			),
		);
		if (poolIds.size === 1) {
			const onlyId = [...poolIds][0];
			if (onlyId === "__none__") return "All selected currently unbound";
			const pool = proxyPools.find((p) => p.id === onlyId);
			return `All selected currently bound to ${pool?.name || onlyId}`;
		}
		return "Selected connections have mixed proxy bindings";
	})();

	const openBulkProxyModal = () => {
		if (selectedConnections.length === 0) return;
		const uniquePoolIds = [
			...new Set(
				selectedConnections.map(
					(conn) => conn.providerSpecificData?.proxyPoolId || "__none__",
				),
			),
		];
		setBulkProxyPoolId(
			uniquePoolIds.length === 1 ? uniquePoolIds[0] : "__none__",
		);
		setShowBulkProxyModal(true);
	};

	const closeBulkProxyModal = () => {
		if (bulkUpdatingProxy) return;
		setShowBulkProxyModal(false);
	};

	const bulkProxyMutation = useMutation({
		retry: false,
		mutationFn: async (args: {
			connectionIds: string[];
			proxyPoolId: string | null;
		}) => {
			const results: boolean[] = [];
			for (const connectionId of args.connectionIds) {
				try {
					const res = await fetch(`/api/providers/${connectionId}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ proxyPoolId: args.proxyPoolId }),
					});
					results.push(res.ok);
				} catch {
					results.push(false);
				}
			}
			const failedCount = results.filter((ok) => !ok).length;
			if (failedCount > 0)
				throw new Error(`Updated with ${failedCount} failed request(s).`);
		},
		onSuccess: () => {
			inv.providers();
			fetchConnections();
			clearSelection();
			setShowBulkProxyModal(false);
		},
		onError: (error) => {
			alert(error.message);
			inv.providers();
			fetchConnections();
			clearSelection();
			setShowBulkProxyModal(false);
		},
		onSettled: () => {
			setBulkUpdatingProxy(false);
		},
	});

	const handleBulkApplyProxyPool = () => {
		if (selectedConnectionIds.length === 0) return;
		setBulkUpdatingProxy(true);
		bulkProxyMutation.mutate({
			connectionIds: selectedConnectionIds,
			proxyPoolId: bulkProxyPoolId === "__none__" ? null : bulkProxyPoolId,
		});
	};

	const updateProxyMutation = useMutation({
		retry: false,
		mutationFn: async ({
			connectionId,
			proxyPoolId,
		}: {
			connectionId: string;
			proxyPoolId: string | null;
		}) => {
			const res = await fetch(`/api/providers/${connectionId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ proxyPoolId }),
			});
			if (!res.ok) throw new Error("Failed to update proxy");
			return { connectionId, proxyPoolId };
		},
		onSuccess: ({ connectionId, proxyPoolId }) => {
			setConnections((prev) =>
				prev.map((c) =>
					c.id === connectionId
						? {
								...c,
								providerSpecificData: {
									...c.providerSpecificData,
									proxyPoolId,
								},
							}
						: c,
				),
			);
			inv.providers();
		},
		onError: (error) => {
			console.log("Error updating proxy:", error);
		},
	});

	const isSelected = (connectionId) =>
		selectedConnectionIds.includes(connectionId);
	const handleSearchChange = (value) => {
		setCurrentPage(1);
		updateQueryParams({ searchQuery: value.trim() ? value : null });
	};

	const handleStatusFilterChange = (value) => {
		const nextValue = normalizeConnectionFilterStatus(value);
		setCurrentPage(1);
		updateQueryParams({ statusFilter: nextValue === "all" ? null : nextValue });
	};

	const handleAccountTypeFilterChange = (value) => {
		const nextValue = String(value || "all")
			.trim()
			.toLowerCase();
		setCurrentPage(1);
		updateQueryParams({
			accountTypeFilter: nextValue === "all" ? null : nextValue,
		});
	};

	const connectionsList = (
		<div className="flex flex-col gap-4">
			<div className="rounded-[4px] border border-border bg-card px-4 py-4 shadow-sm space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h3 className="text-base font-semibold text-foreground">
							{translate("Connections")}
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							{translate(
								"Search, reorder, and manage saved accounts for this provider.",
							)}
						</p>
					</div>
					<div className="text-sm text-muted-foreground">
						{totalConnections === 0
							? translate("No matching connections")
							: `${totalConnections} ${translate("matching connection")}${totalConnections === 1 ? "" : "s"}`}
					</div>
				</div>

				<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
					<Field>
						<FieldLabel htmlFor="connection-search">
							{translate("Search connections")}
						</FieldLabel>
						<div className="relative">
							<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<ShadcnInput
								id="connection-search"
								value={searchQuery}
								onChange={(e) => handleSearchChange(e.target.value)}
								placeholder={translate(
									"Search by name, email, provider, or id",
								)}
								className="min-w-0 pl-8"
							/>
						</div>
					</Field>

					<Field>
						<FieldLabel>{translate("Status filter")}</FieldLabel>
						<ShadcnSelect
							value={statusFilter}
							onValueChange={handleStatusFilterChange}
						>
							<SelectTrigger className="w-full lg:w-40">
								<SelectValue placeholder={translate("All statuses")} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{translate("All statuses")}</SelectItem>
								<SelectItem value="eligible">
									{translate("Eligible")}
								</SelectItem>
								<SelectItem value="exhausted">
									{translate("Exhausted")}
								</SelectItem>
								<SelectItem value="blocked">{translate("Blocked")}</SelectItem>
								<SelectItem value="disabled">
									{translate("Disabled")}
								</SelectItem>
								<SelectItem value="unknown">{translate("Unknown")}</SelectItem>
							</SelectContent>
						</ShadcnSelect>
					</Field>

					{availableAccountTypeOptions.length > 1 && (
						<Field>
							<FieldLabel>{translate("Account type")}</FieldLabel>
							<ShadcnSelect
								value={accountTypeFilter}
								onValueChange={handleAccountTypeFilterChange}
							>
								<SelectTrigger className="w-full lg:w-44">
									<SelectValue placeholder={translate("All account types")} />
								</SelectTrigger>
								<SelectContent>
									{availableAccountTypeOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</ShadcnSelect>
						</Field>
					)}
				</div>
			</div>

			<div className="flex flex-col divide-y divide-black/[0.03] dark:divide-white/[0.03] rounded-[4px] border border-black/5 dark:border-white/5 bg-[var(--color-surface)]">
				{paginatedConnections.map((conn) => {
					return (
						<div
							key={conn.id}
							className="flex items-stretch bg-[var(--color-surface)]"
						>
							<div className="flex-1 min-w-0">
								<ConnectionRow
									connection={conn}
									proxyPools={proxyPools}
									isOAuth={isOAuth}
									providerDefaultProxyPoolId={
										providerDefaultProxyPoolId !== "__none__"
											? providerDefaultProxyPoolId
											: undefined
									}
									onToggleActive={(isActive) =>
										handleUpdateConnectionStatus(conn.id, isActive)
									}
									onUpdateProxy={(proxyPoolId) => {
										updateProxyMutation.mutate({
											connectionId: conn.id,
											proxyPoolId: proxyPoolId || null,
										});
									}}
									onEdit={() => {
										setSelectedConnection(conn);
										setShowEditModal(true);
									}}
									onDelete={() => handleDelete(conn.id)}
								/>
							</div>
						</div>
					);
				})}
			</div>

			{totalConnections > 0 && (
				<Pagination
					className="mt-2"
					currentPage={visibleCurrentPage}
					pageSize={pageSize}
					totalItems={totalConnections}
					onPageChange={(page) =>
						setCurrentPage(Math.max(1, Math.min(page, totalPages)))
					}
					onPageSizeChange={(size) => {
						setPageSize(size);
						setCurrentPage(1);
					}}
				/>
			)}
		</div>
	);

	const bulkProxyOptions = [
		{ value: "__none__", label: translate("None") },
		...proxyPools.map((pool) => ({ value: pool.id, label: pool.name })),
	];

	const bulkHint =
		selectedConnectionIds.length === 0
			? translate("Select one or more connections, then click Proxy Action.")
			: selectedProxySummary;

	const canApplyBulkProxy =
		selectedConnectionIds.length > 0 && !bulkUpdatingProxy;

	const bulkActionModal = (
		<Dialog
			open={showBulkProxyModal}
			onOpenChange={(open) => !open && closeBulkProxyModal()}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{translate("Proxy Action")}</DialogTitle>
					<DialogDescription>
						{translate("Apply one proxy pool setting to selected connections.")}
					</DialogDescription>
				</DialogHeader>
				<Field>
					<FieldLabel>{translate("Proxy Pool")}</FieldLabel>
					<ShadcnSelect
						value={bulkProxyPoolId}
						onValueChange={setBulkProxyPoolId}
					>
						<SelectTrigger className="h-8 w-full">
							<SelectValue placeholder={translate("None")} />
						</SelectTrigger>
						<SelectContent>
							{bulkProxyOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</ShadcnSelect>
					<FieldDescription>{bulkHint}</FieldDescription>
					<FieldDescription>
						{translate(
							"Selecting None will unbind selected connections from proxy pool.",
						)}
					</FieldDescription>
				</Field>
				<DialogFooter>
					<Button
						onClick={closeBulkProxyModal}
						variant="ghost"
						disabled={bulkUpdatingProxy}
					>
						{translate("Cancel")}
					</Button>
					<Button
						onClick={handleBulkApplyProxyPool}
						disabled={!canApplyBulkProxy}
					>
						{bulkUpdatingProxy ? translate("Applying...") : translate("Apply")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);

	const handleTestModel = async (modelId) => {
		if (testingModelId) return;
		setTestingModelId(modelId);
		try {
			const modelRef = isMorphManaged
				? `morph/${modelId}`
				: `${providerStorageAlias}/${modelId}`;
			const res = await fetch("/api/models/test", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ model: modelRef }),
			});
			const data = await res.json();
			setModelTestResults((prev) => ({
				...prev,
				[modelId]: data.ok ? "ok" : "error",
			}));
			setModelsTestError(
				data.ok ? "" : data.error || translate("Model not reachable"),
			);
		} catch {
			setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
			setModelsTestError(translate("Network error"));
		} finally {
			setTestingModelId(null);
		}
	};

	const handleTestAllConnections = async () => {
		if (testingAllConnections) return;
		setTestingAllConnections(true);
		setTestAllResults(null);
		try {
			const res = await fetch("/api/providers/test-batch", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mode: "provider", providerId: providerId }),
			});
			const data = await res.json();
			setTestAllResults(data);
			// Refresh connections list to reflect updated statuses
			fetchConnections();
			inv.providers();
			const { summary } = data;
			if (summary?.failed > 0) {
				notify.warning(
					`${summary.passed} passed, ${summary.failed} failed out of ${summary.total} connections.`,
				);
			} else if (summary?.total > 0) {
				notify.success(`All ${summary.passed} connections tested OK.`);
			} else {
				notify.info("No connections to test.");
			}
		} catch {
			setTestAllResults(null);
			notify.error("Failed to test connections.");
		} finally {
			setTestingAllConnections(false);
		}
	};

	const renderModelsSection = () => {
		if (isCompatible) {
			return (
				<CompatibleModelsSection
					providerStorageAlias={providerStorageAlias}
					providerDisplayAlias={providerDisplayAlias}
					modelAliases={modelAliases}
					copied={copied}
					onCopy={copy}
					onSetAlias={handleSetAlias}
					onDeleteAlias={handleDeleteAlias}
					connections={connections}
					isAnthropic={isAnthropicCompatible}
				/>
			);
		}
		// Combine hardcoded models with Kilo free models (deduplicated)
		// Exclude non-llm models (embedding, tts, etc.) — they have dedicated pages under media-providers
		const displayModels = [
			...models,
			...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
		].filter((m) => !m.type || m.type === "llm");
		// Custom models added by user (stored as aliases: modelId → providerAlias/modelId)
		const customModels = Object.entries(modelAliases)
			.filter(([alias, rawFullModel]) => {
				const fullModel = String(rawFullModel || "");
				const prefix = `${providerStorageAlias}/`;
				if (!fullModel.startsWith(prefix)) return false;
				const modelId = fullModel.slice(prefix.length);
				// Only show if not already in hardcoded list
				// For passthroughModels, include all aliases (model IDs may contain slashes like "anthropic/claude-3")
				if (providerInfo.passthroughModels)
					return !models.some((m) => m.id === modelId);
				return !models.some((m) => m.id === modelId) && alias === modelId;
			})
			.map(([alias, rawFullModel]) => {
				const fullModel = String(rawFullModel || "");
				return {
					id: fullModel.slice(`${providerStorageAlias}/`.length),
					alias,
					fullModel,
				};
			});

		return (
			<div className="flex flex-wrap gap-3">
				{displayModels.map((model) => {
					const fullModel = `${providerStorageAlias}/${model.id}`;
					const oldFormatModel = `${providerId}/${model.id}`;
					const existingAlias = Object.entries(modelAliases).find(
						([, m]) => m === fullModel || m === oldFormatModel,
					)?.[0];
					return (
						<ModelRow
							key={model.id}
							model={model}
							fullModel={`${providerDisplayAlias}/${model.id}`}
							alias={existingAlias}
							copied={copied}
							onCopy={copy}
							onDeleteAlias={() => handleDeleteAlias(existingAlias)}
							testStatus={modelTestResults[model.id]}
							onTest={
								connections.length > 0 || isFreeNoAuth || isMorphManaged
									? () => handleTestModel(model.id)
									: undefined
							}
							isTesting={testingModelId === model.id}
							isCustom={false}
							isFree={model.isFree}
						/>
					);
				})}

				{/* Custom models inline */}
				{customModels.map((model) => (
					<ModelRow
						key={model.id}
						model={{ id: model.id }}
						fullModel={`${providerDisplayAlias}/${model.id}`}
						alias={model.alias}
						copied={copied}
						onCopy={copy}
						onDeleteAlias={() => handleDeleteAlias(model.alias)}
						testStatus={modelTestResults[model.id]}
						onTest={
							connections.length > 0 || isFreeNoAuth || isMorphManaged
								? () => handleTestModel(model.id)
								: undefined
						}
						isTesting={testingModelId === model.id}
						isCustom
						isFree={false}
					/>
				))}

				{/* Add model button — inline, same style as model chips */}
				<button
					onClick={() => setShowAddCustomModel(true)}
					className="flex cursor-pointer items-center gap-1.5 px-3 py-2 rounded-[4px] border border-dashed border-black/15 dark:border-white/15 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 transition-colors"
				>
					<AppIcon name="add" size={14} />
					Add Model
				</button>

				{/* Suggested models from provider API — show only models not yet added */}
				{suggestedModels.length > 0 &&
					(() => {
						const addedFullModels = new Set(Object.values(modelAliases));
						const hardcodedIds = new Set(models.map((m) => m.id));
						const notAdded = suggestedModels.filter(
							(m) =>
								!addedFullModels.has(`${providerStorageAlias}/${m.id}`) &&
								!hardcodedIds.has(m.id),
						);
						if (notAdded.length === 0) return null;
						return (
							<div className="w-full mt-2">
								<p className="text-xs text-[var(--color-text-muted)] mb-2">
									Suggested free models (≥200k context):
								</p>
								<div className="flex flex-wrap gap-2">
									{notAdded.map((m) => (
										<button
											key={m.id}
											onClick={async () => {
												const alias = m.id.split("/").pop();
												await handleSetAlias(m.id, alias, providerStorageAlias);
											}}
											className="flex cursor-pointer items-center gap-1 px-2.5 py-1.5 rounded-[4px] border border-black/10 dark:border-white/10 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 hover:bg-primary/5 transition-colors"
											title={`${m.name} · ${(m.contextLength / 1000).toFixed(0)}k ctx`}
										>
											<AppIcon name="add" size={13} />
											{m.id.split("/").pop()}
										</button>
									))}
								</div>
							</div>
						);
					})()}
			</div>
		);
	};

	if (loading) {
		return (
			<div className="flex flex-col gap-8">
				<ShadcnCard>
					<CardContent className="space-y-4">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-8 w-72" />
						<Skeleton className="h-20 w-full" />
					</CardContent>
				</ShadcnCard>
				<ShadcnCard>
					<CardContent className="space-y-4">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-8 w-72" />
						<Skeleton className="h-20 w-full" />
					</CardContent>
				</ShadcnCard>
			</div>
		);
	}

	if (!providerInfo) {
		return (
			<div className="text-center py-20">
				<p className="text-[var(--color-text-muted)]">
					{translate("Provider not found")}
				</p>
				<Link
					href="/app/providers"
					className="text-[var(--color-primary)] mt-4 inline-block"
				>
					{translate("Back to Providers")}
				</Link>
			</div>
		);
	}

	// Determine icon path: OpenAI Compatible providers use specialized icons
	const getHeaderIconPath = () => {
		if (isOpenAICompatible && providerInfo.apiType) {
			return providerInfo.apiType === "responses"
				? "/providers/oai-r.png"
				: "/providers/oai-cc.png";
		}
		if (isAnthropicCompatible) {
			return "/providers/anthropic-m.png";
		}
		if (providerInfo.id === "morph-fast") {
			return "/providers/morph-fast.svg";
		}
		// SVG-first fallback: prefer .svg if available, otherwise .png
		const ext = providerInfo.id === "commandcode" ? ".svg" : ".png";
		return `/providers/${providerInfo.id}${ext}`;
	};

	const nextQuotaResetLabel = quotaSummary.nextResetAt
		? new Date(quotaSummary.nextResetAt).toLocaleString()
		: null;

	return (
		<div className="flex flex-col gap-8">
			{/* Header */}
			<div>
				<Link
					href="/app/providers"
					className="inline-flex cursor-pointer items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors mb-4"
				>
					<ArrowLeft className="h-4 w-4" strokeWidth={2} />
					{translate("Back to Providers")}
				</Link>
				<div className="flex items-center gap-4">
					<div
						className="rounded-[4px] flex items-center justify-center"
						style={{ backgroundColor: `${providerInfo.color}15` }}
					>
						<ProviderIcon
							src={getHeaderIconPath()}
							alt={providerInfo.name}
							size={48}
							className="object-contain rounded-[4px] max-w-[48px] max-h-[48px]"
							fallbackText={
								providerInfo.textIcon ||
								providerInfo.id.slice(0, 2).toUpperCase()
							}
							fallbackColor={providerInfo.color}
						/>
					</div>
					<div>
						<h1 className="text-3xl font-semibold tracking-tight">
							{providerInfo.name}
						</h1>
						<p className="text-[var(--color-text-muted)]">
							{isMorphManaged
								? `${models.length} ${translate("public fast model")}${models.length === 1 ? "" : "s"}`
								: `${connections.length} ${translate("connection")}${connections.length === 1 ? "" : "s"}`}
						</p>
					</div>
				</div>
			</div>

			{providerInfo.deprecated && (
				<div className="flex items-center gap-2 px-3 py-2 rounded-[4px] bg-yellow-500/10 border border-yellow-500/30">
					<TriangleAlert
						className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500"
						strokeWidth={2}
					/>
					<p className="text-xs text-red-600 dark:text-yellow-400 leading-relaxed">
						{providerInfo.deprecationNotice}
					</p>
				</div>
			)}

			{providerInfo.notice && !providerInfo.deprecated && (
				<div className="flex items-center gap-2 px-3 py-2 rounded-[4px] bg-blue-500/10 border border-blue-500/30">
					<Info className="h-4 w-4 shrink-0 text-blue-500" strokeWidth={2} />
					<p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
						{providerInfo.notice.text}
					</p>
					{providerInfo.notice.apiKeyUrl && (
						<a
							href={providerInfo.notice.apiKeyUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="cursor-pointer text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded shrink-0 transition-colors"
						>
							Get API Key →
						</a>
					)}
				</div>
			)}

			{connections.length > 0 && !isMorphManaged && (
				<ShadcnCard className="overflow-hidden">
					<CardContent>
						<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div className="max-w-2xl">
								<Badge
									variant="default"
									className="uppercase tracking-[0.18em]"
								>
									<AppIcon name="donut_large" size={14} />
									Routing availability
								</Badge>
								<h2 className="mt-3 text-lg font-semibold text-foreground">
									Connection routing summary
								</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									This rolls up each connection&apos;s current routing status
									for this provider. Quota and cooldown signals are only shown
									when the connection is explicitly reporting them.
								</p>
							</div>

							<div className="min-w-[240px] rounded-[4px] border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
								<div className="flex items-center gap-2 font-medium text-foreground">
									<AppIcon name="schedule" size={16} className="text-primary" />
									Next quota retry/reset
								</div>
								<p className="mt-1 text-sm">
									{nextQuotaResetLabel || "No quota retry/reset scheduled"}
								</p>
							</div>
						</div>

						<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
							{quotaSummaryItems.map((item) => (
								<div
									key={item.key}
									className="rounded-[4px] border border-border bg-card/60 px-4 py-3"
								>
									<p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
										{item.label}
									</p>
									<p className={`mt-2 text-2xl font-semibold ${item.tone}`}>
										{item.value}
									</p>
								</div>
							))}
						</div>

						{quotaSummary.unknown > 0 && (
							<p className="mt-4 text-xs text-muted-foreground">
								{quotaSummary.unknown} connection
								{quotaSummary.unknown === 1 ? " is" : "s are"} still reporting
								unknown availability.
							</p>
						)}
					</CardContent>
				</ShadcnCard>
			)}

			{isMorphManaged && (
				<ShadcnCard>
					<CardContent>
						<div className="mb-4 flex items-center justify-between">
							<div>
								<h2 className="text-lg font-semibold">Managed in Morph</h2>
								<p className="text-sm text-muted-foreground">
									Morph Fast Models are visible here for discovery, testing, and
									usage correlation, but keys, base URL, rotation, and default
									code-aware instructions stay in the Morph page.
								</p>
							</div>
							<Button asChild size="sm" variant="secondary">
								<Link href="/app/morph">
									{translate("Open Morph")}
									<ArrowRightIcon data-icon className="size-4" />
								</Link>
							</Button>
						</div>
						<div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
							<Badge variant="default">{translate("Read-only")}</Badge>
							<Badge variant="default">{translate("System managed")}</Badge>
							<Badge variant="default">
								{translate("Morph page owns code-aware defaults")}
							</Badge>
							<Badge variant="default">
								{translate("/v1 chat, responses, embeddings, messages")}
							</Badge>
							<Badge variant="default">
								{translate("/morphllm native facade remains available")}
							</Badge>
						</div>
					</CardContent>
				</ShadcnCard>
			)}

			{isCompatible && providerNode && (
				<ShadcnCard>
					<CardContent>
						<div className="mb-4 flex items-center justify-between">
							<div>
								<h2 className="text-lg font-semibold">
									{isAnthropicCompatible
										? translate("Anthropic Compatible Details")
										: translate("OpenAI Compatible Details")}
								</h2>
								<p className="text-sm text-muted-foreground">
									{isAnthropicCompatible
										? translate("Messages API")
										: providerNode.apiType === "responses"
											? translate("Responses API")
											: translate("Chat Completions")}{" "}
									· {(providerNode.baseUrl || "").replace(/\/$/, "")}/
									{isAnthropicCompatible
										? translate("messages")
										: providerNode.apiType === "responses"
											? translate("responses")
											: translate("chat/completions")}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Button size="sm" onClick={() => setShowAddApiKeyModal(true)}>
									<PlusIcon data-icon className="size-4" />
									{translate("Add")}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={handleTestAllConnections}
									disabled={testingAllConnections || connections.length === 0}
								>
									{testingAllConnections ? (
										<Spinner className="size-4" />
									) : null}
									{testingAllConnections
										? translate("Testing...")
										: translate("Test All")}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={() => setShowEditNodeModal(true)}
								>
									<PencilIcon data-icon className="size-4" />
									{translate("Edit")}
								</Button>
								<Button
									size="sm"
									variant="destructive"
									onClick={async () => {
										if (
											!confirm(
												`${translate("Delete this")} ${isAnthropicCompatible ? translate("Anthropic") : translate("OpenAI")} ${translate("Compatible node?")}`,
											)
										)
											return;
										deleteNodeMutation.mutate();
									}}
								>
									<TrashIcon data-icon className="size-4" />
									Delete
								</Button>
							</div>
						</div>
						<p className="text-sm text-muted-foreground">
							{translate(
								"You can add multiple API keys to this compatible node. Routing priority and health determine failover order.",
							)}
						</p>
					</CardContent>
				</ShadcnCard>
			)}

			<ShadcnCard>
				<CardContent className="space-y-4">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="text-lg font-semibold">
									{translate("Provider Default Proxy")}
								</h2>
								<Badge
									variant={
										providerDefaultProxyPoolId !== "__none__"
											? "default"
											: "secondary"
									}
								>
									{providerDefaultProxyPoolId !== "__none__"
										? translate("enabled")
										: translate("inactive")}
								</Badge>
							</div>
							<p className="mt-1 text-sm text-muted-foreground">
								{translate(
									"Accounts without a per-account proxy override inherit this provider default automatically.",
								)}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<Badge variant="secondary">
								{
									connections.filter(
										(connection) =>
											!connection.providerSpecificData?.proxyPoolId,
									).length
								}{" "}
								{translate("inheriting")}
							</Badge>
							<Badge variant="secondary">
								{
									connections.filter(
										(connection) =>
											!!connection.providerSpecificData?.proxyPoolId,
									).length
								}{" "}
								{translate("overrides")}
							</Badge>
						</div>
					</div>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
						<Field>
							<FieldLabel>{translate("Default Proxy Pool")}</FieldLabel>
							<FieldDescription>
								{translate(
									"Per-account override always wins. Clearing an override returns the account to inheritance.",
								)}
							</FieldDescription>
							<ShadcnSelect
								value={providerDefaultProxyPoolId}
								onValueChange={(value) => {
									setProviderDefaultProxyPoolId(value);
									void saveProviderDefaultProxy(value);
								}}
								disabled={savingProviderDefaultProxy}
							>
								<SelectTrigger className="mt-2 w-full lg:max-w-[360px]">
									<SelectValue
										placeholder={translate("No provider default proxy")}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__none__">
										{translate("No provider default proxy")}
									</SelectItem>
									{proxyPools.map((pool) => (
										<SelectItem key={pool.id} value={pool.id}>
											{pool.name}
										</SelectItem>
									))}
								</SelectContent>
							</ShadcnSelect>
						</Field>

						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="secondary"
								onClick={() => void applyProviderDefaultToUnassignedAccounts()}
								disabled={
									bulkUpdatingProxy ||
									savingProviderDefaultProxy ||
									providerDefaultProxyPoolId === "__none__"
								}
							>
								{bulkUpdatingProxy
									? translate("Applying...")
									: translate("Apply to unassigned accounts")}
							</Button>
							<Button
								variant="destructive"
								onClick={() => void removeProviderProxyFromAllAccounts()}
								disabled={bulkUpdatingProxy || savingProviderDefaultProxy}
							>
								{bulkUpdatingProxy
									? translate("Removing...")
									: translate("Remove from all accounts")}
							</Button>
						</div>
					</div>
				</CardContent>
			</ShadcnCard>

			{/* Connections */}
			{isMorphManaged ? (
				<ShadcnCard>
					<CardContent>
						<div className="flex items-center gap-3">
							<div className="inline-flex size-10 items-center justify-center rounded-[4px] bg-pink-500/10 text-pink-500">
								<AppIcon name="bolt" size={20} />
							</div>
							<div>
								<p className="text-sm font-medium">
									{translate("Managed provider surface")}
								</p>
								<p className="text-xs text-muted-foreground">
									{translate(
										"This provider is mirrored from Morph settings and cannot be edited here. Status reflects the shared Morph key pool, not a normal provider connection count.",
									)}
								</p>
							</div>
						</div>
					</CardContent>
				</ShadcnCard>
			) : isFreeNoAuth ? (
				<ShadcnCard>
					<CardContent>
						<div className="flex items-center gap-3">
							<div className="inline-flex size-10 items-center justify-center rounded-[4px] bg-green-500/10 text-green-500">
								<AppIcon name="lock_open" size={20} />
							</div>
							<div>
								<p className="text-sm font-medium">
									{translate("No authentication required")}
								</p>
								<p className="text-xs text-muted-foreground">
									{translate("This provider is ready to use.")}
								</p>
							</div>
						</div>
					</CardContent>
				</ShadcnCard>
			) : (
				<ShadcnCard>
					<CardContent>
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-lg font-semibold">
								{translate("Connections")}
							</h2>
							<div className="flex items-center gap-4">
								{/* Round Robin toggle */}
								<div className="flex items-center gap-2">
									<span className="text-xs font-medium text-muted-foreground">
										{translate("Round Robin")}
									</span>
									<Switch
										checked={providerStrategy === "round-robin"}
										onToggle={handleRoundRobinToggle}
									/>
									{providerStrategy === "round-robin" && (
										<div className="flex items-center gap-1.5">
											<span className="text-xs text-muted-foreground">
												{translate("Sticky:")}
											</span>
											<ShadcnInput
												type="number"
												min={1}
												value={providerStickyLimit}
												onChange={(e) =>
													handleStickyLimitChange(e.target.value)
												}
												placeholder="1"
												className="h-8 w-14 px-2 py-1 text-xs"
											/>
										</div>
									)}
								</div>
							</div>
						</div>

						{connections.length === 0 ? (
							<Empty className="py-12">
								<EmptyMedia variant="icon">
									<AppIcon name={isOAuth ? "lock" : "key"} size={32} />
								</EmptyMedia>
								<EmptyHeader>
									<EmptyTitle>{translate("No connections yet")}</EmptyTitle>
									<EmptyDescription>
										{translate("Add your first connection to get started")}
									</EmptyDescription>
								</EmptyHeader>
								{!isCompatible && !isMorphManaged && (
									<div className="flex justify-center gap-2">
										{providerId === "iflow" && (
											<Button
												variant="secondary"
												onClick={() => setShowIFlowCookieModal(true)}
											>
												<CookieIcon data-icon className="size-4" />
												Cookie Auth
											</Button>
										)}
										<Button
											onClick={() =>
												isOAuth || providerId === "freebuff"
													? setShowOAuthModal(true)
													: setShowAddApiKeyModal(true)
											}
										>
											<PlusIcon data-icon className="size-4" />
											{providerId === "iflow"
												? translate("OAuth")
												: translate("Add Connection")}
										</Button>
									</div>
								)}
							</Empty>
						) : (
							<>
								{connectionsList}
								{!isCompatible && !isMorphManaged && (
									<div className="mt-4 flex gap-2">
										{providerId === "iflow" && (
											<Button
												size="sm"
												variant="secondary"
												onClick={() => setShowIFlowCookieModal(true)}
												title={translate("Add connection using browser cookie")}
											>
												<CookieIcon data-icon className="size-4" />
												Cookie
											</Button>
										)}
										<Button
											size="sm"
											onClick={() =>
												isOAuth || providerId === "freebuff"
													? setShowOAuthModal(true)
													: setShowAddApiKeyModal(true)
											}
										>
											<PlusIcon data-icon className="size-4" />
											{translate("Add")}
										</Button>
										<Button
											size="sm"
											variant="secondary"
											onClick={handleTestAllConnections}
											disabled={
												testingAllConnections || connections.length === 0
											}
										>
											{testingAllConnections ? (
												<Spinner className="size-4" />
											) : null}
											{testingAllConnections
												? translate("Testing...")
												: translate("Test All")}
										</Button>
									</div>
								)}
							</>
						)}
					</CardContent>
				</ShadcnCard>
			)}

			{/* Provider default instructions config */}
			{providerId === "codex" && <CodexInstructionsCard />}
			{providerId === "commandcode" && <CommandCodeInstructionsCard />}
			{providerId === "morph-fast" && <MorphInstructionsCard />}

			{/* Models */}
			<ShadcnCard>
				<CardContent>
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-lg font-semibold">
							{translate("Available Models")}
						</h2>
					</div>

					{!!modelsTestError && (
						<p className="mb-3 break-words text-xs text-red-500">
							{modelsTestError}
						</p>
					)}
					{!isCompatible && !isMorphManaged ? (
						<ModelsCard
							providerId={providerId}
							kindFilter="llm"
							providerModels={providerModels}
							syncingModels={syncingProviderModels}
							onSyncModels={
								connections.length > 0 ? handleSyncProviderModels : null
							}
							syncNotice={providerModelsSyncNotice}
							syncError={providerModelsSyncError}
						/>
					) : (
						renderModelsSection()
					)}
				</CardContent>
			</ShadcnCard>

			{bulkActionModal}

			{/* Modals */}
			{providerId === "kiro" || providerId === "amazon-q" ? (
				<KiroOAuthWrapper
					isOpen={showOAuthModal}
					providerInfo={{ ...providerInfo, id: providerId }}
					onSuccess={handleOAuthSuccess}
					onClose={() => setShowOAuthModal(false)}
				/>
			) : providerId === "freebuff" ? (
				<FreebuffAuthModal
					key={showOAuthModal ? "open" : "closed"}
					isOpen={showOAuthModal}
					onSuccess={handleOAuthSuccess}
					onClose={() => setShowOAuthModal(false)}
				/>
			) : providerId === "cursor" ? (
				<CursorAuthModal
					isOpen={showOAuthModal}
					onSuccess={handleOAuthSuccess}
					onClose={() => setShowOAuthModal(false)}
				/>
			) : providerId === "gitlab" ? (
				<GitLabAuthModal
					isOpen={showOAuthModal}
					providerInfo={providerInfo}
					onSuccess={handleOAuthSuccess}
					onClose={() => setShowOAuthModal(false)}
				/>
			) : (
				<OAuthModal
					isOpen={showOAuthModal}
					provider={providerId}
					providerInfo={providerInfo}
					onSuccess={handleOAuthSuccess}
					onClose={() => setShowOAuthModal(false)}
					oauthMeta={null}
					idcConfig={null}
				/>
			)}
			{providerId === "iflow" && (
				<IFlowCookieModal
					isOpen={showIFlowCookieModal}
					onSuccess={handleIFlowCookieSuccess}
					onClose={() => setShowIFlowCookieModal(false)}
				/>
			)}
			<AddApiKeyModal
				isOpen={showAddApiKeyModal}
				provider={providerId}
				providerName={providerInfo.name}
				isCompatible={isCompatible}
				isAnthropic={isAnthropicCompatible}
				authType={providerInfo?.authType}
				authHint={providerInfo?.authHint}
				website={providerInfo?.website}
				proxyPools={proxyPools}
				defaultProxyPoolId={
					providerDefaultProxyPoolId !== "__none__"
						? providerDefaultProxyPoolId
						: undefined
				}
				onSave={handleSaveApiKey}
				onClose={() => setShowAddApiKeyModal(false)}
			/>
			<EditConnectionModal
				isOpen={showEditModal}
				connection={selectedConnection}
				connections={connections}
				onSave={handleUpdateConnection}
				onClose={() => {
					fetchConnections();
					setShowEditModal(false);
				}}
			/>
			{isCompatible && (
				<EditCompatibleNodeModal
					isOpen={showEditNodeModal}
					node={providerNode}
					onSave={handleUpdateNode}
					onClose={() => setShowEditNodeModal(false)}
					isAnthropic={isAnthropicCompatible}
					providerId={providerId}
				/>
			)}
			{!isCompatible && (
				<AddCustomModelModal
					isOpen={showAddCustomModel}
					providerAlias={providerStorageAlias}
					providerDisplayAlias={providerDisplayAlias}
					onSave={async (modelId) => {
						// For passthrough providers (OpenRouter), use last segment as alias to avoid slash conflicts
						const alias = providerInfo?.passthroughModels
							? modelId.split("/").pop()
							: modelId;
						await handleSetAlias(modelId, alias, providerStorageAlias);
						setShowAddCustomModel(false);
					}}
					onClose={() => setShowAddCustomModel(false)}
				/>
			)}
		</div>
	);
}
