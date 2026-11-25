import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  chooseAIFollowCupIndex,
  chooseAILeadCupIndex,
  CUP_COLOR_BY_INDEX,
  generateRecommendedPlacement,
  validateCupPlacement,
  type CupGameMode,
} from '../games/gradientcup/logic';
import { soundEngine } from '../utils/sound';
import { GameBoardLayout } from './GameBoardLayout';
import { VictoryConfetti } from './VictoryConfetti';

type CupPhase =
  | 'SETUP'
  | 'PLACEMENT'
  | 'HANDOFF_TO_P2_PLACE'
  | 'BATTLE'
  | 'RESULT';

type BattleSubPhase =
  | 'HANDOFF_LEAD'
  | 'LEAD_PICK'
  | 'HANDOFF_FOLLOW'
  | 'FOLLOW_PICK'
  | 'REVEAL';

interface RoundRecord {
  round: number;
  leadPlayer: 1 | 2;
  p1CupIdx: number;
  p1Value: number;
  p2CupIdx: number;
  p2Value: number;
  winner: 1 | 2 | 'DRAW';
}

interface GradientCupGameProps {
  onBackToLobby: () => void;
}

const PLACEMENT_LIMIT_SECONDS = 300; // 5 minutes

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function GradientCupGame({ onBackToLobby }: GradientCupGameProps) {
  const [phase, setPhase] = useState<CupPhase>('SETUP');
  const [mode, setMode] = useState<CupGameMode>('ai');
  const [p1Name, setP1Name] = useState('플레이어 1');
  const [p2Name, setP2Name] = useState('AI 봇');

  // Placement state
  const [placingPlayer, setPlacingPlayer] = useState<1 | 2>(1);
  const [draftCups, setDraftCups] = useState<Array<number | null>>(() =>
    Array(7).fill(null),
  );
  const [focusedCupIdx, setFocusedCupIdx] = useState<number>(0);
  const [placementTimeLeft, setPlacementTimeLeft] = useState<number>(
    PLACEMENT_LIMIT_SECONDS,
  );

  // Finalized setups for both players
  const [p1Setup, setP1Setup] = useState<number[]>([]);
  const [p2Setup, setP2Setup] = useState<number[]>([]);

  // Battle state
  const [round, setRound] = useState<number>(1);
  const [leadPlayer, setLeadPlayer] = useState<1 | 2>(1);
  const [battleSubPhase, setBattleSubPhase] = useState<BattleSubPhase>('LEAD_PICK');
  const [p1UsedIndices, setP1UsedIndices] = useState<number[]>([]);
  const [p2UsedIndices, setP2UsedIndices] = useState<number[]>([]);
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);
  const [leadChosenIdx, setLeadChosenIdx] = useState<number | null>(null);
  const [followChosenIdx, setFollowChosenIdx] = useState<number | null>(null);
  const [history, setHistory] = useState<RoundRecord[]>([]);

  const timeoutGuardRef = useRef(false);

  const effectiveP1Name = p1Name.trim() || '플레이어 1';
  const effectiveP2Name =
    mode === 'ai' ? p2Name.trim() || 'AI 봇' : p2Name.trim() || '플레이어 2';

  const handleModeSwitch = (nextMode: CupGameMode) => {
    setMode(nextMode);
    if (nextMode === 'ai' && p2Name === '플레이어 2') {
      setP2Name('AI 봇');
    } else if (nextMode === 'local' && p2Name === 'AI 봇') {
      setP2Name('플레이어 2');
    }
  };

  const startNewGame = () => {
    setPlacingPlayer(1);
    setDraftCups(Array(7).fill(null));
    setFocusedCupIdx(0);
    setPlacementTimeLeft(PLACEMENT_LIMIT_SECONDS);
    setP1Setup([]);
    setP2Setup([]);
    setRound(1);
    setLeadPlayer(1);
    setBattleSubPhase('LEAD_PICK');
    setP1UsedIndices([]);
    setP2UsedIndices([]);
    setP1Score(0);
    setP2Score(0);
    setLeadChosenIdx(null);
    setFollowChosenIdx(null);
    setHistory([]);
    timeoutGuardRef.current = false;
    setPhase('PLACEMENT');
  };

  const validation = useMemo(() => validateCupPlacement(draftCups), [draftCups]);

  const handlePickCubeDigit = (digit: number) => {
    if (phase !== 'PLACEMENT') return;
    const targetSlot = focusedCupIdx;

    // Check remaining available cubes for this digit (if replacing another digit in targetSlot)
    const currentInSlot = draftCups[targetSlot];
    const usedCount = validation.digitCounts[digit];
    if (currentInSlot !== digit && usedCount >= 2) {
      return;
    }

    const next = [...draftCups];
    next[targetSlot] = digit;
    setDraftCups(next);
    soundEngine.playSelect();

    // Auto-advance to next empty slot if available
    const nextEmpty = next.findIndex((val, i) => i > targetSlot && val === null);
    if (nextEmpty !== -1) {
      setFocusedCupIdx(nextEmpty);
    } else {
      const firstEmpty = next.findIndex((val) => val === null);
      if (firstEmpty !== -1) {
        setFocusedCupIdx(firstEmpty);
      } else if (targetSlot < 6) {
        setFocusedCupIdx(targetSlot + 1);
      }
    }
  };

  const handleClearCupSlot = (idx: number) => {
    const next = [...draftCups];
    next[idx] = null;
    setDraftCups(next);
    setFocusedCupIdx(idx);
  };

  const handleAutoRecommend = () => {
    const rec = generateRecommendedPlacement();
    setDraftCups(rec);
    setFocusedCupIdx(6);
    soundEngine.playHintResult(85);
  };

  const finalizeCurrentPlacement = useCallback(
    (finalNumbers: number[]) => {
      if (placingPlayer === 1) {
        setP1Setup(finalNumbers);
        if (mode === 'ai') {
          setP2Setup(generateRecommendedPlacement());
          setRound(1);
          setLeadPlayer(1);
          setBattleSubPhase('LEAD_PICK');
          setPhase('BATTLE');
        } else {
          setDraftCups(Array(7).fill(null));
          setFocusedCupIdx(0);
          setPlacementTimeLeft(PLACEMENT_LIMIT_SECONDS);
          timeoutGuardRef.current = false;
          setPhase('HANDOFF_TO_P2_PLACE');
        }
      } else {
        setP2Setup(finalNumbers);
        setRound(1);
        setLeadPlayer(1);
        setBattleSubPhase('HANDOFF_LEAD');
        setPhase('BATTLE');
      }
    },
    [placingPlayer, mode],
  );

  // 300s placement countdown timer
  useEffect(() => {
    if (phase !== 'PLACEMENT') return;

    const timer = window.setInterval(() => {
      setPlacementTimeLeft((prev) => {
        if (prev <= 1) {
          if (!timeoutGuardRef.current) {
            timeoutGuardRef.current = true;
            window.setTimeout(() => {
              const fallback = validation.isValid
                ? (draftCups as number[])
                : generateRecommendedPlacement();
              finalizeCurrentPlacement(fallback);
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, validation.isValid, draftCups, finalizeCurrentPlacement]);

  const p1Remaining = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((i) => !p1UsedIndices.includes(i)),
    [p1UsedIndices],
  );
  const p2Remaining = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((i) => !p2UsedIndices.includes(i)),
    [p2UsedIndices],
  );

  const followPlayer: 1 | 2 = leadPlayer === 1 ? 2 : 1;

  const commitReveal = useCallback(
    (chosenLeadIdx: number, chosenFollowIdx: number) => {
      const p1CupIdx = leadPlayer === 1 ? chosenLeadIdx : chosenFollowIdx;
      const p2CupIdx = leadPlayer === 2 ? chosenLeadIdx : chosenFollowIdx;
      const p1Val = p1Setup[p1CupIdx];
      const p2Val = p2Setup[p2CupIdx];

      let roundWinner: 1 | 2 | 'DRAW' = 'DRAW';
      if (p1Val > p2Val) {
        roundWinner = 1;
        setP1Score((s) => s + 1);
        soundEngine.playHintResult(90);
      } else if (p2Val > p1Val) {
        roundWinner = 2;
        setP2Score((s) => s + 1);
        soundEngine.playWrongGuess();
      } else {
        soundEngine.playTick();
      }

      setP1UsedIndices((prev) => [...prev, p1CupIdx]);
      setP2UsedIndices((prev) => [...prev, p2CupIdx]);
      setLeadChosenIdx(chosenLeadIdx);
      setFollowChosenIdx(chosenFollowIdx);
      setHistory((prev) => [
        ...prev,
        {
          round,
          leadPlayer,
          p1CupIdx,
          p1Value: p1Val,
          p2CupIdx,
          p2Value: p2Val,
          winner: roundWinner,
        },
      ]);
      setBattleSubPhase('REVEAL');
    },
    [leadPlayer, p1Setup, p2Setup, round],
  );

  const handleLeadSelectCup = useCallback(
    (cupIdx: number) => {
      soundEngine.playSelect();
      setLeadChosenIdx(cupIdx);
      if (mode === 'local') {
        setBattleSubPhase('HANDOFF_FOLLOW');
      } else {
        setBattleSubPhase('FOLLOW_PICK');
      }
    },
    [mode],
  );

  const handleFollowSelectCup = useCallback(
    (cupIdx: number) => {
      if (leadChosenIdx === null) return;
      commitReveal(leadChosenIdx, cupIdx);
    },
    [leadChosenIdx, commitReveal],
  );

  // AI Bot turn automation during BATTLE
  useEffect(() => {
    if (phase !== 'BATTLE' || mode !== 'ai') return;

    if (battleSubPhase === 'LEAD_PICK' && leadPlayer === 2) {
      const timer = window.setTimeout(() => {
        const chosenIdx = chooseAILeadCupIndex(p2Remaining, p2Setup);
        handleLeadSelectCup(chosenIdx);
      }, 650);
      return () => window.clearTimeout(timer);
    }

    if (
      battleSubPhase === 'FOLLOW_PICK' &&
      followPlayer === 2 &&
      leadChosenIdx !== null
    ) {
      const timer = window.setTimeout(() => {
        const leadColorTier = CUP_COLOR_BY_INDEX[leadChosenIdx].tier;
        const chosenIdx = chooseAIFollowCupIndex(
          p2Remaining,
          p2Setup,
          leadColorTier,
          new Set(p1UsedIndices),
        );
        commitReveal(leadChosenIdx, chosenIdx);
      }, 700);
      return () => window.clearTimeout(timer);
    }
  }, [
    phase,
    mode,
    battleSubPhase,
    leadPlayer,
    followPlayer,
    leadChosenIdx,
    p2Remaining,
    p2Setup,
    p1UsedIndices,
    handleLeadSelectCup,
    commitReveal,
  ]);

  const handleNextRound = () => {
    const latestRecord = history[history.length - 1];
    if (round >= 7) {
      soundEngine.playVictory();
      setPhase('RESULT');
      return;
    }

    const nextLead: 1 | 2 =
      latestRecord && latestRecord.winner !== 'DRAW'
        ? latestRecord.winner
        : leadPlayer;

    setRound((r) => r + 1);
    setLeadPlayer(nextLead);
    setLeadChosenIdx(null);
    setFollowChosenIdx(null);

    if (mode === 'local') {
      setBattleSubPhase('HANDOFF_LEAD');
    } else {
      setBattleSubPhase('LEAD_PICK');
    }
  };

  const renderCupGraphic = (
    cupIdx: number,
    options: {
      value?: number | null;
      hiddenNumber?: boolean;
      selected?: boolean;
      used?: boolean;
      size?: 'sm' | 'md' | 'lg';
    } = {},
  ) => {
    const color = CUP_COLOR_BY_INDEX[cupIdx];
    const {
      value = null,
      hiddenNumber = false,
      selected = false,
      used = false,
      size = 'md',
    } = options;

    const dims =
      size === 'lg'
        ? 'h-28 w-24 sm:h-32 sm:w-28'
        : size === 'sm'
          ? 'h-16 w-12 sm:h-20 sm:w-14'
          : 'h-20 w-14 sm:h-24 sm:w-16';

    return (
      <div
        className={`relative flex flex-col items-center justify-center rounded-b-2xl rounded-t-md border-2 transition-transform duration-150 ${dims} ${
          selected ? 'scale-105 ring-2 ring-white' : ''
        } ${used ? 'opacity-30 grayscale' : ''}`}
        style={{
          backgroundColor: color.bgHex,
          borderColor: color.borderHex,
          color: color.textHex,
        }}
      >
        {/* Cup rim */}
        <div
          className="absolute -top-1 left-[-2px] right-[-2px] h-2 rounded-full border"
          style={{
            backgroundColor: color.borderHex,
            borderColor: color.borderHex,
          }}
          aria-hidden="true"
        />
        <span className="font-mono text-xl font-extrabold tabular-nums sm:text-2xl">
          {hiddenNumber ? '?' : value !== null ? value : '—'}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold opacity-85">
          {hiddenNumber ? color.badgeText : `${cupIdx + 1}번 컵`}
        </span>
      </div>
    );
  };

  const finalWinner: 1 | 2 | 'DRAW' =
    p1Score > p2Score ? 1 : p2Score > p1Score ? 2 : 'DRAW';

  return (
    <>
      {phase === 'RESULT' && <VictoryConfetti />}

      {/* SETUP */}
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
              7개의 컵 · 대칭 그라데이션 심리전
            </span>
          </div>

          <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
            <section className="text-center">
              <p className="text-xs font-medium text-cyan-300">
                게임 5 · 그라데이션 컵 심리전
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl [text-wrap:balance]">
                7개의 컵 심리전
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
                양 끝(1·7번)이 가장 짙고 가운데(4번)가 가장 옅은 대칭 색상의 7개 컵에
                0~9 숫자를 오름차순(합계 30 이하)으로 숨긴 뒤, 컵의 색상만 보고 상대의 숫자를 추리하세요.
              </p>
            </section>

            {/* Symmetrical Cup Color Preview */}
            <section className="mt-6 rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:p-5">
              <p className="text-center text-xs font-medium text-slate-400">
                대칭 컵 색상 구조 (1·7번 동일 · 2·6번 동일 · 3·5번 동일)
              </p>
              <div className="mt-3.5 flex items-end justify-center gap-1.5 sm:gap-3">
                {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1.5">
                    {renderCupGraphic(idx, { value: idx + 1, size: 'sm' })}
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-5 space-y-5 rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('ai')}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    mode === 'ai'
                      ? 'border-cyan-400 bg-cyan-500/12'
                      : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                  }`}
                >
                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-slate-100">1인 vs AI 봇</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      컵 색상 단서만으로 추리하는 AI 봇과 7라운드 심리전을 겨룹니다.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeSwitch('local')}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    mode === 'local'
                      ? 'border-sky-400 bg-sky-500/12'
                      : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                  }`}
                >
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-slate-100">2인 로컬 대전</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      한 기기에서 가림막(화면 넘기기)을 통해 서로의 숫자를 감추며 대결합니다.
                    </p>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cup-p1-name" className="text-xs text-slate-400">
                    플레이어 1 이름
                  </label>
                  <input
                    id="cup-p1-name"
                    type="text"
                    maxLength={14}
                    value={p1Name}
                    onChange={(e) => setP1Name(e.target.value)}
                    className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cup-p2-name" className="text-xs text-slate-400">
                    {mode === 'ai' ? 'AI 상대 이름' : '플레이어 2 이름'}
                  </label>
                  <input
                    id="cup-p2-name"
                    type="text"
                    maxLength={14}
                    value={p2Name}
                    onChange={(e) => setP2Name(e.target.value)}
                    className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={startNewGame}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 whitespace-nowrap"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>숫자 배치 시작</span>
              </button>
            </section>
          </main>
        </div>
      )}

      {/* PLACEMENT PHASE — One-Screen Fold 8 Layout */}
      {phase === 'PLACEMENT' && (
        <GameBoardLayout
          topBar={
            <div className="rounded-xl border border-slate-800 bg-[#131926] px-3 py-2 sm:px-4 sm:py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('SETUP')}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 whitespace-nowrap"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">모드</span>
                  </button>
                  <div className="min-w-0 truncate text-xs sm:text-sm">
                    <span className="font-semibold text-cyan-300">
                      {placingPlayer === 1 ? effectiveP1Name : effectiveP2Name}
                    </span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
                    <span className="font-bold text-slate-100">
                      1~7번 컵 숫자 배치
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0B0F17] px-2.5 py-1">
                  <Clock
                    className={`h-3.5 w-3.5 ${
                      placementTimeLeft <= 30 ? 'text-rose-400' : 'text-cyan-300'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={`font-mono text-sm font-bold tabular-nums sm:text-base ${
                      placementTimeLeft <= 30 ? 'text-rose-400' : 'text-slate-100'
                    }`}
                  >
                    {formatCountdown(placementTimeLeft)}
                  </span>
                </div>
              </div>
            </div>
          }
          mainStage={
            <div className="flex h-full min-h-0 flex-col justify-center gap-3 rounded-2xl border border-slate-800 bg-[#131926] p-3 sm:gap-5 sm:p-5">
              {/* 7 Cup Slots */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2.5">
                {draftCups.map((val, idx) => {
                  const isFocused = focusedCupIdx === idx;
                  const hasOrderError = validation.orderViolations[idx];
                  const color = CUP_COLOR_BY_INDEX[idx];

                  return (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFocusedCupIdx(idx)}
                        className={`relative flex aspect-[3/4] w-full flex-col items-center justify-center rounded-b-xl rounded-t-md border-2 transition-all focus-visible:outline-2 focus-visible:outline-cyan-300 sm:rounded-b-2xl ${
                          hasOrderError
                            ? 'ring-2 ring-rose-500'
                            : isFocused
                              ? 'scale-[1.04] ring-2 ring-white'
                              : 'hover:opacity-95'
                        }`}
                        style={{
                          backgroundColor: color.bgHex,
                          borderColor: hasOrderError ? '#F43F5E' : color.borderHex,
                          color: color.textHex,
                        }}
                      >
                        <span className="font-mono text-lg font-extrabold tabular-nums sm:text-2xl">
                          {val !== null ? val : '?'}
                        </span>
                        <span className="mt-0.5 text-[9px] font-semibold opacity-90 sm:text-[10px]">
                          {idx + 1}번
                        </span>
                      </button>

                      {val !== null ? (
                        <button
                          type="button"
                          onClick={() => handleClearCupSlot(idx)}
                          className="text-[10px] text-slate-400 hover:text-rose-300 sm:text-[11px]"
                        >
                          지우기
                        </button>
                      ) : (
                        <span className="truncate text-[9px] text-slate-500 sm:text-[10px]">
                          {color.badgeText}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Real-time Sum Gauge + Rule Checklist */}
              <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-800 bg-[#0B0F17] p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">7개 숫자 총합</span>
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${
                        validation.sumWithinLimit ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {validation.sum} / 30
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full w-full origin-left rounded-full transition-transform duration-200 ${
                        validation.sumWithinLimit ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{
                        transform: `scaleX(${Math.min(1, validation.sum / 30)})`,
                      }}
                    />
                  </div>
                </div>

                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:flex-col sm:gap-1 sm:text-xs">
                  <li
                    className={`flex items-center gap-1 ${
                      validation.allFilled ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {validation.allFilled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>7개 모두 배치</span>
                  </li>
                  <li
                    className={`flex items-center gap-1 ${
                      validation.sumWithinLimit ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {validation.sumWithinLimit ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>총합 30 이하</span>
                  </li>
                  <li
                    className={`flex items-center gap-1 ${
                      validation.nonDecreasing ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {validation.nonDecreasing ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>N₁ ≤ … ≤ N₇ 오름차순</span>
                  </li>
                </ul>
              </div>
            </div>
          }
          controlPanel={
            <div className="rounded-xl border border-slate-800 bg-[#131926] p-3 sm:rounded-2xl sm:p-4 space-y-2.5 sm:space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  {focusedCupIdx + 1}번 컵 숫자 선택
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoRecommend}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 whitespace-nowrap"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    <span>자동 추천</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftCups(Array(7).fill(null));
                      setFocusedCupIdx(0);
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>비우기</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
                  const used = validation.digitCounts[digit];
                  const remaining = 2 - used;
                  const disabled =
                    draftCups[focusedCupIdx] !== digit && remaining <= 0;

                  return (
                    <button
                      key={digit}
                      type="button"
                      disabled={disabled}
                      onClick={() => handlePickCubeDigit(digit)}
                      className="flex min-h-11 flex-col items-center justify-center rounded-xl border border-slate-700 bg-[#0B0F17] py-1 transition-colors hover:border-cyan-400 hover:bg-cyan-500/10 focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-13"
                    >
                      <span className="font-mono text-base font-bold tabular-nums text-slate-100 sm:text-lg">
                        {digit}
                      </span>
                      <span className="font-mono text-[9px] text-slate-400 sm:text-[10px]">
                        {remaining}/2
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={!validation.isValid}
                onClick={() => finalizeCurrentPlacement(draftCups as number[])}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:min-h-12 sm:text-sm"
              >
                <span>배치 완료</span>
              </button>
            </div>
          }
        />
      )}

      {/* PRIVACY HANDOFF FOR P2 PLACEMENT */}
      {phase === 'HANDOFF_TO_P2_PLACE' && (
        <div className="flex h-full items-center justify-center overflow-hidden p-4">
          <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#131926] p-7 text-center">
            <EyeOff className="mx-auto h-10 w-10 text-sky-400" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-bold text-slate-50 sm:text-2xl">
              {effectiveP1Name}님의 배치가 완료되었습니다
            </h2>
            <p className="mt-2.5 text-sm text-slate-400">
              이제 {effectiveP2Name}님에게 기기를 넘겨주세요. 상대가 배치한 숫자는 보이지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setPlacingPlayer(2);
                setPhase('PLACEMENT');
              }}
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-400 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span>{effectiveP2Name} 배치 시작</span>
            </button>
          </section>
        </div>
      )}

      {/* BATTLE PHASE (7 ROUNDS) — One-Screen Fold 8 Layout */}
      {phase === 'BATTLE' && (
        <GameBoardLayout
          topBar={
            <div className="rounded-xl border border-slate-800 bg-[#131926] px-3 py-2 sm:px-4 sm:py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase('SETUP')}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 whitespace-nowrap"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">모드</span>
                  </button>
                  <div className="min-w-0 truncate text-xs sm:text-sm">
                    <span className="font-mono font-bold text-cyan-300">
                      ROUND {round}/7
                    </span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
                    <span className="text-slate-300">
                      선공: {leadPlayer === 1 ? effectiveP1Name : effectiveP2Name}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 font-mono text-xs sm:gap-3 sm:text-sm">
                  <span className="text-cyan-300">
                    <span className="hidden font-sans text-xs text-slate-400 sm:inline">
                      {effectiveP1Name}{' '}
                    </span>
                    <strong className="text-base tabular-nums sm:text-lg">{p1Score}</strong>
                  </span>
                  <span className="text-slate-600">:</span>
                  <span className="text-rose-300">
                    <strong className="text-base tabular-nums sm:text-lg">{p2Score}</strong>
                    <span className="hidden font-sans text-xs text-slate-400 sm:inline">
                      {' '}{effectiveP2Name}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          }
          mainStage={
            <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#131926] p-4 text-center sm:p-6">
              {battleSubPhase === 'HANDOFF_LEAD' && (
                <div className="max-w-sm">
                  <EyeOff className="mx-auto h-9 w-9 text-cyan-300" aria-hidden="true" />
                  <h2 className="mt-3 text-lg font-bold text-slate-100 sm:text-xl">
                    {round}라운드 선공 · {leadPlayer === 1 ? effectiveP1Name : effectiveP2Name}
                  </h2>
                  <p className="mt-2 text-xs text-slate-400 sm:text-sm">
                    다른 플레이어가 화면을 보지 않는지 확인한 뒤 컵을 선택하세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBattleSubPhase('LEAD_PICK')}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 sm:text-sm"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    <span>내 컵 확인 및 선택하기</span>
                  </button>
                </div>
              )}

              {battleSubPhase === 'HANDOFF_FOLLOW' && leadChosenIdx !== null && (
                <div className="max-w-sm">
                  <EyeOff className="mx-auto h-9 w-9 text-sky-400" aria-hidden="true" />
                  <h2 className="mt-3 text-lg font-bold text-slate-100 sm:text-xl">
                    {round}라운드 후공 · {followPlayer === 1 ? effectiveP1Name : effectiveP2Name}
                  </h2>
                  <p className="mt-2 text-xs text-slate-400 sm:text-sm">
                    상대가 중앙 가림막에 컵을 올렸습니다. 기기를 넘겨받아 대응할 컵을 고르세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBattleSubPhase('FOLLOW_PICK')}
                    className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-400 px-5 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 sm:text-sm"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    <span>가림막 확인 및 내 컵 고르기</span>
                  </button>
                </div>
              )}

              {(battleSubPhase === 'LEAD_PICK' ||
                battleSubPhase === 'FOLLOW_PICK' ||
                battleSubPhase === 'REVEAL') && (
                <div className="flex w-full flex-col items-center">
                  <p className="text-xs font-semibold text-slate-400">
                    {battleSubPhase === 'REVEAL'
                      ? '동시 공개 결과'
                      : '중앙 가림막 (숫자 비공개 · 색상만 표시)'}
                  </p>

                  <div className="mt-4 flex items-center justify-center gap-5 sm:mt-6 sm:gap-10">
                    {/* Lead Cup */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-400">
                        선공 ({leadPlayer === 1 ? effectiveP1Name : effectiveP2Name})
                      </span>
                      {leadChosenIdx !== null ? (
                        renderCupGraphic(leadChosenIdx, {
                          value:
                            leadPlayer === 1
                              ? p1Setup[leadChosenIdx]
                              : p2Setup[leadChosenIdx],
                          hiddenNumber: battleSubPhase !== 'REVEAL',
                          size: 'lg',
                        })
                      ) : (
                        <div className="flex h-28 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 text-xs text-slate-500 sm:h-32 sm:w-28">
                          {battleSubPhase === 'LEAD_PICK' &&
                          mode === 'ai' &&
                          leadPlayer === 2
                            ? 'AI 선택 중...'
                            : '선택 대기'}
                        </div>
                      )}
                      {leadChosenIdx !== null && battleSubPhase !== 'REVEAL' && (
                        <span className="text-xs font-medium text-cyan-300">
                          {CUP_COLOR_BY_INDEX[leadChosenIdx].label} ({CUP_COLOR_BY_INDEX[leadChosenIdx].pairHint})
                        </span>
                      )}
                    </div>

                    <span className="font-mono text-lg font-bold text-slate-600">VS</span>

                    {/* Follow Cup */}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-400">
                        후공 ({followPlayer === 1 ? effectiveP1Name : effectiveP2Name})
                      </span>
                      {followChosenIdx !== null && battleSubPhase === 'REVEAL' ? (
                        renderCupGraphic(followChosenIdx, {
                          value:
                            followPlayer === 1
                              ? p1Setup[followChosenIdx]
                              : p2Setup[followChosenIdx],
                          hiddenNumber: false,
                          size: 'lg',
                        })
                      ) : (
                        <div className="flex h-28 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 text-xs text-slate-500 sm:h-32 sm:w-28">
                          {battleSubPhase === 'FOLLOW_PICK' &&
                          mode === 'ai' &&
                          followPlayer === 2
                            ? 'AI 추리 중...'
                            : '선택 대기'}
                        </div>
                      )}
                    </div>
                  </div>

                  {battleSubPhase === 'REVEAL' && history[history.length - 1] && (
                    <div className="mt-4 w-full max-w-md border-t border-slate-800 pt-4 sm:mt-6">
                      {(() => {
                        const rec = history[history.length - 1];
                        if (rec.winner === 'DRAW') {
                          return (
                            <p className="text-sm font-bold text-slate-200 sm:text-base">
                              같은 숫자({rec.p1Value})로 무승부! 양쪽 0점
                            </p>
                          );
                        }
                        const winnerName =
                          rec.winner === 1 ? effectiveP1Name : effectiveP2Name;
                        return (
                          <p className="text-sm font-bold text-emerald-400 sm:text-base">
                            {winnerName}님이 더 큰 숫자로 +1점!
                          </p>
                        );
                      })()}

                      <button
                        type="button"
                        onClick={handleNextRound}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-6 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 sm:text-sm"
                      >
                        <span>{round >= 7 ? '최종 결과 & 복기 보기' : '다음 라운드 진행'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          }
          controlPanel={
            <div className="space-y-2.5 sm:space-y-3.5">
              {/* Active Human Player's Cup Selection Tray */}
              {((battleSubPhase === 'LEAD_PICK' && !(mode === 'ai' && leadPlayer === 2)) ||
                (battleSubPhase === 'FOLLOW_PICK' &&
                  !(mode === 'ai' && followPlayer === 2))) ? (
                <div className="rounded-xl border border-slate-800 bg-[#131926] p-3 sm:rounded-2xl sm:p-4">
                  {(() => {
                    const activePicker: 1 | 2 =
                      battleSubPhase === 'LEAD_PICK' ? leadPlayer : followPlayer;
                    const activeName =
                      activePicker === 1 ? effectiveP1Name : effectiveP2Name;
                    const setup = activePicker === 1 ? p1Setup : p2Setup;
                    const usedSet = new Set(
                      activePicker === 1 ? p1UsedIndices : p2UsedIndices,
                    );

                    return (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                            {activeName} 컵 선택
                          </h3>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {battleSubPhase === 'LEAD_PICK' ? '선공' : '후공 대응'}
                          </span>
                        </div>

                        <div className="mt-2.5 grid grid-cols-7 gap-1 sm:mt-3.5 sm:grid-cols-4 sm:gap-2">
                          {setup.map((val, idx) => {
                            const isUsed = usedSet.has(idx);
                            const color = CUP_COLOR_BY_INDEX[idx];
                            return (
                              <button
                                key={idx}
                                type="button"
                                disabled={isUsed}
                                onClick={() =>
                                  battleSubPhase === 'LEAD_PICK'
                                    ? handleLeadSelectCup(idx)
                                    : handleFollowSelectCup(idx)
                                }
                                className={`flex flex-col items-center justify-center rounded-b-xl rounded-t-md border-2 py-2 transition-transform focus-visible:outline-2 focus-visible:outline-cyan-300 sm:min-h-18 ${
                                  isUsed
                                    ? 'cursor-not-allowed opacity-25 grayscale'
                                    : 'cursor-pointer hover:-translate-y-0.5'
                                }`}
                                style={{
                                  backgroundColor: color.bgHex,
                                  borderColor: color.borderHex,
                                  color: color.textHex,
                                }}
                              >
                                <span className="font-mono text-base font-extrabold tabular-nums sm:text-xl">
                                  {val}
                                </span>
                                <span className="text-[9px] font-semibold opacity-90 sm:text-[10px]">
                                  {idx + 1}번
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-[#131926] p-3 text-center text-xs text-slate-400 sm:rounded-2xl sm:p-4">
                  {battleSubPhase === 'REVEAL'
                    ? '라운드 결과를 확인한 뒤 다음 라운드를 진행하세요.'
                    : battleSubPhase === 'HANDOFF_LEAD' || battleSubPhase === 'HANDOFF_FOLLOW'
                      ? '기기 전환 후 중앙 버튼을 눌러 컵을 확인하세요.'
                      : 'AI 봇이 컵 색상과 남은 숫자를 추리하고 있습니다...'}
                </div>
              )}

              {/* Compact Round Log (visible cleanly on Fold unfolded >=640px) */}
              {history.length > 0 && (
                <div className="hidden rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:block">
                  <h3 className="text-xs font-semibold text-slate-300">
                    진행 기록 ({history.length}/7)
                  </h3>
                  <div className="mt-2 space-y-1.5 text-[11px]">
                    {[...history].reverse().map((rec) => (
                      <div
                        key={rec.round}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[#0B0F17] px-2.5 py-1.5 font-mono tabular-nums"
                      >
                        <span className="text-slate-500">{rec.round}R</span>
                        <span className="text-cyan-300">
                          {rec.p1CupIdx + 1}번({rec.p1Value})
                        </span>
                        <span className="text-slate-600">:</span>
                        <span className="text-rose-300">
                          {rec.p2CupIdx + 1}번({rec.p2Value})
                        </span>
                        <span
                          className={
                            rec.winner === 1
                              ? 'font-sans font-semibold text-cyan-300'
                              : rec.winner === 2
                                ? 'font-sans font-semibold text-rose-300'
                                : 'font-sans text-slate-400'
                          }
                        >
                          {rec.winner === 'DRAW'
                            ? '무'
                            : rec.winner === 1
                              ? 'P1'
                              : 'P2'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          }
        />
      )}

      {/* RESULT & FULL PLACEMENT REVIEW */}
      {phase === 'RESULT' && (
        <div className="h-full overflow-y-auto">
          <main className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
            <section className="rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Trophy className="h-4 w-4" aria-hidden="true" />
                    <span>7라운드 최종 결과</span>
                  </div>
                  <h1 className="mt-1.5 text-2xl font-bold text-slate-50 sm:text-3xl">
                    {finalWinner === 'DRAW'
                      ? '무승부로 종료되었습니다'
                      : `${finalWinner === 1 ? effectiveP1Name : effectiveP2Name}님의 승리!`}
                  </h1>
                  <p className="mt-1 font-mono text-sm text-slate-300">
                    {effectiveP1Name} {p1Score}점 : {p2Score}점 {effectiveP2Name}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={startNewGame}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>다시하기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('SETUP')}
                    className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
                  >
                    모드 변경
                  </button>
                </div>
              </div>
            </section>

            {/* Side-by-side Full Placement Review */}
            <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { name: effectiveP1Name, setup: p1Setup, accent: 'text-cyan-300' },
                { name: effectiveP2Name, setup: p2Setup, accent: 'text-rose-300' },
              ].map((player, pIdx) => {
                const sum = player.setup.reduce((acc, v) => acc + v, 0);
                return (
                  <div
                    key={pIdx}
                    className="rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:p-5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className={`text-sm font-bold ${player.accent}`}>
                        {player.name} 초기 배치표
                      </h2>
                      <span className="font-mono text-xs text-slate-400">
                        총합 {sum} / 30
                      </span>
                    </div>
                    <div className="mt-3.5 grid grid-cols-7 gap-1">
                      {player.setup.map((val, idx) => (
                        <div key={idx} className="flex flex-col items-center">
                          {renderCupGraphic(idx, { value: val, size: 'sm' })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Round-by-round Match History */}
            <section className="mt-5 rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:p-5">
              <h2 className="text-sm font-bold text-slate-100">라운드별 대결 복기</h2>
              <div className="mt-3 divide-y divide-slate-800/80">
                {history.map((rec) => (
                  <div
                    key={rec.round}
                    className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs"
                  >
                    <span className="font-mono font-bold text-slate-400">
                      {rec.round}R
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-cyan-300">
                        {effectiveP1Name}: {rec.p1CupIdx + 1}번 컵(
                        <strong className="font-mono">{rec.p1Value}</strong>)
                      </span>
                      <span className="text-slate-600">vs</span>
                      <span className="text-rose-300">
                        {effectiveP2Name}: {rec.p2CupIdx + 1}번 컵(
                        <strong className="font-mono">{rec.p2Value}</strong>)
                      </span>
                    </div>
                    <span
                      className={`font-semibold ${
                        rec.winner === 1
                          ? 'text-cyan-300'
                          : rec.winner === 2
                            ? 'text-rose-300'
                            : 'text-slate-400'
                      }`}
                    >
                      {rec.winner === 'DRAW'
                        ? '무승부 (0점)'
                        : `${rec.winner === 1 ? effectiveP1Name : effectiveP2Name} +1점`}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
      )}
    </>
  );
}
