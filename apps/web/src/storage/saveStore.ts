import {
  SAVE_STORAGE_KEY,
  createDefaultSaveData,
  parseSaveData,
  type SaveData,
} from '@starspell/shared';

export function loadSave(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): SaveData {
  if (!storage) {
    return createDefaultSaveData();
  }
  try {
    const raw = storage.getItem(SAVE_STORAGE_KEY);
    if (!raw) {
      return createDefaultSaveData();
    }
    const parsed: unknown = JSON.parse(raw);
    return parseSaveData(parsed);
  } catch {
    return createDefaultSaveData();
  }
}

export function persistSave(
  saveData: SaveData,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saveData));
  } catch {
    // Ignore storage quota errors
  }
}
