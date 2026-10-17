/** Explicit per-account Tinder data-import preferences. Never grants AI-send rights. */
export interface TinderImportSettings {
  autoSyncOpened: boolean;
  autoCollectLoaded: boolean;
  scope: "all" | "filtered";
  ageMin: number | null;
  ageMax: number | null;
  requireMessages: boolean;
  includeMessages: boolean;
  includeProfile: boolean;
  includePhotos: boolean;
}
export const DEFAULT_TINDER_IMPORT_SETTINGS: TinderImportSettings = {
  autoSyncOpened: true, autoCollectLoaded: true, scope: "all",
  ageMin: null, ageMax: null, requireMessages: false,
  includeMessages: true, includeProfile: true, includePhotos: true
};
export function validateTinderImportSettings(input: unknown): TinderImportSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_import_settings");
  const x = input as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_TINDER_IMPORT_SETTINGS);
  if (Object.keys(x).some(k => !keys.includes(k))) throw new Error("unknown_import_setting");
  for (const key of ["autoSyncOpened","autoCollectLoaded","requireMessages","includeMessages","includeProfile","includePhotos"]) {
    if (typeof x[key] !== "boolean") throw new Error("invalid_import_toggle_" + key);
  }
  if (x.scope !== "all" && x.scope !== "filtered") throw new Error("invalid_import_scope");
  for (const key of ["ageMin","ageMax"]) {
    if (x[key] !== null && (typeof x[key] !== "number" || !Number.isInteger(x[key]) || (x[key] as number) < 18 || (x[key] as number) > 120))
      throw new Error("invalid_import_age_" + key);
  }
  if (x.ageMin !== null && x.ageMax !== null && (x.ageMin as number) > (x.ageMax as number))
    throw new Error("invalid_import_age_range");
  if (!x.includeMessages && !x.includeProfile && !x.includePhotos) throw new Error("import_has_no_selected_data");
  return x as unknown as TinderImportSettings;
}
export function shouldImportThread(
  settings: TinderImportSettings, observed: { age?: number | null; messageCount: number }
): { eligible: boolean; reason: "allowed" | "missing_age" | "age_outside_range" | "no_messages" } {
  if (settings.scope === "all") return { eligible: true, reason: "allowed" };
  if (settings.requireMessages && !observed.messageCount) return { eligible: false, reason: "no_messages" };
  if (settings.ageMin !== null || settings.ageMax !== null) {
    if (typeof observed.age !== "number" || !Number.isInteger(observed.age)) return { eligible:false, reason:"missing_age" };
    const age = observed.age!;
    if ((settings.ageMin !== null && age < settings.ageMin) || (settings.ageMax !== null && age > settings.ageMax))
      return {eligible:false,reason:"age_outside_range"};
  }
  return {eligible:true,reason:"allowed"};
}
