import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  GameMode,
  GiveUpResponse,
  GuessAnswerResponse,
  HintEntry,
  StartGameResponse,
  SubmitHintResponse,
} from '../types';

export const API_KEY_STORAGE_KEY = 'brain_survival_gemini_api_key';
const WORD_GENERATION_MODEL = 'gemini-4-hydrogen';
const SESSION_STORAGE_PREFIX = 'brain_survival_word_session_';
const RECENT_WORDS_STORAGE_KEY = 'brain_survival_recent_solo_words';

const SOLO_THEMES = [
  '자연과 풍경',
  '음식과 요리',
  '일상 생활용품',
  '동물',
  '식물과 꽃',
  '장소와 공간',
  '교통과 탈것',
  '날씨와 기상',
  '스포츠와 운동',
  '음악과 악기',
  '예술과 문화',
  '직업',
  '우주와 천체',
  '건축과 도시',
  '가구와 인테리어',
  '의류와 패션',
  '학용품과 문구',
  '주방 도구',
  '계절과 시간',
  '바다와 해변',
  '산과 숲',
  '여행과 휴가',
  '감정과 마음',
  '과학과 도구',
];

const RUBRIC_SYSTEM_INSTRUCTION = `당신은 한국어 단어 연상·의미 유사도 추리 게임 '말결'의 전문 채점관입니다.
정답 단어와 힌트 단어 사이의 한국어 의미적·상황적·연상적 거리를 아래 5단계 채점 기준표에 따라 0.0 ~ 99.9점으로 정교하게 채점하세요. (정답과 완전히 같은 단어는 클라이언트에서 100점으로 처리하므로 99.9 이하만 부여)

[5단계 한국어 연상·의미 채점 기준표]
1. 90.0 ~ 99.9점 (핵심 연관어 · 동의어/직접 연상)
   - 정답의 동의어, 유의어, 반의어, 핵심 구성 요소, 또는 한국인이 정답을 들었을 때 즉시 떠올리는 1순위 짝꿍 단어.
   - 예(정답 '바다'): '파도'(95.5), '해변'(94.0), '바닷물'(96.5), '수평선'(92.0), '모래사장'(91.5), '갈매기'(90.5)
2. 70.0 ~ 89.9점 (동일 범주 · 밀접한 상황)
   - 같은 상위 개념에 속하거나 같은 장소·상황에서 흔히 함께 쓰이는 관련성이 매우 높은 단어.
   - 예(정답 '바다'): '배'(84.0), '수영'(82.5), '물고기'(85.0), '조개'(80.0), '등대'(83.0), '여름'(74.0)
3. 45.0 ~ 69.9점 (간접 연상 · 중간 연결고리)
   - 한두 단계를 거쳐 자연스럽게 연상되거나, 공통 속성(색·감각·행동·배경)을 공유하는 단어.
   - 예(정답 '바다'): '여행'(62.0), '하늘'(58.0), '바람'(56.5), '휴가'(64.0), '소금'(65.0), '파란색'(55.0)
4. 20.0 ~ 44.9점 (약한 연결 · 주변 배경)
   - 억지스럽지는 않으나 직접 연결하기엔 거리가 먼 추상적·부분적 접점.
   - 예(정답 '바다'): '지도'(34.0), '신발'(26.0), '카메라'(31.0), '시간'(22.0)
5. 0.0 ~ 19.9점 (무관함)
   - 의미적·상황적 접점이 거의 없는 단어.
   - 예(정답 '바다'): '연필'(8.0), '냉장고'(11.0), '수학'(5.0), '키보드'(4.0)

[채점 원칙]
- 실제 한국인 체감에 맞게 점수를 후하게 보정하세요. 일상에서 자연스럽게 함께 떠오르면 70점 이상, 한 단계 연상이 가능하면 45점 이상을 부여하세요.
- 소수점 첫째 자리까지 섬세하게 구분해 순위 변별력이 생기도록 채점하세요.
- reason은 이 점수를 준 근거를 15자 이내 한국어로 간결하게 작성하되, 정답 단어나 그 글자를 직접 노출하는 스포일러는 절대 금지입니다 (예: "핵심 자연 현상 짝꿍", "같은 장소·활동 연관", "공통 분위기 간접 연상", "의미 접점 거의 없음").`;

interface WordChainSession {
  id: string;
  mode: GameMode;
  targetWord: string;
  targetNormalized: string;
  createdAt: number;
  hintCount: number;
  answerAttempts: number;
  hintsByNormalized: Record<string, HintEntry>;
  finished: boolean;
  won: boolean;
}

const memorySessions = new Map<string, WordChainSession>();

