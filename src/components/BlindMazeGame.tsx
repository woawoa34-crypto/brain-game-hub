import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Clock,
  Compass,
  Eye,
  Flag,
  Play,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import {
  DIR_LABELS_KO,
  generateMaze,
  getForwardDelta,
  turnLeft90,
  turnRight90,
  type CardinalDir,
  type GeneratedMaze,
} from '../games/blindmaze/generator';
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

interface BlindMazeGameProps {
  onBackToLobby: () => void;
}

const DIR_ROTATION_DEG: Record<CardinalDir, number> = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
};

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

export function BlindMazeGame({ onBackToLobby }: BlindMazeGameProps) {
  const [phase, setPhase] = useState<MazePhase>('SETUP');
  const [boardSize, setBoardSize] = useState<6 | 7>(6);
  const [memorizeSeconds, setMemorizeSeconds] = useState<3 | 5>(3);
  const [mode, setMode] = useState<MazeMode>('solo');
  const [p1Name, setP1Name] = useState('플레이어 1');
  const [p2Name, setP2Name] = useState('플레이어 2');

  const [maze, setMaze] = useState<GeneratedMaze | null>(null);
  const [explorers, setExplorers] = useState<ExplorerState[]>([]);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(0);
  const [actionsLeft, setActionsLeft] = useState<number>(2);

  const [memorizeLeftMs, setMemorizeLeftMs] = useState<number>(3000);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [collisionFlash, setCollisionFlash] = useState<boolean>(false);
  const [collisionNotice, setCollisionNotice] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<1 | 2 | null>(null);
  const [gaveUp, setGaveUp] = useState<boolean>(false);

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
    setActionsLeft(2);
    setMemorizeLeftMs(memorizeSeconds * 1000);
    setElapsedMs(0);
    setCollisionFlash(false);
    setCollisionNotice(null);
    setWinnerId(null);
    setGaveUp(false);
    setPhase('MEMORIZE');
  }, [boardSize, memorizeSeconds, mode, p1Name, p2Name]);

  // Memorize countdown timer
  useEffect(() => {
    if (phase !== 'MEMORIZE') return;

    const totalMs = memorizeSeconds * 1000;
    const startedAt = performance.now();

    const timer = window.setInterval(() => {
      const passed = performance.now() - startedAt;
      const remain = Math.max(0, totalMs - passed);
      setMemorizeLeftMs(remain);
      if (remain <= 0) {
        window.clearInterval(timer);
        soundEngine.playTick();
        setPhase('EXPLORE');
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [phase, memorizeSeconds]);

  // Solo elapsed timer during EXPLORE
  useEffect(() => {
    if (phase !== 'EXPLORE' || mode !== 'solo') return;

    const startedAt = performance.now() - elapsedMs;
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 100);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode]);

  const activeExplorer = explorers[activeTurnIdx] ?? explorers[0] ?? null;

  const triggerCollisionFeedback = useCallback((playerName: string) => {
    soundEngine.playWrongGuess();
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(120);
    }
    setCollisionFlash(false);
    window.requestAnimationFrame(() => setCollisionFlash(true));
    window.setTimeout(() => setCollisionFlash(false), 320);
    setCollisionNotice(`${playerName}: 앞이 벽으로 막혀 있습니다! (충돌 +1)`);
  }, []);

  const performRelativeAction = useCallback(
    (action: 'LEFT' | 'RIGHT' | 'FORWARD') => {
      if (phase !== 'EXPLORE' || !maze || !activeExplorer) return;

      setCollisionNotice(null);

      let reachedExit = false;
      const nextExplorers = explorers.map((exp, idx) => {
        if (idx !== activeTurnIdx) return exp;

        if (action === 'LEFT') {
          soundEngine.playSelect();
          return {
            ...exp,
            dir: turnLeft90(exp.dir),
            rotationDeg: exp.rotationDeg - 90,
            steps: exp.steps + 1,
          };
        }

        if (action === 'RIGHT') {
          soundEngine.playSelect();
          return {
            ...exp,
            dir: turnRight90(exp.dir),
            rotationDeg: exp.rotationDeg + 90,
            steps: exp.steps + 1,
          };
        }

        // FORWARD
        const currentCell = maze.grid[exp.r][exp.c];
        if (currentCell.walls[exp.dir]) {
          triggerCollisionFeedback(exp.name);
          return {
            ...exp,
            collisions: exp.collisions + 1,
            steps: exp.steps + 1,
          };
        }

        const { dr, dc } = getForwardDelta(exp.dir);
        const nr = exp.r + dr;
        const nc = exp.c + dc;
        soundEngine.playTick();

        if (nr === maze.exit.r && nc === maze.exit.c) {
          reachedExit = true;
        }

        return {
          ...exp,
          r: nr,
          c: nc,
          steps: exp.steps + 1,
          trajectory: [...exp.trajectory, { r: nr, c: nc }],
        };
      });

      setExplorers(nextExplorers);

      if (reachedExit) {
        soundEngine.playVictory();
        setWinnerId(activeExplorer.id);
        setPhase('RESULT');
        return;
      }

      if (mode === 'race') {
        if (actionsLeft <= 1) {
          setActiveTurnIdx((prev) => (prev + 1) % nextExplorers.length);
          setActionsLeft(2);
        } else {
          setActionsLeft((prev) => prev - 1);
        }
      }
    },
    [
      phase,
      maze,
      activeExplorer,
      explorers,
      activeTurnIdx,
      mode,
      actionsLeft,
      triggerCollisionFeedback,
    ],
  );

  // Keyboard shortcuts during EXPLORE (A/Left = turn left, W/Up = forward, D/Right = turn right)
  useEffect(() => {
    if (phase !== 'EXPLORE') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        performRelativeAction('LEFT');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        performRelativeAction('RIGHT');
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        performRelativeAction('FORWARD');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, performRelativeAction]);

  const trajectorySets = useMemo(() => {
    const p1Set = new Set<string>();
    const p2Set = new Set<string>();
    if (explorers[0]) {
      for (const pt of explorers[0].trajectory) {
        p1Set.add(`${pt.r},${pt.c}`);
      }
    }
    if (explorers[1]) {
      for (const pt of explorers[1].trajectory) {
        p2Set.add(`${pt.r},${pt.c}`);
      }
    }
    return { p1Set, p2Set };
  }, [explorers]);

  const showWalls = phase === 'MEMORIZE' || phase === 'RESULT';

  return (
    <>
      {phase === 'RESULT' && !gaveUp && <VictoryConfetti />}

      {/* SETUP SCREEN */}
      {phase === 'SETUP' && (
        <div className="h-full overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
            <button
              type="button"
              onClick={onBackToLobby}
              className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>로비로 돌아가기</span>
            </button>

            <span className="text-xs text-slate-500">
              인지 지도 & 시점 회전 미로
            </span>
          </div>

          <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
            <section className="text-center">
              <p className="text-xs font-medium text-violet-300">
                게임 4 · 인지 지도 & 시점 회전
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl [text-wrap:balance]">
                블라인드 미로 탈출
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
                잠시 공개되는 미로 지도를 머릿속에 기억한 뒤, 어둠 속에서 내 시점 방향(좌회전·전진·우회전)만을
                조종해 출구(E)까지 탈출하세요.
              </p>
            </section>

            <section className="mt-7 space-y-5 rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-7">
              {/* Board Size & Memorize Time */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    미로 크기
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setBoardSize(6)}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                        boardSize === 6
                          ? 'border-violet-400 bg-violet-500/15 text-violet-200'
                          : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      6×6 (보통)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardSize(7)}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                        boardSize === 7
                          ? 'border-violet-400 bg-violet-500/15 text-violet-200'
                          : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      7×7 (어려움)
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-300">
                    지도 기억 시간
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setMemorizeSeconds(3)}
                      className={`min-h-11 rounded-xl border px-3 py-2 font-mono text-xs font-bold transition-colors ${
                        memorizeSeconds === 3
                          ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                          : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      3초 공개
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemorizeSeconds(5)}
                      className={`min-h-11 rounded-xl border px-3 py-2 font-mono text-xs font-bold transition-colors ${
                        memorizeSeconds === 5
                          ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                          : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      5초 공개
                    </button>
                  </div>
                </div>
              </div>

              {/* Game Mode */}
              <div className="border-t border-slate-800 pt-5">
                <span className="block text-xs font-semibold text-slate-300">
                  플레이 모드
                </span>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMode('solo')}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                      mode === 'solo'
                        ? 'border-violet-400 bg-violet-500/12'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                    }`}
                  >
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold text-slate-100">솔로 타임어택</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">
                        최소 충돌과 최단 시간으로 출구(E)에 도달하는 기록 도전 모드
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('race')}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                      mode === 'race'
                        ? 'border-rose-400 bg-rose-500/12'
                        : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                    }`}
                  >
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold text-slate-100">2인 턴제 레이스</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">
                        같은 미로에서 P1·P2가 1턴에 행동 2회씩 번갈아 입력해 먼저 탈출하면 승리
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Player names */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="maze-p1-name" className="text-xs text-slate-400">
                    {mode === 'solo' ? '플레이어 이름' : 'P1 이름 (파랑)'}
                  </label>
                  <input
                    id="maze-p1-name"
                    type="text"
                    maxLength={14}
                    value={p1Name}
                    onChange={(e) => setP1Name(e.target.value)}
                    className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 focus:border-violet-400 focus:outline-none"
                  />
                </div>

                {mode === 'race' && (
                  <div>
                    <label htmlFor="maze-p2-name" className="text-xs text-slate-400">
                      P2 이름 (빨강)
                    </label>
                    <input
                      id="maze-p2-name"
                      type="text"
                      maxLength={14}
                      value={p2Name}
                      onChange={(e) => setP2Name(e.target.value)}
                      className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 focus:border-rose-400 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={startMazeRound}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 whitespace-nowrap"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>미로 기억 시작하기</span>
              </button>
            </section>
          </main>
        </div>
      )}

      {/* ACTIVE GAME: MEMORIZE, EXPLORE, RESULT — One-Screen Fold 8 Layout */}
      {phase !== 'SETUP' && maze && (
        <GameBoardLayout
          topBar={
            <div className="rounded-xl border border-slate-800 bg-[#131926] px-3 py-2 sm:px-4 sm:py-2.5">
              <div className="flex items-center justify-between gap-2">
                {/* Left: Back + Active Player / Phase Info */}
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setPhase('SETUP')}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 whitespace-nowrap"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">설정</span>
                  </button>

                  {phase === 'MEMORIZE' && (
                    <div className="min-w-0 truncate text-xs sm:text-sm">
                      <span className="font-semibold text-violet-300">기억 단계</span>
                      <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
                      <span className="font-bold text-slate-100">
                        {boardSize}×{boardSize} 벽과 출구(E)를 기억하세요
                      </span>
                    </div>
                  )}

                  {phase === 'EXPLORE' && activeExplorer && (
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                      <span
                        className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[11px] font-bold ${
                          activeExplorer.id === 1
                            ? 'bg-sky-400 text-slate-950'
                            : 'bg-rose-400 text-slate-950'
                        }`}
                      >
                        P{activeExplorer.id}
                      </span>
                      <span className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                        {activeExplorer.name}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-violet-300 whitespace-nowrap">
                        <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{DIR_LABELS_KO[activeExplorer.dir]}</span>
                      </span>
                      {mode === 'race' && (
                        <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-amber-300 whitespace-nowrap">
                          {actionsLeft}/2
                        </span>
                      )}
                    </div>
                  )}

                  {phase === 'RESULT' && (
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-emerald-400 sm:text-sm">
                      <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {gaveUp
                          ? '전체 미로 지도 공개'
                          : mode === 'solo'
                            ? `${(elapsedMs / 1000).toFixed(1)}초 만에 탈출 성공!`
                            : `${explorers.find((e) => e.id === winnerId)?.name ?? ''} 탈출 승리!`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Countdown / Timer / Collision Counter */}
                <div className="flex shrink-0 items-center gap-2">
                  {phase === 'MEMORIZE' ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-[#0B0F17] px-2.5 py-1">
                      <Eye className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
                      <span className="font-mono text-sm font-bold tabular-nums text-violet-200 sm:text-base">
                        {(memorizeLeftMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  ) : mode === 'solo' ? (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2 py-1">
                        <Clock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                        <span className="font-mono text-xs font-bold tabular-nums text-slate-100 sm:text-sm">
                          {(elapsedMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2 py-1">
                        <span className="text-[11px] text-slate-400">충돌</span>
                        <span className="font-mono text-xs font-bold tabular-nums text-rose-400 sm:text-sm">
                          {explorers[0]?.collisions ?? 0}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {explorers.map((exp) => (
                        <div
                          key={exp.id}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-mono tabular-nums ${
                            phase === 'EXPLORE' && activeExplorer?.id === exp.id
                              ? exp.id === 1
                                ? 'border-sky-400 bg-sky-500/15 text-sky-200'
                                : 'border-rose-400 bg-rose-500/15 text-rose-200'
                              : 'border-slate-800 bg-[#0B0F17] text-slate-400'
                          }`}
                        >
                          <span className="font-bold">P{exp.id}</span>
                          <span className="ml-1">충돌 {exp.collisions}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {phase === 'MEMORIZE' && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full w-full origin-left rounded-full bg-violet-400 transition-transform duration-75"
                    style={{
                      transform: `scaleX(${Math.max(
                        0,
                        Math.min(1, memorizeLeftMs / (memorizeSeconds * 1000)),
                      )})`,
                    }}
                  />
                </div>
              )}
            </div>
          }
          noticeBar={
            collisionNotice && phase === 'EXPLORE' ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                <span className="truncate">{collisionNotice}</span>
              </div>
            ) : undefined
          }
          mainStage={
            <SquareBoardBox maxPx={620}>
              <div
                className={`h-full w-full rounded-2xl border p-2 transition-colors duration-150 sm:p-3 ${
                  collisionFlash
                    ? 'animate-shake border-rose-500 bg-rose-950/35'
                    : 'border-slate-800 bg-[#131926]'
                }`}
              >
                <div
                  className="relative h-full w-full border-[3px] border-slate-300/80 bg-[#0B0F17] select-none"
                  aria-label="블라인드 미로 보드"
                >
                  <div
                    className="grid h-full w-full"
                    style={{
                      gridTemplateColumns: `repeat(${maze.size}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${maze.size}, minmax(0, 1fr))`,
                    }}
                  >
                    {maze.grid.map((row) =>
                      row.map((cell) => {
                        const isStart =
                          cell.r === maze.start.r && cell.c === maze.start.c;
                        const isExit =
                          cell.r === maze.exit.r && cell.c === maze.exit.c;

                        const p1Here =
                          explorers[0]?.r === cell.r && explorers[0]?.c === cell.c;
                        const p2Here =
                          explorers[1]?.r === cell.r && explorers[1]?.c === cell.c;

                        const key = `${cell.r},${cell.c}`;
                        const inP1Path = phase === 'RESULT' && trajectorySets.p1Set.has(key);
                        const inP2Path = phase === 'RESULT' && trajectorySets.p2Set.has(key);

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
                                {/* Soft directional vision glow towards 12 o'clock (rotated to exact N/E/S/W) */}
                                <div
                                  className={`absolute inset-x-[18%] top-0 h-[46%] rounded-b-full blur-[1px] ${
                                    activeExplorer.id === 1
                                      ? 'bg-gradient-to-b from-sky-300/45 via-sky-400/15 to-transparent'
                                      : 'bg-gradient-to-b from-rose-300/45 via-rose-400/15 to-transparent'
                                  }`}
                                />
                                {/* Crisp facing edge bar showing exact next forward cell border */}
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
                            {showWalls && cell.walls.S && cell.r < maze.size - 1 && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-[2px] left-0 right-0 z-10 h-[4px] bg-slate-200"
                              />
                            )}
                            {showWalls && cell.walls.E && cell.c < maze.size - 1 && (
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute bottom-0 right-[-2px] top-0 z-10 w-[4px] bg-slate-200"
                              />
                            )}

                            {/* Player Tokens with Orthogonal 12/3/6/9 O'Clock Symmetrical Pointer */}
                            {(p1Here || p2Here) && (
                              <div className="z-20 flex items-center justify-center gap-0.5">
                                {p1Here && explorers[0] && (
                                  <div
                                    className={`relative flex items-center justify-center rounded-full bg-sky-400 text-slate-950 shadow-md ${
                                      p2Here
                                        ? 'h-[56%] w-[56%] min-h-5 min-w-5 p-1'
                                        : 'h-7 w-7 sm:h-9 sm:w-9'
                                    } ${
                                      phase === 'EXPLORE' && activeExplorer?.id === 1
                                        ? 'ring-2 ring-white'
                                        : ''
                                    }`}
                                    title={`P1 방향: ${DIR_LABELS_KO[explorers[0].dir]}`}
                                  >
                                    <div
                                      className="flex h-full w-full items-center justify-center transition-transform duration-200 ease-out"
                                      style={{
                                        transform: `rotate(${explorers[0].rotationDeg}deg)`,
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
                                {p2Here && explorers[1] && (
                                  <div
                                    className={`relative flex items-center justify-center rounded-full bg-rose-400 text-slate-950 shadow-md ${
                                      p1Here
                                        ? 'h-[56%] w-[56%] min-h-5 min-w-5 p-1'
                                        : 'h-7 w-7 sm:h-9 sm:w-9'
                                    } ${
                                      phase === 'EXPLORE' && activeExplorer?.id === 2
                                        ? 'ring-2 ring-white'
                                        : ''
                                    }`}
                                    title={`P2 방향: ${DIR_LABELS_KO[explorers[1].dir]}`}
                                  >
                                    <div
                                      className="flex h-full w-full items-center justify-center transition-transform duration-200 ease-out"
                                      style={{
                                        transform: `rotate(${explorers[1].rotationDeg}deg)`,
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
          controlPanel={
            <div className="space-y-2.5 sm:space-y-4">
              {phase === 'MEMORIZE' && (
                <div className="rounded-xl border border-slate-800 bg-[#131926] p-3.5 sm:rounded-2xl sm:p-5">
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold text-slate-100 sm:text-sm">
                        지도 암기 중
                      </h2>
                      <p className="mt-1 hidden text-xs leading-relaxed text-slate-400 sm:block">
                        출발점(S) 화살표의 초기 방향과 출구(E)까지의 경로를 기억하세요. 잠시 후 모든 벽이 어둡게 가려집니다.
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400 sm:hidden">
                        S·E 위치와 초기 시점 방향을 기억하세요
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase('EXPLORE')}
                      className="min-h-10 shrink-0 rounded-xl bg-violet-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-violet-300 sm:mt-4 sm:min-h-11 sm:w-full whitespace-nowrap"
                    >
                      바로 출발
                    </button>
                  </div>
                </div>
              )}

              {phase === 'EXPLORE' && activeExplorer && (
                <div className="rounded-xl border border-slate-800 bg-[#131926] p-3 sm:rounded-2xl sm:p-5">
                  <div className="hidden items-center justify-between gap-2 sm:flex">
                    <h2 className="text-sm font-bold text-slate-100">
                      시점 기준 이동 조작
                    </h2>
                    <span className="text-xs font-semibold text-violet-300">
                      시점: {DIR_LABELS_KO[activeExplorer.dir]}
                    </span>
                  </div>
                  <p className="mt-1 hidden text-xs text-slate-400 sm:block">
                    바라보는 방향(12·3·6·9시 정방향)을 기준으로 90° 회전하거나 1칸 전진합니다.
                  </p>

                  {/* Strictly 3 Relative Controls */}
                  <div className="grid grid-cols-3 gap-2 sm:mt-4 sm:gap-2.5">
                    <button
                      type="button"
                      onClick={() => performRelativeAction('LEFT')}
                      className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-700 bg-[#0B0F17] px-2 py-2 text-xs font-bold text-slate-100 transition-colors hover:border-violet-400 hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-violet-400 sm:min-h-20 sm:gap-1.5"
                    >
                      <RotateCcw className="h-4 w-4 text-violet-300 sm:h-5 sm:w-5" aria-hidden="true" />
                      <span>좌회전 90°</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => performRelativeAction('FORWARD')}
                      className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-violet-400 px-2 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 sm:min-h-20 sm:gap-1.5"
                    >
                      <ArrowUp className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                      <span className="whitespace-nowrap">앞으로 전진</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => performRelativeAction('RIGHT')}
                      className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-slate-700 bg-[#0B0F17] px-2 py-2 text-xs font-bold text-slate-100 transition-colors hover:border-violet-400 hover:bg-violet-500/10 focus-visible:outline-2 focus-visible:outline-violet-400 sm:min-h-20 sm:gap-1.5"
                    >
                      <RotateCw className="h-4 w-4 text-violet-300 sm:h-5 sm:w-5" aria-hidden="true" />
                      <span>우회전 90°</span>
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 sm:mt-4 sm:flex-col sm:items-stretch sm:border-t sm:border-slate-800 sm:pt-3">
                    <p className="text-[11px] text-slate-500 sm:text-center">
                      키보드: ←/A · ↑/W · →/D
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setGaveUp(true);
                        setPhase('RESULT');
                      }}
                      className="inline-flex min-h-8 items-center justify-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-rose-300 sm:mt-1.5 sm:min-h-9"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>포기 및 지도 보기</span>
                    </button>
                  </div>
                </div>
              )}

              {phase === 'RESULT' && (
                <div className="rounded-xl border border-slate-800 bg-[#131926] p-3.5 sm:rounded-2xl sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                      <span>탐험 기록</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-sky-500/50" aria-hidden="true" />
                        P1 궤적
                      </span>
                      {mode === 'race' && (
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-sm bg-rose-500/50" aria-hidden="true" />
                          P2 궤적
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 space-y-2 sm:mt-3.5">
                    {explorers.map((exp) => {
                      const isWinner = !gaveUp && winnerId === exp.id;
                      return (
                        <div
                          key={exp.id}
                          className={`rounded-xl border p-2.5 sm:p-3 ${
                            isWinner
                              ? 'border-emerald-400 bg-emerald-500/10'
                              : 'border-slate-800 bg-[#0B0F17]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                                  exp.id === 1
                                    ? 'bg-sky-400 text-slate-950'
                                    : 'bg-rose-400 text-slate-950'
                                }`}
                              >
                                P{exp.id}
                              </span>
                              <span className="text-xs font-bold text-slate-100 sm:text-sm">
                                {exp.name}
                              </span>
                              {isWinner && (
                                <span className="text-[11px] font-bold text-emerald-400">
                                  성공
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                              {mode === 'solo' && (
                                <span className="font-bold text-sky-300">
                                  {(elapsedMs / 1000).toFixed(1)}초
                                </span>
                              )}
                              <span className="text-slate-400">입력 {exp.steps}</span>
                              <span className="text-rose-300">충돌 {exp.collisions}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex gap-2 sm:mt-4">
                    <button
                      type="button"
                      onClick={startMazeRound}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-400 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-violet-300 whitespace-nowrap sm:min-h-11"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>새 미로 도전</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhase('SETUP')}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap sm:min-h-11"
                    >
                      설정 변경
                    </button>
                  </div>
                </div>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
