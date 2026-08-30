import { NATIONALITIES, Nationality } from '@ww2/shared/nationality';
import { UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { reviveUnit } from '@ww2/shared/unit-factory';

/** Bump when the persisted shape changes in a backward-incompatible way. */
export const SAVE_SCHEMA_VERSION = 1;

export interface GameSaveFile {
  schemaVersion: number;
  savedAt: string;
  state: unknown;
}

const UNIT_TYPE_VALUES = new Set<string>(UNIT_TYPES);
const NATIONALITY_VALUES = new Set<string>(NATIONALITIES);

interface SerializedUnit {
  type: UnitType;
  nationality: Nationality;
  id: string;
}

/**
 * A deserialized {@link MilitaryUnit} is a plain object with exactly `{ type, nationality, id }`.
 * No other state shape matches all three, so this is a safe discriminator for deep revival.
 */
function isSerializedUnit(value: unknown): value is SerializedUnit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    typeof record['id'] === 'string' &&
    typeof record['type'] === 'string' &&
    UNIT_TYPE_VALUES.has(record['type']) &&
    typeof record['nationality'] === 'string' &&
    NATIONALITY_VALUES.has(record['nationality'])
  );
}

/** Recursively rebuild class instances (units) from a parsed-JSON snapshot. */
function reviveDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reviveDeep);
  }
  if (isSerializedUnit(value)) {
    return reviveUnit(value);
  }
  if (value && typeof value === 'object') {
    const revived: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      revived[key] = reviveDeep(nested);
    }
    return revived;
  }
  return value;
}

/** Serialize a full NGXS store snapshot into the save-file JSON string. */
export function serializeGame(snapshot: unknown, now: Date = new Date()): string {
  const saveFile: GameSaveFile = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: now.toISOString(),
    state: snapshot,
  };
  return JSON.stringify(saveFile, null, 2);
}

/**
 * Parse a save-file JSON string and return an NGXS snapshot with class instances rehydrated,
 * ready for `store.reset(...)`. Throws on malformed input or an unsupported schema version.
 */
export function deserializeGame(json: string): Record<string, unknown> {
  let parsed: GameSaveFile;
  try {
    parsed = JSON.parse(json) as GameSaveFile;
  } catch (error) {
    throw new Error(`Save file is not valid JSON: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || parsed.state == null) {
    throw new Error('Save file is missing game state.');
  }
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported save schema version ${parsed.schemaVersion} (expected ${SAVE_SCHEMA_VERSION}).`,
    );
  }

  return reviveDeep(parsed.state) as Record<string, unknown>;
}

/** Default download filename for a fresh save (no previously-loaded file). */
export function defaultSaveFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `wwii-save_${stamp}.json`;
}
