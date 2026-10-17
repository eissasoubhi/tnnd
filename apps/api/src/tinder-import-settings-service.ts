import { getPool } from "./db-client.js";
import { DEFAULT_TINDER_IMPORT_SETTINGS, validateTinderImportSettings, type TinderImportSettings } from "../../../src/tinder-import-settings.js";

export async function readTinderImportSettings(userId: string): Promise<{settings: TinderImportSettings; updatedAt: string | null}> {
  const result = await getPool().query<{settings: unknown; updated_at: Date}>(
    "SELECT settings, updated_at FROM tinder_import_settings WHERE user_id = $1", [userId]);
  const row = result.rows[0];
  return row ? {settings: validateTinderImportSettings(row.settings),updatedAt:row.updated_at.toISOString()}
    : {settings: {...DEFAULT_TINDER_IMPORT_SETTINGS},updatedAt:null};
}
export async function saveTinderImportSettings(userId: string, value: unknown) {
  const settings = validateTinderImportSettings(value);
  const result = await getPool().query<{updated_at: Date}>(
    "INSERT INTO tinder_import_settings (user_id,settings) VALUES ($1,$2::jsonb) "
    + "ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now() RETURNING updated_at",
    [userId,JSON.stringify(settings)]);
  return {settings,updatedAt:result.rows[0]?.updated_at.toISOString() ?? null};
}
