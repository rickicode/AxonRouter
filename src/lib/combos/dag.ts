function listComboRefs(combo) {
  const models = Array.isArray(combo?.models) ? combo.models : [];
  return models
    .filter((step) => step && typeof step === "object" && step.kind === "combo-ref" && typeof step.comboName === "string")
    .map((step) => step.comboName.trim())
    .filter(Boolean);
}

export function validateComboDAG(comboName: any, combos: any, options: any = {}) {
  const list = Array.isArray(combos) ? combos : [];
  // Use the combo's own config.maxComboDepth if available, otherwise fall back to options or default 10
  const targetCombo = list.find((c) => c?.name === comboName);
  const configuredDepth = Number(targetCombo?.config?.maxComboDepth);
  const maxDepth = Number.isFinite(configuredDepth) && configuredDepth >= 1
    ? Math.min(configuredDepth, 10)
    : (Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 10);
  const byName = new Map(
    list
      .filter((combo) => typeof combo?.name === "string" && combo.name.trim())
      .map((combo) => [combo.name.trim(), combo])
  );

  const seen = new Set();
  const stack = [];

  function visit(name: string, depth: number) {
    if (depth > maxDepth) {
      throw new Error(`Combo nesting exceeds max depth (${maxDepth}) at \"${name}\"`);
    }
    if (stack.includes(name)) {
      throw new Error(`Circular combo reference detected: ${[...stack, name].join(" -> ")}`);
    }
    if (seen.has(name)) return;

    const combo = byName.get(name);
    if (!combo) {
      throw new Error(`Referenced combo \"${name}\" does not exist`);
    }

    stack.push(name);
    for (const refName of listComboRefs(combo)) {
      visit(refName, depth + 1);
    }
    stack.pop();
    seen.add(name);
  }

  visit(comboName, 1);
  return true;
}
