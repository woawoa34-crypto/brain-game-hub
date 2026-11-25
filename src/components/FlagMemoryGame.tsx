import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Flag,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trophy,
  X,
} from 'lucide-react';
import { FLAG_COUNTRIES, getFlagImageUrl, type FlagCountry } from '../data/flags';
import { soundEngine } from '../utils/sound';
import { VictoryConfetti } from './VictoryConfetti';

type FlagGamePhase = 'SETUP' | 'PRELOADING' | 'EXPOSURE' | 'READY' | 'RECALL' | 'RESULT';

interface FlagMemoryGameProps {
  onBackToLobby: () => void;
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function FlagImage({
  country,
  className = '',
}: {
  country: FlagCountry;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-800 text-slate-300 ${className}`}
      >
        <span className="font-mono text-xs font-bold uppercase">{country.code}</span>
        <span className="mt-0.5 text-[11px] text-slate-400">{country.nameKo}</span>
      </div>
    );
  }

  return (
    <img
      src={getFlagImageUrl(country.code)}
      alt={`${country.nameKo} 국기`}
      referrerPolicy="no-referrer"
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

const EXPOSURE_TIME_PRESETS = [0.3, 0.5, 0.8, 1.2];
const CYCLE_PRESETS = [1, 2, 3, 5];

export function FlagMemoryGame({ onBackToLobby }: FlagMemoryGameProps) {
  const [phase, setPhase] = useState<FlagGamePhase>('SETUP');
  const [secondsPerFlag, setSecondsPerFlag] = useState<number>(0.5);
  const [totalCycles, setTotalCycles] = useState<number>(3);

  const [exposureFlags, setExposureFlags] = useState<FlagCountry[]>([]);
  const [targetCodes, setTargetCodes] = useState<Set<string>>(new Set());
  const [gridFlags, setGridFlags] = useState<FlagCountry[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const [currentCycle, setCurrentCycle] = useState<number>(1);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const timerRef = useRef<number | null>(null);

  const safeSeconds = Number.isFinite(secondsPerFlag)
    ? Math.max(0.2, Math.min(5, secondsPerFlag))
    : 0.5;
  const safeCycles = Number.isFinite(totalCycles)
    ? Math.max(1, Math.min(10, Math.round(totalCycles)))
    : 3;
  const totalDurationSeconds = Math.round(safeSeconds * 10 * safeCycles * 10) / 10;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const preloadImages = async (countries: FlagCountry[]) => {
    await Promise.all(
      countries.map(
        (country) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.referrerPolicy = 'no-referrer';
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = getFlagImageUrl(country.code);
            window.setTimeout(resolve, 2500);
          }),
      ),
    );
  };

  const startRound = async () => {
    clearTimer();
    const shuffled = shuffleArray(FLAG_COUNTRIES);
    const tenExposed = shuffled.slice(0, 10);
    const fiveTargets = shuffleArray(tenExposed).slice(0, 5);
    const twentyNew = shuffled.slice(10, 30);
    const twentyFiveGrid = shuffleArray([...fiveTargets, ...twentyNew]);

    setExposureFlags(tenExposed);
    setTargetCodes(new Set(fiveTargets.map((f) => f.code)));
    setGridFlags(twentyFiveGrid);
    setSelectedCodes([]);
    setCurrentCycle(1);
    setCurrentIndex(0);
    setPhase('PRELOADING');

    await preloadImages([...tenExposed, ...twentyNew]);

    setPhase('EXPOSURE');
  };

  useEffect(() => {
    if (phase !== 'EXPOSURE') return;

    soundEngine.playTick();
    const intervalMs = Math.round(safeSeconds * 1000);

    timerRef.current = window.setTimeout(() => {
      if (currentIndex + 1 < 10) {
        setCurrentIndex((prev) => prev + 1);
      } else if (currentCycle < safeCycles) {
        setCurrentCycle((prev) => prev + 1);
        setCurrentIndex(0);
      } else {
        setPhase('READY');
      }
    }, intervalMs);

    return () => clearTimer();
  }, [phase, currentIndex, currentCycle, safeSeconds, safeCycles]);

  const toggleFlagSelection = (code: string) => {
    if (phase !== 'RECALL') return;
    setSelectedCodes((prev) => {
      if (prev.includes(code)) {
        soundEngine.playSelect();
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 5) {
        return prev;
      }
      soundEngine.playSelect();
      return [...prev, code];
    });
  };

  const handleSubmitRecall = () => {
    if (selectedCodes.length !== 5) return;
    const hitCount = selectedCodes.filter((code) => targetCodes.has(code)).length;
    if (hitCount === 5) {
      soundEngine.playVictory();
    } else if (hitCount >= 3) {
      soundEngine.playHintResult(85);
    } else {
      soundEngine.playWrongGuess();
    }
    setPhase('RESULT');
  };

  const resultStats = useMemo(() => {
    const selectedSet = new Set(selectedCodes);
    let hits = 0;
    let wrong = 0;
    let missed = 0;

    for (const flag of gridFlags) {
      const isTarget = targetCodes.has(flag.code);
      const isSelected = selectedSet.has(flag.code);
      if (isTarget && isSelected) hits += 1;
      else if (!isTarget && isSelected) wrong += 1;
      else if (isTarget && !isSelected) missed += 1;
    }

    return { hits, wrong, missed, selectedSet };
  }, [gridFlags, selectedCodes, targetCodes]);

  const activeExposureFlag = exposureFlags[currentIndex];
  const totalSteps = safeCycles * 10;
  const completedSteps = (currentCycle - 1) * 10 + (currentIndex + 1);
  const progressRatio = Math.min(1, completedSteps / totalSteps);

  return (
    <>
      {phase === 'RESULT' && resultStats.hits === 5 && <VictoryConfetti />}

      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <button
          type="button"
          onClick={phase === 'SETUP' ? onBackToLobby : () => {
            clearTimer();
            setPhase('SETUP');
          }}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{phase === 'SETUP' ? '로비로 돌아가기' : '설정 화면으로'}</span>
        </button>

        <span className="text-xs text-slate-500">
          {FLAG_COUNTRIES.length}개국 국기 데이터셋
        </span>
      </div>

      {/* Phase 0: SETUP */}
      {phase === 'SETUP' && (
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <section className="text-center">
            <p className="text-xs font-medium text-emerald-400">
              게임 2 · 순간 시각 기억력 테스트
            </p>
            <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl [text-wrap:balance]">
              국기 기억력 테스트
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
              무작위 10개 국기가 지정한 시간과 횟수만큼 순서대로 지나갑니다.
              모두 본 뒤 5×5 배열의 25개 국기 중 앞서 본 5개 국기를 찾아내세요.
            </p>
          </section>

          <section className="mt-8 rounded-2xl border border-slate-800 bg-[#131926] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>노출 규칙 설정</span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Setting 1: Seconds per flag */}
              <div>
                <label
                  htmlFor="flag-seconds-input"
                  className="flex items-center gap-2 text-sm font-semibold text-slate-200"
                >
                  <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>국기 1개당 노출 시간 (초)</span>
                </label>
                <input
                  id="flag-seconds-input"
                  type="number"
                  min={0.2}
                  max={5}
                  step={0.1}
                  value={secondsPerFlag}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSecondsPerFlag(Number.isNaN(val) ? 0.5 : val);
                  }}
                  onBlur={() => setSecondsPerFlag(Math.round(safeSeconds * 10) / 10)}
                  className="mt-2.5 min-h-12 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-4 py-2.5 font-mono text-lg font-bold tabular-nums text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {EXPOSURE_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSecondsPerFlag(preset)}
                      className={`min-h-8 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors ${
                        Math.abs(safeSeconds - preset) < 0.01
                          ? 'bg-emerald-500 text-slate-950'
                          : 'border border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {preset}초
                    </button>
                  ))}
                </div>
              </div>

