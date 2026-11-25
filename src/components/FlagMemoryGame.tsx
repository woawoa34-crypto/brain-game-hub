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
        className={`flex h-full w-full flex-col items-center justify-center bg-slate-800 text-slate-300 ${className}`}
      >
        <span className="font-mono text-xs font-bold uppercase">{country.code}</span>
        <span className="mt-0.5 text-[10px] text-slate-400">{country.nameKo}</span>
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
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>로비로 돌아가기</span>
          </button>
          <span className="text-xs text-slate-500">
            {FLAG_COUNTRIES.length}개국 국기 데이터셋
          </span>
        </div>

        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <section className="text-center">
            <p className="text-xs font-medium text-emerald-400">
              게임 2 · 순간 시각 기억력 테스트
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-50 sm:text-4xl [text-wrap:balance]">
              국기 기억력 테스트
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
              무작위 10개 국기가 지정한 시간과 횟수만큼 순서대로 지나갑니다.
              모두 본 뒤 5×5 배열의 25개 국기 중 앞서 본 5개 국기를 찾아내세요.
            </p>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>노출 규칙 설정</span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-4 py-2 font-mono text-lg font-bold tabular-nums text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-4 py-2 font-mono text-lg font-bold tabular-nums text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
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

            <div className="mt-6 flex flex-col items-start justify-between gap-2 rounded-xl border border-slate-800 bg-[#0B0F17] px-4 py-3.5 sm:flex-row sm:items-center">
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
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap"
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
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden="true" />
        <p className="mt-4 text-base font-semibold text-slate-100">
          {isOnline ? '온라인 공동 국기 배열을 불러오는 중...' : '국기 이미지를 불러오는 중입니다...'}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          정확한 {safeSeconds.toFixed(1)}초 간격 노출을 위해 미리 준비하고 있습니다.
        </p>
      </div>
    );
  }

  if (!isOnline && phase === 'READY') {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#131926] p-7 text-center sm:p-9">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Flag className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-50">
            국기 노출이 모두 끝났습니다
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
            총 {safeCycles}회차({totalDurationSeconds.toFixed(1)}초) 동안 10개의 국기를 확인했습니다.
            다음 5×5 배열(25개 국기)에서 방금 본 국기 중 5개를 찾아 선택하세요.
          </p>

          <button
            type="button"
            onClick={() => setPhase('RECALL')}
            className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 sm:w-auto sm:min-w-48 whitespace-nowrap"
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
          <div className="rounded-xl border border-slate-800 bg-[#131926] px-3 py-2 sm:px-4">
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <span className="text-xs font-bold text-slate-100 sm:text-sm">
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
                <div className="flex items-center gap-3 font-mono text-xs font-bold tabular-nums sm:text-sm">
                  <span className="text-emerald-400">
                    {currentCycle}/{safeCycles}회차
                  </span>
                  <span className="text-sky-400">{currentIndex + 1}/10</span>
                </div>
              )}

              {phase === 'RECALL' && (
                <div className="flex items-center gap-2.5 font-mono text-xs font-bold tabular-nums sm:text-sm">
                  {isOnline && (
                    <span className="text-slate-300">
                      {(recallElapsedMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  <div>
                    <span className={selectedCodes.length === 5 ? 'text-emerald-400' : 'text-sky-400'}>
                      {selectedCodes.length}
                    </span>
                    <span className="text-slate-500"> / 5 선택</span>
                  </div>
                </div>
              )}

              {phase === 'RESULT' && (
                <div className="flex items-center gap-2.5 font-mono text-xs font-bold tabular-nums">
                  <span className="text-emerald-400">정답 {resultStats.hits}</span>
                  <span className="text-rose-400">오답 {resultStats.wrong}</span>
                  <span className="text-amber-300">놓침 {resultStats.missed}</span>
                </div>
              )}
            </div>

            {phase === 'EXPOSURE' && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full w-full origin-left rounded-full bg-emerald-400 transition-transform duration-150 ease-out"
                  style={{ transform: `scaleX(${progressRatio})` }}
                />
              </div>
            )}
          </div>
        }
        mainStage={
          phase === 'EXPOSURE' && activeExposureFlag ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:p-6">
              <div className="aspect-[3/2] max-h-full w-full max-w-md overflow-hidden rounded-xl border-2 border-slate-700/80 bg-[#0B0F17] shadow-xl">
                <FlagImage
                  key={`${currentCycle}-${activeExposureFlag.code}`}
                  country={activeExposureFlag}
                />
              </div>
            </div>
          ) : phase === 'RECALL' ? (
            <SquareBoardBox maxPx={620}>
              <div
                className="grid h-full w-full grid-cols-5 grid-rows-5 gap-1.5 rounded-2xl border border-slate-800 bg-[#131926] p-2 sm:gap-2 sm:p-3"
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
                      className={`relative h-full w-full overflow-hidden rounded-lg border-2 bg-[#0B0F17] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                        isSelected
                          ? 'border-sky-400 ring-2 ring-sky-400/40 scale-[0.97]'
                          : disabled
                            ? 'border-slate-800/70 opacity-40 cursor-not-allowed'
                            : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <FlagImage country={flag} />
                      {isSelected && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-sky-400 font-mono text-[11px] font-bold text-slate-950 shadow">
                          {selectionOrder}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </SquareBoardBox>
          ) : (
            <SquareBoardBox maxPx={620}>
              <div
                className="grid h-full w-full grid-cols-5 grid-rows-5 gap-1 rounded-2xl border border-slate-800 bg-[#131926] p-2 sm:gap-1.5 sm:p-3"
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
                          : 'border-slate-800/70 bg-[#0B0F17] opacity-35';

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
                      className={`relative h-full w-full overflow-hidden rounded-lg border-2 ${cardStyle}`}
                    >
                      <FlagImage country={flag} />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-1 pb-0.5 pt-2 text-center">
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
            <div className="rounded-xl border border-slate-800 bg-[#131926] p-3.5 sm:rounded-2xl sm:p-5">
              <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-3">
                <div>
                  <span className="text-[11px] font-medium text-emerald-400 sm:text-xs">
                    집중 관찰 중
                  </span>
                  <p className="mt-0.5 text-xs text-slate-300 sm:text-sm">
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
                    className="min-h-9 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                  >
                    중단
                  </button>
                )}
              </div>
            </div>
          ) : phase === 'RECALL' ? (
            <div className="rounded-xl border border-slate-800 bg-[#131926] p-3 sm:rounded-2xl sm:p-5">
              <div className="hidden sm:block">
                <h3 className="text-sm font-bold text-slate-100">방금 본 국기 5개 선택</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
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
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-xs font-bold ${
                        slot < selectedCodes.length
                          ? 'border-sky-400 bg-sky-400 text-slate-950'
                          : 'border-slate-700 bg-[#0B0F17] text-slate-500'
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
                      className="min-h-10 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                    >
                      초기화
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={selectedCodes.length !== 5 || isPaused}
                    onClick={() => void handleSubmitRecall()}
                    className="min-h-10 flex-1 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 whitespace-nowrap"
                  >
                    제출 ({selectedCodes.length}/5)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-[#131926] p-2.5 sm:h-full sm:justify-between sm:gap-3 sm:rounded-2xl sm:p-4">
              {/* Online Comparison Box */}
              {isOnline ? (
                <div className="shrink-0 space-y-1.5 rounded-xl border border-slate-800 bg-[#0B0F17] p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-400">
                      {!bothSubmitted
                        ? '상대방의 행동을 기다리는 중...'
                        : onlineMatchWinner === 'DRAW'
                          ? '동점 무승부!'
                          : `${onlineMatchWinner === 'P1' ? p1Name : p2Name} 승리!`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-sky-500/30 bg-[#131926] px-2 py-1">
                      <p className="truncate font-bold text-sky-300">{p1Name}</p>
                      <p className="font-mono text-slate-200">
                        {sub1
                          ? `${sub1.hits}개 (${(sub1.elapsedMs / 1000).toFixed(1)}s)`
                          : '선택 중...'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-rose-500/30 bg-[#131926] px-2 py-1">
                      <p className="truncate font-bold text-rose-300">{p2Name}</p>
                      <p className="font-mono text-slate-200">
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
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                      <span>최종 채점 결과</span>
                    </div>
                    <p className="text-sm font-bold text-slate-50">
                      5개 중{' '}
                      <span className="font-mono text-base text-emerald-400">
                        {resultStats.hits}
                      </span>
                      개 정답
                    </p>
                  </div>

                  <dl className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800/80 bg-[#0B0F17] py-1.5 text-center">
                    <div>
                      <dt className="flex items-center justify-center gap-0.5 text-[10px] text-emerald-400">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        정답
                      </dt>
                      <dd className="font-mono text-sm font-bold tabular-nums text-slate-100">
                        {resultStats.hits}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center justify-center gap-0.5 text-[10px] text-rose-400">
                        <X className="h-3 w-3" aria-hidden="true" />
                        오답
                      </dt>
                      <dd className="font-mono text-sm font-bold tabular-nums text-slate-100">
                        {resultStats.wrong}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-amber-300">놓침</dt>
                      <dd className="font-mono text-sm font-bold tabular-nums text-slate-100">
                        {resultStats.missed}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Exposed 10 Flags Review Panel */}
              <div className="min-h-0 flex-1 flex flex-col justify-center">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold text-slate-200 sm:text-xs">
                    이번 게임 출제 국기 10선
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-xs bg-emerald-400" aria-hidden="true" />
                      정답
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-xs bg-amber-400" aria-hidden="true" />
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
                      ? 'border-emerald-400/75 bg-emerald-500/15'
                      : isMissed
                        ? 'border-amber-400/75 bg-amber-500/12'
                        : 'border-slate-800/90 bg-[#0B0F17]';

                    return (
                      <li
                        key={flag.code}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1 sm:flex-row sm:gap-2 sm:px-2 sm:py-1.5 ${rowTone}`}
                      >
                        <span className="hidden w-4 shrink-0 font-mono text-[10px] font-bold tabular-nums text-slate-500 sm:inline">
                          {idx + 1}
                        </span>
                        <div className="relative h-5 w-7.5 shrink-0 overflow-hidden rounded-[3px] border border-slate-700/70 bg-slate-900 sm:h-5.5 sm:w-8">
                          <FlagImage country={flag} />
                          <span className="absolute left-0 top-0 rounded-br bg-black/75 px-0.5 font-mono text-[8px] font-bold leading-tight text-slate-200 sm:hidden">
                            {idx + 1}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-1 w-full sm:w-auto">
                          <span className="w-full truncate text-center text-[9px] font-semibold leading-tight text-slate-100 sm:text-left sm:text-[11px]">
                            {flag.nameKo}
                          </span>
                          {isHit && (
                            <span
                              title="핵심 정답 적중"
                              className="hidden shrink-0 rounded bg-emerald-500 px-1 py-0.5 text-[9px] font-extrabold leading-none text-slate-950 sm:inline"
                            >
                              정답
                            </span>
                          )}
                          {isMissed && (
                            <span
                              title="핵심 출제 놓침"
                              className="hidden shrink-0 rounded bg-amber-400 px-1 py-0.5 text-[9px] font-extrabold leading-none text-slate-950 sm:inline"
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
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60 whitespace-nowrap sm:min-h-10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isRematching ? '준비 중' : '같은 게임 바로 재대결'}</span>
                    </button>
                  )}
                  {onReturnToWaitingRoom && (
                    <button
                      type="button"
                      onClick={onReturnToWaitingRoom}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap sm:min-h-10"
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
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap sm:min-h-10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>다시 하기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('SETUP')}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap sm:min-h-10 sm:px-3"
                  >
                    설정
                  </button>
                  <button
                    type="button"
                    onClick={onBackToLobby}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 whitespace-nowrap sm:min-h-10 sm:px-3"
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
