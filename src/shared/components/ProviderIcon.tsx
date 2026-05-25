"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import PropTypes from "prop-types";

const PNG_FIRST_PROVIDER_IDS = new Set(["codex", "github", "kiro", "opencode"]);
const SVG_FIRST_PROVIDER_IDS = new Set(["amazon-q"]);

function getProviderAssetBase(src) {
  if (!src) return "";

  return String(src)
    .toLowerCase()
    .replace(/^\/providers\//, "")
    .replace(/\.(png|svg|jpg|jpeg|webp)$/i, "")
    .replace(/^openai-compatible-.+$/, "oai-cc")
    .replace(/^anthropic-compatible-.+$/, "anthropic-m")
    .replace(/[^a-z0-9-_]/g, "");
}

function toProviderAssetPath(src, extension) {
  if (!src) return "";

  if (src.startsWith("/providers/")) {
    return src.replace(/\.(png|svg|jpg|jpeg|webp)$/i, extension);
  }

  const normalized = getProviderAssetBase(src);

  return normalized ? `/providers/${normalized}${extension}` : "";
}

export default function ProviderIcon({
  src,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const candidates = useMemo(() => {
    const normalized = getProviderAssetBase(src);
    const svgPath = toProviderAssetPath(src, ".svg");
    const pngPath = toProviderAssetPath(src, ".png");
    const preferredPaths = PNG_FIRST_PROVIDER_IDS.has(normalized)
      ? [pngPath, svgPath]
      : SVG_FIRST_PROVIDER_IDS.has(normalized)
        ? [svgPath, pngPath]
        : [src, svgPath, pngPath];

    return preferredPaths.filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index);
  }, [src]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const currentSrc = candidates[candidateIndex] || "";
  const exhausted = !currentSrc;

  const handleError = () => {
    setCandidateIndex((index) => index + 1);
  };

  if (exhausted) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-lg font-semibold ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: Math.max(10, Math.floor(size * 0.34)),
        }}
        aria-label={alt || undefined}
        title={alt || undefined}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt || ""}
      width={size}
      height={size}
      className={className}
      onError={handleError}
      unoptimized
    />
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