              {/* Setting 2: Total cycles */}
              <div>
                <label
                  htmlFor="flag-cycles-input"
                  className="flex items-center gap-2 text-sm font-semibold text-slate-200"
                >
                  <Layers className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>총 보여지는 사이클 횟수 (회)</span>
                </label>
                <input
                  id="flag-cycles-input"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={totalCycles}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setTotalCycles(Number.isNaN(val) ? 3 : val);
                  }}
                  onBlur={() => setTotalCycles(safeCycles)}
                  className="mt-2.5 min-h-12 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-4 py-2.5 font-mono text-lg font-bold tabular-nums text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {CYCLE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTotalCycles(preset)}
                      className={`min-h-8 rounded-lg px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors ${
                        safeCycles === preset
                          ? 'bg-emerald-500 text-slate-950'
                          : 'border border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {preset}회
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Real-time Total Duration Summary */}
            <div className="mt-7 flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-800 bg-[#0B0F17] px-5 py-4 sm:flex-row sm:items-center">
              <div className="text-xs text-slate-400">
                <span>총 소요 시간</span>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-500">
                  {safeSeconds.toFixed(1)}초 × 10개 × {safeCycles}회
                </p>
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400">
                {totalDurationSeconds.toFixed(1)}
                <span className="ml-1 font-sans text-sm font-semibold text-emerald-300">초</span>
              </div>
            </div>

            <button
              type="button"
              onClick={startRound}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 whitespace-nowrap"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>기억력 테스트 시작</span>
            </button>
          </section>
        </main>
      )}

      {/* Preloading */}
      {phase === 'PRELOADING' && (
        <main className="mx-auto flex w-full max-w-xl flex-col items-center justify-center px-4 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden="true" />
          <p className="mt-4 text-base font-semibold text-slate-100">
            국기 이미지를 불러오는 중입니다...
          </p>
          <p className="mt-1 text-xs text-slate-400">
            정확한 {safeSeconds.toFixed(1)}초 간격 노출을 위해 미리 준비하고 있습니다.
          </p>
        </main>
      )}

      {/* Phase 1: EXPOSURE */}
      {phase === 'EXPOSURE' && activeExposureFlag && (
        <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-2xl border border-slate-800 bg-[#131926] p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-medium text-emerald-400">현재 회차</span>
                <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-slate-100">
                  {currentCycle} <span className="text-sm font-normal text-slate-400">/ {safeCycles} 회차</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-slate-400">국기 순서</span>
                <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-sky-400">
                  {currentIndex + 1} <span className="text-sm font-normal text-slate-400">/ 10</span>
                </p>
              </div>
            </div>

            {/* Smooth Progress Bar */}
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full w-full origin-left rounded-full bg-emerald-400 transition-transform duration-150 ease-out"
                style={{ transform: `scaleX(${progressRatio})` }}
              />
            </div>

            {/* Central Flag Display */}
            <div className="mt-8 flex flex-col items-center">
              <div className="aspect-[3/2] w-full max-w-sm overflow-hidden rounded-xl border border-slate-700/80 bg-[#0B0F17] shadow-lg">
                <FlagImage
                  key={`${currentCycle}-${activeExposureFlag.code}`}
                  country={activeExposureFlag}
                />
              </div>
              <p className="mt-5 text-xs text-slate-400">
                국기의 색상과 문양을 집중해서 기억하세요
              </p>
            </div>
          </div>
        </main>
      )}

      {/* Phase 2: READY */}
      {phase === 'READY' && (
        <main className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6 sm:py-20">
          <section className="rounded-2xl border border-slate-800 bg-[#131926] p-7 text-center sm:p-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Flag className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-slate-50">
              국기 노출이 모두 끝났습니다
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
              총 {safeCycles}회차({totalDurationSeconds.toFixed(1)}초) 동안 10개의 국기를 확인했습니다.
              다음 화면의 5×5 배열(25개 국기)에서 방금 본 국기 중 5개를 찾아 선택하세요.
            </p>

            <button
              type="button"
              onClick={() => setPhase('RECALL')}
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:w-auto sm:min-w-48 whitespace-nowrap"
            >
              <span>시작</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </section>
        </main>
      )}

      {/* Phase 3: RECALL (5x5 Grid) */}
      {phase === 'RECALL' && (
        <main className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-6 sm:py-8">
          <div className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-base font-bold text-slate-100 sm:text-lg">
                방금 본 국기 5개를 선택하세요
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                25개 국기 중 앞서 등장했던 국기 5개가 섞여 있습니다.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <div className="font-mono text-sm font-bold tabular-nums text-slate-200">
                선택{' '}
                <span className={selectedCodes.length === 5 ? 'text-emerald-400' : 'text-sky-400'}>
                  {selectedCodes.length}
                </span>
                <span className="text-slate-500"> / 5</span>
              </div>

              <button
                type="button"
                disabled={selectedCodes.length !== 5}
                onClick={handleSubmitRecall}
                className="min-h-11 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 whitespace-nowrap shrink-0"
              >
                제출
              </button>
            </div>
          </div>

          <div
            className="grid grid-cols-5 gap-1.5 sm:gap-3"
            role="group"
            aria-label="5x5 국기 선택 배열"
          >
            {gridFlags.map((flag) => {
              const isSelected = selectedCodes.includes(flag.code);
              const selectionOrder = selectedCodes.indexOf(flag.code) + 1;
              const disabled = !isSelected && selectedCodes.length >= 5;

              return (
                <button
                  key={flag.code}
                  type="button"
                  onClick={() => toggleFlagSelection(flag.code)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={`국기 선택 ${isSelected ? '(선택됨)' : ''}`}
                  className={`group relative aspect-[3/2] min-h-11 overflow-hidden rounded-lg border-2 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:rounded-xl ${
                    isSelected
                      ? 'border-sky-400 ring-2 ring-sky-400/40 scale-[0.98]'
                      : disabled
                        ? 'border-slate-800/70 opacity-45 cursor-not-allowed'
                        : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <FlagImage country={flag} />

                  {isSelected && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-sky-400 font-mono text-[11px] font-bold text-slate-950 shadow sm:right-1.5 sm:top-1.5 sm:h-6 sm:w-6 sm:text-xs">
                      {selectionOrder}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </main>
      )}

      {/* Phase 4: RESULT */}
      {phase === 'RESULT' && (
        <main className="mx-auto w-full max-w-4xl px-3 py-6 sm:px-6 sm:py-10">
          <section className="rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  <span>채점 결과</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold text-slate-50 sm:text-3xl">
                  5개 중{' '}
                  <span className="font-mono tabular-nums text-emerald-400">
                    {resultStats.hits}
                  </span>
                  개를 맞혔습니다
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  설정: {safeSeconds.toFixed(1)}초 / 국기 · {safeCycles}회차 반복
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={startRound}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>같은 설정으로 다시하기</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('SETUP')}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
                >
                  <span>설정 변경</span>
                </button>
              </div>
            </div>

            {/* Score Breakdown & Legend */}
            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-slate-800 pt-5">
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>정답</span>
                </dt>
                <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
                  {resultStats.hits}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-rose-400">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>오답</span>
                </dt>
                <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
                  {resultStats.wrong}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-amber-300">놓친 정답</dt>
                <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
                  {resultStats.missed}
                </dd>
              </div>
            </dl>
          </section>

          {/* 5x5 Visual Grading Grid */}
          <section className="mt-6">
            <div
              className="grid grid-cols-5 gap-1.5 sm:gap-3"
              aria-label="5x5 국기 채점 결과 배열"
            >
              {gridFlags.map((flag) => {
                const isTarget = targetCodes.has(flag.code);
                const isSelected = resultStats.selectedSet.has(flag.code);

                let status: 'hit' | 'wrong' | 'missed' | 'neutral' = 'neutral';
                if (isTarget && isSelected) status = 'hit';
                else if (!isTarget && isSelected) status = 'wrong';
                else if (isTarget && !isSelected) status = 'missed';

                const cardStyle =
                  status === 'hit'
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : status === 'wrong'
                      ? 'border-rose-500 bg-rose-500/10'
                      : status === 'missed'
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-slate-800/80 bg-[#131926]/60 opacity-45';

                const labelText =
                  status === 'hit'
                    ? '정답'
                    : status === 'wrong'
                      ? '오답'
                      : status === 'missed'
                        ? '놓침'
                        : '';

                const labelColor =
                  status === 'hit'
                    ? 'text-emerald-400'
                    : status === 'wrong'
                      ? 'text-rose-400'
                      : status === 'missed'
                        ? 'text-amber-300'
                        : 'text-slate-500';

                return (
                  <div
                    key={flag.code}
                    className={`flex flex-col overflow-hidden rounded-lg border-2 p-1 sm:rounded-xl sm:p-1.5 ${cardStyle}`}
                  >
                    <div className="aspect-[3/2] w-full overflow-hidden rounded bg-[#0B0F17]">
                      <FlagImage country={flag} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1 px-0.5 text-[10px] sm:mt-1.5 sm:text-xs">
                      <span className="truncate font-medium text-slate-200">
                        {flag.nameKo}
                      </span>
                      {labelText && (
                        <span className={`shrink-0 font-bold ${labelColor}`}>
                          {labelText}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}
    </>
  );
}
