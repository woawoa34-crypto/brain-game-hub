const API_KEY_STORAGE_KEY = 'brain_survival_gemini_api_key';
const GEMINI_ENDPOINT_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

const recentSoloWords: string[] = [];

export function resolveStoredApiKey(customApiKey?: string): string {
  const fromProp = customApiKey?.trim();
  if (fromProp) return fromProp;
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function normalizeWord(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase();
}

export function sanitizeDisplayWord(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

interface GeminiRestResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

async function callGeminiGenerateContent(
  apiKey: string,
  payload: Record<string, unknown>,
  maxRetries = 1,
): Promise<string> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new Error(
      "Gemini API 키가 없습니다. 상단의 'API 미등록' 버튼을 눌러 개인 API 키를 먼저 등록해 주세요.",
    );
  }

  const endpoint = `${GEMINI_ENDPOINT_BASE}?key=${encodeURIComponent(trimmedKey)}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const rawBody = await response.text();
      let parsedBody: GeminiRestResponse | null = null;

      try {
        parsedBody = JSON.parse(rawBody) as GeminiRestResponse;
      } catch {
        // Non-JSON response (e.g., HTML error page or network proxy response)
        if (!response.ok) {
          throw new Error(
            `Gemini API 요청 실패 (HTTP ${response.status}). 네트워크 상태와 API 키를 확인해 주세요.`,
          );
        }
        throw new Error(
          'Gemini API가 올바른 JSON 형식의 응답을 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.',
        );
      }

      if (!response.ok) {
        const apiMsg = parsedBody?.error?.message ?? '';
        const status = response.status;

        if (status === 400 || status === 401 || status === 403 || apiMsg.includes('API_KEY_INVALID')) {
          throw new Error(
            'Gemini API 키가 유효하지 않거나 권한이 없습니다. 상단의 API 키 설정 배지를 확인해 주세요.',
          );
        }
        if (status === 429 || apiMsg.includes('RESOURCE_EXHAUSTED')) {
          if (attempt < maxRetries) {
            await new Promise((r) => window.setTimeout(r, 450 * (attempt + 1)));
            continue;
          }
          throw new Error('Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
        }
        if (status >= 500 && attempt < maxRetries) {
          await new Promise((r) => window.setTimeout(r, 450 * (attempt + 1)));
          continue;
        }
        throw new Error(apiMsg || `Gemini API 오류가 발생했습니다. (HTTP ${status})`);
      }

      const candidateText = parsedBody?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof candidateText !== 'string' || !candidateText.trim()) {
        throw new Error('AI 응답 내용이 비어 있습니다. 다시 시도해 주세요.');
      }

      return stripJsonFence(candidateText);
    } catch (err) {
      lastError =
        err instanceof Error
          ? err
          : new Error('Gemini API 통신 중 알 수 없는 오류가 발생했습니다.');
      const isNetworkFailure =
        err instanceof TypeError || lastError.message.includes('Failed to fetch');
      if (isNetworkFailure && attempt < maxRetries) {
        await new Promise((r) => window.setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (!isNetworkFailure || attempt === maxRetries) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('Gemini API 요청을 완료하지 못했습니다.');
}

export async function generateSoloKoreanNoun(apiKey: string): Promise<string> {
  const theme = SOLO_THEMES[Math.floor(Math.random() * SOLO_THEMES.length)];
  const avoidList = recentSoloWords.length > 0 ? recentSoloWords.join(', ') : '없음';

  const rawText = await callGeminiGenerateContent(apiKey, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `한국어 단어 유사도 추리 게임의 정답으로 사용할 일반 명사 1개를 선정해줘.
주제 힌트: ${theme}
조건:
- 누구나 일상에서 잘 아는 한국어 일반 명사 1개 (2~4글자 권장, 띄어쓰기 없이 한 단어)
- 고유명사, 브랜드명, 줄임말, 신조어, 전문 학술 용어 제외
- 최근 출제된 다음 단어는 절대 제외: ${avoidList}
반드시 JSON으로만 응답해줘.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          word: {
            type: 'STRING',
            description: '띄어쓰기 없는 한국어 일반 명사 1개',
          },
        },
        required: ['word'],
      },
      temperature: 0.9,
    },
  });

  let parsedWord = '';
  try {
    const parsed = JSON.parse(rawText) as { word?: unknown };
    if (typeof parsed.word === 'string') {
      parsedWord = sanitizeDisplayWord(parsed.word).replace(/\s+/g, '');
    }
  } catch {
    throw new Error('AI가 생성한 정답 단어 응답이 올바른 JSON 형식이 아닙니다.');
  }

  if (!parsedWord || parsedWord.length < 1 || parsedWord.length > 12) {
    throw new Error('생성된 정답 단어가 유효하지 않습니다. 다시 시도해 주세요.');
  }

  recentSoloWords.push(parsedWord);
  if (recentSoloWords.length > 40) {
    recentSoloWords.shift();
  }

  return parsedWord;
}

export async function scoreHintWithRubric(
  targetWord: string,
  hintWord: string,
  apiKey: string,
): Promise<{ score: number; reason: string }> {
  const rawText = await callGeminiGenerateContent(apiKey, {
    systemInstruction: {
      parts: [{ text: RUBRIC_SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `정답 단어: "${targetWord}"
힌트 단어: "${hintWord}"
위 5단계 기준표에 따라 유사도 점수(score)와 짧은 이유(reason)를 JSON으로 반환하세요.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          score: {
            type: 'NUMBER',
            description: '0.0 이상 99.9 이하의 유사도 점수 (소수점 첫째 자리)',
          },
          reason: {
            type: 'STRING',
            description: '정답 스포일러 없이 15자 이내로 작성한 짧은 연상 근거',
          },
        },
        required: ['score', 'reason'],
      },
      temperature: 0.2,
    },
  });

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
    throw new Error('AI가 유사도 점수를 올바른 JSON 형식으로 계산하지 못했습니다.');
  }
}
