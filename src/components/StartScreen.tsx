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
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto max-w-2xl text-center">
        <span className="inline-block rounded bg-white/10 px-2.5 py-0.5 font-mono text-xs font-bold tracking-wider text-[#6B61FF]">
          WORD LOGIC CHALLENGE
        </span>
        <h1 className="arcade-hero-title mt-3 -rotate-1 text-4xl font-bold leading-tight sm:text-5xl [text-wrap:balance]">
          단어의 의미 결을 따라 정답을 찾으세요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-base [text-wrap:balance]">
          힌트 단어를 입력하면 AI가 한국어 연상·의미 채점 기준에 따라 유사도를 0%에서 100%로 계산합니다.
        </p>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="mx-auto mt-6 max-w-3xl rounded-2xl border-2 border-rose-400 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100"
        >
          {errorMessage}
        </div>
      )}

      <section
        aria-label="게임 모드 선택"
        className="mt-8 grid grid-cols-1 items-stretch gap-6 md:grid-cols-2"
      >
        {/* Solo Play (AI Setter) */}
        <div className="arcade-card flex flex-col justify-between rounded-[24px] p-6 sm:p-7">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#FFD21E]">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>AI 자동 출제</span>
            </div>
            <h2 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl">
              솔로 플레이 (AI 출제)
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              AI가 일상 속 한국어 일반 명사 중 무작위로 정답 단어 1개를 선정합니다.
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
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-5 py-3 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all duration-150 hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD21E] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
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
        <div className="arcade-card flex flex-col justify-between rounded-[24px] p-6 sm:p-7">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#FF61D2]">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>직접 출제 · 마스킹 보호</span>
            </div>
            <h2 className="font-display mt-2 text-2xl font-bold text-white sm:text-3xl">
              출제자 모드
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
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
                  className="min-h-12 w-full rounded-xl border-2 border-[#2B2857] bg-[#121026] py-3 pl-4 pr-12 text-base text-white placeholder:text-white/40 focus:border-[#6B61FF] focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowWord((prev) => !prev)}
                  aria-label={showWord ? '입력한 단어 숨기기' : '입력한 단어 보기'}
                  className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-[#6B61FF] hover:text-white focus-visible:outline-2 focus-visible:outline-[#FFD21E]"
                >
                  {showWord ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy || customWord.trim().length === 0}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6B61FF] px-5 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#433AB5] transition-all duration-150 hover:bg-[#FF61D2] hover:text-[#121026] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD21E] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
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
        className="mt-10 border-t-2 border-[#2B2857] pt-7"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-xs font-bold text-[#FFD21E]">
            유사도 게이지 안내
          </span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/80">
            <div className="flex items-center gap-2">
              <span className="h-2 w-5 rounded-full bg-[#FF61D2]" aria-hidden="true" />
              <span className="font-mono tabular-nums text-[#FF61D2]">90%+ / 70%+</span>
              <span className="text-white/70">핵심 연관어 · 밀접한 관련</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-5 rounded-full bg-[#FFD21E]" aria-hidden="true" />
              <span className="font-mono tabular-nums text-[#FFD21E]">45–69%</span>
              <span className="text-white/70">간접 연상</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-5 rounded-full bg-white/40" aria-hidden="true" />
              <span className="font-mono tabular-nums text-white/60">45% 미만</span>
              <span className="text-white/70">약한 연결 · 무관함</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
