import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Flag,
  Home,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trophy,
  X,
} from 'lucide-react';
import { set as fbSet, update as fbUpdate } from 'firebase/database';
import { FLAG_COUNTRIES, getFlagImageUrl, type FlagCountry } from '../data/flags';
import {
  getRoomGameStateRef,
  recordMatchWinnerScore,
  rematchSameGame,
  resolveHostRole,
} from '../services/onlineRoom';
import type {
  FlagSubmissionRecord,
  OnlineFlagMemoryState,
  OnlineGameSharedProps,
  OnlineRole,
} from '../types/online';
import { soundEngine } from '../utils/sound';
import { GameBoardLayout, SquareBoardBox } from './GameBoardLayout';
import { VictoryConfetti } from './VictoryConfetti';

type FlagGamePhase = 'SETUP' | 'PRELOADING' | 'EXPOSURE' | 'READY' | 'RECALL' | 'RESULT';

interface FlagMemoryGameProps extends OnlineGameSharedProps {
  onBackToLobby: () => void;
}

const FLAG_MAP = new Map<string, FlagCountry>(FLAG_COUNTRIES.map((c) => [c.code, c]));

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
        className={`flex aspect-[3/2] max-h-full w-full flex-col items-center justify-center rounded bg-slate-800 text-slate-300 ${className}`}
      >
        <span className="font-mono text-xs font-bold uppercase">{country.code}</span>
        <span className="mt-0.5 text-[10px] text-slate-400">{country.nameKo}</span>
      </div>
    );
  }

  return (
    <div className={`flex aspect-[3/2] max-h-full w-full items-center justify-center ${className}`}>
      <img
        src={getFlagImageUrl(country.code)}
        alt={`${country.nameKo} 국기`}
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

const EXPOSURE_TIME_PRESETS = [0.3, 0.5, 0.8, 1.2];
const CYCLE_PRESETS = [1, 2, 3, 5];

export function FlagMemoryGame({
  onBackToLobby,
  isPaused = false,
  onlineRoom,
  myRole,
  onReturnToWaitingRoom,
  onlineReactionBar,
}: FlagMemoryGameProps) {
  const isOnline = Boolean(onlineRoom && myRole);
  const hostRole: OnlineRole = resolveHostRole(onlineRoom);
  const isHost = Boolean(isOnline && myRole === hostRole);
  const matchNumber = onlineRoom?.matchNumber ?? 1;
  const firstTurnRole: OnlineRole = onlineRoom?.firstTurnRole ?? 'P1';
  const onlineFlagState = onlineRoom?.gameState?.flagMemory ?? null;

  const [phase, setPhase] = useState<FlagGamePhase>(isOnline ? 'PRELOADING' : 'SETUP');
  const [secondsPerFlag, setSecondsPerFlag] = useState<number>(0.5);
  const [totalCycles, setTotalCycles] = useState<number>(3);

  const [exposureFlags, setExposureFlags] = useState<FlagCountry[]>([]);
  const [targetCodes, setTargetCodes] = useState<Set<string>>(new Set());
  const [gridFlags, setGridFlags] = useState<FlagCountry[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const [currentCycle, setCurrentCycle] = useState<number>(1);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [recallElapsedMs, setRecallElapsedMs] = useState<number>(0);
  const [isRematching, setIsRematching] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);
  const activeOnlineRoundRef = useRef<number>(0);
  const scoredMatchRef = useRef<string | null>(null);

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

  const preloadImages = useCallback(async (countries: FlagCountry[]) => {
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
  }, []);

  // Host initializes shared 10 flags + 5 targets + 25 grid in RTDB
  useEffect(() => {
    if (!isOnline || !isHost || !onlineRoom) return;
    if (onlineFlagState && onlineFlagState.roundKey === matchNumber) return;

    const shuffled = shuffleArray(FLAG_COUNTRIES);
    const tenExposed = shuffled.slice(0, 10);
    const fiveTargets = shuffleArray(tenExposed).slice(0, 5);
    const twentyNew = shuffled.slice(10, 30);
    const twentyFiveGrid = shuffleArray([...fiveTargets, ...twentyNew]);

    const payload: OnlineFlagMemoryState = {
      phase: 'EXPOSURE',
      secondsPerFlag: 0.5,
      totalCycles: 3,
      exposureCodes: tenExposed.map((c) => c.code),
      targetCodes: fiveTargets.map((c) => c.code),
      gridCodes: twentyFiveGrid.map((c) => c.code),
      startedAt: Date.now(),
      submissions: {},
      roundKey: matchNumber,
    };

    void fbSet(getRoomGameStateRef(onlineRoom.roomCode, 'flagMemory'), payload);
  }, [isOnline, isHost, onlineRoom, onlineFlagState, matchNumber]);

  // Synchronize online round data to local playback when roundKey changes
  useEffect(() => {
    if (!isOnline || !onlineFlagState) return;
    if (activeOnlineRoundRef.current === onlineFlagState.roundKey) return;

    activeOnlineRoundRef.current = onlineFlagState.roundKey;
    clearTimer();

    const expList = (onlineFlagState.exposureCodes ?? [])
      .map((code) => FLAG_MAP.get(code))
      .filter((c): c is FlagCountry => Boolean(c));
    const gridList = (onlineFlagState.gridCodes ?? [])
      .map((code) => FLAG_MAP.get(code))
      .filter((c): c is FlagCountry => Boolean(c));

    setSecondsPerFlag(onlineFlagState.secondsPerFlag ?? 0.5);
    setTotalCycles(onlineFlagState.totalCycles ?? 3);
    setExposureFlags(expList);
    setTargetCodes(new Set(onlineFlagState.targetCodes ?? []));
    setGridFlags(gridList);
    setSelectedCodes([]);
    setCurrentCycle(1);
    setCurrentIndex(0);
    setRecallElapsedMs(0);

    const existingSub = myRole ? onlineFlagState.submissions?.[myRole] : undefined;
    if (existingSub) {
      setSelectedCodes(existingSub.selectedCodes ?? []);
      setRecallElapsedMs(existingSub.elapsedMs ?? 0);
      setPhase('RESULT');
      return;
    }

    let cancelled = false;
    setPhase('PRELOADING');
    void preloadImages([...expList, ...gridList]).then(() => {
      if (!cancelled) {
        setPhase('EXPOSURE');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOnline, onlineFlagState, myRole, preloadImages]);

  // Local start
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
    setRecallElapsedMs(0);
    setPhase('PRELOADING');

    await preloadImages([...tenExposed, ...twentyNew]);
    setPhase('EXPOSURE');
  };

  // Exposure flash loop (freezes when isPaused is true)
  useEffect(() => {
    if (phase !== 'EXPOSURE' || isPaused) {
      clearTimer();
      return;
    }

    soundEngine.playTick();
    const intervalMs = Math.round(safeSeconds * 1000);

    timerRef.current = window.setTimeout(() => {
      if (currentIndex + 1 < 10) {
        setCurrentIndex((prev) => prev + 1);
      } else if (currentCycle < safeCycles) {
        setCurrentCycle((prev) => prev + 1);
        setCurrentIndex(0);
      } else {
        setPhase(isOnline ? 'RECALL' : 'READY');
      }
    }, intervalMs);

    return () => clearTimer();
  }, [phase, isPaused, currentIndex, currentCycle, safeSeconds, safeCycles, isOnline]);

  // Online recall stopwatch (freezes when isPaused is true)
  useEffect(() => {
    if (!isOnline || phase !== 'RECALL' || isPaused) return;

    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTick;
      lastTick = now;
      setRecallElapsedMs((prev) => prev + delta);
    }, 100);

    return () => window.clearInterval(timer);
  }, [isOnline, phase, isPaused]);

  const mySubmission = isOnline && myRole ? onlineFlagState?.submissions?.[myRole] : undefined;
  const opponentRole: OnlineRole = myRole === 'P1' ? 'P2' : 'P1';
  const opponentSubmission = isOnline ? onlineFlagState?.submissions?.[opponentRole] : undefined;
  const bothSubmitted = Boolean(onlineFlagState?.submissions?.P1 && onlineFlagState?.submissions?.P2);

  // Compute online match winner & award score once both submitted
  const onlineMatchWinner = useMemo<OnlineRole | 'DRAW' | null>(() => {
    const sub1 = onlineFlagState?.submissions?.P1;
    const sub2 = onlineFlagState?.submissions?.P2;
    if (!sub1 || !sub2) return null;
    if (sub1.hits > sub2.hits) return 'P1';
    if (sub2.hits > sub1.hits) return 'P2';
    if (sub1.elapsedMs < sub2.elapsedMs) return 'P1';
    if (sub2.elapsedMs < sub1.elapsedMs) return 'P2';
    return 'DRAW';
  }, [onlineFlagState?.submissions?.P1, onlineFlagState?.submissions?.P2]);

  useEffect(() => {
    if (!isOnline || !onlineRoom || !onlineFlagState || !bothSubmitted) return;
    const key = `FLAG_GAME_${onlineFlagState.roundKey}`;
    if (scoredMatchRef.current === key) return;
    scoredMatchRef.current = key;

    if (onlineMatchWinner === 'P1' || onlineMatchWinner === 'P2') {
      if (onlineMatchWinner === myRole) {
        soundEngine.playVictory();
      } else {
        soundEngine.playTick();
      }
      void recordMatchWinnerScore(onlineRoom.roomCode, onlineMatchWinner, key);
    }
  }, [isOnline, onlineRoom, onlineFlagState, bothSubmitted, onlineMatchWinner, myRole]);

  const toggleFlagSelection = (code: string) => {
    if (phase !== 'RECALL' || isPaused) return;
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

  const handleSubmitRecall = async () => {
    if (selectedCodes.length !== 5 || isPaused) return;
    const hitCount = selectedCodes.filter((code) => targetCodes.has(code)).length;
    const wrongCount = 5 - hitCount;

    if (hitCount === 5) {
      soundEngine.playVictory();
    } else if (hitCount >= 3) {
      soundEngine.playHintResult(85);
    } else {
      soundEngine.playWrongGuess();
    }

    if (isOnline && onlineRoom && myRole) {
      const record: FlagSubmissionRecord = {
        selectedCodes,
        hits: hitCount,
        wrong: wrongCount,
        elapsedMs: Math.round(recallElapsedMs),
        submittedAt: Date.now(),
      };
      await fbUpdate(
        getRoomGameStateRef(onlineRoom.roomCode, `flagMemory/submissions/${myRole}`),
        record,
      );
    }

    setPhase('RESULT');
  };

  const resultStats = useMemo(() => {
    const activeSelection = isOnline && mySubmission ? (mySubmission.selectedCodes ?? []) : selectedCodes;
    const selectedSet = new Set(activeSelection);
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
  }, [isOnline, mySubmission, gridFlags, selectedCodes, targetCodes]);

  const handleOnlineRematch = async () => {
    if (!onlineRoom || !isHost || isRematching) return;
    setIsRematching(true);
    try {
      await rematchSameGame(onlineRoom.roomCode, firstTurnRole);
    } finally {
      setIsRematching(false);
    }
  };

  const activeExposureFlag = exposureFlags[currentIndex];
  const totalSteps = safeCycles * 10;
  const completedSteps = (currentCycle - 1) * 10 + (currentIndex + 1);
  const progressRatio = Math.min(1, completedSteps / totalSteps);

  if (!isOnline && phase === 'SETUP') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={onBackToLobby}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1 text-xs font-bold text-white shadow-[0_3px_0_#15132d] transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>로비로 돌아가기</span>
          </button>
          <span className="font-mono text-xs font-bold text-[#FF61D2]">
            {FLAG_COUNTRIES.length}개국 국기 데이터셋
          </span>
        </div>

        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <section className="text-center">
            <p className="font-mono text-xs font-bold tracking-wider text-[#6B61FF]">
              GAME 02 · VISUAL MEMORY
            </p>
            <h1 className="arcade-hero-title mt-2 -rotate-1 text-4xl font-bold tracking-tight sm:text-5xl [text-wrap:balance]">
              국기 기억력 테스트
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-white/80 [text-wrap:balance]">
              무작위 10개 국기가 지정한 시간과 횟수만큼 순서대로 지나갑니다.
              모두 본 뒤 5×5 배열의 25개 국기 중 앞서 본 5개 국기를 찾아내세요.
            </p>
          </section>

          <section className="arcade-panel mt-6 rounded-3xl p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#FFD21E]">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span>노출 규칙 설정</span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="flag-seconds-input"
                  className="flex items-center gap-2 text-sm font-bold text-white"
                >
                  <Clock className="h-4 w-4 text-[#FF61D2]" aria-hidden="true" />
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
                  className="mt-2 min-h-11 w-full rounded-xl border-2 border-[#2B2857] bg-[#121026] px-4 py-2 font-mono text-lg font-bold tabular-nums text-white focus:border-[#6B61FF] focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EXPOSURE_TIME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSecondsPerFlag(preset)}
                      className={`min-h-8 rounded-xl border-2 px-2.5 py-1 font-mono text-xs font-extrabold tabular-nums transition-colors ${
                        Math.abs(safeSeconds - preset) < 0.01
                          ? 'border-[#FFD21E] bg-[#FFD21E] text-[#121026]'
                          : 'border-[#2B2857] bg-[#121026] text-white/80 hover:border-[#6B61FF]'
                      }`}
                    >
                      {preset}초
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="flag-cycles-input"
                  className="flex items-center gap-2 text-sm font-bold text-white"
                >
                  <Layers className="h-4 w-4 text-[#FFD21E]" aria-hidden="true" />
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
                  className="mt-2 min-h-11 w-full rounded-xl border-2 border-[#2B2857] bg-[#121026] px-4 py-2 font-mono text-lg font-bold tabular-nums text-white focus:border-[#FFD21E] focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CYCLE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTotalCycles(preset)}
                      className={`min-h-8 rounded-xl border-2 px-2.5 py-1 font-mono text-xs font-extrabold tabular-nums transition-colors ${
                        safeCycles === preset
                          ? 'border-[#6B61FF] bg-[#6B61FF] text-white'
                          : 'border-[#2B2857] bg-[#121026] text-white/80 hover:border-[#FFD21E]'
                      }`}
                    >
                      {preset}회
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-start justify-between gap-2 rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="text-xs text-white/75">
                <span className="font-bold text-white">총 소요 시간</span>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-white/60">
                  {safeSeconds.toFixed(1)}초 × 10개 × {safeCycles}회
                </p>
              </div>
              <div className="font-mono text-2xl font-extrabold tabular-nums text-[#FFD21E]">
                {totalDurationSeconds.toFixed(1)}
                <span className="ml-1 font-sans text-sm font-bold text-[#FF61D2]">초</span>
              </div>
            </div>

            <button
              type="button"
              onClick={startRound}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-6 py-3 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] whitespace-nowrap"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>기억력 테스트 시작</span>
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (phase === 'PRELOADING') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        <div className="arcade-panel max-w-md rounded-3xl p-6">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6B61FF]" aria-hidden="true" />
          <p className="mt-4 text-base font-extrabold text-white">
            {isOnline ? '온라인 공동 국기 배열을 불러오는 중...' : '국기 이미지를 불러오는 중입니다...'}
          </p>
          <p className="mt-1 text-xs text-white/70">
            정확한 {safeSeconds.toFixed(1)}초 간격 노출을 위해 미리 준비하고 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (!isOnline && phase === 'READY') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <section className="arcade-panel w-full max-w-lg rounded-3xl p-7 text-center sm:p-9">
          <div className="arcade-icon-box mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFD21E] text-[#121026]">
            <Flag className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-3xl font-bold text-[#FFD21E]">
            국기 노출이 모두 끝났습니다
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-white/80 [text-wrap:balance]">
            총 {safeCycles}회차({totalDurationSeconds.toFixed(1)}초) 동안 10개의 국기를 확인했습니다.
            다음 5×5 배열(25개 국기)에서 방금 본 국기 중 5개를 찾아 선택하세요.
          </p>

          <button
            type="button"
            onClick={() => setPhase('RECALL')}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-6 py-3 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] sm:w-auto sm:min-w-48 whitespace-nowrap"
          >
            <span>시작</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>
      </div>
    );
  }

  // EXPOSURE, RECALL, RESULT -> One-screen 100dvh Fold 8 GameBoardLayout
  const p1Name = onlineRoom?.players?.P1?.nickname ?? 'P1';
  const p2Name = onlineRoom?.players?.P2?.nickname ?? 'P2';
  const sub1 = onlineFlagState?.submissions?.P1;
  const sub2 = onlineFlagState?.submissions?.P2;

  return (
    <>
      {phase === 'RESULT' &&
        ((!isOnline && resultStats.hits === 5) ||
          (isOnline && bothSubmitted && onlineMatchWinner === myRole)) && <VictoryConfetti />}

      <GameBoardLayout
        onlineReactionBar={onlineReactionBar}
        topBar={
          <div className="rounded-2xl border-[3px] border-[#2B2857] bg-[#1D1B3D] px-3 py-2 shadow-[0_4px_0_#15132d] sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!isOnline && (
                  <button
                    type="button"
                    onClick={() => {
                      clearTimer();
                      setPhase('SETUP');
                    }}
                    aria-label="설정 화면으로"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[#2B2857] bg-[#121026] text-white transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E]"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <span className="font-display text-base font-bold text-[#FFD21E] sm:text-lg">
                  {phase === 'EXPOSURE'
                    ? '국기 기억 단계'
                    : phase === 'RECALL'
                      ? '5×5 국기 찾기'
                      : isOnline && !bothSubmitted
                        ? '제출 완료 · 상대방 대기 중'
                        : `채점 결과 · 5개 중 ${resultStats.hits}개 정답`}
                </span>
              </div>

              {phase === 'EXPOSURE' && (
                <div className="flex items-center gap-3 font-mono text-xs font-extrabold tabular-nums sm:text-sm">
                  <span className="text-[#FF61D2]">
                    {currentCycle}/{safeCycles}회차
                  </span>
                  <span className="text-[#FFD21E]">{currentIndex + 1}/10</span>
                </div>
              )}

              {phase === 'RECALL' && (
                <div className="flex items-center gap-2.5 font-mono text-xs font-extrabold tabular-nums sm:text-sm">
                  {isOnline && (
                    <span className="text-white">
                      {(recallElapsedMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  <div>
                    <span className={selectedCodes.length === 5 ? 'text-[#FF61D2]' : 'text-[#FFD21E]'}>
                      {selectedCodes.length}
                    </span>
                    <span className="text-white/60"> / 5 선택</span>
                  </div>
                </div>
              )}

              {phase === 'RESULT' && (
                <div className="flex items-center gap-2.5 font-mono text-xs font-extrabold tabular-nums">
                  <span className="text-emerald-400">정답 {resultStats.hits}</span>
                  <span className="text-rose-400">오답 {resultStats.wrong}</span>
                  <span className="text-[#FFD21E]">놓침 {resultStats.missed}</span>
                </div>
              )}
            </div>

            {phase === 'EXPOSURE' && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#121026]">
                <div
                  className="h-full w-full origin-left rounded-full bg-[#FF61D2] transition-transform duration-150 ease-out"
                  style={{ transform: `scaleX(${progressRatio})` }}
                />
              </div>
            )}
          </div>
        }
        mainStage={
          phase === 'EXPOSURE' && activeExposureFlag ? (
            <div className="arcade-panel flex h-full w-full max-w-full items-center justify-center rounded-3xl p-3 sm:p-6">
              <div className="flex aspect-[3/2] max-h-full w-full max-w-md items-center justify-center rounded-2xl border-[3px] border-[#FFD21E] bg-[#121026] p-1.5 shadow-[0_6px_0_#9E7D00]">
                <FlagImage
                  key={`${currentCycle}-${activeExposureFlag.code}`}
                  country={activeExposureFlag}
                />
              </div>
            </div>
          ) : phase === 'RECALL' ? (
            <SquareBoardBox maxPx={620} className="w-full max-w-full">
              <div
                className="arcade-panel grid h-full w-full max-w-full grid-cols-5 grid-rows-5 gap-1.5 rounded-2xl p-2 sm:gap-2 sm:p-3"
                role="group"
                aria-label="5x5 국기 선택 배열"
              >
                {gridFlags.map((flag) => {
                  const isSelected = selectedCodes.includes(flag.code);
                  const selectionOrder = selectedCodes.indexOf(flag.code) + 1;
                  const disabled = (!isSelected && selectedCodes.length >= 5) || isPaused;

                  return (
                    <button
                      key={flag.code}
                      type="button"
                      onClick={() => toggleFlagSelection(flag.code)}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={`국기 선택 ${isSelected ? '(선택됨)' : ''}`}
                      className={`relative flex h-full w-full items-center justify-center rounded-xl border-2 bg-[#121026] p-1.5 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#FF61D2] ${
                        isSelected
                          ? 'border-[#FFD21E] ring-2 ring-[#FFD21E]/50 scale-[0.97]'
                          : disabled
                            ? 'border-[#2B2857]/60 opacity-40 cursor-not-allowed'
                            : 'border-[#2B2857] hover:border-[#6B61FF]'
                      }`}
                    >
                      <FlagImage country={flag} />
                      {isSelected && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-[#FFD21E] font-mono text-[11px] font-extrabold text-[#121026] shadow">
                          {selectionOrder}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </SquareBoardBox>
          ) : (
            <SquareBoardBox maxPx={620} className="w-full max-w-full">
              <div
                className="arcade-panel grid h-full w-full max-w-full grid-cols-5 grid-rows-5 gap-1 rounded-2xl p-2 sm:gap-1.5 sm:p-3"
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
                      ? 'border-emerald-400 bg-emerald-500/15'
                      : status === 'wrong'
                        ? 'border-rose-500 bg-rose-500/15'
                        : status === 'missed'
                          ? 'border-amber-400 bg-amber-400/15'
                          : 'border-[#2B2857]/60 bg-[#121026] opacity-35';

                  const badgeBg =
                    status === 'hit'
                      ? 'bg-emerald-500 text-slate-950'
                      : status === 'wrong'
                        ? 'bg-rose-500 text-white'
                        : status === 'missed'
                          ? 'bg-amber-400 text-slate-950'
                          : '';

                  const badgeLabel =
                    status === 'hit'
                      ? '정답'
                      : status === 'wrong'
                        ? '오답'
                        : status === 'missed'
                          ? '놓침'
                          : '';

                  return (
                    <div
                      key={flag.code}
                      className={`relative flex h-full w-full items-center justify-center rounded-xl border-2 p-1.5 ${cardStyle}`}
                    >
                      <FlagImage country={flag} />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/85 via-black/55 to-transparent px-1 pb-0.5 pt-2 text-center">
                        <span className="block truncate text-[9px] font-semibold text-slate-100 sm:text-[10px]">
                          {flag.nameKo}
                        </span>
                      </div>
                      {badgeLabel && (
                        <span
                          className={`absolute right-0.5 top-0.5 rounded px-1 py-0.5 text-[9px] font-extrabold leading-none ${badgeBg}`}
                        >
                          {badgeLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </SquareBoardBox>
          )
        }
        controlPanel={
          phase === 'EXPOSURE' ? (
            <div className="arcade-panel rounded-2xl p-3.5 sm:rounded-3xl sm:p-5">
              <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-3">
                <div>
                  <span className="text-[11px] font-extrabold text-[#FF61D2] sm:text-xs">
                    집중 관찰 중
                  </span>
                  <p className="mt-0.5 text-xs text-white/85 sm:text-sm">
                    국기의 색상과 문양을 기억하세요 ({safeSeconds.toFixed(1)}초/장)
                  </p>
                </div>
                {!isOnline && (
                  <button
                    type="button"
                    onClick={() => {
                      clearTimer();
                      setPhase('SETUP');
                    }}
                    className="min-h-9 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-3 py-1.5 text-xs font-bold text-white hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
                  >
                    중단
                  </button>
                )}
              </div>
            </div>
          ) : phase === 'RECALL' ? (
            <div className="arcade-panel rounded-2xl p-3 sm:rounded-3xl sm:p-5">
              <div className="hidden sm:block">
                <h3 className="text-sm font-extrabold text-[#FFD21E]">방금 본 국기 5개 선택</h3>
                <p className="mt-1 text-xs leading-relaxed text-white/75">
                  {isOnline
                    ? '정답 수가 같으면 더 빠르게 제출한 플레이어가 승리합니다!'
                    : '25개 국기 중 앞서 등장했던 5개를 골라 제출하세요.'}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 sm:mt-4 sm:flex-col sm:items-stretch">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3, 4].map((slot) => (
                    <span
                      key={slot}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 font-mono text-xs font-extrabold ${
                        slot < selectedCodes.length
                          ? 'border-[#FFD21E] bg-[#FFD21E] text-[#121026]'
                          : 'border-[#2B2857] bg-[#121026] text-white/50'
                      }`}
                    >
                      {slot + 1}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 sm:mt-2">
                  {selectedCodes.length > 0 && (
                    <button
                      type="button"
                      disabled={isPaused}
                      onClick={() => setSelectedCodes([])}
                      className="min-h-10 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-3 py-2 text-xs font-bold text-white hover:border-[#6B61FF] whitespace-nowrap"
                    >
                      초기화
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={selectedCodes.length !== 5 || isPaused}
                    onClick={() => void handleSubmitRecall()}
                    className="min-h-10 flex-1 rounded-2xl bg-[#FFD21E] px-5 py-2 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] disabled:cursor-not-allowed disabled:bg-[#121026] disabled:text-white/40 disabled:shadow-none whitespace-nowrap"
                  >
                    제출 ({selectedCodes.length}/5)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="arcade-panel flex flex-col gap-2 rounded-2xl p-2.5 sm:h-full sm:justify-between sm:gap-3 sm:rounded-3xl sm:p-4">
              {/* Online Comparison Box */}
              {isOnline ? (
                <div className="shrink-0 space-y-1.5 rounded-2xl border-2 border-[#2B2857] bg-[#121026] p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-[#FF61D2]">
                      {!bothSubmitted
                        ? '상대방의 행동을 기다리는 중...'
                        : onlineMatchWinner === 'DRAW'
                          ? '동점 무승부!'
                          : `${onlineMatchWinner === 'P1' ? p1Name : p2Name} 승리!`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl border-2 border-sky-400/50 bg-[#1D1B3D] px-2 py-1">
                      <p className="truncate font-extrabold text-sky-400">{p1Name}</p>
                      <p className="font-mono text-white">
                        {sub1
                          ? `${sub1.hits}개 (${(sub1.elapsedMs / 1000).toFixed(1)}s)`
                          : '선택 중...'}
                      </p>
                    </div>
                    <div className="rounded-xl border-2 border-rose-400/50 bg-[#1D1B3D] px-2 py-1">
                      <p className="truncate font-extrabold text-rose-300">{p2Name}</p>
                      <p className="font-mono text-white">
                        {sub2
                          ? `${sub2.hits}개 (${(sub2.elapsedMs / 1000).toFixed(1)}s)`
                          : opponentSubmission
                            ? `${opponentSubmission.hits}개`
                            : '선택 중...'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden shrink-0 sm:block">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#FFD21E]">
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                      <span>최종 채점 결과</span>
                    </div>
                    <p className="text-sm font-bold text-white">
                      5개 중{' '}
                      <span className="font-mono text-base text-emerald-400">
                        {resultStats.hits}
                      </span>
                      개 정답
                    </p>
                  </div>

                  <dl className="mt-2 grid grid-cols-3 gap-1.5 rounded-2xl border-2 border-[#2B2857] bg-[#121026] py-1.5 text-center">
                    <div>
                      <dt className="flex items-center justify-center gap-0.5 text-[10px] font-bold text-emerald-400">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        정답
                      </dt>
                      <dd className="font-mono text-sm font-extrabold tabular-nums text-white">
                        {resultStats.hits}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center justify-center gap-0.5 text-[10px] font-bold text-rose-400">
                        <X className="h-3 w-3" aria-hidden="true" />
                        오답
                      </dt>
                      <dd className="font-mono text-sm font-extrabold tabular-nums text-white">
                        {resultStats.wrong}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold text-[#FFD21E]">놓침</dt>
                      <dd className="font-mono text-sm font-extrabold tabular-nums text-white">
                        {resultStats.missed}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Exposed 10 Flags Review Panel */}
              <div className="min-h-0 flex-1 flex flex-col justify-center">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-extrabold text-white sm:text-xs">
                    이번 게임 출제 국기 10선
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-white/75">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-xs bg-emerald-400" aria-hidden="true" />
                      정답
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-xs bg-[#FFD21E]" aria-hidden="true" />
                      출제 놓침
                    </span>
                  </div>
                </div>

                <ol
                  aria-label="이번 라운드 출제 국기 10선"
                  className="grid grid-cols-5 gap-1 sm:grid-cols-2 sm:gap-1.5"
                >
                  {exposureFlags.map((flag, idx) => {
                    const isTarget = targetCodes.has(flag.code);
                    const isSelected = resultStats.selectedSet.has(flag.code);
                    const isHit = isTarget && isSelected;
                    const isMissed = isTarget && !isSelected;

                    const rowTone = isHit
                      ? 'border-emerald-400 bg-emerald-500/15'
                      : isMissed
                        ? 'border-[#FFD21E] bg-[#FFD21E]/15'
                        : 'border-[#2B2857] bg-[#121026]';

                    return (
                      <li
                        key={flag.code}
                        className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1 sm:flex-row sm:gap-2 sm:px-2 sm:py-1.5 ${rowTone}`}
                      >
                        <span className="hidden w-4 shrink-0 font-mono text-[10px] font-bold tabular-nums text-white/55 sm:inline">
                          {idx + 1}
                        </span>
                        <div className="relative flex aspect-[3/2] w-8 shrink-0 items-center justify-center rounded-[3px] border border-[#2B2857] bg-[#121026] p-0.5 sm:w-9">
                          <FlagImage country={flag} />
                          <span className="absolute left-0 top-0 rounded-br bg-black/75 px-0.5 font-mono text-[8px] font-bold leading-tight text-white sm:hidden">
                            {idx + 1}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-1 w-full sm:w-auto">
                          <span className="w-full truncate text-center text-[9px] font-bold leading-tight text-white sm:text-left sm:text-[11px]">
                            {flag.nameKo}
                          </span>
                          {isHit && (
                            <span
                              title="핵심 정답 적중"
                              className="hidden shrink-0 rounded bg-emerald-400 px-1 py-0.5 text-[9px] font-extrabold leading-none text-[#121026] sm:inline"
                            >
                              정답
                            </span>
                          )}
                          {isMissed && (
                            <span
                              title="핵심 출제 놓침"
                              className="hidden shrink-0 rounded bg-[#FFD21E] px-1 py-0.5 text-[9px] font-extrabold leading-none text-[#121026] sm:inline"
                            >
                              놓침
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Bottom Action Buttons */}
              {isOnline ? (
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  {isHost && bothSubmitted && (
                    <button
                      type="button"
                      disabled={isRematching}
                      onClick={() => void handleOnlineRematch()}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFD21E] px-3 py-1.5 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] transition-all hover:bg-[#FF61D2] disabled:opacity-60 whitespace-nowrap sm:min-h-10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isRematching ? '준비 중' : '같은 게임 바로 재대결'}</span>
                    </button>
                  )}
                  {onReturnToWaitingRoom && (
                    <button
                      type="button"
                      onClick={onReturnToWaitingRoom}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#6B61FF] px-3 py-1.5 text-xs font-bold text-white shadow-[0_3px_0_#433AB5] transition-all hover:bg-[#FF61D2] hover:text-[#121026] whitespace-nowrap sm:min-h-10"
                    >
                      <Home className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>대기실로 돌아가기</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={startRound}
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFD21E] px-3 py-1.5 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] transition-all hover:bg-[#FF61D2] whitespace-nowrap sm:min-h-10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>다시 하기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('SETUP')}
                    className="inline-flex min-h-9 items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:border-[#6B61FF] whitespace-nowrap sm:min-h-10 sm:px-3"
                  >
                    설정
                  </button>
                  <button
                    type="button"
                    onClick={onBackToLobby}
                    className="inline-flex min-h-9 items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:border-[#FFD21E] whitespace-nowrap sm:min-h-10 sm:px-3"
                  >
                    로비로
                  </button>
                </div>
              )}
            </div>
          )
        }
      />
    </>
  );
}
