import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Sparkles } from 'lucide-react';

interface StartScreenProps {
  isStartingSolo: boolean;
  isStartingSetter: boolean;
  errorMessage: string | null;
  onStartSolo: () => void;
  onStartSetter: (customWord: string) => void;
  onClearError: () => void;
}

export function StartScreen({
  isStartingSolo,
  isStartingSetter,
  errorMessage,
  onStartSolo,
  onStartSetter,
  onClearError,
}: StartScreenProps) {
  const [customWord, setCustomWord] = useState('');
  const [showWord, setShowWord] = useState(false);

  const isBusy = isStartingSolo || isStartingSetter;

  const handleSetterSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = customWord.trim();
    if (!trimmed || isBusy) return;
    onStartSetter(trimmed);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium text-sky-400">
          한국어 의미 유사도 추리 게임
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-50 sm:text-5xl [text-wrap:balance]">
          단어의 의미 거리로 숨겨진 정답을 찾으세요
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base [text-wrap:balance]">
          힌트 단어를 입력하면 AI가 한국어 연상·의미 채점 기준에 따라 유사도를 0%에서 100%로 계산합니다.
          점수가 높은 단어를 따라 의미를 좁혀가며 정답에 도전해보세요.
        </p>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="mx-auto mt-6 max-w-3xl rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      <section
        aria-label="게임 모드 선택"
        className="mt-10 grid grid-cols-1 items-stretch gap-6 md:grid-cols-2"
      >
        {/* Solo Play (AI Setter) */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>AI 자동 출제</span>
            </div>
            <h2 className="mt-2.5 text-xl font-bold text-slate-100">
              솔로 플레이 (AI 출제)
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Gemini AI가 일상 속 한국어 일반 명사 중 무작위로 정답 단어 1개를 선정합니다.
              혼자서 어휘력과 추리력을 시험해보기에 가장 좋습니다.
            </p>
          </div>

          <div className="mt-8">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                onClearError();
                onStartSolo();
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
            >
              {isStartingSolo ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>정답 단어를 고르는 중...</span>
                </>
              ) : (
                <>
                  <span>솔로 플레이 시작</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Setter Mode */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>직접 출제 · 마스킹 보호</span>
            </div>
            <h2 className="mt-2.5 text-xl font-bold text-slate-100">
              출제자 모드
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              출제자가 정답 단어를 직접 입력하고 시작하면 화면에서 즉시 숨겨집니다.
              친구와 한 화면을 번갈아 보며 문제를 내고 맞혀보세요.
            </p>
          </div>

          <form onSubmit={handleSetterSubmit} className="mt-6 space-y-3">
            <div>
              <label htmlFor="setter-word-input" className="sr-only">
                출제할 정답 단어
              </label>
              <div className="relative">
                <input
                  id="setter-word-input"
                  type={showWord ? 'text' : 'password'}
                  value={customWord}
                  onChange={(e) => {
                    if (errorMessage) onClearError();
                    setCustomWord(e.target.value);
                  }}
                  placeholder="정답 단어를 입력하세요 (예: 도서관)"
                  maxLength={20}
                  autoComplete="off"
                  disabled={isBusy}
                  className="min-h-12 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] py-3 pl-4 pr-12 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowWord((prev) => !prev)}
                  aria-label={showWord ? '입력한 단어 숨기기' : '입력한 단어 보기'}
                  className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  {showWord ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy || customWord.trim().length === 0}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors duration-150 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
            >
              {isStartingSetter ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>정답을 숨기는 중...</span>
                </>
              ) : (
                <>
                  <span>게임 시작</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      {/* Clean unboxed similarity legend */}
      <section
        aria-label="유사도 색상 기준"
        className="mt-10 border-t border-slate-800/80 pt-7"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-medium text-slate-400">
            유사도 게이지 안내
          </span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="h-2 w-5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="font-mono tabular-nums text-emerald-400">90%+ / 70%+</span>
              <span className="text-slate-400">핵심 연관어 · 밀접한 관련</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-5 rounded-full bg-amber-400" aria-hidden="true" />
              <span className="font-mono tabular-nums text-amber-300">45–69%</span>
              <span className="text-slate-400">간접 연상</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-5 rounded-full bg-slate-500" aria-hidden="true" />
              <span className="font-mono tabular-nums text-slate-400">45% 미만</span>
              <span className="text-slate-400">약한 연결 · 무관함</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
