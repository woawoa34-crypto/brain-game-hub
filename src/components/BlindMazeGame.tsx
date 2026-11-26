import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  Compass,
  Eye,
  Flag,
  Home,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { set as fbSet, update as fbUpdate } from 'firebase/database';
import {
  DIR_LABELS_KO,
  generateMaze,
  getForwardDelta,
  type CardinalDir,
  type GeneratedMaze,
} from '../games/blindmaze/generator';
import {
  getRoomGameStateRef,
  recordMatchWinnerScore,
  rematchSameGame,
  resolveHostRole,
} from '../services/onlineRoom';
import type {
  OnlineBlindMazeState,
  OnlineGameSharedProps,
  OnlineMazeExplorer,
  OnlineRole,
} from '../types/online';
import { soundEngine } from '../utils/sound';
import { GameBoardLayout, SquareBoardBox } from './GameBoardLayout';
import { VictoryConfetti } from './VictoryConfetti';

type MazeMode = 'solo' | 'race';
type MazePhase = 'SETUP' | 'MEMORIZE' | 'EXPLORE' | 'RESULT';

interface ExplorerState {
  id: 1 | 2;
  name: string;
  r: number;
  c: number;
  dir: CardinalDir;
  /** Cumulative rotation in degrees so left (-90) and right (+90) animate smoothly without wrap-around jumps */
  rotationDeg: number;
  collisions: number;
  steps: number;
  trajectory: Array<{ r: number; c: number }>;
}

interface BlindMazeGameProps extends OnlineGameSharedProps {
  onBackToLobby: () => void;
}

const ONLINE_SHOT_CLOCK_SECONDS = 45;

const DIR_ROTATION_DEG: Record<CardinalDir, number> = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
};

