function getCatalogModelId(model: any, fallbackId = "") {
  if (typeof model === "string") return model.trim();
  if (!model || typeof model !== "object" || Array.isArray(model)) return fallbackId;

  for (const key of ["id", "key", "model"]) {
    if (typeof model[key] === "string" && model[key].trim()) {
      return model[key].trim();
    }
  }

  return fallbackId;
}

export function buildCatalogModels(models: any) {
  if (Array.isArray(models)) {
    return models
      .map((model) => {
        const id = getCatalogModelId(model);
        if (!id) return null;

        return {
          id,
          name: typeof model?.name === "string" && model.name.trim() ? model.name.trim() : id,
          provider:
            typeof model?.provider === "string" && model.provider.trim()
              ? model.provider.trim()
              : id.split("/")[0] || "",
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  if (!models || typeof models !== "object") {
    return [];
  }

  return Object.keys(models)
    .map((key) => {
      const model = models[key];
      const id = getCatalogModelId(model, key);
      if (!id) return null;

      return {
        id,
        name: typeof model?.name === "string" && model.name.trim() ? model.name.trim() : id,
        provider:
          typeof model?.provider === "string" && model.provider.trim()
            ? model.provider.trim()
            : id.split("/")[0] || "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildPublicPreviewResponse(preview: any, modelCatalog: any) {
  const publicArtifacts = preview?.publicArtifacts ?? {};

  return {
    version: preview?.hash ?? "",
    opencode: publicArtifacts.opencode ?? null,
    ohMyOpencode: publicArtifacts.ohMyOpencode ?? null,
    ohMyOpenCodeSlim: publicArtifacts.ohMyOpenCodeSlim ?? null,
    catalogModels: buildCatalogModels(modelCatalog),
  };
}
