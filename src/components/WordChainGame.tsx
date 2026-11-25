import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Flag,
  Loader2,
  Lock,
  Search,
  Send,
} from 'lucide-react';
import { HintRow } from './HintRow';
import { ResultSummary } from './ResultSummary';
import { StartScreen } from './StartScreen';
import { VictoryConfetti } from './VictoryConfetti';
import {
  getSimilarityLabel,
  getSimilarityTier,
  type GameMode,
  type GamePhase,
  type GiveUpResponse,
  type GuessAnswerResponse,
  type HintEntry,
  type StartGameResponse,
  type SubmitHintResponse,
} from '../types';
import { soundEngine } from '../utils/sound';

interface WordChainGameProps {
  customApiKey: string;
  onBackToLobby: () => void;
}

export function WordChainGame({ customApiKey, onBackToLobby }: WordChainGameProps) {
  const [phase, setPhase] = useState<GamePhase>('TITLE');
  const [mode, setMode] = useState<GameMode>('solo');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [maskedCount, setMaskedCount] = useState<number>(4);

  const [hints, setHints] = useState<HintEntry[]>([]);
  const [latestHintId, setLatestHintId] = useState<string | null>(null);
  const [alreadyTriedNotice, setAlreadyTriedNotice] = useState<string | null>(null);
  const [hintCount, setHintCount] = useState(0);
  const [answerAttempts, setAnswerAttempts] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [revealedWord, setRevealedWord] = useState<string>('');
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);

  const [hintInput, setHintInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [guessFeedback, setGuessFeedback] = useState<string | null>(null);
  const [shakeGuess, setShakeGuess] = useState(false);

  const [isStartingSolo, setIsStartingSolo] = useState(false);
  const [isStartingSetter, setIsStartingSetter] = useState(false);
  const [isSubmittingHint, setIsSubmittingHint] = useState(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isGivingUp, setIsGivingUp] = useState(false);
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hintInputRef = useRef<HTMLInputElement | null>(null);
  const guessInputRef = useRef<HTMLInputElement | null>(null);

  const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (customApiKey.trim()) {
      headers['x-gemini-api-key'] = customApiKey.trim();
    }
    return headers;
  };

  const sortedHints = useMemo(() => {
    return [...hints].sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      if (b.rawCosine !== a.rawCosine) return b.rawCosine - a.rawCosine;
      return a.order - b.order;
    });
  }, [hints]);

  const latestHint = useMemo(() => {
    if (!latestHintId) return null;
    const index = sortedHints.findIndex((h) => h.id === latestHintId);
    if (index === -1) return null;
    return { entry: sortedHints[index], rank: index + 1 };
  }, [latestHintId, sortedHints]);

  const resetRoundState = () => {
    setHints([]);
    setLatestHintId(null);
    setAlreadyTriedNotice(null);
    setHintCount(0);
    setAnswerAttempts(0);
    setTotalAttempts(0);
    setRevealedWord('');
    setWrongGuesses([]);
    setHintInput('');
    setGuessInput('');
    setGuessFeedback(null);
    setConfirmingGiveUp(false);
    setErrorMessage(null);
  };

  const startGame = async (selectedMode: GameMode, customWord?: string) => {
    setErrorMessage(null);
    if (selectedMode === 'solo') {
      setIsStartingSolo(true);
    } else {
      setIsStartingSetter(true);
    }

    try {
      const response = await fetch('/api/game/start', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          mode: selectedMode,
          customWord: selectedMode === 'setter' ? customWord : undefined,
        }),
      });

      const data = (await response.json()) as Partial<StartGameResponse> & { error?: string };
      if (!response.ok || !data.sessionId) {
        throw new Error(data.error || '게임을 시작하지 못했습니다.');
      }

      resetRoundState();
      setSessionId(data.sessionId);
      setMode(data.mode ?? selectedMode);
      setMaskedCount(data.maskedCount ?? 4);
      setPhase('PLAYING');

      window.setTimeout(() => {
        hintInputRef.current?.focus();
      }, 60);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '게임을 시작하는 중 오류가 발생했습니다.');
    } finally {
      setIsStartingSolo(false);
      setIsStartingSetter(false);
    }
  };

  const handleReturnToTitle = () => {
    resetRoundState();
    setSessionId(null);
    setPhase('TITLE');
  };

  const handleHintSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const word = hintInput.trim();
    if (!word || !sessionId || isSubmittingHint) return;

    setErrorMessage(null);
    setAlreadyTriedNotice(null);
    setIsSubmittingHint(true);

    try {
      const response = await fetch('/api/game/hint', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ sessionId, word }),
      });

      const data = (await response.json()) as Partial<SubmitHintResponse> & { error?: string };
      if (!response.ok || !data.hint) {
        throw new Error(data.error || '유사도를 계산하지 못했습니다.');
      }

      const returnedHint = data.hint;
      setHintCount(data.hintCount ?? hintCount);
      setAnswerAttempts(data.answerAttempts ?? answerAttempts);
      setLatestHintId(returnedHint.id);

      if (data.alreadyTried) {
        setAlreadyTriedNotice(`'${returnedHint.word}'은(는) 이미 입력한 힌트입니다.`);
      } else {
        setHints((prev) => [...prev, returnedHint]);
        soundEngine.playHintResult(returnedHint.similarity);
      }

      setHintInput('');
      hintInputRef.current?.focus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '유사도 계산 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingHint(false);
    }
  };

  const submitAnswerChallenge = async (candidateWord: string) => {
    const word = candidateWord.trim();
    if (!word || !sessionId || isSubmittingGuess) return;

    setErrorMessage(null);
    setGuessFeedback(null);
    setIsSubmittingGuess(true);

    try {
      const response = await fetch('/api/game/guess', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ sessionId, word }),
      });

      const data = (await response.json()) as Partial<GuessAnswerResponse> & { error?: string };
      if (!response.ok || typeof data.correct !== 'boolean') {
        throw new Error(data.error || '정답 확인 중 오류가 발생했습니다.');
      }

      setHintCount(data.hintCount ?? hintCount);
      setAnswerAttempts(data.answerAttempts ?? answerAttempts);
      setTotalAttempts(data.totalAttempts ?? hintCount + answerAttempts);

      if (data.correct && data.targetWord) {
        soundEngine.playVictory();
        setRevealedWord(data.targetWord);
        setPhase('VICTORY');
      } else {
        soundEngine.playWrongGuess();
        setWrongGuesses((prev) => (prev.includes(word) ? prev : [...prev, word]));
        setGuessFeedback(`'${word}'은(는) 정답이 아닙니다.`);
        setGuessInput('');
        setShakeGuess(false);
        window.requestAnimationFrame(() => setShakeGuess(true));
        window.setTimeout(() => setShakeGuess(false), 280);
        guessInputRef.current?.focus();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '정답 확인 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingGuess(false);
    }
  };

  const handleGuessSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitAnswerChallenge(guessInput);
  };

  const handleGiveUp = async () => {
    if (!sessionId || isGivingUp) return;
    setErrorMessage(null);
    setIsGivingUp(true);

    try {
      const response = await fetch('/api/game/give-up', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ sessionId }),
      });

      const data = (await response.json()) as Partial<GiveUpResponse> & { error?: string };
      if (!response.ok || !data.targetWord) {
        throw new Error(data.error || '정답을 불러오지 못했습니다.');
      }

      setRevealedWord(data.targetWord);
      setHintCount(data.hintCount ?? hintCount);
      setAnswerAttempts(data.answerAttempts ?? answerAttempts);
      setTotalAttempts(data.totalAttempts ?? hintCount + answerAttempts);
      setConfirmingGiveUp(false);
      setPhase('GAVE_UP');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '정답 공개 중 오류가 발생했습니다.');
    } finally {
      setIsGivingUp(false);
    }
  };

  const handlePrefillGuess = (word: string) => {
    setGuessInput(word);
    setGuessFeedback(null);
    guessInputRef.current?.focus();
  };

  return (
    <>
      {phase === 'VICTORY' && <VictoryConfetti />}

      {/* Sub-bar context strip */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <button
          type="button"
          onClick={phase === 'TITLE' ? onBackToLobby : handleReturnToTitle}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{phase === 'TITLE' ? '로비로 돌아가기' : '모드 선택으로'}</span>
        </button>

        {phase !== 'TITLE' && (
          <button
            type="button"
            onClick={handleReturnToTitle}
            className="text-xs font-medium text-slate-400 transition-colors hover:text-sky-300 whitespace-nowrap"
          >
            새 문제 시작
          </button>
        )}
      </div>

      {phase === 'TITLE' && (
        <StartScreen
          isStartingSolo={isStartingSolo}
          isStartingSetter={isStartingSetter}
          errorMessage={errorMessage}
          onStartSolo={() => startGame('solo')}
          onStartSetter={(word) => startGame('setter', word)}
          onClearError={() => setErrorMessage(null)}
        />
      )}

      {phase === 'PLAYING' && (
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
            {/* Left Column: Secret Vault + Hint Probe + Answer Challenge */}
            <section className="space-y-5 lg:sticky lg:top-20 lg:col-span-5">
              <div className="rounded-2xl border border-slate-800 bg-[#131926] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                    <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span>숨겨진 정답</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>{mode === 'solo' ? '솔로 모드' : '출제자 모드'}</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      힌트 {hintCount}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      도전 {answerAttempts}
                    </span>
                  </div>
                </div>

                <div
                  className="mt-4 flex items-center justify-center gap-2.5 rounded-xl border border-slate-800/90 bg-[#0B0F17] py-4"
                  aria-label="정답 단어가 마스킹되어 숨겨져 있습니다"
                >
                  {Array.from({ length: Math.min(6, Math.max(4, maskedCount)) }).map((_, i) => (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 rounded-full bg-slate-500/80"
                      aria-hidden="true"
                    />
                  ))}
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    마스킹됨
                  </span>
                </div>

                {/* Hint Input */}
                <form onSubmit={handleHintSubmit} className="mt-5">
                  <label
                    htmlFor="hint-word-input"
                    className="block text-sm font-semibold text-slate-100"
                  >
                    힌트 단어 입력
                  </label>
                  <p className="mt-0.5 text-xs text-slate-400">
                    단어를 입력해 정답과의 의미 유사도를 측정하세요.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <input
                      ref={hintInputRef}
                      id="hint-word-input"
                      type="text"
                      value={hintInput}
                      onChange={(e) => setHintInput(e.target.value)}
                      placeholder="예: 바다, 사과, 음악"
                      maxLength={25}
                      autoComplete="off"
                      disabled={isSubmittingHint}
                      className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-700/80 bg-[#0B0F17] px-4 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingHint || hintInput.trim().length === 0}
                      className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      {isSubmittingHint ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Search className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>유사도 측정</span>
                    </button>
                  </div>
                </form>

                <hr className="my-5 border-slate-800/90" />

                {/* Answer Challenge Input */}
                <form
                  onSubmit={handleGuessSubmit}
                  className={shakeGuess ? 'animate-shake' : undefined}
                >
                  <label
                    htmlFor="guess-answer-input"
                    className="block text-sm font-semibold text-emerald-300"
                  >
                    정답 도전
                  </label>
                  <p className="mt-0.5 text-xs text-slate-400">
                    정답이 떠올랐다면 아래에 입력해 맞혀보세요.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <input
                      ref={guessInputRef}
                      id="guess-answer-input"
                      type="text"
                      value={guessInput}
                      onChange={(e) => {
                        if (guessFeedback) setGuessFeedback(null);
                        setGuessInput(e.target.value);
                      }}
                      placeholder="정답 단어를 입력하세요"
                      maxLength={25}
                      autoComplete="off"
                      disabled={isSubmittingGuess}
                      className="min-h-12 min-w-0 flex-1 rounded-xl border border-emerald-500/35 bg-[#0B0F17] px-4 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingGuess || guessInput.trim().length === 0}
                      className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      {isSubmittingGuess ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>정답 확인</span>
                    </button>
                  </div>

                  {guessFeedback && (
                    <p role="status" className="mt-2 text-xs font-medium text-rose-300">
                      {guessFeedback}
                    </p>
                  )}

                  {wrongGuesses.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      오답 기록: <span className="text-slate-400">{wrongGuesses.join(' · ')}</span>
                    </p>
                  )}
                </form>

                {/* Give Up */}
                <div className="mt-5 border-t border-slate-800/80 pt-4">
                  {!confirmingGiveUp ? (
                    <button
                      type="button"
                      onClick={() => setConfirmingGiveUp(true)}
                      className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>포기 및 정답 보기</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">정말 포기하고 정답을 볼까요?</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingGiveUp(false)}
                          disabled={isGivingUp}
                          className="min-h-9 rounded-lg border border-slate-700 px-3 py-1.5 font-medium text-slate-300 transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleGiveUp}
                          disabled={isGivingUp}
                          className="min-h-9 rounded-lg bg-rose-500/90 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                          {isGivingUp ? '불러오는 중...' : '정답 보기'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Right Column: Latest Guess Banner + Auto-Sorted Similarity Ranking */}
            <section className="lg:col-span-7">
              {latestHint && (
                <div className="mb-5 rounded-2xl border border-sky-500/35 bg-[#131926] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="font-medium text-sky-400">최근 측정 결과</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="font-mono tabular-nums">
                          현재 {latestHint.rank}위
                        </span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span>{getSimilarityLabel(latestHint.entry.similarity)}</span>
                      </div>
                      <p className="mt-1 truncate text-lg font-bold text-slate-100">
                        {latestHint.entry.word}
                      </p>
                      {alreadyTriedNotice && (
                        <p className="mt-0.5 text-xs text-amber-300/90">
                          {alreadyTriedNotice}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <span
                        className={`font-mono text-2xl font-bold tabular-nums ${
                          getSimilarityTier(latestHint.entry.similarity) === 'high'
                            ? 'text-emerald-400'
                            : getSimilarityTier(latestHint.entry.similarity) === 'medium'
                              ? 'text-amber-300'
                              : 'text-slate-300'
                        }`}
                      >
                        {latestHint.entry.similarity.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {latestHint.entry.isExactMatch && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>정답 단어와 정확히 일치합니다!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => submitAnswerChallenge(latestHint.entry.word)}
                        disabled={isSubmittingGuess}
                        className="min-h-9 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0"
                      >
                        이 단어로 정답 완료하기
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-200">
                  힌트 목록{' '}
                  <span className="font-mono font-normal tabular-nums text-slate-400">
                    ({sortedHints.length})
                  </span>
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>유사도 높은 순 자동 정렬</span>
                </div>
              </div>

              {sortedHints.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-[#131926]/50 px-6 py-14 text-center">
                  <p className="text-base font-semibold text-slate-200">
                    첫 번째 힌트 단어를 입력해보세요
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                    자연, 음식, 도구, 장소, 감정처럼 넓은 범위의 단어로 시작하면
                    정답이 속한 의미 영역을 빠르게 좁힐 수 있습니다.
                  </p>
                </div>
              ) : (
                <ol className="space-y-2.5" aria-label="유사도 순 힌트 목록">
                  {sortedHints.map((hint, idx) => (
                    <HintRow
                      key={hint.id}
                      hint={hint}
                      rank={idx + 1}
                      isLatest={hint.id === latestHintId}
                      onSelectForGuess={handlePrefillGuess}
                    />
                  ))}
                </ol>
              )}
            </section>
          </div>
        </main>
      )}

      {(phase === 'VICTORY' || phase === 'GAVE_UP') && (
        <ResultSummary
          won={phase === 'VICTORY'}
          mode={mode}
          targetWord={revealedWord}
          hintCount={hintCount}
          answerAttempts={answerAttempts}
          totalAttempts={totalAttempts}
          sortedHints={sortedHints}
          wrongGuesses={wrongGuesses}
          isStartingSolo={isStartingSolo}
          onPlaySoloAgain={() => startGame('solo')}
          onReturnToTitle={handleReturnToTitle}
        />
      )}
    </>
  );
}
