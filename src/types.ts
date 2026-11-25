export type ActiveGame = 'LOBBY' | 'WORD_GAME' | 'FLAG_GAME' | 'WALLBADUK_GAME';

export type GameMode = 'solo' | 'setter';

export type GamePhase = 'TITLE' | 'PLAYING' | 'VICTORY' | 'GAVE_UP';

export interface HintEntry {
  id: string;
  word: string;
  similarity: number;
  rawCosine: number;
  order: number;
  isExactMatch: boolean;
}

export interface StartGameResponse {
  sessionId: string;
  mode: GameMode;
  maskedCount: number;
}

export interface SubmitHintResponse {
  hint: HintEntry;
  alreadyTried: boolean;
  hintCount: number;
  answerAttempts: number;
}

export interface GuessAnswerResponse {
  correct: boolean;
  guess: string;
  targetWord?: string;
  hintCount: number;
  answerAttempts: number;
  totalAttempts: number;
}

export interface GiveUpResponse {
  targetWord: string;
  hintCount: number;
  answerAttempts: number;
  totalAttempts: number;
}

export type SimilarityTier = 'high' | 'medium' | 'low';

export function getSimilarityTier(similarity: number): SimilarityTier {
  if (similarity >= 80) return 'high';
  if (similarity >= 50) return 'medium';
  return 'low';
}

export function getSimilarityLabel(similarity: number): string {
  if (similarity >= 95) return '정답 근접';
  if (similarity >= 80) return '매우 가까움';
  if (similarity >= 65) return '꽤 가까움';
  if (similarity >= 50) return '관련 있음';
  if (similarity >= 25) return '약간 멈';
  return '거리가 멈';
}
