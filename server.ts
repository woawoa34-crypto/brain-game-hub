import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_GENERATION_MODEL = 'gemini-4-hydrogen';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;

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

interface StoredHint {
  id: string;
  word: string;
  similarity: number;
  rawCosine: number;
  reason: string;
  order: number;
  isExactMatch: boolean;
}

interface GameSession {
  id: string;
  mode: 'solo' | 'setter';
  targetWord: string;
  targetNormalized: string;
  createdAt: number;
  hintCount: number;
  answerAttempts: number;
  hintsByNormalized: Map<string, StoredHint>;
  finished: boolean;
  won: boolean;
}

const sessions = new Map<string, GameSession>();
const recentSoloWords: string[] = [];

function resolveApiKey(req: Request): string {
  const headerKey = req.header('x-gemini-api-key')?.trim();
  const key = headerKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. 상단의 API 키 설정 배지에서 개인 Gemini API 키를 입력해주세요.');
  }
  return key;
}

function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeWord(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase();
}

function sanitizeDisplayWord(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function cleanupSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
  if (sessions.size > MAX_SESSIONS) {
    const sorted = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toRemove = sorted.slice(0, sessions.size - MAX_SESSIONS);
    for (const [id] of toRemove) {
      sessions.delete(id);
    }
  }
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
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

const RUBRIC_SYSTEM_INSTRUCTION = `당신은 한국어 단어 연상·의미 유사도 추리 게임 '말결'의 전문 채점관입니다.
정답 단어와 힌트 단어 사이의 한국어 의미적·상황적·연상적 거리를 아래 5단계 채점 기준표에 따라 0.0 ~ 99.9점으로 정교하게 채점하세요. (정답과 완전히 같은 단어는 서버에서 100점으로 처리하므로 99.9 이하만 부여)

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

async function scoreHintWithRubric(
  targetWord: string,
  hintWord: string,
  apiKey: string,
): Promise<{ score: number; reason: string }> {
  const ai = getGeminiClient(apiKey);
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

async function generateSoloKoreanNoun(apiKey: string): Promise<string> {
  const ai = getGeminiClient(apiKey);
  const theme = SOLO_THEMES[Math.floor(Math.random() * SOLO_THEMES.length)];
  const avoidList = recentSoloWords.length > 0 ? recentSoloWords.join(', ') : '없음';

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

  recentSoloWords.push(parsedWord);
  if (recentSoloWords.length > 40) {
    recentSoloWords.shift();
  }

  return parsedWord;
}

function getFriendlyApiError(error: unknown): { status: number; message: string } {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : 500;

  if (rawMessage.includes('GEMINI_API_KEY')) {
    return {
      status: 400,
      message: rawMessage,
    };
  }
  if (status === 400 || status === 403 || rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      message: 'Gemini API 키가 유효하지 않거나 권한이 없습니다. 상단의 API 키 설정 배지를 확인해주세요.',
    };
  }
  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage || '서버 처리 중 오류가 발생했습니다.',
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      hasServerKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/game/start', async (req: Request, res: Response) => {
    try {
      cleanupSessions();
      const apiKey = resolveApiKey(req);
      const body = req.body as { mode?: unknown; customWord?: unknown };
      const mode = body.mode === 'setter' ? 'setter' : body.mode === 'solo' ? 'solo' : null;

      if (!mode) {
        res.status(400).json({ error: '유효한 게임 모드를 선택해주세요.' });
        return;
      }

      let targetWord = '';
      if (mode === 'setter') {
        const rawCustom = typeof body.customWord === 'string' ? sanitizeDisplayWord(body.customWord) : '';
        if (!rawCustom) {
          res.status(400).json({ error: '정답 단어를 입력해주세요.' });
          return;
        }
        if (rawCustom.length > 20) {
          res.status(400).json({ error: '정답 단어는 20자 이내로 입력해주세요.' });
          return;
        }
        targetWord = rawCustom;
      } else {
        targetWord = await generateSoloKoreanNoun(apiKey);
      }

      const sessionId = crypto.randomUUID();
      const session: GameSession = {
        id: sessionId,
        mode,
        targetWord,
        targetNormalized: normalizeWord(targetWord),
        createdAt: Date.now(),
        hintCount: 0,
        answerAttempts: 0,
        hintsByNormalized: new Map(),
        finished: false,
        won: false,
      };
      sessions.set(sessionId, session);

      res.json({
        sessionId,
        mode,
        maskedCount: Math.max(2, Math.min(8, targetWord.length)),
      });
    } catch (error) {
      const { status, message } = getFriendlyApiError(error);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/game/hint', async (req: Request, res: Response) => {
    try {
      const apiKey = resolveApiKey(req);
      const body = req.body as { sessionId?: unknown; word?: unknown };
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      const rawWord = typeof body.word === 'string' ? sanitizeDisplayWord(body.word) : '';

      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: '진행 중인 게임을 찾을 수 없습니다. 새 게임을 시작해주세요.' });
        return;
      }
      if (session.finished) {
        res.status(400).json({ error: '이미 종료된 게임입니다.' });
        return;
      }
      if (!rawWord) {
        res.status(400).json({ error: '힌트 단어를 입력해주세요.' });
        return;
      }
      if (rawWord.length > 25) {
        res.status(400).json({ error: '단어는 25자 이내로 입력해주세요.' });
        return;
      }

      const normalized = normalizeWord(rawWord);
      const existing = session.hintsByNormalized.get(normalized);
      if (existing) {
        res.json({
          hint: existing,
          alreadyTried: true,
          hintCount: session.hintCount,
          answerAttempts: session.answerAttempts,
        });
        return;
      }

      const isExactMatch = normalized === session.targetNormalized;
      let similarity = 100;
      let reason = '정답 단어와 완전 일치';

      if (!isExactMatch) {
        const rubricResult = await scoreHintWithRubric(
          session.targetWord,
          rawWord,
          apiKey,
        );
        similarity = rubricResult.score;
        reason = rubricResult.reason;
      }

      session.hintCount += 1;

      const hint: StoredHint = {
        id: crypto.randomUUID(),
        word: rawWord,
        similarity,
        rawCosine: Math.round((similarity / 100) * 1000) / 1000,
        reason,
        order: session.hintCount,
        isExactMatch,
      };

      session.hintsByNormalized.set(normalized, hint);

      res.json({
        hint,
        alreadyTried: false,
        hintCount: session.hintCount,
        answerAttempts: session.answerAttempts,
      });
    } catch (error) {
      const { status, message } = getFriendlyApiError(error);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/game/guess', (req: Request, res: Response) => {
    const body = req.body as { sessionId?: unknown; word?: unknown };
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const rawWord = typeof body.word === 'string' ? sanitizeDisplayWord(body.word) : '';

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: '진행 중인 게임을 찾을 수 없습니다. 새 게임을 시작해주세요.' });
      return;
    }
    if (session.finished) {
      res.status(400).json({ error: '이미 종료된 게임입니다.' });
      return;
    }
    if (!rawWord) {
      res.status(400).json({ error: '정답 후보 단어를 입력해주세요.' });
      return;
    }

    session.answerAttempts += 1;
    const isCorrect = normalizeWord(rawWord) === session.targetNormalized;

    if (isCorrect) {
      session.finished = true;
      session.won = true;
      res.json({
        correct: true,
        guess: rawWord,
        targetWord: session.targetWord,
        hintCount: session.hintCount,
        answerAttempts: session.answerAttempts,
        totalAttempts: session.hintCount + session.answerAttempts,
      });
      return;
    }

    res.json({
      correct: false,
      guess: rawWord,
      hintCount: session.hintCount,
      answerAttempts: session.answerAttempts,
      totalAttempts: session.hintCount + session.answerAttempts,
    });
  });

  app.post('/api/game/give-up', (req: Request, res: Response) => {
    const body = req.body as { sessionId?: unknown };
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: '진행 중인 게임을 찾을 수 없습니다.' });
      return;
    }

    session.finished = true;
    session.won = false;

    res.json({
      targetWord: session.targetWord,
      hintCount: session.hintCount,
      answerAttempts: session.answerAttempts,
      totalAttempts: session.hintCount + session.answerAttempts,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
