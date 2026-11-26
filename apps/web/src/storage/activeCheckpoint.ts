import {
  ACTIVE_CHECKPOINT_SCHEMA_VERSION,
  ACTIVE_CHECKPOINT_STORAGE_KEY,
  parseActiveCheckpoint,
  type ActiveCheckpoint,
  type SoloState,
  type WayfaringStyle,
} from '@starspell/shared';

export function loadActiveCheckpoint(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): ActiveCheckpoint | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(ACTIVE_CHECKPOINT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return parseActiveCheckpoint(parsed);
  } catch {
    return null;
  }
}

export function saveActiveCheckpoint(
  params: {
    style: WayfaringStyle;
    soloState: SoloState;
    elapsedSinceLastEvent: number;
    savedAt?: number;
  },
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage || params.soloState.status !== 'playing') {
    return;
  }
  const payload: ActiveCheckpoint = {
    schemaVersion: ACTIVE_CHECKPOINT_SCHEMA_VERSION,
    style: params.style,
    soloState: {
      ...params.soloState,
      slots: [...params.soloState.slots],
      usedWordIds: [...params.soloState.usedWordIds],
    },
    elapsedSinceLastEvent: Math.max(0, params.elapsedSinceLastEvent),
    savedAt: params.savedAt ?? Date.now(),
  };
  try {
    storage.setItem(ACTIVE_CHECKPOINT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearActiveCheckpoint(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(ACTIVE_CHECKPOINT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
