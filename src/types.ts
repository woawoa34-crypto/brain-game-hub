export type ActiveGame =
  | 'LOBBY'
  | 'WORD_GAME'
  | 'FLAG_GAME'
  | 'WALLBADUK_GAME'
  | 'BLIND_MAZE_GAME'
  | 'GRADIENT_CUP_GAME';

export type GameMode = 'solo' | 'setter';

export type GamePhase = 'TITLE' | 'PLAYING' | 'VICTORY' | 'GAVE_UP';

export interface HintEntry {
  id: string;
  word: string;
  similarity: number;
  rawCosine: number;
  reason?: string;
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
  if (similarity >= 70) return 'high';
  if (similarity >= 45) return 'medium';
  return 'low';
}

export function getSimilarityLabel(similarity: number): string {
  if (similarity >= 90) return '핵심 연관어';
  if (similarity >= 70) return '밀접한 관련';
  if (similarity >= 45) return '간접 연상';
  if (similarity >= 20) return '약한 연결';
  return '무관함';
}
