import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Flag, Grid3x3, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import type { ActiveGame } from '../types';

interface LobbyScreenProps {
  savedApiKey: string;
  hasServerKey: boolean;
  onSelectGame: (game: Exclude<ActiveGame, 'LOBBY'>) => void;
  onSaveApiKey: (key: string) => void;
  onClearApiKey: () => void;
}

export function LobbyScreen({
  savedApiKey,
  hasServerKey,
  onSelectGame,
  onSaveApiKey,
  onClearApiKey,
}: LobbyScreenProps) {
  const [keyInput, setKeyInput] = useState(savedApiKey);
  const [showKey, setShowKey] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) {
      onClearApiKey();
      setSaveNotice('저장된 API 키를 삭제했습니다.');
      window.setTimeout(() => setSaveNotice(null), 2500);
      return;
    }
    onSaveApiKey(trimmed);
    setSaveNotice('Gemini API 키가 브라우저(localStorage)에 저장되었습니다.');
    window.setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleClear = () => {
    setKeyInput('');
    onClearApiKey();
    setSaveNotice('저장된 API 키를 삭제했습니다.');
    window.setTimeout(() => setSaveNotice(null), 2500);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium text-sky-400">
          한국어 두뇌 서바이벌 미니게임 허브
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-50 sm:text-5xl [text-wrap:balance]">
          어휘 추리와 순간 기억력, 전략 대결에 도전하세요
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base [text-wrap:balance]">
          AI 의미 벡터 단어 추리, 70개국 국기 기억력 테스트, 7×7 영역 분리 전략 보드게임까지
          세 가지 두뇌 서바이벌 게임을 한 곳에서 즐길 수 있습니다.
        </p>
      </section>

      {/* Three Game Selection Cards */}
      <section
        aria-label="미니게임 선택"
        className="mt-10 grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {/* Game 1: 말결 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 1 · Gemini 임베딩 추리</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              말결 (AI 유사어 추리)
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              출제자 모드 또는 AI 솔로 모드로 숨겨진 정답 단어를 맞혀보세요.
              힌트 단어를 입력하면 <span className="font-mono text-xs text-slate-300">gemini-embedding-001</span>이
              의미 유사도를 0%~100%로 계산해 높은 순으로 정렬합니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>출제자 & 솔로 모드</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                {savedApiKey || hasServerKey ? 'API 연결 준비됨' : 'Gemini API 키 필요'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('WORD_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <span>말결 플레이하기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Game 2: 국기 기억력 테스트 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <Flag className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 2 · 순간 시각 기억력</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              국기 기억력 테스트
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              빠르게 지나가는 10개의 실제 국기를 지정한 사이클만큼 반복 관찰한 뒤,
              5×5 배열의 25개 국기 중 앞서 본 5개 국기를 정확히 찾아내는 집중력 게임입니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>70개국 실제 국기</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-emerald-300/90">API 키 없이 바로 실행</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('FLAG_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 whitespace-nowrap"
            >
              <span>국기 기억력 테스트 시작</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Game 3: 벽바둑 2 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7 md:col-span-2 lg:col-span-1">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
              <Grid3x3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 3 · 영역 분리 전략</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              벽바둑 2
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              7×7 보드 위에서 사각·원형 말을 움직이고 벽을 설치해 영역을 분리하세요.
              1라운드 3인전(벽 부수기 1회)과 2라운드 1:1 결승전, 로컬 멀티 및 AI 봇을 지원합니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>로컬 대전 & AI 봇</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-amber-300/90">API 키 없이 바로 실행</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('WALLBADUK_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap"
            >
              <span>벽바둑 2 시작하기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>

      {/* Bottom Gemini API Key localStorage Configuration */}
      <section
        id="api-key-settings"
        aria-label="Gemini API 키 설정"
        className="mt-10 rounded-2xl border border-slate-800 bg-[#131926]/80 p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <KeyRound className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <span>개인 Gemini API 키 설정</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              입력한 키는 브라우저의 <span className="font-mono text-slate-300">localStorage</span>에만
              저장되며, 게임 1(말결) 실행 시 서버 요청 헤더로 안전하게 전달됩니다.
            </p>
          </div>

          <div className="text-xs font-medium text-slate-400 shrink-0">
            {savedApiKey ? (
              <span className="text-emerald-400">개인 API 키 저장됨</span>
            ) : hasServerKey ? (
              <span className="text-sky-400">서버 기본 키 활성화됨</span>
            ) : (
              <span className="text-amber-300">API 키 미설정</span>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="lobby-gemini-api-key" className="sr-only">
              Gemini API 키
            </label>
            <input
              id="lobby-gemini-api-key"
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIza... 형태의 본인 Gemini API 키 입력 (선택 사항)"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] py-2.5 pl-4 pr-11 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              aria-label={showKey ? 'API 키 숨기기' : 'API 키 보기'}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400 sm:flex-initial whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>저장</span>
            </button>
            {savedApiKey && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>삭제</span>
              </button>
            )}
          </div>
        </form>

        {saveNotice && (
          <p role="status" className="mt-2.5 text-xs font-medium text-emerald-400">
            {saveNotice}
          </p>
        )}
      </section>
    </main>
  );
}
