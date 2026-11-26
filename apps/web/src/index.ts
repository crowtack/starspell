import { DIFFICULTY_CONFIGS } from '@starspell/shared';

export function getWebStubDifficultyCount(): number {
  return Object.keys(DIFFICULTY_CONFIGS).length;
}
