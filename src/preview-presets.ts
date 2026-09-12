export interface PreviewPreset {
  id: string;
  name: string;
  scenarioIds: string[];
  variantIds: string[];
  createdAt: string;
  updatedAt: string;
}

const storageKey = "previewPresets";
const maxPresets = 20;

export async function getPreviewPresets(): Promise<PreviewPreset[]> {
  const stored = await chrome.storage.local.get(storageKey);
  const value = stored[storageKey];
  if (!Array.isArray(value)) return [];
  return value.filter(isPreviewPreset).slice(-maxPresets);
}

export async function savePreviewPreset(nameInput: string, scenarioIds: string[], variantIds: string[]): Promise<PreviewPreset> {
  const name = nameInput.trim();
  if (!name) throw new Error("Preset name is required.");
  if (!scenarioIds.length || !variantIds.length) throw new Error("Select at least one conversation and one configuration mix.");

  const presets = await getPreviewPresets();
  const now = new Date().toISOString();
  const existing = presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
  const preset: PreviewPreset = existing
    ? { ...existing, name, scenarioIds: [...scenarioIds], variantIds: [...variantIds], updatedAt: now }
    : {
        id: crypto.randomUUID(),
        name,
        scenarioIds: [...scenarioIds],
        variantIds: [...variantIds],
        createdAt: now,
        updatedAt: now
      };

  const next = presets.filter((item) => item.id !== preset.id);
  next.push(preset);
  await chrome.storage.local.set({ [storageKey]: next.slice(-maxPresets) });
  return preset;
}

export async function deletePreviewPreset(id: string): Promise<void> {
  const presets = await getPreviewPresets();
  await chrome.storage.local.set({ [storageKey]: presets.filter((preset) => preset.id !== id) });
}

function isPreviewPreset(value: unknown): value is PreviewPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<PreviewPreset>;
  return typeof preset.id === "string"
    && typeof preset.name === "string"
    && Array.isArray(preset.scenarioIds)
    && preset.scenarioIds.every((id) => typeof id === "string")
    && Array.isArray(preset.variantIds)
    && preset.variantIds.every((id) => typeof id === "string")
    && typeof preset.createdAt === "string"
    && typeof preset.updatedAt === "string";
}
