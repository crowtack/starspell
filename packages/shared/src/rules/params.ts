/**
 * Single source of truth for tunable game and platform constants.
 * Mirrors docs/GAME_RULES.md §13 and core prototype gameplay constants.
 */
export const MIN_MS_PER_CHAR = 40;
export const RECONNECT_GRACE_MS = 30_000;
export const COMPETITION_HARD_CAP_MS = 360_000;
export const SURVIVAL_MAX_WORDS = 60;
export const SURVIVAL_HARD_CAP_MS = 720_000;
export const MIN_WORDS_PER_TIER_FOR_SURVIVAL = 60;
export const MP_DAILY_XP_CAP = 3_000;
export const RATING_START = 1_000;
export const RATING_FLOOR = 100;
export const K_PROVISIONAL = 32;
export const K_STANDARD = 24;
export const PROVISIONAL_MATCHES = 20;
export const LEADERBOARD_MIN_RANKED = 5;
export const GUEST_IMPORT_XP_CAP = 30_000;
export const SKIP_USES_BOOSTED_TIER = false;

export const WORDS_PER_CHAPTER = 15;
export const CLOCK_CAP_BONUS_SECONDS = 15;
export const XP_PER_LEVEL = 600;
export const POINTS_PER_CHAR = 25;
export const XP_PER_POINT_RATIO = 0.4;
export const TIME_BONUS_XP_PER_SECOND = 12;

export const CLOCK_WARNING_AMBER_SECONDS = 15;
export const CLOCK_WARNING_RED_SECONDS = 5;
export const MAX_FRAME_DELTA_SECONDS = 0.1;

export const MAX_CHAPTER_TIER_BOOST = 2;
export const MIN_TIER = 1;
export const MAX_TIER = 5;

export const BASE_GLOW_RADIUS_PX = 22;
export const SUN_RING_CIRCUMFERENCE = 144.51;
