import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMBEDDING_MODEL = 'gemini-embedding-001';
const WORD_GENERATION_MODEL = 'gemini-4-hydrogen';
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const COSINE_MIN = 0.45;
const COSINE_MAX = 0.96;

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
  order: number;
  isExactMatch: boolean;
}

interface GameSession {
  id: string;
  mode: 'solo' | 'setter';
  targetWord: string;
  targetNormalized: string;
  targetVector: number[];
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
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. 메인 로비 하단에서 개인 Gemini API 키를 입력해주세요.');
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

async function embedKoreanWord(word: string, apiKey: string): Promise<number[]> {
  const ai = getGeminiClient(apiKey);
  const response = await withRetry(() =>
    ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: word,
      config: {
        taskType: 'SEMANTIC_SIMILARITY',
      },
    }),
  );

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('임베딩 벡터를 생성하지 못했습니다.');
  }
  return values;
}

function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i += 1) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function convertCosineToPercent(rawCosine: number, isExactMatch: boolean): number {
  if (isExactMatch) return 100;
  const normalized = (rawCosine - COSINE_MIN) / (COSINE_MAX - COSINE_MIN);
  const clamped = Math.max(0, Math.min(1, normalized));
  const percent = Math.round(clamped * 1000) / 10;
  return Math.min(99.9, percent);
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
      message: 'Gemini API 키가 유효하지 않거나 권한이 없습니다. 로비의 API 키 설정을 확인해주세요.',
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

      const targetVector = await embedKoreanWord(targetWord, apiKey);
      const sessionId = crypto.randomUUID();
      const session: GameSession = {
        id: sessionId,
        mode,
        targetWord,
        targetNormalized: normalizeWord(targetWord),
        targetVector,
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
      let rawCosine = 1.0;

      if (!isExactMatch) {
        const hintVector = await embedKoreanWord(rawWord, apiKey);
        rawCosine = computeCosineSimilarity(session.targetVector, hintVector);
      }

      const similarity = convertCosineToPercent(rawCosine, isExactMatch);
      session.hintCount += 1;

      const hint: StoredHint = {
        id: crypto.randomUUID(),
        word: rawWord,
        similarity,
        rawCosine: Math.round(rawCosine * 1000) / 1000,
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