function computeSmoothRotation(currentDeg: number, targetDir: CardinalDir): number {
  const targetMod = DIR_ROTATION_DEG[targetDir];
  const currentMod = ((currentDeg % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return currentDeg + delta;
}

/**
 * Symmetrical custom SVG pointer facing strictly 12 o'clock (0deg = North / dy = -1).
 * Rotated 0deg (N), 90deg (E), 180deg (S), 270deg (W) to match orthogonal movement exactly.
 */
function OrthogonalPointerSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 2.5L20.5 19.5L12 15.5L3.5 19.5L12 2.5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BlindMazeGame({
  onBackToLobby,
  isPaused = false,
  onlineRoom = null,
  myRole = null,
  onReturnToWaitingRoom,
  onlineReactionBar,
}: BlindMazeGameProps) {
  const isOnline = Boolean(onlineRoom && myRole);
  const hostRole = resolveHostRole(onlineRoom);
  const isHost = isOnline && myRole === hostRole;
  const firstTurnRole: OnlineRole = onlineRoom?.firstTurnRole ?? 'P1';
  const matchNumber = onlineRoom?.matchNumber ?? 1;
  const onlineMaze = onlineRoom?.gameState?.blindMaze ?? null;

  const [phase, setPhase] = useState<MazePhase>('SETUP');
  const [boardSize, setBoardSize] = useState<6 | 7>(6);
  const [memorizeSeconds, setMemorizeSeconds] = useState<3 | 5>(3);
  const [mode, setMode] = useState<MazeMode>('solo');
  const [p1Name, setP1Name] = useState('플레이어 1');
  const [p2Name, setP2Name] = useState('플레이어 2');

  const [maze, setMaze] = useState<GeneratedMaze | null>(null);
  const [explorers, setExplorers] = useState<ExplorerState[]>([]);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(0);

  const [memorizeLeftMs, setMemorizeLeftMs] = useState<number>(3000);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [shotClock, setShotClock] = useState<number>(ONLINE_SHOT_CLOCK_SECONDS);
  const [collisionFlash, setCollisionFlash] = useState<boolean>(false);
  const [collisionNotice, setCollisionNotice] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<1 | 2 | null>(null);
  const [gaveUp, setGaveUp] = useState<boolean>(false);
  const [isRematching, setIsRematching] = useState<boolean>(false);

  const initializedRoundRef = useRef<number | null>(null);
  const shotClockGuardRef = useRef<boolean>(false);
  const prevTurnAlertRef = useRef<boolean>(false);
  const playedVictoryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOnline) return;
    setGaveUp(false);
    setCollisionFlash(false);
    setCollisionNotice(null);
  }, [isOnline, matchNumber]);

  // Host initializes online BlindMaze state in RTDB
  useEffect(() => {
    if (!isOnline || !onlineRoom || !isHost) return;
    if (onlineMaze && onlineMaze.roundKey === matchNumber) return;
    if (initializedRoundRef.current === matchNumber) return;

    initializedRoundRef.current = matchNumber;
    const generated = generateMaze(6);
    const initialRotation = DIR_ROTATION_DEG[generated.initialDir];

    const initialExplorers: OnlineMazeExplorer[] = [
      {
        id: 1,
        name: onlineRoom.players?.P1?.nickname ?? '플레이어 1',
        r: generated.start.r,
        c: generated.start.c,
        dir: generated.initialDir,
        rotationDeg: initialRotation,
        collisions: 0,
        steps: 0,
        trajectory: [{ r: generated.start.r, c: generated.start.c }],
      },
      {
        id: 2,
        name: onlineRoom.players?.P2?.nickname ?? '플레이어 2',
        r: generated.start.r,
        c: generated.start.c,
        dir: generated.initialDir,
        rotationDeg: initialRotation,
        collisions: 0,
        steps: 0,
        trajectory: [{ r: generated.start.r, c: generated.start.c }],
      },
    ];

    const initialState: OnlineBlindMazeState = {
      phase: 'MEMORIZE',
      boardSize: 6,
      memorizeSeconds: 3,
      maze: generated,
      explorers: initialExplorers,
      activeTurn: firstTurnRole,
      winnerId: null,
      collisionNotice: null,
      roundKey: matchNumber,
    };

    void fbSet(getRoomGameStateRef(onlineRoom.roomCode, 'blindMaze'), initialState);
  }, [isOnline, onlineRoom, isHost, onlineMaze, matchNumber, firstTurnRole]);

  const effectivePhase: MazePhase = isOnline
    ? (onlineMaze?.phase ?? 'MEMORIZE')
    : phase;
  const effectiveBoardSize = isOnline ? (onlineMaze?.boardSize ?? 6) : boardSize;
  const effectiveMemorizeSeconds = isOnline
    ? (onlineMaze?.memorizeSeconds ?? 3)
    : memorizeSeconds;
  const effectiveMode: MazeMode = isOnline ? 'race' : mode;
  const effectiveMaze = isOnline ? (onlineMaze?.maze ?? null) : maze;
  const effectiveExplorers = useMemo<ExplorerState[]>(() => {
    if (!isOnline) return explorers;
    return (onlineMaze?.explorers ?? []).map((exp) => ({
      ...exp,
      trajectory: exp.trajectory ?? [],
    }));
  }, [isOnline, onlineMaze?.explorers, explorers]);
  const effectiveActiveTurnIdx = isOnline
    ? onlineMaze?.activeTurn === 'P2'
      ? 1
      : 0
    : activeTurnIdx;
  const activeTurnRole: OnlineRole = effectiveActiveTurnIdx === 1 ? 'P2' : 'P1';
  const isMyOnlineTurn = !isOnline || activeTurnRole === myRole;
  const effectiveWinnerId = isOnline ? (onlineMaze?.winnerId ?? null) : winnerId;
  const effectiveCollisionNotice = isOnline
    ? (onlineMaze?.collisionNotice ?? null)
    : collisionNotice;

  // Reset memorize countdown when online round starts
  useEffect(() => {
    if (!isOnline || !onlineMaze) return;
    if (onlineMaze.phase === 'MEMORIZE') {
      setMemorizeLeftMs((onlineMaze.memorizeSeconds ?? 3) * 1000);
    }
  }, [isOnline, onlineMaze?.roundKey, onlineMaze?.phase, onlineMaze?.memorizeSeconds]);

  const startMazeRound = useCallback(() => {
    const generated = generateMaze(boardSize);
    const initialRotation = DIR_ROTATION_DEG[generated.initialDir];
    const initialExplorers: ExplorerState[] = [
      {
        id: 1,
        name: p1Name.trim() || '플레이어 1',
        r: generated.start.r,
        c: generated.start.c,
        dir: generated.initialDir,
        rotationDeg: initialRotation,
        collisions: 0,
        steps: 0,
        trajectory: [{ r: generated.start.r, c: generated.start.c }],
      },
    ];

    if (mode === 'race') {
      initialExplorers.push({
        id: 2,
        name: p2Name.trim() || '플레이어 2',
        r: generated.start.r,
        c: generated.start.c,
        dir: generated.initialDir,
        rotationDeg: initialRotation,
        collisions: 0,
        steps: 0,
        trajectory: [{ r: generated.start.r, c: generated.start.c }],
      });
    }

    setMaze(generated);
    setExplorers(initialExplorers);
    setActiveTurnIdx(0);
    setMemorizeLeftMs(memorizeSeconds * 1000);
    setElapsedMs(0);
    setCollisionFlash(false);
    setCollisionNotice(null);
    setWinnerId(null);
    setGaveUp(false);
    setPhase('MEMORIZE');
  }, [boardSize, memorizeSeconds, mode, p1Name, p2Name]);

  // Memorize countdown timer (Pause freezes countdown)
  useEffect(() => {
    if (effectivePhase !== 'MEMORIZE' || isPaused) return;
    if (isOnline && !onlineMaze) return;

    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setMemorizeLeftMs((prev) => {
        const remain = Math.max(0, prev - delta);
        const prevSec = Math.ceil(prev / 1000);
        const nextSec = Math.ceil(remain / 1000);
        if (remain > 0 && nextSec !== prevSec && nextSec <= 5) {
          soundEngine.playTick();
        }
        if (remain <= 0) {
          window.clearInterval(timer);
          soundEngine.playTurnAlert();
          if (isOnline) {
            if (isHost && onlineRoom) {
              void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'blindMaze'), {
                phase: 'EXPLORE',
              });
            }
          } else {
            setPhase('EXPLORE');
          }
        }
        return remain;
      });
    }, 50);

    return () => window.clearInterval(timer);
  }, [effectivePhase, isPaused, isOnline, onlineMaze, isHost, onlineRoom]);

  // Solo elapsed timer during EXPLORE (Pause freezes timer)
  useEffect(() => {
    if (isOnline || effectivePhase !== 'EXPLORE' || mode !== 'solo' || isPaused) return;

    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setElapsedMs((prev) => prev + delta);
    }, 100);

    return () => window.clearInterval(timer);
  }, [isOnline, effectivePhase, mode, isPaused]);

  // Turn alert sound when my online turn begins
  useEffect(() => {
    if (!isOnline || effectivePhase !== 'EXPLORE') {
      prevTurnAlertRef.current = false;
      return;
    }
    if (isMyOnlineTurn && !prevTurnAlertRef.current) {
      soundEngine.playTurnAlert();
    }
    prevTurnAlertRef.current = isMyOnlineTurn;
  }, [isOnline, effectivePhase, isMyOnlineTurn]);

  // Online 45s shot clock reset per turn
  const onlineTurnSyncKey = isOnline && onlineMaze
    ? `${onlineMaze.roundKey}:${onlineMaze.phase}:${onlineMaze.activeTurn}:${onlineMaze.explorers?.[0]?.steps ?? 0}:${onlineMaze.explorers?.[1]?.steps ?? 0}`
    : null;

  useEffect(() => {
    if (!isOnline || !onlineTurnSyncKey) return;
    setShotClock(ONLINE_SHOT_CLOCK_SECONDS);
    shotClockGuardRef.current = false;
  }, [isOnline, onlineTurnSyncKey]);

  // Online 45s turn countdown & auto-pass (freezes on Pause)
  useEffect(() => {
    if (!isOnline || !onlineRoom || effectivePhase !== 'EXPLORE' || isPaused) return;

    const timer = window.setInterval(() => {
      setShotClock((prev) => {
        const next = prev - 1;
        if (next >= 1 && next <= 5) {
          soundEngine.playTick();
        }
        if (prev <= 1) {
          if (isMyOnlineTurn && !shotClockGuardRef.current && myRole) {
            shotClockGuardRef.current = true;
            const nextTurn: OnlineRole = myRole === 'P1' ? 'P2' : 'P1';
            const myNick = onlineRoom.players?.[myRole]?.nickname ?? myRole;
            void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'blindMaze'), {
              activeTurn: nextTurn,
              collisionNotice: `${myNick} 님의 제한 시간(${ONLINE_SHOT_CLOCK_SECONDS}초)이 초과되어 턴이 자동 패스되었습니다.`,
            });
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isOnline, onlineRoom, effectivePhase, isPaused, isMyOnlineTurn, myRole]);

  // Record cumulative room win & play result sound on RESULT
  useEffect(() => {
    if (!isOnline || !onlineRoom || effectivePhase !== 'RESULT' || !effectiveWinnerId) return;
    const winnerRole: OnlineRole = effectiveWinnerId === 2 ? 'P2' : 'P1';
    const key = `BLINDMAZE_GAME_${matchNumber}`;
    if (playedVictoryKeyRef.current !== key) {
      playedVictoryKeyRef.current = key;
      if (winnerRole === myRole) {
        soundEngine.playVictory();
      } else {
        soundEngine.playError();
      }
    }
    void recordMatchWinnerScore(
      onlineRoom.roomCode,
      winnerRole,
      key,
    );
  }, [isOnline, onlineRoom, effectivePhase, effectiveWinnerId, matchNumber, myRole]);

  const activeExplorer =
    effectiveExplorers[effectiveActiveTurnIdx] ?? effectiveExplorers[0] ?? null;

  const triggerCollisionFeedback = useCallback(
    (playerName: string, targetDir: CardinalDir) => {
      soundEngine.playBump();
      setCollisionFlash(false);
      window.requestAnimationFrame(() => setCollisionFlash(true));
      window.setTimeout(() => setCollisionFlash(false), 320);
      const notice = `${playerName}: ${DIR_LABELS_KO[targetDir]}이 벽으로 막혀 있습니다! (충돌 +1)`;
      if (!isOnline) {
        setCollisionNotice(notice);
      }
      return notice;
    },
    [isOnline],
  );

  const performDirectionalMove = useCallback(
    (targetDir: CardinalDir) => {
      if (effectivePhase !== 'EXPLORE' || !effectiveMaze || !activeExplorer || isPaused) return;
      if (isOnline && !isMyOnlineTurn) return;

      if (!isOnline) {
        setCollisionNotice(null);
      }

      let reachedExit = false;
      let hitNotice: string | null = null;

      const nextExplorers = effectiveExplorers.map((exp, idx) => {
        if (idx !== effectiveActiveTurnIdx) return exp;

        const nextRotation = computeSmoothRotation(exp.rotationDeg, targetDir);
        const currentCell = effectiveMaze.grid[exp.r][exp.c];

        if (currentCell.walls[targetDir]) {
          hitNotice = triggerCollisionFeedback(exp.name, targetDir);
          return {
            ...exp,
            dir: targetDir,
            rotationDeg: nextRotation,
            collisions: exp.collisions + 1,
            steps: exp.steps + 1,
          };
        }

        const { dr, dc } = getForwardDelta(targetDir);
        const nr = exp.r + dr;
        const nc = exp.c + dc;
        soundEngine.playClick();

        if (nr === effectiveMaze.exit.r && nc === effectiveMaze.exit.c) {
          reachedExit = true;
        }

        return {
          ...exp,
          r: nr,
          c: nc,
          dir: targetDir,
          rotationDeg: nextRotation,
          steps: exp.steps + 1,
          trajectory: [...exp.trajectory, { r: nr, c: nc }],
        };
      });

      if (isOnline && onlineRoom) {
        if (reachedExit) {
          soundEngine.playVictory();
          void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'blindMaze'), {
            explorers: nextExplorers,
            winnerId: activeExplorer.id,
            collisionNotice: null,
            phase: 'RESULT',
          });
          return;
        }

        const nextTurn: OnlineRole = activeTurnRole === 'P1' ? 'P2' : 'P1';
        void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'blindMaze'), {
          explorers: nextExplorers,
          activeTurn: nextTurn,
          collisionNotice: hitNotice,
        });
        return;
      }

      setExplorers(nextExplorers);

      if (reachedExit) {
        soundEngine.playVictory();
        setWinnerId(activeExplorer.id);
        setPhase('RESULT');
        return;
      }

      if (effectiveMode === 'race') {
        setActiveTurnIdx((prev) => (prev + 1) % nextExplorers.length);
      }
    },
    [
      effectivePhase,
      effectiveMaze,
      activeExplorer,
      isPaused,
      isOnline,
      isMyOnlineTurn,
      effectiveExplorers,
      effectiveActiveTurnIdx,
      effectiveMode,
      onlineRoom,
      activeTurnRole,
      triggerCollisionFeedback,
    ],
  );

  // Keyboard shortcuts during EXPLORE (Arrow keys / WASD = N, S, W, E)
  useEffect(() => {
    if (effectivePhase !== 'EXPLORE' || isPaused) return;
    if (isOnline && !isMyOnlineTurn) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        performDirectionalMove('N');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        performDirectionalMove('S');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        performDirectionalMove('W');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        performDirectionalMove('E');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [effectivePhase, isPaused, isOnline, isMyOnlineTurn, performDirectionalMove]);

  const trajectorySets = useMemo(() => {
    const p1Set = new Set<string>();
    const p2Set = new Set<string>();
    if (effectiveExplorers[0]) {
      for (const pt of effectiveExplorers[0].trajectory) {
        p1Set.add(`${pt.r},${pt.c}`);
      }
    }
    if (effectiveExplorers[1]) {
      for (const pt of effectiveExplorers[1].trajectory) {
        p2Set.add(`${pt.r},${pt.c}`);
      }
    }
    return { p1Set, p2Set };
  }, [effectiveExplorers]);

  const handleOnlineRematch = async () => {
    if (!onlineRoom || !isHost || isRematching) return;
    setIsRematching(true);
    try {
      await rematchSameGame(onlineRoom.roomCode, firstTurnRole);
    } finally {
      setIsRematching(false);
    }
  };

  const handleOnlineGiveUp = () => {
    if (!isOnline || !onlineRoom || !myRole || isPaused) return;
    const oppWinnerId: 1 | 2 = myRole === 'P1' ? 2 : 1;
    const myNick = onlineRoom.players?.[myRole]?.nickname ?? myRole;
    void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'blindMaze'), {
      winnerId: oppWinnerId,
      collisionNotice: `${myNick}님이 기권하여 상대방이 승리했습니다.`,
      phase: 'RESULT',
    });
  };

  const showWalls = effectivePhase === 'MEMORIZE' || effectivePhase === 'RESULT';

  if (isOnline && (!onlineMaze || !effectiveMaze)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="arcade-panel max-w-md rounded-3xl p-6">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6B61FF]" aria-hidden="true" />
          <p className="mt-3 text-sm font-extrabold text-white">
            블라인드 미로 탈출 온라인 방을 준비하는 중입니다...
          </p>
        </div>
      </div>
    );
  }

  const showResultConfetti =
    effectivePhase === 'RESULT' &&
    !gaveUp &&
    (!isOnline || (effectiveWinnerId === 2 ? 'P2' : 'P1') === myRole);

  return (
    <>
      {showResultConfetti && <VictoryConfetti />}

      {/* SETUP SCREEN (Local only) */}
      {!isOnline && phase === 'SETUP' && (
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
              인지 지도 & 시점 회전 미로
            </span>
          </div>

          <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
            <section className="text-center">
              <p className="font-mono text-xs font-bold tracking-wider text-[#6B61FF]">
                GAME 04 · COGNITIVE MAZE
              </p>
              <h1 className="arcade-hero-title mt-2 -rotate-1 text-4xl font-bold tracking-tight sm:text-5xl [text-wrap:balance]">
                블라인드 미로 탈출
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-white/80 [text-wrap:balance]">
                잠시 공개되는 미로 지도를 머릿속에 기억한 뒤, 어둠 속에서 상·하·좌·우 4방향 화살표로
                이동해 출구(E)까지 탈출하세요.
              </p>
            </section>

            <section className="arcade-panel mt-7 space-y-5 rounded-3xl p-5 sm:p-7">
              {/* Board Size & Memorize Time */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-bold text-[#FFD21E]">
                    미로 크기
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setBoardSize(6)}
                      className={`min-h-11 rounded-xl border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                        boardSize === 6
                          ? 'border-[#FFD21E] bg-[#FFD21E] text-[#121026]'
                          : 'border-[#2B2857] bg-[#121026] text-white/80 hover:border-[#6B61FF]'
                      }`}
                    >
                      6×6 (보통)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardSize(7)}
                      className={`min-h-11 rounded-xl border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                        boardSize === 7
                          ? 'border-[#FFD21E] bg-[#FFD21E] text-[#121026]'
                          : 'border-[#2B2857] bg-[#121026] text-white/80 hover:border-[#6B61FF]'
                      }`}
                    >
                      7×7 (어려움)
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-bold text-[#FF61D2]">
                    지도 기억 시간
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setMemorizeSeconds(3)}
                      className={`min-h-11 rounded-xl border-2 px-3 py-2 font-mono text-xs font-extrabold transition-colors ${
                        memorizeSeconds === 3
                          ? 'border-[#6B61FF] bg-[#6B61FF] text-white'
                          : 'border-[#2B2857] bg-[#121026] text-white/80 hover:border-[#6B61FF]'
                      }`}
                    >
                      3초 공개
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemorizeSeconds(5)}
                      className={`min-h-11 rounded-xl border-2 px-3 py-2 font-mono text-xs font-extrabold transition-colors ${
                        memorizeSeconds === 5
                          ? 'border-[#6B61FF] bg-[#6B61FF] text-white'
                          : 'border-[#2B2857] bg-[#121026] text-white/80 hover:border-[#6B61FF]'
                      }`}
                    >
                      5초 공개
                    </button>
                  </div>
                </div>
              </div>

              {/* Game Mode */}
              <div className="border-t border-[#2B2857] pt-5">
                <span className="block text-xs font-bold text-[#FFD21E]">
                  플레이 모드
                </span>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMode('solo')}
                    className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                      mode === 'solo'
                        ? 'border-[#6B61FF] bg-[#121026] shadow-[0_4px_0_#433AB5]'
                        : 'border-[#2B2857] bg-[#121026] hover:border-[#6B61FF]'
                    }`}
                  >
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-[#6B61FF]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-extrabold text-white">솔로 타임어택</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/75">
                        최소 충돌과 최단 시간으로 출구(E)에 도달하는 기록 도전 모드
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('race')}
                    className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                      mode === 'race'
                        ? 'border-[#FFD21E] bg-[#121026] shadow-[0_4px_0_#9E7D00]'
                        : 'border-[#2B2857] bg-[#121026] hover:border-[#FFD21E]'
                    }`}
                  >
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#FFD21E]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-extrabold text-white">2인 턴제 레이스</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/75">
                        같은 미로에서 P1·P2가 1회씩 번갈아 상하좌우로 이동해 먼저 탈출하면 승리
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Player names */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="maze-p1-name" className="text-xs font-bold text-white/80">
                    {mode === 'solo' ? '플레이어 이름' : 'P1 이름 (파랑)'}
                  </label>
                  <input
                    id="maze-p1-name"
                    type="text"
                    maxLength={14}
                    value={p1Name}
                    onChange={(e) => setP1Name(e.target.value)}
                    className="mt-1.5 min-h-10 w-full rounded-xl border-2 border-[#2B2857] bg-[#121026] px-3 py-2 text-sm text-white focus:border-[#6B61FF] focus:outline-none"
                  />
                </div>

                {mode === 'race' && (
                  <div>
                    <label htmlFor="maze-p2-name" className="text-xs font-bold text-white/80">
                      P2 이름 (빨강)
                    </label>
                    <input
                      id="maze-p2-name"
                      type="text"
                      maxLength={14}
                      value={p2Name}
                      onChange={(e) => setP2Name(e.target.value)}
                      className="mt-1.5 min-h-10 w-full rounded-xl border-2 border-[#2B2857] bg-[#121026] px-3 py-2 text-sm text-white focus:border-rose-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={startMazeRound}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-6 py-3 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] whitespace-nowrap"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>미로 기억 시작하기</span>
              </button>
            </section>
          </main>
        </div>
      )}

      {/* ACTIVE GAME: MEMORIZE, EXPLORE, RESULT — One-Screen Fold 8 Layout */}
      {(isOnline || phase !== 'SETUP') && effectiveMaze && (
        <GameBoardLayout
          onlineReactionBar={onlineReactionBar}
          topBar={
            <div className="rounded-2xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-2 shadow-[0_3px_0_#15132d] sm:px-4 sm:py-2.5">
              <div className="flex items-center justify-between gap-2">
                {/* Left: Back + Active Player / Phase Info */}
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  {!isOnline && (
                    <button
                      type="button"
                      onClick={() => setPhase('SETUP')}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2.5 py-1 text-xs font-extrabold text-white transition-all hover:border-[#FFD21E] hover:text-[#FFD21E] active:translate-y-[1px] whitespace-nowrap"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">설정</span>
                    </button>
                  )}

                  {effectivePhase === 'MEMORIZE' && (
                    <div className="min-w-0 truncate text-xs sm:text-sm">
                      <span className="font-black text-[#FFD21E]">기억 단계</span>
                      <span aria-hidden="true" className="mx-1.5 text-white/35">·</span>
                      <span className="font-extrabold text-white">
                        {effectiveBoardSize}×{effectiveBoardSize} 벽과 출구(E)를 기억하세요
                      </span>
                    </div>
                  )}

                  {effectivePhase === 'EXPLORE' && activeExplorer && (
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                      <span
                        className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[11px] font-black ${
                          activeExplorer.id === 1
                            ? 'bg-sky-400 text-[#121026]'
                            : 'bg-rose-400 text-[#121026]'
                        }`}
                      >
                        P{activeExplorer.id}
                      </span>
                      <span className="truncate text-xs font-extrabold text-white sm:text-sm">
                        {activeExplorer.name}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold text-[#FFD21E] whitespace-nowrap">
                        <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{DIR_LABELS_KO[activeExplorer.dir]}</span>
                      </span>
                      {effectiveMode === 'race' && (
                        <span
                          className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap ${
                            isOnline
                              ? isMyOnlineTurn
                                ? 'border-[#FFD21E] bg-[#FFD21E] text-[#121026]'
                                : 'border-[#2B2857] bg-[#121026] text-white/75'
                              : 'border-[#FFD21E]/60 bg-[#121026] text-[#FFD21E]'
                          }`}
                        >
                          {isOnline
                            ? isMyOnlineTurn
                              ? '내 턴'
                              : '상대 턴'
                            : '내 턴 (1회 이동)'}
                        </span>
                      )}
                    </div>
                  )}

                  {effectivePhase === 'RESULT' && (
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-black text-[#FFD21E] sm:text-sm">
                      <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {gaveUp
                          ? '전체 미로 지도 공개'
                          : effectiveMode === 'solo'
                            ? `${(elapsedMs / 1000).toFixed(1)}초 만에 탈출 성공!`
                            : `${effectiveExplorers.find((e) => e.id === effectiveWinnerId)?.name ?? ''} 탈출 승리!`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Countdown / Timer / Collision Counter */}
                <div className="flex shrink-0 items-center gap-2">
                  {effectivePhase === 'MEMORIZE' ? (
                    <div className="flex items-center gap-1.5 rounded-xl border-2 border-[#FFD21E] bg-[#121026] px-2.5 py-1">
                      <Eye className="h-3.5 w-3.5 text-[#FFD21E]" aria-hidden="true" />
                      <span className="font-mono text-sm font-black tabular-nums text-[#FFD21E] sm:text-base">
                        {(memorizeLeftMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  ) : effectiveMode === 'solo' ? (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 py-1">
                        <Clock className="h-3.5 w-3.5 text-[#6B61FF]" aria-hidden="true" />
                        <span className="font-mono text-xs font-extrabold tabular-nums text-white sm:text-sm">
                          {(elapsedMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 py-1">
                        <span className="text-[11px] font-bold text-white/75">충돌</span>
                        <span className="font-mono text-xs font-extrabold tabular-nums text-rose-400 sm:text-sm">
                          {effectiveExplorers[0]?.collisions ?? 0}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {isOnline && effectivePhase === 'EXPLORE' && (
                        <div className="flex items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 py-1">
                          <Clock
                            className={`h-3 w-3 ${
                              shotClock <= 10 ? 'text-rose-400' : 'text-[#FFD21E]'
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={`font-mono text-xs font-extrabold tabular-nums ${
                              shotClock <= 10 ? 'text-rose-400' : 'text-white'
                            }`}
                          >
                            {shotClock}s
                          </span>
                        </div>
                      )}
                      {effectiveExplorers.map((exp) => (
                        <div
                          key={exp.id}
                          className={`rounded-xl border-2 px-2 py-1 text-[11px] font-mono tabular-nums ${
                            effectivePhase === 'EXPLORE' && activeExplorer?.id === exp.id
                              ? exp.id === 1
                                ? 'border-sky-400 bg-sky-500/20 font-extrabold text-sky-200'
                                : 'border-rose-400 bg-rose-500/20 font-extrabold text-rose-200'
                              : 'border-[#2B2857] bg-[#121026] text-white/75'
                          }`}
                        >
                          <span className="font-extrabold">P{exp.id}</span>
                          <span className="ml-1">충돌 {exp.collisions}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {effectivePhase === 'MEMORIZE' && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-[#2B2857] bg-[#121026]">
                  <div
                    className="h-full w-full origin-left bg-[#FFD21E] transition-transform duration-75"
                    style={{
                      transform: `scaleX(${Math.max(
                        0,
                        Math.min(1, memorizeLeftMs / (effectiveMemorizeSeconds * 1000)),
                      )})`,
                    }}
                  />
                </div>
              )}
            </div>
          }
          noticeBar={
            isOnline && effectivePhase === 'EXPLORE' && !isMyOnlineTurn ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border-2 border-[#6B61FF] bg-[#1D1B3D] px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_3px_0_#15132d]"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFD21E] shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {effectiveCollisionNotice
                    ? `${effectiveCollisionNotice} · 상대방의 행동을 기다리는 중...`
                    : `상대방(${activeExplorer?.name ?? ''})의 행동을 기다리는 중...`}
                </span>
              </div>
            ) : effectiveCollisionNotice && effectivePhase === 'EXPLORE' ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border-2 border-rose-400 bg-rose-500/20 px-3 py-1.5 text-xs font-extrabold text-rose-200 shadow-[0_3px_0_#9F1239]"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                <span className="truncate">{effectiveCollisionNotice}</span>
              </div>
            ) : undefined
          }
          boardArea={
            <SquareBoardBox maxPx={620}>
              <div
                className={`h-full w-full rounded-2xl border-[3px] p-2 transition-colors duration-150 sm:p-3 ${
                  collisionFlash
                    ? 'animate-shake border-rose-400 bg-rose-950/60 shadow-[0_4px_0_#9F1239]'
                    : 'border-[#2B2857] bg-[#1D1B3D] shadow-[0_5px_0_#15132d]'
                }`}
              >
                <div
                  className="relative h-full w-full overflow-hidden rounded-xl border-[3px] border-[#2B2857] bg-[#121026] select-none"
                  aria-label="블라인드 미로 보드"
                >
                  <div
                    className="grid h-full w-full"
                    style={{
                      gridTemplateColumns: `repeat(${effectiveMaze.size}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${effectiveMaze.size}, minmax(0, 1fr))`,
                    }}
                  >
                    {effectiveMaze.grid.map((row) =>
                      row.map((cell) => {
                        const isStart =
                          cell.r === effectiveMaze.start.r && cell.c === effectiveMaze.start.c;
                        const isExit =
                          cell.r === effectiveMaze.exit.r && cell.c === effectiveMaze.exit.c;

                        const p1Here =
                          effectiveExplorers[0]?.r === cell.r &&
                          effectiveExplorers[0]?.c === cell.c;
                        const p2Here =
                          effectiveExplorers[1]?.r === cell.r &&
                          effectiveExplorers[1]?.c === cell.c;

                        const key = `${cell.r},${cell.c}`;
                        const inP1Path =
                          effectivePhase === 'RESULT' && trajectorySets.p1Set.has(key);
                        const inP2Path =
                          effectivePhase === 'RESULT' && trajectorySets.p2Set.has(key);

                        // Active explorer forward sightline indicator on the cell's facing edge
                        const activeHere =
                          activeExplorer &&
                          activeExplorer.r === cell.r &&
                          activeExplorer.c === cell.c;

                        let cellBg = 'bg-[#0C111C]';
                        if (showWalls) {
                          if (isExit) cellBg = 'bg-emerald-500/25';
                          else if (isStart) cellBg = 'bg-sky-500/18';
                          else if (inP1Path && inP2Path) cellBg = 'bg-violet-500/25';
                          else if (inP1Path) cellBg = 'bg-sky-500/20';
                          else if (inP2Path) cellBg = 'bg-rose-500/20';
                          else cellBg = 'bg-[#101726]';
                        }

                        return (
                          <div
                            key={`${cell.r}-${cell.c}`}
                            className={`relative flex items-center justify-center border border-slate-800/45 ${cellBg}`}
                          >
                            {/* Forward Sightline Beam & Facing-Edge Indicator Light */}
                            {activeHere && activeExplorer && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 z-10 transition-transform duration-200 ease-out"
                                style={{
                                  transform: `rotate(${activeExplorer.rotationDeg}deg)`,
                                }}
                              >
                                <div
                                  className={`absolute inset-x-[18%] top-0 h-[46%] rounded-b-full blur-[1px] ${
                                    activeExplorer.id === 1
                                      ? 'bg-gradient-to-b from-sky-300/45 via-sky-400/15 to-transparent'
                                      : 'bg-gradient-to-b from-rose-300/45 via-rose-400/15 to-transparent'
                                  }`}
                                />
                                <div
                                  className={`absolute left-1/2 top-[2px] h-[3px] w-[54%] -translate-x-1/2 rounded-full ${
                                    activeExplorer.id === 1
                                      ? 'bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.95)]'
                                      : 'bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.95)]'
                                  }`}
                                />
                              </div>
                            )}

                            {/* S / E Markers only during MEMORIZE and RESULT */}
                            {showWalls && isStart && !p1Here && !p2Here && (
                              <span className="font-mono text-xs font-extrabold text-sky-400 sm:text-sm">
                                S
                              </span>
                            )}
                            {showWalls && isExit && !p1Here && !p2Here && (
                              <span className="font-mono text-xs font-extrabold text-emerald-400 sm:text-sm">
                                E
                              </span>
                            )}

                            {showWalls && (isStart || isExit) && (p1Here || p2Here) && (
                              <span
                                className={`absolute left-1 top-0.5 z-20 font-mono text-[10px] font-bold ${
                                  isExit ? 'text-emerald-300' : 'text-sky-300'
                                }`}
                              >
                                {isExit ? 'E' : 'S'}
                              </span>
                            )}

                            {/* Internal Walls: only visible in MEMORIZE and RESULT */}
                            {showWalls && cell.walls.S && cell.r < effectiveMaze.size - 1 && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-[2px] left-0 right-0 z-10 h-[4px] bg-slate-200"
                              />
                            )}
                            {showWalls && cell.walls.E && cell.c < effectiveMaze.size - 1 && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute bottom-0 right-[-2px] top-0 z-10 w-[4px] bg-slate-200"
                              />
                            )}

                            {/* Player Tokens with Orthogonal 12/3/6/9 O'Clock Symmetrical Pointer */}
                            {(p1Here || p2Here) && (
                              <div className="z-20 flex items-center justify-center gap-0.5">
                                {p1Here && effectiveExplorers[0] && (
                                  <div
                                    className={`relative flex items-center justify-center rounded-full bg-sky-400 text-slate-950 shadow-md ${
                                      p2Here
                                        ? 'h-[56%] w-[56%] min-h-5 min-w-5 p-1'
                                        : 'h-7 w-7 sm:h-9 sm:w-9'
                                    } ${
                                      effectivePhase === 'EXPLORE' && activeExplorer?.id === 1
                                        ? 'ring-2 ring-white'
                                        : ''
                                    }`}
                                    title={`P1 방향: ${DIR_LABELS_KO[effectiveExplorers[0].dir]}`}
                                  >
                                    <div
                                      className="flex h-full w-full items-center justify-center transition-transform duration-200 ease-out"
                                      style={{
                                        transform: `rotate(${effectiveExplorers[0].rotationDeg}deg)`,
                                      }}
                                    >
                                      <OrthogonalPointerSvg
                                        className={
                                          p2Here
                                            ? 'h-3 w-3'
                                            : 'h-4 w-4 sm:h-5 sm:w-5'
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                                {p2Here && effectiveExplorers[1] && (
                                  <div
                                    className={`relative flex items-center justify-center rounded-full bg-rose-400 text-slate-950 shadow-md ${
                                      p1Here
                                        ? 'h-[56%] w-[56%] min-h-5 min-w-5 p-1'
                                        : 'h-7 w-7 sm:h-9 sm:w-9'
                                    } ${
                                      effectivePhase === 'EXPLORE' && activeExplorer?.id === 2
                                        ? 'ring-2 ring-white'
                                        : ''
                                    }`}
                                    title={`P2 방향: ${DIR_LABELS_KO[effectiveExplorers[1].dir]}`}
                                  >
                                    <div
                                      className="flex h-full w-full items-center justify-center transition-transform duration-200 ease-out"
                                      style={{
                                        transform: `rotate(${effectiveExplorers[1].rotationDeg}deg)`,
                                      }}
                                    >
                                      <OrthogonalPointerSvg
                                        className={
                                          p1Here
                                            ? 'h-3 w-3'
                                            : 'h-4 w-4 sm:h-5 sm:w-5'
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }),
                    )}
                  </div>
                </div>
              </div>
            </SquareBoardBox>
          }
          controlArea={
            <div className="space-y-2.5 sm:space-y-4">
              {effectivePhase === 'MEMORIZE' && (
                <div className="arcade-panel rounded-2xl p-3.5 sm:rounded-3xl sm:p-5">
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <div className="min-w-0">
                      <h2 className="text-xs font-black text-[#FFD21E] sm:text-sm">
                        지도 암기 중
                      </h2>
                      <p className="mt-1 hidden text-xs leading-relaxed text-white/75 sm:block">
                        출발점(S)과 출구(E)까지의 열린 통로를 기억하세요. 잠시 후 모든 벽이 어둡게 가려집니다.
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/75 sm:hidden">
                        S·E 위치와 열린 길을 기억하세요
                      </p>
                    </div>
                    {!isOnline && (
                      <button
                        type="button"
                        disabled={isPaused}
                        onClick={() => setPhase('EXPLORE')}
                        className="min-h-10 shrink-0 rounded-2xl bg-[#FFD21E] px-4 py-2 text-xs font-black text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-[0_2px_0_#9E7D00] disabled:opacity-45 sm:mt-4 sm:min-h-11 sm:w-full whitespace-nowrap"
                      >
                        바로 출발
                      </button>
                    )}
                  </div>
                </div>
              )}

              {effectivePhase === 'EXPLORE' && activeExplorer && (
                <div className="arcade-panel rounded-2xl p-2.5 sm:rounded-3xl sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-black text-white sm:text-sm">
                      4방향 이동 조작
                    </h2>
                    <span className="text-[11px] font-extrabold text-[#FFD21E] sm:text-xs">
                      {effectiveMode === 'race'
                        ? `P${activeExplorer.id} 턴 · 1회 이동 시 교대`
                        : `최근 방향: ${DIR_LABELS_KO[activeExplorer.dir]}`}
                    </span>
                  </div>
                  <p className="mt-1 hidden text-xs text-white/75 sm:block">
                    {isOnline && !isMyOnlineTurn
                      ? `상대방(${activeExplorer.name})이 이동할 때까지 기다려주세요.`
                      : '이동할 방향 화살표(▲▼◀▶)를 누르면 화살표가 해당 방향을 가리키며 즉시 1칸 전진합니다.'}
                  </p>

                  {/* Cross-shaped 4-Way D-Pad */}
                  <div className="mx-auto mt-2 grid w-48 grid-cols-3 gap-1.5 sm:mt-4 sm:w-56 sm:gap-2">
                    <div aria-hidden="true" />
                    <button
                      type="button"
                      disabled={isPaused || (isOnline && !isMyOnlineTurn)}
                      onClick={() => performDirectionalMove('N')}
                      aria-label="위쪽(북쪽)으로 이동"
                      className="flex h-12 flex-col items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] text-[#FFD21E] shadow-[0_4px_0_#15132d] transition-all hover:border-[#6B61FF] hover:bg-[#6B61FF] hover:text-white active:translate-y-[2px] active:shadow-[0_2px_0_#15132d] focus-visible:outline-2 focus-visible:outline-[#FFD21E] disabled:cursor-not-allowed disabled:opacity-35 sm:h-14"
                    >
                      <ArrowUp className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                      <span className="text-[10px] font-black leading-none">상</span>
                    </button>
                    <div aria-hidden="true" />

                    <button
                      type="button"
                      disabled={isPaused || (isOnline && !isMyOnlineTurn)}
                      onClick={() => performDirectionalMove('W')}
                      aria-label="왼쪽(서쪽)으로 이동"
                      className="flex h-12 flex-col items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] text-[#FFD21E] shadow-[0_4px_0_#15132d] transition-all hover:border-[#6B61FF] hover:bg-[#6B61FF] hover:text-white active:translate-y-[2px] active:shadow-[0_2px_0_#15132d] focus-visible:outline-2 focus-visible:outline-[#FFD21E] disabled:cursor-not-allowed disabled:opacity-35 sm:h-14"
                    >
                      <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                      <span className="text-[10px] font-black leading-none">좌</span>
                    </button>

                    <div
                      aria-hidden="true"
                      className={`flex h-12 items-center justify-center rounded-2xl border-2 text-xs font-mono font-black sm:h-14 ${
                        activeExplorer.id === 1
                          ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                          : 'border-rose-400 bg-rose-500/20 text-rose-200'
                      }`}
                    >
                      P{activeExplorer.id}
                    </div>

                    <button
                      type="button"
                      disabled={isPaused || (isOnline && !isMyOnlineTurn)}
                      onClick={() => performDirectionalMove('E')}
                      aria-label="오른쪽(동쪽)으로 이동"
                      className="flex h-12 flex-col items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] text-[#FFD21E] shadow-[0_4px_0_#15132d] transition-all hover:border-[#6B61FF] hover:bg-[#6B61FF] hover:text-white active:translate-y-[2px] active:shadow-[0_2px_0_#15132d] focus-visible:outline-2 focus-visible:outline-[#FFD21E] disabled:cursor-not-allowed disabled:opacity-35 sm:h-14"
                    >
                      <ArrowRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                      <span className="text-[10px] font-black leading-none">우</span>
                    </button>

                    <div aria-hidden="true" />
                    <button
                      type="button"
                      disabled={isPaused || (isOnline && !isMyOnlineTurn)}
                      onClick={() => performDirectionalMove('S')}
                      aria-label="아래쪽(남쪽)으로 이동"
                      className="flex h-12 flex-col items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] text-[#FFD21E] shadow-[0_4px_0_#15132d] transition-all hover:border-[#6B61FF] hover:bg-[#6B61FF] hover:text-white active:translate-y-[2px] active:shadow-[0_2px_0_#15132d] focus-visible:outline-2 focus-visible:outline-[#FFD21E] disabled:cursor-not-allowed disabled:opacity-35 sm:h-14"
                    >
                      <ArrowDown className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                      <span className="text-[10px] font-black leading-none">하</span>
                    </button>
                    <div aria-hidden="true" />
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3.5 sm:flex-col sm:items-stretch sm:border-t sm:border-[#2B2857] sm:pt-3">
                    <p className="text-[11px] font-medium text-white/60 sm:text-center">
                      키보드: 방향키 또는 W·A·S·D
                    </p>
                    <button
                      type="button"
                      disabled={isPaused}
                      onClick={() => {
                        if (isOnline) {
                          handleOnlineGiveUp();
                        } else {
                          setGaveUp(true);
                          setPhase('RESULT');
                        }
                      }}
                      className="inline-flex min-h-8 items-center justify-center gap-1.5 text-xs font-bold text-white/75 transition-colors hover:text-[#FF61D2] disabled:opacity-45 sm:mt-1 sm:min-h-9"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isOnline ? '기권하기' : '포기 및 지도 보기'}</span>
                    </button>
                  </div>
                </div>
              )}

              {effectivePhase === 'RESULT' && (
                <div className="arcade-panel rounded-2xl p-3.5 sm:rounded-3xl sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#FFD21E]">
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                      <span>탐험 기록</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-semibold text-white/75">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-sky-400" aria-hidden="true" />
                        P1 궤적
                      </span>
                      {effectiveMode === 'race' && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm bg-rose-400" aria-hidden="true" />
                          P2 궤적
                        </span>
                      )}
                    </div>
                  </div>

                  {effectiveCollisionNotice && (
                    <p className="mt-2 text-xs font-semibold text-[#FFD21E]">
                      {effectiveCollisionNotice}
                    </p>
                  )}

                  <div className="mt-2.5 space-y-2 sm:mt-3.5">
                    {effectiveExplorers.map((exp) => {
                      const isWinner = !gaveUp && effectiveWinnerId === exp.id;
                      return (
                        <div
                          key={exp.id}
                          className={`rounded-2xl border-2 p-2.5 sm:p-3 ${
                            isWinner
                              ? 'border-[#FFD21E] bg-[#FFD21E]/15'
                              : 'border-[#2B2857] bg-[#121026]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-black ${
                                  exp.id === 1
                                    ? 'bg-sky-400 text-[#121026]'
                                    : 'bg-rose-400 text-[#121026]'
                                }`}
                              >
                                P{exp.id}
                              </span>
                              <span className="text-xs font-extrabold text-white sm:text-sm">
                                {exp.name}
                              </span>
                              {isWinner && (
                                <span className="text-[11px] font-black text-[#FFD21E]">
                                  승리
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                              {effectiveMode === 'solo' && (
                                <span className="font-extrabold text-[#FFD21E]">
                                  {(elapsedMs / 1000).toFixed(1)}초
                                </span>
                              )}
                              <span className="text-white/75">입력 {exp.steps}</span>
                              <span className="font-bold text-rose-300">충돌 {exp.collisions}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isOnline ? (
                    <div className="mt-3 space-y-2 sm:mt-4">
                      <div className="flex flex-wrap gap-2">
                        {isHost && (
                          <button
                            type="button"
                            disabled={isRematching}
                            onClick={() => void handleOnlineRematch()}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFD21E] px-3 py-2 text-xs font-black text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-[0_2px_0_#9E7D00] disabled:opacity-60 whitespace-nowrap sm:min-h-11"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {isRematching ? '준비 중...' : '같은 게임 바로 재대결'}
                            </span>
                          </button>
                        )}
                        {onReturnToWaitingRoom && (
                          <button
                            type="button"
                            onClick={onReturnToWaitingRoom}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-3 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#15132d] transition-all hover:border-[#6B61FF] hover:text-[#FFD21E] active:translate-y-[1px] whitespace-nowrap sm:min-h-11"
                          >
                            <Home className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>대기실로 돌아가기</span>
                          </button>
                        )}
                      </div>
                      {!isHost && (
                        <p className="text-[11px] text-white/70">
                          방장({onlineRoom?.players?.[hostRole]?.nickname ?? hostRole})이 재대결 또는 대기실 복귀를 선택할 수 있습니다.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2 sm:mt-4">
                      <button
                        type="button"
                        onClick={startMazeRound}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFD21E] px-3 py-2 text-xs font-black text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-[0_2px_0_#9E7D00] whitespace-nowrap sm:min-h-11"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>새 미로 도전</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhase('SETUP')}
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-3 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#15132d] transition-all hover:border-[#6B61FF] hover:text-[#FFD21E] active:translate-y-[1px] whitespace-nowrap sm:min-h-11"
                      >
                        설정 변경
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
