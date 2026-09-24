export function getStatusVariant(isActive, effectiveStatus) {
  if (isActive === false) return "default";
  if (effectiveStatus === "active" || effectiveStatus === "success") return "success";
  if (effectiveStatus === "cooldown") return "warning";
  if (effectiveStatus === "exhausted" || effectiveStatus === "error" || effectiveStatus === "expired" || effectiveStatus === "unavailable" || effectiveStatus === "invalid") return "error";
  return "default";
}