function loadRecentSoloWords(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_WORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentSoloWord(word: string): void {
  try {
    const list = loadRecentSoloWords();
    list.push(word);
    if (list.length > 40) list.splice(0, list.length - 40);
    window.localStorage.setItem(RECENT_WORDS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

function persistSession(session: WordChainSession): void {
  memorySessions.set(session.id, session);
  try {
    window.sessionStorage.setItem(
      `${SESSION_STORAGE_PREFIX}${session.id}`,
      JSON.stringify(session),
    );
  } catch {
    // Ignore storage errors
  }
}

function loadSession(sessionId: string): WordChainSession | null {
  const inMem = memorySessions.get(sessionId);
  if (inMem) return inMem;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WordChainSession;
    if (parsed && typeof parsed.targetWord === 'string') {
      memorySessions.set(sessionId, parsed);
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function hasWordChainSession(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  return loadSession(sessionId) !== null;
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeWord(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase();
}

function sanitizeDisplayWord(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function resolveClientApiKey(customApiKey?: string): string {
  const direct = customApiKey?.trim();
  if (direct) return direct;
  try {
    const stored = window.localStorage.getItem(API_KEY_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // Storage unavailable
  }
  throw new Error(
    'Gemini API 키가 설정되지 않았습니다. 상단의 API 키 설정 배지에서 개인 Gemini API 키를 입력해주세요.',
  );
}

function formatGeminiClientError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  if (
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API key not valid') ||
    status === 400 ||
    status === 403
  ) {
    return new Error(
      'Gemini API 키가 유효하지 않거나 권한이 없습니다. 상단의 API 키 설정 배지를 확인해주세요.',
    );
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || status === 429) {
    return new Error('Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
  }
  return new Error(rawMessage || 'Gemini API 호출 중 오류가 발생했습니다.');
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : undefined;
      const retryable = status === 429 || status === 500 || status === 503 || status === undefined;
      if (!retryable || attempt === maxRetries) {
        throw formatGeminiClientError(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw formatGeminiClientError(lastError);
}

async function generateSoloKoreanNoun(apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const theme = SOLO_THEMES[Math.floor(Math.random() * SOLO_THEMES.length)];
  const recent = loadRecentSoloWords();
  const avoidList = recent.length > 0 ? recent.join(', ') : '없음';

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: WORD_GENERATION_MODEL,
      contents: `한국어 단어 유사도 추리 게임의 정답으로 사용할 일반 명사 1개를 선정해줘.
주제 힌트: ${theme}
조건:
- 누구나 일상에서 잘 아는 한국어 일반 명사 1개 (2~4글자 권장, 띄어쓰기 없이 한 단어)
- 고유명사, 브랜드명, 줄임말, 신조어, 전문 학술 용어 제외
- 최근 출제된 다음 단어는 절대 제외: ${avoidList}
반드시 JSON으로만 응답해줘.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: {
              type: Type.STRING,
              description: '띄어쓰기 없는 한국어 일반 명사 1개',
            },
          },
          required: ['word'],
        },
      },
    }),
  );

  const rawText = (response.text ?? '').trim();
  let parsedWord = '';
  try {
    const parsed = JSON.parse(rawText) as { word?: unknown };
    if (typeof parsed.word === 'string') {
      parsedWord = sanitizeDisplayWord(parsed.word).replace(/\s+/g, '');
    }
  } catch {
    throw new Error('AI가 정답 단어를 올바른 형식으로 생성하지 못했습니다.');
  }

  if (!parsedWord || parsedWord.length < 1 || parsedWord.length > 12) {
    throw new Error('생성된 정답 단어가 유효하지 않습니다.');
  }

  saveRecentSoloWord(parsedWord);
  return parsedWord;
}

async function scoreHintWithRubric(
  targetWord: string,
  hintWord: string,
  apiKey: string,
): Promise<{ score: number; reason: string }> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: WORD_GENERATION_MODEL,
      contents: `정답 단어: "${targetWord}"
힌트 단어: "${hintWord}"
위 5단계 기준표에 따라 유사도 점수(score)와 짧은 이유(reason)를 JSON으로 반환하세요.`,
      config: {
        systemInstruction: RUBRIC_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: {
              type: Type.NUMBER,
              description: '0.0 이상 99.9 이하의 유사도 점수 (소수점 첫째 자리)',
            },
            reason: {
              type: Type.STRING,
              description: '정답 스포일러 없이 15자 이내로 작성한 짧은 연상 근거',
            },
          },
          required: ['score', 'reason'],
        },
      },
    }),
  );

  const rawText = (response.text ?? '').trim();
  try {
    const parsed = JSON.parse(rawText) as { score?: unknown; reason?: unknown };
    const numericScore = Number(parsed.score);
    if (!Number.isFinite(numericScore)) {
      throw new Error('유효하지 않은 유사도 점수 형식입니다.');
    }
    const clamped = Math.max(0, Math.min(99.9, numericScore));
    const rounded = Math.round(clamped * 10) / 10;
    const rawReason =
      typeof parsed.reason === 'string'
        ? parsed.reason.trim().replace(/\s+/g, ' ').slice(0, 24)
        : '';
    return {
      score: rounded,
      reason: rawReason || '의미 연상 분석 완료',
    };
  } catch {
    throw new Error('AI가 유사도 점수를 올바른 형식으로 계산하지 못했습니다.');
  }
}

export async function startWordChainSession(params: {
  mode: GameMode;
  customWord?: string;
  customApiKey?: string;
  fixedSessionId?: string;
}): Promise<StartGameResponse> {
  const apiKey = resolveClientApiKey(params.customApiKey);
  let targetWord = '';

  if (params.mode === 'setter') {
    const rawCustom = typeof params.customWord === 'string' ? sanitizeDisplayWord(params.customWord) : '';
    if (!rawCustom) {
      throw new Error('정답 단어를 입력해주세요.');
    }
    if (rawCustom.length > 20) {
      throw new Error('정답 단어는 20자 이내로 입력해주세요.');
    }
    targetWord = rawCustom;
  } else {
    targetWord = await generateSoloKoreanNoun(apiKey);
  }

  const sessionId = params.fixedSessionId ?? createUuid();
  const session: WordChainSession = {
    id: sessionId,
    mode: params.mode,
    targetWord,
    targetNormalized: normalizeWord(targetWord),
    createdAt: Date.now(),
    hintCount: 0,
    answerAttempts: 0,
    hintsByNormalized: {},
    finished: false,
    won: false,
  };
  persistSession(session);

  return {
    sessionId,
    mode: params.mode,
    maskedCount: Math.max(2, Math.min(8, targetWord.length)),
  };
}

export async function submitWordChainHint(params: {
  sessionId: string;
  word: string;
  customApiKey?: string;
}): Promise<SubmitHintResponse> {
  const session = loadSession(params.sessionId);
  if (!session) {
    throw new Error('진행 중인 게임을 찾을 수 없습니다. 새 게임을 시작해주세요.');
  }
  if (session.finished) {
    throw new Error('이미 종료된 게임입니다.');
  }

  const rawWord = sanitizeDisplayWord(params.word);
  if (!rawWord) {
    throw new Error('힌트 단어를 입력해주세요.');
  }
  if (rawWord.length > 25) {
    throw new Error('단어는 25자 이내로 입력해주세요.');
  }

  const normalized = normalizeWord(rawWord);
  const existing = session.hintsByNormalized[normalized];
  if (existing) {
    return {
      hint: existing,
      alreadyTried: true,
      hintCount: session.hintCount,
      answerAttempts: session.answerAttempts,
    };
  }

  const isExactMatch = normalized === session.targetNormalized;
  let similarity = 100;
  let reason = '정답 단어와 완전 일치';

  if (!isExactMatch) {
    const apiKey = resolveClientApiKey(params.customApiKey);
    const rubricResult = await scoreHintWithRubric(session.targetWord, rawWord, apiKey);
    similarity = rubricResult.score;
    reason = rubricResult.reason;
  }

  session.hintCount += 1;

  const hint: HintEntry = {
    id: createUuid(),
    word: rawWord,
    similarity,
    rawCosine: Math.round((similarity / 100) * 1000) / 1000,
    reason,
    order: session.hintCount,
    isExactMatch,
  };

  session.hintsByNormalized[normalized] = hint;
  persistSession(session);

  return {
    hint,
    alreadyTried: false,
    hintCount: session.hintCount,
    answerAttempts: session.answerAttempts,
  };
}

export function guessWordChainAnswer(params: {
  sessionId: string;
  word: string;
}): GuessAnswerResponse {
  const session = loadSession(params.sessionId);
  if (!session) {
    throw new Error('진행 중인 게임을 찾을 수 없습니다. 새 게임을 시작해주세요.');
  }
  if (session.finished) {
    throw new Error('이미 종료된 게임입니다.');
  }

  const rawWord = sanitizeDisplayWord(params.word);
  if (!rawWord) {
    throw new Error('정답 후보 단어를 입력해주세요.');
  }

  session.answerAttempts += 1;
  const isCorrect = normalizeWord(rawWord) === session.targetNormalized;

  if (isCorrect) {
    session.finished = true;
    session.won = true;
    persistSession(session);
    return {
      correct: true,
      guess: rawWord,
      targetWord: session.targetWord,
      hintCount: session.hintCount,
      answerAttempts: session.answerAttempts,
      totalAttempts: session.hintCount + session.answerAttempts,
    };
  }

  persistSession(session);
  return {
    correct: false,
    guess: rawWord,
    hintCount: session.hintCount,
    answerAttempts: session.answerAttempts,
    totalAttempts: session.hintCount + session.answerAttempts,
  };
}

export function giveUpWordChainSession(params: { sessionId: string }): GiveUpResponse {
  const session = loadSession(params.sessionId);
  if (!session) {
    throw new Error('진행 중인 게임을 찾을 수 없습니다.');
  }

  session.finished = true;
  session.won = false;
  persistSession(session);

  return {
    targetWord: session.targetWord,
    hintCount: session.hintCount,
    answerAttempts: session.answerAttempts,
    totalAttempts: session.hintCount + session.answerAttempts,
  };
}
