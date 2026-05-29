"use client";

import AppIcon from "@/shared/components/AppIcon";
import Image from "next/image";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { translate } from "@/i18n/runtime";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { MEDIA_PROVIDER_KINDS, AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers";
import { getModelsByProviderId } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import ConnectionsCard from "@/app/(dashboard)/app/providers/components/ConnectionsCard";
import ModelsCard from "@/app/(dashboard)/app/providers/components/ModelsCard";
import { TTS_PROVIDER_CONFIG } from "@/shared/constants/ttsProviders";
import { getTtsVoicesForModel } from "../../../../../../../open-sse/config/ttsModels";

// Shared row layout — defined outside components to avoid re-mount on re-render
function Row({ label, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-text-muted)] w-20 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const DEFAULT_TTS_RESPONSE_EXAMPLE = `// Audio will appear here after running.
// Example JSON response (response_format=json):
{
  "format": "mp3",
  "audio": "//NExAANaAIIAUAAANNNNNNNN..." // base64 encoded MP3
}`;

const DEFAULT_RESPONSE_EXAMPLE = `{
  "object": "list",
  "data": [{
    "object": "embedding",
    "index": 0,
    "embedding": [0.002301, -0.019212, 0.004815, -0.031249, ...]
  }],
  "model": "...",
  "usage": { "prompt_tokens": 9, "total_tokens": 9 }
}`;

// Config-driven example defaults per kind
const KIND_TIPS = {
  stt: [
    "Send real audio file in multipart form when using live endpoint.",
    "Prefer curated provider STT models if live model listing is empty.",
    "Optional fields like language and prompt can improve transcript quality.",
  ],
  tts: [
    "Model strings often combine TTS model and voice, depending on provider.",
    "Try JSON response mode when you need base64 audio for downstream tooling.",
    "If output fails, verify provider credentials and supported voice/model pairing.",
  ],
  image: [
    "Start with short prompt, then add style/detail iteratively.",
    "Check provider-specific params like size, quality, and background.",
    "If output fails, verify image model not disabled in provider models list.",
  ],
  webFetch: [
    "Use full canonical URL for more predictable fetch results.",
    "Compare providers if extraction quality differs on same page.",
    "Inspect raw response shape if markdown/text output looks incomplete.",
  ],
};

const KIND_EXAMPLE_CONFIG = {
  webSearch: {
    inputLabel: "Query",
    inputPlaceholder: "What is the latest news about AI?",
    defaultInput: "What is the latest news about AI?",
    bodyKey: "query",
    defaultResponse: `{\n  "results": [\n    { "title": "...", "url": "...", "snippet": "..." }\n  ]\n}`,
  },
  webFetch: {
    inputLabel: "URL",
    inputPlaceholder: "https://example.com",
    defaultInput: "https://example.com",
    bodyKey: "url",
    defaultResponse: `{\n  "content": "...",\n  "title": "...",\n  "url": "..."\n}`,
  },
  image: {
    inputLabel: "Prompt",
    inputPlaceholder: "A cute cat wearing a hat",
    defaultInput: "A cute cat wearing a hat",
    bodyKey: "prompt",
    defaultResponse: `{\n  "data": [\n    { "url": "...", "b64_json": "..." }\n  ]\n}`,
  },
  imageToText: {
    inputLabel: "Image URL",
    inputPlaceholder: "https://example.com/image.png",
    defaultInput: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
    bodyKey: "url",
    extraBody: { prompt: "Describe this image in detail" },
    defaultResponse: `{\n  "text": "A cat sitting on a windowsill...",\n  "model": "..."\n}`,
  },
  stt: {
    inputLabel: "Audio URL",
    inputPlaceholder: "https://example.com/audio.mp3",
    defaultInput: "",
    bodyKey: "url",
    defaultResponse: `{\n  "text": "Hello world...",\n  "model": "..."\n}`,
  },
  video: {
    inputLabel: "Prompt",
    inputPlaceholder: "A serene lake at sunset",
    defaultInput: "A serene lake at sunset",
    bodyKey: "prompt",
    defaultResponse: `{\n  "data": [\n    { "url": "..." }\n  ]\n}`,
  },
  music: {
    inputLabel: "Prompt",
    inputPlaceholder: "A calm piano melody",
    defaultInput: "A calm piano melody",
    bodyKey: "prompt",
    defaultResponse: `{\n  "data": [\n    { "url": "...", "format": "mp3" }\n  ]\n}`,
  },
};

// EmbeddingExampleCard
function EmbeddingExampleCard({ providerId }) {
  const providerAlias = getProviderAlias(providerId);
  const embeddingModels = getModelsByProviderId(providerId).filter((m) => m.type === "embedding");

  const [selectedModel, setSelectedModel] = useState(embeddingModels[0]?.id ?? "");
  const [input, setInput] = useState("The quick brown fox jumps over the lazy dog");
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/tunnels/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});
  }, []);

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";

  const curlSnippet = `curl -X POST ${endpoint}/v1/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '{"model": "${modelFull}", "input": "${input}"}'`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    const start = Date.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch("/v1/embeddings", {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelFull, input: input.trim() }),
      });
      const latencyMs = Date.now() - start;
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message || data?.error || `HTTP ${res.status}`); return; }
      setResult({ data, latencyMs });
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  // Compact embedding array: first 4 values + count
  const formatResultJson = (data) => {
    if (!data) return DEFAULT_RESPONSE_EXAMPLE;
    const clone = JSON.parse(JSON.stringify(data));
    (clone.data || []).forEach((item) => {
      if (Array.isArray(item.embedding) && item.embedding.length > 4) {
        item.embedding = [...item.embedding.slice(0, 4).map((v) => parseFloat(v.toFixed(6))), `... (${item.embedding.length} dims)`];
      }
    });
    return JSON.stringify(clone, null, 2);
  };

  const resultJson = result ? JSON.stringify(result.data, null, 2) : "";

  return (
    <Card><CardContent className="p-4">
      <h2 className="text-lg font-semibold mb-4">{translate("Example")}</h2>

      <div className="flex flex-col gap-2.5">
        {/* Model */}
        <Row label="Model">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
          >
            {embeddingModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
        </Row>

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex items-center gap-2">
            <input
              value={endpoint}
              onChange={(e) => useTunnel ? setTunnelEndpoint(e.target.value) : setLocalEndpoint(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
              placeholder="http://localhost:3000"
            />
            {/* Tunnel toggle — only show if tunnel URL is available */}
            {tunnelEndpoint && (
              <button
                onClick={() => setUseTunnel((v) => !v)}
                title={useTunnel ? "Using tunnel" : "Using local"}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border shrink-0 transition-colors cursor-pointer ${
                  useTunnel ? "border-[var(--color-primary)]/40 bg-primary/10 text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                }`}
              >
                <AppIcon name="wifi_tethering" size={14} />
                Tunnel
              </button>
            )}
          </div>
        </Row>

        {/* API Key */}
        <Row label="API Key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
          />
        </Row>

        {/* Input */}
        <Row label="Input">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-3 py-1.5 pr-7 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                <AppIcon name="close" size={14} />
              </button>
            )}
          </div>
        </Row>

        {/* Curl + Run */}
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{translate("Request")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyCurl(curlSnippet)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                <AppIcon name={copiedCurl ? "check" : "content_copy"} size={14} />
                {copiedCurl ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleRun}
                disabled={running || !input.trim() || !modelFull}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AppIcon name="play_arrow" size={14} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>
          <pre className="bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre">{curlSnippet}</pre>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-[var(--color-danger)] break-words">{error}</p>}

        {/* Response — default example or real result */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Response {result && <span className="font-normal normal-case">&#9889; {result.latencyMs}ms</span>}
            </span>
            {result && (
              <button
                onClick={() => copyRes(resultJson)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
              >
                <AppIcon name={copiedRes ? "check" : "content_copy"} size={14} />
                {copiedRes ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <pre className="bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre opacity-70">
            {formatResultJson(result?.data)}
          </pre>
        </div>
      </div>
    </CardContent></Card>
  );
}

// ─── TTS Example Card ────────────────────────────────────────────────────────
function TtsExampleCard({ providerId }) {
  const providerAlias = getProviderAlias(providerId);
  const config = TTS_PROVIDER_CONFIG[providerId] || TTS_PROVIDER_CONFIG["edge-tts"];

  // Voice state
  const [selectedVoice, setSelectedVoice]     = useState("");
  const [selectedVoiceName, setSelectedVoiceName] = useState("");
  const [voiceId, setVoiceId]               = useState(""); // editable voice id (elevenlabs)
  // Voices shown below Voice row after language selected
  const [countryVoices, setCountryVoices]     = useState([]);
  const [selectedLang, setSelectedLang]       = useState("");
  const [selectedModel, setSelectedModel]     = useState(() => {
    if (config.hasModelSelector && config.modelKey) {
      const models = getModelsByProviderId(config.modelKey);
      return models?.[0]?.id || "";
    }
    return "";
  });

  // Form state
  const [input, setInput]               = useState("Hello, this is a text to speech test.");
  const [apiKey, setApiKey]             = useState("");
  const [useTunnel, setUseTunnel]       = useState(false);
  const [localEndpoint]   = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [responseFormat, setResponseFormat] = useState("mp3"); // mp3 | json
  const [audioUrl, setAudioUrl]         = useState("");
  const [jsonResponse, setJsonResponse] = useState(null); // Store JSON response
  const [running, setRunning]           = useState(false);
  const [error, setError]               = useState("");
  const [latency, setLatency]           = useState(null);
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();

  // Country picker modal state
  const [modalOpen, setModalOpen]           = useState(false);
  const [languages, setLanguages]           = useState([]);
  const [modalLoading, setModalLoading]     = useState(false);
  const [modalSearch, setModalSearch]       = useState("");
  const [modalError, setModalError]         = useState("");
  const [byLang, setByLang]                 = useState({});

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/tunnels/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});

    // Pre-select default voice based on provider config
    if (config.voiceSource === "hardcoded") {
      const defaultModel = config.hasModelSelector && config.modelKey
        ? (getModelsByProviderId(config.modelKey)?.[0]?.id || "")
        : "";
      // Use per-model voices if available, else flat list
      const voices = (config.voicesPerModel && defaultModel)
        ? (getTtsVoicesForModel(providerId, defaultModel) || [])
        : getModelsByProviderId(config.voiceKey || providerId).filter((m) => m.type === "tts");
      if (voices.length) {
        const presetTimer = setTimeout(() => {
          if (config.hasBrowseButton) {
            // Google TTS: pre-select "en" (English) as default, show as single voice chip
            const defaultVoice = voices.find((v) => v.id === "en") || voices[0];
            setSelectedLang(defaultVoice.id);
            setSelectedVoice(defaultVoice.id);
            setSelectedVoiceName(defaultVoice.name);
            setCountryVoices([{ id: defaultVoice.id, name: defaultVoice.name }]);
          } else {
            // OpenAI/OpenRouter: set voice chips directly (no language picker)
            setCountryVoices(voices);
            setSelectedVoice(voices[0].id);
            setSelectedVoiceName(voices[0].name || voices[0].id);
          }
        }, 0);
        return () => clearTimeout(presetTimer);
      }
    }
    // api-language (edge-tts, local-device, elevenlabs): NO default load, wait for user to pick language
  }, [
    config.hasBrowseButton,
    config.hasModelSelector,
    config.modelKey,
    config.voiceKey,
    config.voiceSource,
    config.voicesPerModel,
    providerId,
  ]);

  // Update voices when model changes (voicesPerModel providers)
  useEffect(() => {
    if (!config.voicesPerModel || !selectedModel) return;
    const voices = getTtsVoicesForModel(providerId, selectedModel) || [];
    const syncTimer = setTimeout(() => {
      setCountryVoices(voices);
      if (voices.length) {
        setSelectedVoice(voices[0].id);
        setSelectedVoiceName(voices[0].name || voices[0].id);
      }
    }, 0);
    return () => clearTimeout(syncTimer);
  }, [selectedModel, config.voicesPerModel, providerId]);

  // Open modal — load language list
  const openModal = async () => {
    setModalOpen(true);
    setModalSearch("");
    setModalError("");
    if (languages.length) return; // already loaded
    setModalLoading(true);
    try {
      if (config.voiceSource === "hardcoded") {
        // Build languages/byLang from static providerModels data
        const voiceKey = config.voiceKey || providerId;
        const voices = getModelsByProviderId(voiceKey).filter((m) => m.type === "tts");
        const byLangMap: any = {};
        for (const v of voices) {
          if (!byLangMap[v.id]) byLangMap[v.id] = { code: v.id, name: v.name, voices: [{ id: v.id, name: v.name }] };
        }
        setByLang(byLangMap);
        setLanguages((Object.values(byLangMap) as any[]).sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""))));
      } else {
        // Use provider-specific apiEndpoint if available, else default to edge-tts voices API
        const url = config.apiEndpoint
          ? config.apiEndpoint
          : `/api/media-providers/tts/voices?provider=${providerId === "local-device" ? "local-device" : "edge-tts"}`;
        const r = await fetch(url);
        const d = await r.json();
        if (d.error) { setModalError(d.error); return; }
        setLanguages(d.languages || []);
        setByLang(d.byLang || {});
      }
    } catch (e) {
      setModalError(e.message);
    } finally {
      setModalLoading(false);
    }
  };

  // Click language → close modal → show voices below
  const handlePickLanguage = (lang) => {
    setModalOpen(false);
    setSelectedLang(lang.code);
    const voices = byLang[lang.code]?.voices || [];
    setCountryVoices(voices);
    // Auto-select first voice
    if (voices.length) {
      setSelectedVoice(voices[0].id);
      setSelectedVoiceName(voices[0].name);
      if (config.hasVoiceIdInput) setVoiceId(voices[0].id);
    }
  };

  const filteredLanguages = modalSearch
    ? languages.filter((c) =>
        c.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(modalSearch.toLowerCase())
      )
    : languages;

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  // For ElevenLabs: use voiceId (editable) instead of selectedVoice
  const activeVoiceId = config.hasVoiceIdInput ? voiceId : selectedVoice;
  const modelFull = config.hasModelSelector && activeVoiceId && selectedModel
    ? `${providerAlias}/${selectedModel}/${activeVoiceId}`
    : activeVoiceId ? `${providerAlias}/${activeVoiceId}` : "";

  const curlSnippet = `curl -X POST ${endpoint}/v1/audio/speech${responseFormat === "json" ? "?response_format=json" : ""} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '{"model": "${modelFull}", "input": "${input}"}' \\
  ${responseFormat === "json" ? "" : "--output speech.mp3"}`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setAudioUrl("");
    setJsonResponse(null);
    const start = Date.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const url = `/v1/audio/speech${responseFormat === "json" ? "?response_format=json" : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: modelFull, input: input.trim() }),
      });
      setLatency(Date.now() - start);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message || d?.error || `HTTP ${res.status}`);
        return;
      }
      
      if (responseFormat === "json") {
        const data = await res.json();
        setJsonResponse(data); // Store full JSON response
        const audioBlob = await fetch(`data:audio/mp3;base64,${data.audio}`).then(r => r.blob());
        setAudioUrl(URL.createObjectURL(audioBlob));
      } else {
        const blob = await res.blob();
        setAudioUrl(URL.createObjectURL(blob));
      }
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Card><CardContent className="p-4">
        <h2 className="text-lg font-semibold mb-4">{translate("Example")}</h2>

        <div className="flex flex-col gap-2.5">
          {/* Endpoint + API Key as read-only text */}
          <Row label="Endpoint">
            <div className="flex items-center gap-2">
              <span className="flex-1 px-3 py-1.5 text-sm font-mono text-[var(--color-text-main)] bg-[var(--color-sidebar)] rounded truncate">
                {endpoint}/v1/audio/speech
              </span>
              {tunnelEndpoint && (
                <button
                  onClick={() => setUseTunnel((v) => !v)}
                  title={useTunnel ? "Using tunnel" : "Using local"}
                  className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border shrink-0 transition-colors ${
                    useTunnel ? "border-[var(--color-primary)]/40 bg-primary/10 text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                  }`}
                >
                  <AppIcon name="wifi_tethering" size={14} />
                  Tunnel
                </button>
              )}
            </div>
          </Row>
          <Row label="API Key">
            <span className="px-3 py-1.5 text-sm font-mono text-[var(--color-text-main)] bg-[var(--color-sidebar)] rounded truncate block">
              {apiKey ? `${apiKey.slice(0, 8)}${"•".repeat(Math.min(20, apiKey.length - 8))}` : <span className="text-[var(--color-text-muted)] italic">{translate("No key configured")}</span>}
            </span>
          </Row>

          {/* Model selector (OpenAI, ElevenLabs) */}
          {config.hasModelSelector && config.modelKey && (
            <Row label="Model">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
              >
                {(getModelsByProviderId(config.modelKey) || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            </Row>
          )}

          {/* Language row + Browse button (edge-tts, local-device, elevenlabs) */}
          {config.hasBrowseButton && (
            <Row label="Language">
              <div className="flex items-center gap-2">
                <button
                  onClick={openModal}
                  className="flex-1 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] font-mono truncate text-left hover:border-[var(--color-primary)]/40 transition-colors"
                >
                  {selectedLang
                    ? <span className="text-[var(--color-text-main)]">{languages.find((l) => l.code === selectedLang)?.name || selectedLang}</span>
                    : <span className="text-[var(--color-text-muted)]">{translate("No language selected")}</span>}
                </button>
                <button
                  onClick={openModal}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 transition-colors shrink-0"
                >
                  <AppIcon name="language" size={14} />
                  Select language
                </button>
              </div>
            </Row>
          )}

          {/* Voice chips — shown after language picked (edge-tts, local-device) or always (OpenAI/ElevenLabs) */}
          {countryVoices.length > 0 && (
            <Row label="Voice">
              <div className="flex flex-wrap gap-1.5">
                {countryVoices.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVoice(v.id);
                      setSelectedVoiceName(v.name);
                      if (config.hasVoiceIdInput) setVoiceId(v.id);
                    }}
                    className={`px-2.5 py-1 rounded-[4px] text-xs border transition-colors ${
                      selectedVoice === v.id
                        ? "bg-primary/15 border-[var(--color-primary)]/40 text-[var(--color-primary)] font-medium"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40"
                    }`}
                  >
                    {v.name}{v.gender ? ` · ${v.gender[0].toUpperCase()}` : ""}
                    {v.free_users_allowed === true && (
                      <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]/20">{translate("Free")}</span>
                    )}
                    {v.free_users_allowed === false && (
                      <span className="ml-1.5 px-1 py-0.5 text-[9px] font-semibold rounded bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/20">{translate("Paid")}</span>
                    )}
                  </button>
                ))}
              </div>
            </Row>
          )}

          {/* Voice ID input (ElevenLabs) — manual entry or auto-fill from chip */}
          {config.hasVoiceIdInput && (
            <Row label="Voice ID">
              <div className="flex flex-col gap-1">
                <div className="relative">
                  <input
                    value={voiceId}
                    onChange={(e) => {
                      setVoiceId(e.target.value);
                      setSelectedVoice(e.target.value);
                    }}
                    placeholder="e.g. CwhRBWXzGAHq8TQ4Fs17"
                    className="w-full px-3 py-1.5 pr-7 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)] font-mono"
                  />
                  {voiceId && (
                    <button
                      type="button"
                      onClick={() => { setVoiceId(""); setSelectedVoice(""); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                    >
                      <AppIcon name="close" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </Row>
          )}

          {/* Google TTS: Language dropdown */}
          {config.hasLanguageDropdown && (
            <Row label="Language">
              <select
                value={selectedVoice}
                onChange={(e) => {
                  const m = getModelsByProviderId(providerId).filter((m) => m.type === "tts").find((m) => m.id === e.target.value);
                  setSelectedVoice(e.target.value);
                  setSelectedVoiceName(m?.name || e.target.value);
                }}
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
              >
                {getModelsByProviderId(providerId).filter((m) => m.type === "tts").map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            </Row>
          )}

          {/* Input */}
          <Row label="Input">
            <div className="relative">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full px-3 py-1.5 pr-7 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                >
                  <AppIcon name="close" size={14} />
                </button>
              )}
            </div>
          </Row>

          {/* Output Format */}
          <Row label="Output Format">
            <select
              value={responseFormat}
              onChange={(e) => setResponseFormat(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
            >
              <option value="mp3">{translate("MP3 (Binary)")}</option>
              <option value="json">{translate("JSON (Base64)")}</option>
            </select>
          </Row>

          {/* Curl + Run */}
          <div className="mt-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{translate("Request")}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyCurl(curlSnippet)}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                >
                  <AppIcon name={copiedCurl ? "check" : "content_copy"} size={14} />
                  {copiedCurl ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={handleRun}
                  disabled={running || !input.trim() || !modelFull}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AppIcon name="play_arrow" size={14} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
                  {running ? "Generating..." : "Run"}
                </button>
              </div>
            </div>
            <pre className="bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre">{curlSnippet}</pre>
          </div>

          {error && <p className="text-xs text-[var(--color-danger)] break-words">{error}</p>}

          {/* Audio player */}
          {audioUrl ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  Response {latency && <span className="font-normal normal-case">&#9889; {latency}ms</span>}
                </span>
                <a href={audioUrl} download="speech.mp3" className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
                  <AppIcon name="download" size={14} />
                  Download
                </a>
              </div>
              <audio controls src={audioUrl} className="w-full" />
              
              {/* JSON Response (if format is json) */}
              {jsonResponse && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{translate("JSON Response")}</span>
                  </div>
                  <pre className="bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify({
                      format: jsonResponse.format,
                      audio: jsonResponse.audio ? `${jsonResponse.audio.substring(0, 100)}...` : ""
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div>
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{translate("Response")}</span>
            <pre className="mt-1.5 bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre opacity-50">{DEFAULT_TTS_RESPONSE_EXAMPLE}</pre>
          </div>
          )}
        </div>
      </CardContent></Card>

      {/* Country Picker Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="border border-[var(--color-border)] rounded w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
            style={{ backgroundColor: "var(--color-bg)", isolation: "isolate" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] shrink-0 rounded-t">
              <h3 className="text-sm font-semibold">{translate("Select Language")}</h3>
              <button onClick={() => setModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer">
                <AppIcon name="close" size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-2.5 border-b border-[var(--color-border)] shrink-0">
              <input
                autoFocus
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Search language..."
                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            {/* Language list */}
            <div className="overflow-y-auto flex-1 p-2">
              {modalError && <p className="text-xs text-[var(--color-danger)] px-2 py-1">{modalError}</p>}
              {modalLoading ? (
                <p className="text-xs text-[var(--color-text-muted)] px-2 py-3">{translate("Loading...")}</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filteredLanguages.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => handlePickLanguage(c)}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded text-left hover:bg-[var(--color-sidebar)] transition-colors cursor-pointer ${
                        selectedLang === c.code ? "bg-primary/10 text-[var(--color-primary)]" : ""
                      }`}
                    >
                      <span className="text-sm">{c.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-[var(--color-text-muted)]">{c.voices.length} voices</span>
                        {selectedLang === c.code && (
                          <AppIcon name="check" size={16} className="text-[var(--color-primary)]" />
                        )}
                      </div>
                    </button>
                  ))}
                  {filteredLanguages.length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)] px-2 py-3">{translate("No languages found.")}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Generic Example Card — config-driven for webSearch, webFetch, image, imageToText, stt, video, music
function GenericExampleCard({ providerId, kind }) {
  const providerAlias = getProviderAlias(providerId);
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const exConfig = KIND_EXAMPLE_CONFIG[kind];

  // Get models for this kind (e.g., type="image")
  const kindModels = getModelsByProviderId(providerId).filter((m) => m.type === kind);
  const [selectedModel, setSelectedModel] = useState(kindModels[0]?.id ?? "");

  const [input, setInput] = useState(exConfig?.defaultInput || "");
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/tunnels/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});
  }, []);

  if (!kindConfig || !exConfig) return null;

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const apiPath = kindConfig.endpoint.path;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";

  const requestBody = {
    model: modelFull,
    [exConfig.bodyKey]: input,
    ...exConfig.extraBody,
  };

  const curlSnippet = `curl -X ${kindConfig.endpoint.method} ${endpoint}${apiPath} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '${JSON.stringify(requestBody)}'`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    const start = Date.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const body = { ...requestBody, model: modelFull };
      const res = await fetch(`/api${apiPath}`, {
        method: kindConfig.endpoint.method,
        headers,
        body: JSON.stringify(body),
      });
      const latencyMs = Date.now() - start;
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message || data?.error || `HTTP ${res.status}`); return; }
      setResult({ data, latencyMs });
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  const resultJson = result ? JSON.stringify(result.data, null, 2) : "";

  return (
    <Card><CardContent className="p-4">
      <h2 className="text-lg font-semibold mb-4">{translate("Example")}</h2>
      <div className="flex flex-col gap-2.5">
        {/* Model selector - only show if models available */}
        {kindModels.length > 0 && (
          <Row label="Model">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
            >
              {kindModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          </Row>
        )}

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex items-center gap-2">
            <span className="flex-1 px-3 py-1.5 text-sm font-mono text-[var(--color-text-main)] bg-[var(--color-sidebar)] rounded truncate">
              {endpoint}{apiPath}
            </span>
            {tunnelEndpoint && (
              <button
                onClick={() => setUseTunnel((v) => !v)}
                title={useTunnel ? "Using tunnel" : "Using local"}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border shrink-0 transition-colors ${
                  useTunnel ? "border-[var(--color-primary)]/40 bg-primary/10 text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                }`}
              >
                <AppIcon name="wifi_tethering" size={14} />
                Tunnel
              </button>
            )}
          </div>
        </Row>

        {/* API Key */}
        <Row label="API Key">
          <span className="px-3 py-1.5 text-sm font-mono text-[var(--color-text-main)] bg-[var(--color-sidebar)] rounded truncate block">
            {apiKey ? `${apiKey.slice(0, 8)}${"\u2022".repeat(Math.min(20, apiKey.length - 8))}` : <span className="text-[var(--color-text-muted)] italic">{translate("No key configured")}</span>}
          </span>
        </Row>

        {/* Input */}
        <Row label={exConfig.inputLabel}>
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={exConfig.inputPlaceholder}
              className="w-full px-3 py-1.5 pr-7 text-sm border border-[var(--color-border)] rounded bg-[var(--color-input-bg)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
              >
                <AppIcon name="close" size={14} />
              </button>
            )}
          </div>
        </Row>

        {/* Curl + Run */}
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{translate("Request")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyCurl(curlSnippet)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
              >
                <AppIcon name={copiedCurl ? "check" : "content_copy"} size={14} />
                {copiedCurl ? "Copied" : "Copy"}
              </button>
            <button
              onClick={handleRun}
              disabled={running || !input.trim() || !modelFull}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <AppIcon name="play_arrow" size={14} style={running ? { animation: "spin 1s linear infinite" } : undefined} />
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>
          <pre className="bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre">{curlSnippet}</pre>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-[var(--color-danger)] break-words">{error}</p>}

        {/* Response */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Response {result && <span className="font-normal normal-case">&#9889; {result.latencyMs}ms</span>}
            </span>
            {result && (
              <button
                onClick={() => copyRes(resultJson)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
              >
                <AppIcon name={copiedRes ? "check" : "content_copy"} size={14} />
                {copiedRes ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <pre className="bg-[var(--color-sidebar)] rounded px-3 py-2.5 text-xs font-mono text-[var(--color-text-main)] overflow-x-auto whitespace-pre opacity-70">
            {result ? resultJson : exConfig.defaultResponse}
          </pre>
          {kind === "image" && result?.data?.data?.[0] && (
            <Image
              src={result.data.data[0].b64_json ? `data:image/png;base64,${result.data.data[0].b64_json}` : result.data.data[0].url}
              alt="Generated"
              width={1024}
              height={1024}
              unoptimized
              className="max-w-full rounded border border-[var(--color-border)] mt-2"
            />
          )}
        </div>
      </div>
    </CardContent></Card>
  );
}

// MediaProviderDetailPage
export default function MediaProviderDetailPage() {
  const params: any = useParams();
  const kind = String(Array.isArray(params?.kind) ? params.kind[0] : params?.kind || "");
  const id = String(Array.isArray(params?.id) ? params.id[0] : params?.id || "");
  const kindConfig = MEDIA_PROVIDER_KINDS.find((k) => k.id === kind);
  const provider: any = AI_PROVIDERS[id];
  const kinds = provider?.serviceKinds ?? ["llm"];
  const [modelListingWarning, setModelListingWarning] = useState("");
  const [disabledModelCount, setDisabledModelCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadModelState = async () => {
      try {
        const [providersRes, disabledRes] = await Promise.all([
          fetch("/api/providers", { cache: "no-store" }),
          fetch(`/api/models/disabled?providerAlias=${encodeURIComponent(getProviderAlias(id))}`, { cache: "no-store" }),
        ]);
        if (disabledRes.ok) {
          const disabledData = await disabledRes.json().catch(() => ({}));
          if (!cancelled) setDisabledModelCount(Array.isArray(disabledData.ids) ? disabledData.ids.length : 0);
        }
        if (!providersRes.ok) return;
        const providersData = await providersRes.json();
        const firstConnection = (providersData.connections || []).find((conn) => conn.provider === id);
        if (!firstConnection?.id) return;

        const modelsRes = await fetch(`/api/providers/${firstConnection.id}/models`, { cache: "no-store" });
        const modelsData = await modelsRes.json().catch(() => ({}));
        if (!cancelled && modelsRes.ok && typeof modelsData.warning === "string") {
          setModelListingWarning(modelsData.warning);
        }
      } catch {
        if (!cancelled) {
          setModelListingWarning("");
          setDisabledModelCount(0);
        }
      }
    };

    if (!provider?.noAuth) loadModelState();
    else {
      const resetTimer = setTimeout(() => {
        setModelListingWarning("");
        setDisabledModelCount(0);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    return () => {
      cancelled = true;
    };
  }, [id, provider?.noAuth]);

  if (!kindConfig) return notFound();
  if (!provider) return notFound();
  if (!kinds.includes(kind)) return notFound();

  return (
    <div className="flex flex-col gap-8">
      {/* Back */}
      <div>
        <Link
          href={`/app/media-providers/${kind}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          {kindConfig.label}
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="size-12 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${provider.color}15` }}>
            <ProviderIcon
              src={provider.id}
              alt={provider.name}
              size={48}
              className="object-contain rounded max-w-[48px] max-h-[48px]"
              fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
              fallbackColor={provider.color}
            />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{provider.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {kinds.map((k) => (
                <Badge key={k} variant={k === kind ? "default" : "secondary"}>
                  {k.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Connections */}
      {provider.noAuth ? (
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-[4px] bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <AppIcon name="lock_open" size={20} />
            </div>
            <div>
              <p className="text-sm font-medium">{translate("No authentication required")}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{translate("This provider is ready to use.")}</p>
            </div>
          </div>
        </CardContent></Card>
      ) : (
        <ConnectionsCard providerId={id} isOAuth={false} />
      )}

      <Card><CardContent className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-[4px] bg-primary/10 text-[var(--color-primary)] shrink-0">
              <AppIcon name="tune" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{translate("Setup Snapshot")}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Key endpoint and routing details for {provider.name} {kindConfig.label.toLowerCase()} requests.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{translate("Endpoint")}</div>
              <p className="mt-1 text-sm font-mono text-[var(--color-text-main)] break-all">{kindConfig.endpoint.method} {kindConfig.endpoint.path}</p>
            </div>
            <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{translate("Provider Alias")}</div>
              <p className="mt-1 text-sm font-mono text-[var(--color-text-main)]">{getProviderAlias(id)}</p>
            </div>
            <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{translate("Auth")}</div>
              <p className="mt-1 text-sm text-[var(--color-text-main)]">{provider.noAuth ? translate("No auth required") : translate("Dashboard connection required")}</p>
            </div>
            <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{translate("Disabled Models")}</div>
              <p className="mt-1 text-sm text-[var(--color-text-main)]">{disabledModelCount}</p>
            </div>
          </div>
        </div>
      </CardContent></Card>

      {(provider.notice || provider.website) ? (
        <Card><CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-[4px] bg-primary/10 text-[var(--color-primary)] shrink-0">
                <AppIcon name="info" size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{translate("Provider Notes")}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Quick links and setup notes for {provider.name} {kindConfig.label.toLowerCase()} usage.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {provider.notice?.text ? (
                <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{translate("Notice")}</div>
                  <p className="mt-1 text-sm text-[var(--color-text-main)] whitespace-pre-wrap">{provider.notice.text}</p>
                </div>
              ) : null}

              <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3 flex flex-col gap-2">
                {provider.website ? (
                  <a
                    href={provider.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline break-all"
                  >
                    <AppIcon name="open_in_new" size={16} />
                    {translate("Provider website")}
                  </a>
                ) : null}
                {provider.notice?.apiKeyUrl ? (
                  <a
                    href={provider.notice.apiKeyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline break-all"
                  >
                    <AppIcon name="key" size={16} />
                    {translate("Get API key")}
                  </a>
                ) : null}
                {!provider.website && !provider.notice?.apiKeyUrl ? (
                  <p className="text-sm text-[var(--color-text-muted)]">{translate("No external links provided for this provider.")}</p>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent></Card>
      ) : null}

      {modelListingWarning ? (
        <Card><CardContent className="p-4">
          <div className="flex items-start gap-3 rounded-[4px] border border-[var(--color-warning)]/20 bg-[color:color-mix(in_srgb,var(--color-warning)_8%,transparent)] px-4 py-3 text-sm text-[var(--color-text-main)]">
            <AppIcon name="warning" size={20} className="text-[var(--color-warning)] shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{translate("Curated Model Fallback Active")}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{modelListingWarning}</p>
            </div>
          </div>
        </CardContent></Card>
      ) : null}

      {(KIND_TIPS as any)[kind]?.length ? (
        <Card><CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-[4px] bg-primary/10 text-[var(--color-primary)] shrink-0">
                <AppIcon name="lightbulb" size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{translate("Request Tips")}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Practical notes for {kindConfig.label.toLowerCase()} requests on {provider.name}.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {(KIND_TIPS as any)[kind].map((tip: any) => (
                <div key={tip} className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-sidebar)]/40 px-4 py-3 text-sm text-[var(--color-text-main)]">
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </CardContent></Card>
      ) : null}

      {/* Models - only for non-tts kinds */}
      {kind !== "tts" && <ModelsCard providerId={id} kindFilter={kind} />}

      {/* Example — per kind */}
      {kind === "embedding" && <EmbeddingExampleCard providerId={id} />}
      {kind === "tts" && <TtsExampleCard providerId={id} />}
      {(KIND_EXAMPLE_CONFIG as any)[kind] && <GenericExampleCard providerId={id} kind={kind} />}
    </div>
  );
}
