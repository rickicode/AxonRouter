import { getMorphFastModels } from "@/shared/constants/models";

export type MorphModelsResponse = {
  object: "list";
  data: Array<{
    id: string;
    object: "model";
    created: number;
    owned_by: string;
    permission: unknown[];
    root: string;
    parent: null;
    name: string;
    context_window: number;
    modalities: string[];
  }>;
};

export function buildMorphModelsResponse(): MorphModelsResponse {
  const created = Math.floor(Date.now() / 1000);

  return {
    object: "list",
    data: getMorphFastModels().map((model) => ({
      id: model.id,
      object: "model",
      created,
      owned_by: model.owned_by,
      permission: [],
      root: model.id,
      parent: null,
      name: model.name,
      context_window: model.contextWindow,
      modalities: model.modalities,
    })),
  };
}
