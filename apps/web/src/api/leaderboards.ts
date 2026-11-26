import type {
  LeaderboardQueryInput,
  LeaderboardResponse,
  PublicProfileDto,
} from '@starspell/shared';
import { apiRequest } from './client';

export function fetchLeaderboard(query: LeaderboardQueryInput): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({
    board: query.board,
    difficulty: query.difficulty,
    window: query.window,
    limit: String(query.limit),
  });
  if (query.cursor) {
    params.set('cursor', query.cursor);
  }
  return apiRequest<LeaderboardResponse>(`/api/leaderboards?${params.toString()}`);
}

export function fetchPublicProfile(username: string): Promise<PublicProfileDto> {
  return apiRequest<PublicProfileDto>(`/api/profile/public/${encodeURIComponent(username)}`);
}
