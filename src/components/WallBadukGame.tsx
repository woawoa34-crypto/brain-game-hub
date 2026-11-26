import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Clock,
  Hammer,
  Home,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  Trophy,
  User,
} from 'lucide-react';
import { set as fbSet, update as fbUpdate } from 'firebase/database';
import {
  analyzeBoard,
  BOARD_SIZE,
  calculateScores,
  chooseAIPlacement,
  chooseAITurnAction,
  getEmptyEdgesForCell,
  getInitialRound2Pieces,
  getOccupiedMap,
  getPlacementSequence,
  getValidMoves,
  playerHasAnyLegalMove,
} from '../games/wallbaduk/engine';
import type {
  Direction,
  EdgeOption,
  MoveOption,
  Piece,
  PieceShape,
  PlayerConfig,
  PlayerState,
  RoundMode,
  TurnSubPhase,
  WallBadukPhase,
} from '../games/wallbaduk/types';
import {
  getRoomGameStateRef,
  recordMatchWinnerScore,
  rematchSameGame,
  resolveHostRole,
} from '../services/onlineRoom';
import type {
  OnlineGameSharedProps,
  OnlineRole,
  OnlineWallBadukState,
} from '../types/online';
import { soundEngine } from '../utils/sound';
import { GameBoardLayout, SquareBoardBox } from './GameBoardLayout';
import { VictoryConfetti } from './VictoryConfetti';

interface WallBadukGameProps extends OnlineGameSharedProps {
  onBackToLobby: () => void;
}

const LOCAL_TURN_SECONDS = 90;
const ONLINE_TURN_SECONDS = 45;

function wallsRecordToMap(record?: Record<string, number> | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!record) return map;
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === 'number') {
      map.set(k, v);
    }
  }
  return map;
}

function wallsMapToRecord(map: Map<string, number>): Record<string, number> {
  const rec: Record<string, number> = {};
  map.forEach((v, k) => {
    rec[k] = v;
  });
  return rec;
}

const PLAYER_STYLE: Record<
  'sky' | 'rose' | 'amber',
  {
    text: string;
    bgSolid: string;
    wallBarBg: string;
    wallGlow: string;
    border: string;
    softBg: string;
    ring: string;
    territoryBg: string;
    territoryBorder: string;
    label: string;
  }
> = {
  sky: {
    text: 'text-sky-300',
    bgSolid: 'bg-sky-400 text-slate-950',
    wallBarBg: 'bg-sky-400',
    wallGlow: 'shadow-[0_0_8px_rgba(56,189,248,0.65)]',
    border: 'border-sky-400',
    softBg: 'bg-sky-500/15',
    ring: 'ring-sky-400',
    territoryBg: 'bg-sky-500/22',
    territoryBorder: 'border-sky-400/50',
    label: '파랑',
  },
  rose: {
    text: 'text-rose-300',
    bgSolid: 'bg-rose-400 text-slate-950',
    wallBarBg: 'bg-rose-400',
    wallGlow: 'shadow-[0_0_8px_rgba(251,113,133,0.65)]',
    border: 'border-rose-400',
    softBg: 'bg-rose-500/15',
    ring: 'ring-rose-400',
    territoryBg: 'bg-rose-500/22',
    territoryBorder: 'border-rose-400/50',
    label: '빨강',
  },
  amber: {
    text: 'text-amber-300',
    bgSolid: 'bg-amber-400 text-slate-950',
    wallBarBg: 'bg-amber-400',
    wallGlow: 'shadow-[0_0_8px_rgba(251,191,36,0.65)]',
    border: 'border-amber-400',
    softBg: 'bg-amber-500/15',
    ring: 'ring-amber-400',
    territoryBg: 'bg-amber-500/22',
    territoryBorder: 'border-amber-400/50',
    label: '노랑',
  },
};

function makeDefaultPlayers(roundMode: RoundMode): PlayerConfig[] {
  const base: PlayerConfig[] = [
    { id: 1, name: '플레이어 1', isAI: false, colorKey: 'sky' },
    { id: 2, name: '플레이어 2', isAI: false, colorKey: 'rose' },
  ];
  if (roundMode === 1) {
    base.push({ id: 3, name: '플레이어 3', isAI: false, colorKey: 'amber' });
  }
  return base;
}

export function WallBadukGame({
  onBackToLobby,
  isPaused = false,
  onlineRoom = null,
  myRole = null,
  onReturnToWaitingRoom,
  onlineReactionBar,
}: WallBadukGameProps) {
  const isOnline = Boolean(onlineRoom && myRole);
  const hostRole = resolveHostRole(onlineRoom);
  const isHost = isOnline && myRole === hostRole;
  const firstTurnRole: OnlineRole = onlineRoom?.firstTurnRole ?? 'P1';
  const matchNumber = onlineRoom?.matchNumber ?? 1;
  const onlineWB = onlineRoom?.gameState?.wallBaduk ?? null;
  const turnLimitSeconds = isOnline ? ONLINE_TURN_SECONDS : LOCAL_TURN_SECONDS;

  const [phase, setPhase] = useState<WallBadukPhase>('SETUP');
  const [roundMode, setRoundMode] = useState<RoundMode>(1);
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(() =>
    makeDefaultPlayers(1),
  );

  // Active game state (walls maps wallKey -> owner playerId)
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [walls, setWalls] = useState<Map<string, number>>(() => new Map());
  const [placementSeq, setPlacementSeq] = useState<number[]>([]);
  const [placementStep, setPlacementStep] = useState<number>(0);
  const [chosenShape, setChosenShape] = useState<PieceShape>('square');

  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [subPhase, setSubPhase] = useState<TurnSubPhase>('SELECT_OR_MOVE');
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [movedPieceId, setMovedPieceId] = useState<string | null>(null);
  const [wallBreakActive, setWallBreakActive] = useState<boolean>(false);
  const [lastBrokenWallKey, setLastBrokenWallKey] = useState<string | null>(null);
  const [lastPlacedWallKey, setLastPlacedWallKey] = useState<string | null>(null);

  const [timeLeft, setTimeLeft] = useState<number>(turnLimitSeconds);
  const [turnCount, setTurnCount] = useState<number>(1);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<string>('');
  const [isRematching, setIsRematching] = useState<boolean>(false);

  const timeoutGuardRef = useRef<boolean>(false);
  const initializedRoundRef = useRef<number | null>(null);
  const prevTurnAlertKeyRef = useRef<string | null>(null);
  const playedVictoryKeyRef = useRef<string | null>(null);

  // Reset transient local selection UI whenever a new online matchNumber starts
  useEffect(() => {
    if (!isOnline) return;
    setSelectedPieceId(null);
    setWallBreakActive(false);
    setChosenShape('square');
  }, [isOnline, matchNumber]);

  // Host initializes online WallBaduk match state in RTDB
  useEffect(() => {
    if (!isOnline || !onlineRoom || !isHost) return;
    if (onlineWB && onlineWB.roundKey === matchNumber) return;
    if (initializedRoundRef.current === matchNumber) return;

    initializedRoundRef.current = matchNumber;
    const baseSeq = getPlacementSequence(2);
    const orderedSeq =
      firstTurnRole === 'P2' ? baseSeq.map((id) => (id === 1 ? 2 : 1)) : baseSeq;

    const initialState: OnlineWallBadukState = {
      phase: 'PLACEMENT',
      roundMode: 2,
      placementSeq: orderedSeq,
      placementStep: 0,
      turnIndex: firstTurnRole === 'P2' ? 1 : 0,
      subPhase: 'SELECT_OR_MOVE',
      movedPieceId: null,
      pieces: getInitialRound2Pieces(),
      walls: {},
      lastBrokenWallKey: null,
      lastPlacedWallKey: null,
      turnCount: 1,
      statusNotice: null,
      endReason: '',
      roundKey: matchNumber,
    };

    void fbSet(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), initialState);
  }, [isOnline, onlineRoom, isHost, onlineWB, matchNumber, firstTurnRole]);

  const onlinePlayers = useMemo<PlayerState[]>(() => {
    if (!isOnline || !onlineRoom) return [];
    return [
      {
        id: 1,
        name: onlineRoom.players?.P1?.nickname ?? '플레이어 1',
        isAI: false,
        colorKey: 'sky',
        wallBreaksLeft: 0,
      },
      {
        id: 2,
        name: onlineRoom.players?.P2?.nickname ?? '플레이어 2',
        isAI: false,
        colorKey: 'rose',
        wallBreaksLeft: 0,
      },
    ];
  }, [isOnline, onlineRoom]);

  const onlineWallsMap = useMemo(
    () => (isOnline ? wallsRecordToMap(onlineWB?.walls) : null),
    [isOnline, onlineWB?.walls],
  );

  // Unified effective state (Online RTDB vs Local)
  const effectivePhase: WallBadukPhase = isOnline
    ? (onlineWB?.phase ?? 'PLACEMENT')
    : phase;
  const effectiveRoundMode: RoundMode = isOnline ? 2 : roundMode;
  const effectivePlayers = isOnline ? onlinePlayers : players;
  const effectivePieces = useMemo(
    () => (isOnline ? (onlineWB?.pieces ?? []) : pieces),
    [isOnline, onlineWB?.pieces, pieces],
  );
  const effectiveWalls = isOnline ? (onlineWallsMap ?? walls) : walls;
  const effectivePlacementSeq = useMemo(
    () => (isOnline ? (onlineWB?.placementSeq ?? [1, 2, 2, 1]) : placementSeq),
    [isOnline, onlineWB?.placementSeq, placementSeq],
  );
  const effectivePlacementStep = isOnline
    ? (onlineWB?.placementStep ?? 0)
    : placementStep;
  const effectiveTurnIndex = isOnline ? (onlineWB?.turnIndex ?? 0) : turnIndex;
  const effectiveSubPhase: TurnSubPhase = isOnline
    ? (onlineWB?.subPhase ?? 'SELECT_OR_MOVE')
    : subPhase;
  const effectiveMovedPieceId = isOnline
    ? (onlineWB?.movedPieceId ?? null)
    : movedPieceId;
  const effectiveLastBrokenWallKey = isOnline
    ? (onlineWB?.lastBrokenWallKey ?? null)
    : lastBrokenWallKey;
  const effectiveLastPlacedWallKey = isOnline
    ? (onlineWB?.lastPlacedWallKey ?? null)
    : lastPlacedWallKey;
  const effectiveTurnCount = isOnline ? (onlineWB?.turnCount ?? 1) : turnCount;
  const effectiveStatusNotice = isOnline
    ? (onlineWB?.statusNotice ?? null)
    : statusNotice;
  const effectiveEndReason = isOnline ? (onlineWB?.endReason ?? '') : endReason;

  // Reset shot-clock and selection whenever turn or sub-phase advances
  const turnSyncToken = isOnline
    ? `${onlineWB?.roundKey ?? 0}:${effectivePhase}:${effectivePlacementStep}:${effectiveTurnIndex}:${effectiveSubPhase}:${effectiveTurnCount}`
    : null;

  useEffect(() => {
    if (!isOnline || !turnSyncToken) return;
    setTimeLeft(ONLINE_TURN_SECONDS);
    timeoutGuardRef.current = false;
    if (effectiveSubPhase !== 'PLACE_WALL') {
      setSelectedPieceId(null);
    }
  }, [isOnline, turnSyncToken, effectiveSubPhase]);

  const handleRoundModeChange = (nextMode: RoundMode) => {
    setRoundMode(nextMode);
    setPlayerConfigs((prev) => {
      const p1 = prev.find((p) => p.id === 1) ?? {
        id: 1,
        name: '플레이어 1',
        isAI: false,
        colorKey: 'sky' as const,
      };
      const p2 = prev.find((p) => p.id === 2) ?? {
        id: 2,
        name: '플레이어 2',
        isAI: false,
        colorKey: 'rose' as const,
      };
      if (nextMode === 2) return [p1, p2];
      const p3 = prev.find((p) => p.id === 3) ?? {
        id: 3,
        name: '플레이어 3',
        isAI: false,
        colorKey: 'amber' as const,
      };
      return [p1, p2, p3];
    });
  };

  const updatePlayerConfig = (id: number, patch: Partial<PlayerConfig>) => {
    setPlayerConfigs((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (patch.isAI !== undefined) {
          if (patch.isAI && p.name === `플레이어 ${id}`) {
            next.name = `AI 봇 ${id}`;
          } else if (!patch.isAI && p.name === `AI 봇 ${id}`) {
            next.name = `플레이어 ${id}`;
          }
        }
        return next;
      }),
    );
  };

  const startGame = () => {
    const initialPlayers: PlayerState[] = playerConfigs.map((cfg, idx) => ({
      ...cfg,
      name: cfg.name.trim() || `플레이어 ${idx + 1}`,
      wallBreaksLeft: roundMode === 1 ? 1 : 0,
    }));
    const initialPieces = roundMode === 2 ? getInitialRound2Pieces() : [];
    const seq = getPlacementSequence(roundMode);

    setPlayers(initialPlayers);
    setPieces(initialPieces);
    setWalls(new Map());
    setPlacementSeq(seq);
    setPlacementStep(0);
    setChosenShape('square');
    setTurnIndex(0);
    setSubPhase('SELECT_OR_MOVE');
    setSelectedPieceId(null);
    setMovedPieceId(null);
    setWallBreakActive(false);
    setLastBrokenWallKey(null);
    setLastPlacedWallKey(null);
    setTimeLeft(LOCAL_TURN_SECONDS);
    setTurnCount(1);
    setStatusNotice(null);
    setEndReason('');
    timeoutGuardRef.current = false;
    setPhase('PLACEMENT');
  };

  const occupiedMap = useMemo(() => getOccupiedMap(effectivePieces), [effectivePieces]);
  const boardAnalysis = useMemo(
    () => analyzeBoard(effectivePieces, effectiveWalls),
    [effectivePieces, effectiveWalls],
  );

  const currentPlacementPlayerId =
    effectivePhase === 'PLACEMENT'
      ? (effectivePlacementSeq[effectivePlacementStep] ?? 1)
      : null;
  const currentPlayer =
    effectivePhase === 'PLACEMENT'
      ? effectivePlayers.find((p) => p.id === currentPlacementPlayerId) ?? effectivePlayers[0]
      : effectivePlayers[effectiveTurnIndex] ?? effectivePlayers[0];

  const activeOnlineRole: OnlineRole = currentPlayer?.id === 2 ? 'P2' : 'P1';
  const isMyOnlineTurn = !isOnline || activeOnlineRole === myRole;

  const remainingShapesForPlacer = useMemo<PieceShape[]>(() => {
    if (effectivePhase !== 'PLACEMENT' || !currentPlacementPlayerId) return [];
    const owned = effectivePieces.filter((p) => p.playerId === currentPlacementPlayerId);
    if (effectiveRoundMode === 2) {
      return ['square'];
    }
    const hasSquare = owned.some((p) => p.shape === 'square');
    const hasCircle = owned.some((p) => p.shape === 'circle');
    const list: PieceShape[] = [];
    if (!hasSquare) list.push('square');
    if (!hasCircle) list.push('circle');
    return list;
  }, [effectivePhase, currentPlacementPlayerId, effectivePieces, effectiveRoundMode]);

  useEffect(() => {
    if (
      remainingShapesForPlacer.length > 0 &&
      !remainingShapesForPlacer.includes(chosenShape)
    ) {
      setChosenShape(remainingShapesForPlacer[0]);
    }
  }, [remainingShapesForPlacer, chosenShape]);

  const selectedPiece = useMemo(
    () => effectivePieces.find((p) => p.id === selectedPieceId) ?? null,
    [effectivePieces, selectedPieceId],
  );

  const movedPiece = useMemo(
    () => effectivePieces.find((p) => p.id === effectiveMovedPieceId) ?? null,
    [effectivePieces, effectiveMovedPieceId],
  );

  const validMoveOptions = useMemo<MoveOption[]>(() => {
    if (
      effectivePhase !== 'PLAYING' ||
      effectiveSubPhase !== 'SELECT_OR_MOVE' ||
      !selectedPiece ||
      !currentPlayer ||
      selectedPiece.playerId !== currentPlayer.id ||
      (isOnline && !isMyOnlineTurn)
    ) {
      return [];
    }
    return getValidMoves(selectedPiece, effectivePieces, effectiveWalls, wallBreakActive);
  }, [
    effectivePhase,
    effectiveSubPhase,
    selectedPiece,
    currentPlayer,
    isOnline,
    isMyOnlineTurn,
    effectivePieces,
    effectiveWalls,
    wallBreakActive,
  ]);

  const validMoveMap = useMemo(() => {
    const map = new Map<string, MoveOption>();
    for (const opt of validMoveOptions) {
      map.set(`${opt.r},${opt.c}`, opt);
    }
    return map;
  }, [validMoveOptions]);

  const emptyEdges = useMemo<EdgeOption[]>(() => {
    if (
      effectivePhase !== 'PLAYING' ||
      effectiveSubPhase !== 'PLACE_WALL' ||
      !movedPiece ||
      (isOnline && !isMyOnlineTurn)
    ) {
      return [];
    }
    return getEmptyEdgesForCell(movedPiece.r, movedPiece.c, effectiveWalls);
  }, [
    effectivePhase,
    effectiveSubPhase,
    movedPiece,
    isOnline,
    isMyOnlineTurn,
    effectiveWalls,
  ]);

  const finalScores = useMemo(() => {
    if (effectivePhase !== 'RESULT') return [];
    return calculateScores(effectivePlayers, effectivePieces, boardAnalysis);
  }, [effectivePhase, effectivePlayers, effectivePieces, boardAnalysis]);

  // Record cumulative score & play victory sound once when online match reaches RESULT
  useEffect(() => {
    if (!isOnline || !onlineRoom || effectivePhase !== 'RESULT') return;
    const resultKey = `WALLBADUK_GAME_${matchNumber}`;
    const winners = finalScores.filter((s) => s.isWinner);
    const myPlayerId = myRole === 'P2' ? 2 : 1;
    if (playedVictoryKeyRef.current !== resultKey) {
      playedVictoryKeyRef.current = resultKey;
      if (winners.some((w) => w.playerId === myPlayerId)) {
        soundEngine.playVictory();
      } else {
        soundEngine.playError();
      }
    }
    if (winners.length === 1) {
      const winnerRole: OnlineRole = winners[0].playerId === 2 ? 'P2' : 'P1';
      void recordMatchWinnerScore(
        onlineRoom.roomCode,
        winnerRole,
        resultKey,
      );
    }
  }, [isOnline, onlineRoom, effectivePhase, finalScores, matchNumber, myRole]);

  // Complete a turn after walls and pieces are finalized
  const finalizeTurnAndAdvance = useCallback(
    (
      nextPieces: Piece[],
      nextWalls: Map<string, number>,
      nextPlayers: PlayerState[],
      curTurnIdx: number,
      notice?: string,
      brokenKeyOverride?: string | null,
      placedKeyOverride?: string | null,
    ) => {
      const analysis = analyzeBoard(nextPieces, nextWalls);
      if (analysis.isFullySeparated) {
        soundEngine.playVictory();
        const reason = '모든 플레이어의 영역이 벽으로 완전히 분리되었습니다.';
        setSelectedPieceId(null);
        setWallBreakActive(false);

        if (isOnline && onlineRoom) {
          void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), {
            phase: 'RESULT',
            pieces: nextPieces,
            walls: wallsMapToRecord(nextWalls),
            movedPieceId: null,
            lastBrokenWallKey: brokenKeyOverride !== undefined ? brokenKeyOverride : effectiveLastBrokenWallKey,
            lastPlacedWallKey: placedKeyOverride !== undefined ? placedKeyOverride : effectiveLastPlacedWallKey,
            statusNotice: notice ?? null,
            endReason: reason,
          });
          return;
        }

        setPieces(nextPieces);
        setWalls(nextWalls);
        setPlayers(nextPlayers);
        setMovedPieceId(null);
        setEndReason(reason);
        setPhase('RESULT');
        return;
      }

      // Find next player with at least one legal move
      const count = nextPlayers.length;
      let chosenNextIdx = -1;
      const skippedNames: string[] = [];

      for (let offset = 1; offset <= count; offset += 1) {
        const candidateIdx = (curTurnIdx + offset) % count;
        const candidate = nextPlayers[candidateIdx];
        if (playerHasAnyLegalMove(candidate, nextPieces, nextWalls)) {
          chosenNextIdx = candidateIdx;
          break;
        }
        skippedNames.push(candidate.name);
      }

      if (chosenNextIdx === -1) {
        soundEngine.playVictory();
        const reason = '더 이상 이동할 수 있는 말이 없어 게임을 종료합니다.';
        setSelectedPieceId(null);
        setWallBreakActive(false);

        if (isOnline && onlineRoom) {
          void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), {
            phase: 'RESULT',
            pieces: nextPieces,
            walls: wallsMapToRecord(nextWalls),
            movedPieceId: null,
            lastBrokenWallKey: brokenKeyOverride !== undefined ? brokenKeyOverride : effectiveLastBrokenWallKey,
            lastPlacedWallKey: placedKeyOverride !== undefined ? placedKeyOverride : effectiveLastPlacedWallKey,
            statusNotice: notice ?? null,
            endReason: reason,
          });
          return;
        }

        setPieces(nextPieces);
        setWalls(nextWalls);
        setPlayers(nextPlayers);
        setMovedPieceId(null);
        setEndReason(reason);
        setPhase('RESULT');
        return;
      }

      const resolvedNotice =
        skippedNames.length > 0
          ? `${skippedNames.join(', ')} 님은 이동 가능한 칸이 없어 턴을 건너뜁니다.`
          : (notice ?? null);

      setSelectedPieceId(null);
      setWallBreakActive(false);

      if (isOnline && onlineRoom) {
        void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), {
          pieces: nextPieces,
          walls: wallsMapToRecord(nextWalls),
          turnIndex: chosenNextIdx,
          subPhase: 'SELECT_OR_MOVE',
          movedPieceId: null,
          lastBrokenWallKey: brokenKeyOverride !== undefined ? brokenKeyOverride : effectiveLastBrokenWallKey,
          lastPlacedWallKey: placedKeyOverride !== undefined ? placedKeyOverride : effectiveLastPlacedWallKey,
          turnCount: effectiveTurnCount + 1,
          statusNotice: resolvedNotice,
        });
        return;
      }

      setPieces(nextPieces);
      setWalls(nextWalls);
      setPlayers(nextPlayers);
      setTurnIndex(chosenNextIdx);
      setSubPhase('SELECT_OR_MOVE');
      setMovedPieceId(null);
      setTimeLeft(LOCAL_TURN_SECONDS);
      setTurnCount((prev) => prev + 1);
      timeoutGuardRef.current = false;
      setStatusNotice(resolvedNotice);
    },
    [
      isOnline,
      onlineRoom,
      effectiveLastBrokenWallKey,
      effectiveLastPlacedWallKey,
      effectiveTurnCount,
    ],
  );

  // Placement action
  const executePlacePiece = useCallback(
    (r: number, c: number, shapeToPlace: PieceShape) => {
      if (effectivePhase !== 'PLACEMENT' || !currentPlayer || isPaused) return;
      if (isOnline && !isMyOnlineTurn) return;
      if (occupiedMap.has(`${r},${c}`)) return;

      const newPiece: Piece = {
        id: `p${currentPlayer.id}-${shapeToPlace}-${effectivePlacementStep}`,
        playerId: currentPlayer.id,
        shape: shapeToPlace,
        r,
        c,
      };

      const nextPieces = [...effectivePieces, newPiece];
      soundEngine.playPlace();

      if (effectivePlacementStep + 1 < effectivePlacementSeq.length) {
        if (isOnline && onlineRoom) {
          void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), {
            pieces: nextPieces,
            placementStep: effectivePlacementStep + 1,
            statusNotice: null,
          });
          return;
        }

        setPieces(nextPieces);
        setPlacementStep((prev) => prev + 1);
        setTimeLeft(LOCAL_TURN_SECONDS);
        timeoutGuardRef.current = false;
        setStatusNotice(null);
      } else {
        const startIdx = isOnline && firstTurnRole === 'P2' ? 1 : 0;
        const firstName =
          effectivePlayers[startIdx]?.name ?? `${startIdx + 1}번 플레이어`;
        const notice = `말 배치가 완료되었습니다. ${firstName}부터 이동과 벽 설치를 시작하세요.`;

        if (isOnline && onlineRoom) {
          void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), {
            phase: 'PLAYING',
            pieces: nextPieces,
            turnIndex: startIdx,
            subPhase: 'SELECT_OR_MOVE',
            movedPieceId: null,
            turnCount: 1,
            statusNotice: notice,
          });
          return;
        }

        setPieces(nextPieces);
        setTurnIndex(0);
        setSubPhase('SELECT_OR_MOVE');
        setSelectedPieceId(null);
        setMovedPieceId(null);
        setWallBreakActive(false);
        setTimeLeft(LOCAL_TURN_SECONDS);
        setTurnCount(1);
        timeoutGuardRef.current = false;
        setStatusNotice(notice);
        setPhase('PLAYING');
      }
    },
    [
      effectivePhase,
      currentPlayer,
      isPaused,
      isOnline,
      isMyOnlineTurn,
      occupiedMap,
      effectivePlacementStep,
      effectivePieces,
      effectivePlacementSeq.length,
      onlineRoom,
      firstTurnRole,
      effectivePlayers,
    ],
  );

  // Move piece action
  const executeMovePiece = useCallback(
    (piece: Piece, move: MoveOption, autoNotice?: string) => {
      if (!currentPlayer || isPaused) return;
      if (isOnline && !isMyOnlineTurn) return;

      const nextPieces = effectivePieces.map((p) =>
        p.id === piece.id ? { ...p, r: move.r, c: move.c } : p,
      );
      const nextWalls = new Map(effectiveWalls);
      let nextPlayers = effectivePlayers;
      let brokenKey: string | null = null;

      if (move.brokenWallKey) {
        nextWalls.delete(move.brokenWallKey);
        brokenKey = move.brokenWallKey;
        if (!isOnline) {
          setLastBrokenWallKey(move.brokenWallKey);
        }
        nextPlayers = effectivePlayers.map((p) =>
          p.id === currentPlayer.id
            ? { ...p, wallBreaksLeft: Math.max(0, p.wallBreaksLeft - 1) }
            : p,
        );
      } else if (!isOnline) {
        setLastBrokenWallKey(null);
      }

      soundEngine.playPlace();

      const availableEdges = getEmptyEdgesForCell(move.r, move.c, nextWalls);
      if (availableEdges.length === 0) {
        finalizeTurnAndAdvance(
          nextPieces,
          nextWalls,
          nextPlayers,
          effectiveTurnIndex,
          autoNotice ?? '도착한 칸의 4면이 모두 막혀 있어 벽 설치 없이 다음 턴으로 넘어갑니다.',
          brokenKey,
        );
        return;
      }

      setSelectedPieceId(piece.id);
      setWallBreakActive(false);

      if (isOnline && onlineRoom) {
        void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wallBaduk'), {
          pieces: nextPieces,
          walls: wallsMapToRecord(nextWalls),
          movedPieceId: piece.id,
          subPhase: 'PLACE_WALL',
          lastBrokenWallKey: brokenKey,
          statusNotice: autoNotice ?? null,
        });
        return;
      }

      setPieces(nextPieces);
      setWalls(nextWalls);
      setPlayers(nextPlayers);
      setMovedPieceId(piece.id);
      setSubPhase('PLACE_WALL');
      setStatusNotice(autoNotice ?? null);
    },
    [
      currentPlayer,
      isPaused,
      isOnline,
      isMyOnlineTurn,
      effectivePieces,
      effectiveWalls,
      effectivePlayers,
      effectiveTurnIndex,
      finalizeTurnAndAdvance,
      onlineRoom,
    ],
  );

  // Place wall action
  const executePlaceWall = useCallback(
    (wallKey: string, autoNotice?: string) => {
      if (
        effectivePhase !== 'PLAYING' ||
        effectiveSubPhase !== 'PLACE_WALL' ||
        !currentPlayer ||
        isPaused
      ) {
        return;
      }
      if (isOnline && !isMyOnlineTurn) return;

      const nextWalls = new Map(effectiveWalls);
      nextWalls.set(wallKey, currentPlayer.id);
      if (!isOnline) {
        setLastPlacedWallKey(wallKey);
      }
      soundEngine.playPlace();
      finalizeTurnAndAdvance(
        effectivePieces,
        nextWalls,
        effectivePlayers,
        effectiveTurnIndex,
        autoNotice,
        undefined,
        wallKey,
      );
    },
    [
      effectivePhase,
      effectiveSubPhase,
      currentPlayer,
      isPaused,
      isOnline,
      isMyOnlineTurn,
      effectiveWalls,
      effectivePieces,
      effectivePlayers,
      effectiveTurnIndex,
      finalizeTurnAndAdvance,
    ],
  );

  // Handle cell click
  const handleCellClick = (r: number, c: number) => {
    if (!currentPlayer || currentPlayer.isAI || isPaused) return;
    if (isOnline && !isMyOnlineTurn) return;

    if (effectivePhase === 'PLACEMENT') {
      if (occupiedMap.has(`${r},${c}`)) return;
      executePlacePiece(r, c, chosenShape);
      return;
    }

    if (effectivePhase === 'PLAYING' && effectiveSubPhase === 'SELECT_OR_MOVE') {
      const clickedOccupant = occupiedMap.get(`${r},${c}`);

      // Clicking own piece selects/deselects it
      if (clickedOccupant && clickedOccupant.playerId === currentPlayer.id) {
        soundEngine.playClick();
        if (selectedPieceId === clickedOccupant.id) {
          setSelectedPieceId(null);
        } else {
          setSelectedPieceId(clickedOccupant.id);
        }
        return;
      }

      // Clicking valid move target
      const moveOpt = validMoveMap.get(`${r},${c}`);
      if (selectedPiece && moveOpt) {
        executeMovePiece(selectedPiece, moveOpt);
      }
    }
  };

  // Auto-play on timeout (90s local / 45s online)
  const handleTurnTimeout = useCallback(() => {
    if (!currentPlayer || isPaused) return;
    if (isOnline && !isMyOnlineTurn) return;

    if (effectivePhase === 'PLACEMENT') {
      const choice = chooseAIPlacement(
        currentPlayer.id,
        remainingShapesForPlacer,
        effectivePieces,
        effectiveWalls,
      );
      executePlacePiece(choice.r, choice.c, choice.shape);
      return;
    }

    if (
      effectivePhase === 'PLAYING' &&
      effectiveSubPhase === 'PLACE_WALL' &&
      movedPiece
    ) {
      const edges = getEmptyEdgesForCell(movedPiece.r, movedPiece.c, effectiveWalls);
      if (edges.length === 0) {
        finalizeTurnAndAdvance(
          effectivePieces,
          effectiveWalls,
          effectivePlayers,
          effectiveTurnIndex,
        );
      } else {
        const randomEdge = edges[Math.floor(Math.random() * edges.length)];
        executePlaceWall(
          randomEdge.wallKey,
          `${currentPlayer.name} 님의 제한 시간이 초과되어 임의의 벽이 설치되었습니다.`,
        );
      }
      return;
    }

    if (effectivePhase === 'PLAYING' && effectiveSubPhase === 'SELECT_OR_MOVE') {
      const owned = effectivePieces.filter((p) => p.playerId === currentPlayer.id);
      let candidatePiece: Piece | null = null;
      let candidateMoves: MoveOption[] = [];

      if (selectedPiece && selectedPiece.playerId === currentPlayer.id) {
        const normal = getValidMoves(selectedPiece, effectivePieces, effectiveWalls, false);
        const brk =
          currentPlayer.wallBreaksLeft > 0
            ? getValidMoves(selectedPiece, effectivePieces, effectiveWalls, true)
            : [];
        if (normal.length > 0) {
          candidatePiece = selectedPiece;
          candidateMoves = normal;
        } else if (brk.length > 0) {
          candidatePiece = selectedPiece;
          candidateMoves = brk;
        }
      }

      if (!candidatePiece) {
        const shuffledOwned = [...owned].sort(() => Math.random() - 0.5);
        for (const p of shuffledOwned) {
          const normal = getValidMoves(p, effectivePieces, effectiveWalls, false);
          if (normal.length > 0) {
            candidatePiece = p;
            candidateMoves = normal;
            break;
          }
        }
        if (!candidatePiece && currentPlayer.wallBreaksLeft > 0) {
          for (const p of shuffledOwned) {
            const brk = getValidMoves(p, effectivePieces, effectiveWalls, true);
            if (brk.length > 0) {
              candidatePiece = p;
              candidateMoves = brk;
              break;
            }
          }
        }
      }

      if (!candidatePiece || candidateMoves.length === 0) {
        finalizeTurnAndAdvance(
          effectivePieces,
          effectiveWalls,
          effectivePlayers,
          effectiveTurnIndex,
          `${currentPlayer.name} 님이 이동할 수 없어 턴이 넘어갑니다.`,
        );
        return;
      }

      const randomMove =
        candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
      const nextPieces = effectivePieces.map((p) =>
        p.id === candidatePiece!.id
          ? { ...p, r: randomMove.r, c: randomMove.c }
          : p,
      );
      const nextWalls = new Map(effectiveWalls);
      let nextPlayers = effectivePlayers;
      let brokenKey: string | null = null;
      let placedKey: string | null = null;

      if (randomMove.brokenWallKey) {
        nextWalls.delete(randomMove.brokenWallKey);
        brokenKey = randomMove.brokenWallKey;
        if (!isOnline) setLastBrokenWallKey(brokenKey);
        nextPlayers = effectivePlayers.map((p) =>
          p.id === currentPlayer.id
            ? { ...p, wallBreaksLeft: Math.max(0, p.wallBreaksLeft - 1) }
            : p,
        );
      }

      const edges = getEmptyEdgesForCell(randomMove.r, randomMove.c, nextWalls);
      if (edges.length > 0) {
        const randomEdge = edges[Math.floor(Math.random() * edges.length)];
        nextWalls.set(randomEdge.wallKey, currentPlayer.id);
        placedKey = randomEdge.wallKey;
        if (!isOnline) setLastPlacedWallKey(placedKey);
      }

      soundEngine.playWrongGuess();
      finalizeTurnAndAdvance(
        nextPieces,
        nextWalls,
        nextPlayers,
        effectiveTurnIndex,
        `${currentPlayer.name} 님의 제한 시간(${turnLimitSeconds}초)이 종료되어 자동 이동 및 벽 설치가 진행되었습니다.`,
        brokenKey,
        placedKey,
      );
    }
  }, [
    currentPlayer,
    isPaused,
    isOnline,
    isMyOnlineTurn,
    effectivePhase,
    effectiveSubPhase,
    remainingShapesForPlacer,
    effectivePieces,
    effectiveWalls,
    effectivePlayers,
    effectiveTurnIndex,
    movedPiece,
    selectedPiece,
    turnLimitSeconds,
    executePlacePiece,
    executePlaceWall,
    finalizeTurnAndAdvance,
  ]);

  // Turn alert sound when my turn begins (online & local human turns)
  useEffect(() => {
    if (effectivePhase !== 'PLACEMENT' && effectivePhase !== 'PLAYING') {
      prevTurnAlertKeyRef.current = null;
      return;
    }
    if (!currentPlayer || currentPlayer.isAI) return;
    if (isOnline && !isMyOnlineTurn) {
      prevTurnAlertKeyRef.current = null;
      return;
    }
    const key = isOnline
      ? `${matchNumber}:${effectivePhase}:${effectivePlacementStep}:${effectiveTurnIndex}:${effectiveTurnCount}`
      : `local:${effectivePhase}:${effectivePlacementStep}:${effectiveTurnIndex}:${effectiveTurnCount}`;
    if (prevTurnAlertKeyRef.current !== key) {
      prevTurnAlertKeyRef.current = key;
      soundEngine.playTurnAlert();
    }
  }, [
    effectivePhase,
    currentPlayer,
    isOnline,
    isMyOnlineTurn,
    matchNumber,
    effectivePlacementStep,
    effectiveTurnIndex,
    effectiveTurnCount,
  ]);

  // Countdown timer (90s local / 45s online shot clock, freezes on Pause)
  useEffect(() => {
    if (effectivePhase !== 'PLACEMENT' && effectivePhase !== 'PLAYING') return;
    if (isPaused) return;
    if (isOnline && !onlineWB) return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;
        if (next >= 1 && next <= 5) {
          soundEngine.playTick();
        }
        if (prev <= 1) {
          if (!timeoutGuardRef.current && (!isOnline || isMyOnlineTurn)) {
            timeoutGuardRef.current = true;
            window.setTimeout(() => handleTurnTimeout(), 0);
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [effectivePhase, isPaused, isOnline, onlineWB, isMyOnlineTurn, handleTurnTimeout]);

  // AI Bot Execution (Local mode only, freezes on Pause)
  useEffect(() => {
    if (isOnline || isPaused) return;
    if (!currentPlayer || !currentPlayer.isAI) return;
    if (phase !== 'PLACEMENT' && phase !== 'PLAYING') return;

    const delay = phase === 'PLACEMENT' ? 500 : subPhase === 'SELECT_OR_MOVE' ? 650 : 450;

    const timer = window.setTimeout(() => {
      if (phase === 'PLACEMENT') {
        const choice = chooseAIPlacement(
          currentPlayer.id,
          remainingShapesForPlacer,
          pieces,
          walls,
        );
        executePlacePiece(choice.r, choice.c, choice.shape);
        return;
      }

      if (phase === 'PLAYING' && subPhase === 'SELECT_OR_MOVE') {
        const action = chooseAITurnAction(currentPlayer, players, pieces, walls);
        if (!action) {
          finalizeTurnAndAdvance(
            pieces,
            walls,
            players,
            turnIndex,
            `${currentPlayer.name}이(가) 이동할 수 없어 턴을 넘깁니다.`,
          );
          return;
        }
        const piece = pieces.find((p) => p.id === action.pieceId);
        if (!piece) return;

        const nextPieces = pieces.map((p) =>
          p.id === piece.id ? { ...p, r: action.move.r, c: action.move.c } : p,
        );
        const nextWalls = new Map(walls);
        let nextPlayers = players;

        if (action.move.brokenWallKey) {
          nextWalls.delete(action.move.brokenWallKey);
          setLastBrokenWallKey(action.move.brokenWallKey);
          nextPlayers = players.map((p) =>
            p.id === currentPlayer.id
              ? { ...p, wallBreaksLeft: Math.max(0, p.wallBreaksLeft - 1) }
              : p,
          );
        } else {
          setLastBrokenWallKey(null);
        }

        if (action.wallKey) {
          nextWalls.set(action.wallKey, currentPlayer.id);
          setLastPlacedWallKey(action.wallKey);
        }

        soundEngine.playSelect();
        finalizeTurnAndAdvance(
          nextPieces,
          nextWalls,
          nextPlayers,
          turnIndex,
          action.move.brokenWallKey
            ? `${currentPlayer.name}이(가) 벽 부수기를 사용해 이동했습니다.`
            : undefined,
        );
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    isOnline,
    isPaused,
    currentPlayer,
    phase,
    subPhase,
    remainingShapesForPlacer,
    pieces,
    walls,
    players,
    turnIndex,
    executePlacePiece,
    finalizeTurnAndAdvance,
  ]);

  const handleOnlineRematch = async () => {
    if (!onlineRoom || !isHost || isRematching) return;
    setIsRematching(true);
    try {
      await rematchSameGame(onlineRoom.roomCode, firstTurnRole);
    } finally {
      setIsRematching(false);
    }
  };

  const edgeByDir = useMemo(() => {
    const map = new Map<Direction, EdgeOption>();
    for (const e of emptyEdges) {
      map.set(e.dir, e);
    }
    return map;
  }, [emptyEdges]);

  const renderPieceToken = (piece: Piece, isSelected: boolean, isMoved: boolean) => {
    const style =
      PLAYER_STYLE[effectivePlayers.find((p) => p.id === piece.playerId)?.colorKey ?? 'sky'];
    const playerLabel = `P${piece.playerId}`;

    if (piece.shape === 'square') {
      return (
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-md border-2 border-slate-950/60 font-mono text-[11px] font-extrabold shadow-md transition-transform duration-150 sm:h-9 sm:w-9 sm:text-xs ${style.bgSolid} ${
            isSelected || isMoved ? 'scale-110 ring-2 ring-white' : ''
          }`}
          title={`${playerLabel} 사각 말(■)`}
        >
          {playerLabel}
        </div>
      );
    }

    return (
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-950/60 font-mono text-[11px] font-extrabold shadow-md transition-transform duration-150 sm:h-9 sm:w-9 sm:text-xs ${style.bgSolid} ${
          isSelected || isMoved ? 'scale-110 ring-2 ring-white' : ''
        }`}
        title={`${playerLabel} 원형 말(●)`}
      >
        {playerLabel}
      </div>
    );
  };

  if (isOnline && !onlineWB) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="arcade-panel max-w-md rounded-3xl p-6">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#FFD21E]" aria-hidden="true" />
          <p className="mt-3 text-sm font-extrabold text-white">
            벽바둑 2 온라인 대국 보드를 준비하는 중입니다...
          </p>
        </div>
      </div>
    );
  }

  const showResultConfetti =
    effectivePhase === 'RESULT' &&
    (!isOnline ||
      finalScores.some(
        (s) => s.isWinner && (s.playerId === 1 ? 'P1' : 'P2') === myRole,
      ));

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

            <span className="font-mono text-xs font-bold text-[#FFD21E]">
              7×7 영역 분리 전략 보드게임
            </span>
          </div>

          <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
            <section className="text-center">
              <p className="font-mono text-xs font-bold tracking-wider text-[#6B61FF]">
                GAME 03 · TERRITORY STRATEGY
              </p>
              <h1 className="arcade-hero-title mt-2 -rotate-1 text-4xl font-bold tracking-tight sm:text-5xl [text-wrap:balance]">
                벽바둑 2
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-white/80 [text-wrap:balance]">
                사각 말(■)과 원형 말(●)을 이동시키고 칸 경계에 벽을 세워 영토를 확보하세요.
                모든 플레이어의 말이 서로 다른 구역으로 완전히 분리되면 넓은 영역을 차지한 쪽이 승리합니다.
              </p>
            </section>

            {/* Round Mode Selection */}
            <section className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleRoundModeChange(1)}
                className={`rounded-[24px] border-[3px] p-5 text-left transition-all ${
                  roundMode === 1
                    ? 'border-[#6B61FF] bg-[#1D1B3D] shadow-[0_6px_0_#433AB5]'
                    : 'border-[#2B2857] bg-[#1D1B3D] shadow-[0_6px_0_#15132d] hover:border-[#6B61FF]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-extrabold text-[#FF61D2]">3인전</span>
                  {roundMode === 1 && (
                    <span className="rounded-lg bg-[#6B61FF] px-2 py-0.5 text-[11px] font-extrabold text-white">선택됨</span>
                  )}
                </div>
                <h2 className="mt-1.5 font-display text-2xl font-bold text-white">
                  1라운드 모드 (3인전)
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-white/75">
                  P1·P2·P3 각자 사각 말(■) 1개 + 원형 말(●) 1개 보유. 1→2→3, 3→2→1 역순 배치 후
                  진행하며 각자 1회 &lsquo;벽 부수기&rsquo; 사용 가능.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleRoundModeChange(2)}
                className={`rounded-[24px] border-[3px] p-5 text-left transition-all ${
                  roundMode === 2
                    ? 'border-[#FFD21E] bg-[#1D1B3D] shadow-[0_6px_0_#9E7D00]'
                    : 'border-[#2B2857] bg-[#1D1B3D] shadow-[0_6px_0_#15132d] hover:border-[#FFD21E]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-extrabold text-[#FFD21E]">1:1 결승전</span>
                  {roundMode === 2 && (
                    <span className="rounded-lg bg-[#FFD21E] px-2 py-0.5 text-[11px] font-extrabold text-[#121026]">선택됨</span>
                  )}
                </div>
                <h2 className="mt-1.5 font-display text-2xl font-bold text-white">
                  2라운드 모드 (1:1 결승전)
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-white/75">
                  P1·P2 각자 원형 말 2개가 대칭 위치에 고정 배치된 채 시작하며 사각 말 2개씩만
                  스네이크 배치합니다. 벽 부수기 사용 불가.
                </p>
              </button>
            </section>

            {/* Players Setup */}
            <section className="arcade-panel mt-5 rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm font-extrabold text-[#FFD21E]">
                참가자 설정 (로컬 멀티플레이 또는 AI 봇)
              </h2>

              <div className="mt-4 space-y-3">
                {playerConfigs.map((cfg) => {
                  const style = PLAYER_STYLE[cfg.colorKey];
                  return (
                    <div
                      key={cfg.id}
                      className="flex flex-col gap-3 rounded-2xl border-2 border-[#2B2857] bg-[#121026] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#121026] font-mono text-xs font-extrabold ${style.bgSolid}`}
                        >
                          P{cfg.id}
                        </span>
                        <label htmlFor={`wb-player-${cfg.id}`} className="sr-only">
                          플레이어 {cfg.id} 이름
                        </label>
                        <input
                          id={`wb-player-${cfg.id}`}
                          type="text"
                          value={cfg.name}
                          maxLength={14}
                          onChange={(e) =>
                            updatePlayerConfig(cfg.id, { name: e.target.value })
                          }
                          className="min-h-10 w-full rounded-xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1.5 text-sm text-white focus:border-[#6B61FF] focus:outline-none"
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-[#2B2857] bg-[#1D1B3D] p-1">
                        <button
                          type="button"
                          onClick={() => updatePlayerConfig(cfg.id, { isAI: false })}
                          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
                            !cfg.isAI
                              ? 'bg-[#FFD21E] text-[#121026]'
                              : 'text-white/70 hover:text-white'
                          }`}
                        >
                          <User className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>사람</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updatePlayerConfig(cfg.id, { isAI: true })}
                          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
                            cfg.isAI
                              ? 'bg-[#6B61FF] text-white'
                              : 'text-white/70 hover:text-white'
                          }`}
                        >
                          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>AI 봇</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={startGame}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-6 py-3 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] whitespace-nowrap"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>벽바둑 2 시작하기</span>
              </button>
            </section>
          </main>
        </div>
      )}

      {/* ACTIVE GAME OR RESULT — One-Screen Fold 8 Layout */}
      {(isOnline ||
        effectivePhase === 'PLACEMENT' ||
        effectivePhase === 'PLAYING' ||
        effectivePhase === 'RESULT') && (
        <GameBoardLayout
          onlineReactionBar={onlineReactionBar}
          topBar={
            <div className="rounded-2xl border-[3px] border-[#2B2857] bg-[#1D1B3D] px-3 py-2 shadow-[0_4px_0_#15132d] sm:px-4 sm:py-2.5">
              <div className="flex items-center justify-between gap-2">
                {/* Left: Back + Turn Info */}
                <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                  {!isOnline && (
                    <button
                      type="button"
                      onClick={() => setPhase('SETUP')}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 py-1 text-xs font-bold text-white transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">설정</span>
                    </button>
                  )}

                  {effectivePhase !== 'RESULT' && currentPlayer ? (
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                      <span
                        className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[11px] font-extrabold ${
                          PLAYER_STYLE[currentPlayer.colorKey].bgSolid
                        }`}
                      >
                        P{currentPlayer.id}
                      </span>
                      <span className="truncate text-xs font-extrabold text-white sm:text-sm">
                        {currentPlayer.name}
                      </span>
                      {isOnline && (
                        <span
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                            isMyOnlineTurn
                              ? 'border-[#FF61D2] bg-[#FF61D2] text-[#121026]'
                              : 'border-[#2B2857] bg-[#121026] text-white/75'
                          }`}
                        >
                          {isMyOnlineTurn ? '내 차례' : '대기'}
                        </span>
                      )}
                      <span className="hidden text-xs text-white/75 md:inline">
                        ·{' '}
                        {currentPlayer.isAI
                          ? 'AI 생각 중...'
                          : isOnline && !isMyOnlineTurn
                            ? '상대방의 행동을 기다리는 중...'
                            : effectivePhase === 'PLACEMENT'
                              ? `빈칸 배치 (${effectivePlacementStep + 1}/${effectivePlacementSeq.length})`
                              : effectiveSubPhase === 'SELECT_OR_MOVE'
                                ? selectedPiece
                                  ? '이동할 칸 선택'
                                  : '내 말 선택'
                                : '도착 칸 경계에 벽 설치'}
                      </span>
                      <span className="shrink-0 text-[11px] text-white/75 md:hidden whitespace-nowrap">
                        {currentPlayer.isAI
                          ? 'AI 중'
                          : isOnline && !isMyOnlineTurn
                            ? '상대 차례'
                            : effectivePhase === 'PLACEMENT'
                              ? `배치 ${effectivePlacementStep + 1}/${effectivePlacementSeq.length}`
                              : effectiveSubPhase === 'SELECT_OR_MOVE'
                                ? selectedPiece
                                  ? '칸 선택'
                                  : '말 선택'
                                : '벽 설치'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-extrabold text-[#FFD21E] sm:text-sm">
                      <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{effectiveEndReason}</span>
                    </div>
                  )}
                </div>

                {/* Right: Separation Status + Countdown Timer */}
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`hidden text-xs sm:inline whitespace-nowrap ${
                      boardAnalysis.isFullySeparated
                        ? 'font-extrabold text-[#FF61D2]'
                        : 'text-white/75'
                    }`}
                  >
                    {boardAnalysis.isFullySeparated
                      ? '완전 분리'
                      : `${effectiveTurnCount}턴 · 공유 ${boardAnalysis.sharedComponentsCount}`}
                  </span>

                  {effectivePhase !== 'RESULT' && (
                    <div className="flex items-center gap-1.5 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2.5 py-1">
                      <Clock
                        className={`h-3.5 w-3.5 ${
                          timeLeft <= 10
                            ? 'text-rose-400'
                            : timeLeft <= 20
                              ? 'text-[#FFD21E]'
                              : 'text-[#6B61FF]'
                        }`}
                        aria-hidden="true"
                      />
                      <span
                        className={`font-mono text-sm font-extrabold tabular-nums sm:text-base ${
                          timeLeft <= 10
                            ? 'text-rose-400'
                            : timeLeft <= 20
                              ? 'text-[#FFD21E]'
                              : 'text-white'
                        }`}
                      >
                        {timeLeft}s
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          }
          noticeBar={
            isOnline && effectivePhase !== 'RESULT' && !isMyOnlineTurn ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-2xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1.5 text-xs font-bold text-white"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFD21E] shrink-0" aria-hidden="true" />
                <span className="truncate">
                  상대방({currentPlayer?.name})의 행동을 기다리는 중...
                </span>
              </div>
            ) : effectiveStatusNotice ? (
              <div
                role="status"
                className="truncate rounded-2xl border-2 border-[#FF61D2] bg-[#1D1B3D] px-3 py-1.5 text-xs font-bold text-[#FF61D2]"
              >
                {effectiveStatusNotice}
              </div>
            ) : undefined
          }
          boardArea={
            <SquareBoardBox maxPx={620}>
              <div className="arcade-panel h-full w-full rounded-2xl p-2 sm:p-3">
                {/* Outer Wall Border */}
                <div className="relative h-full w-full rounded-xl border-[3px] border-[#2B2857] bg-[#121026] select-none">
                  <div className="grid h-full w-full grid-cols-7 grid-rows-7">
                    {Array.from({ length: BOARD_SIZE }).map((_, r) =>
                      Array.from({ length: BOARD_SIZE }).map((__, c) => {
                        const occupant = occupiedMap.get(`${r},${c}`);
                        const moveOpt = validMoveMap.get(`${r},${c}`);
                        const isSelected =
                          occupant && occupant.id === selectedPieceId;
                        const isMoved = occupant && occupant.id === effectiveMovedPieceId;

                        const compId = boardAnalysis.cellToComponent[r][c];
                        const comp = boardAnalysis.components[compId];
                        const soleOwnerId =
                          comp && comp.playerIds.length === 1
                            ? comp.playerIds[0]
                            : null;
                        const soleOwnerColor = soleOwnerId
                          ? effectivePlayers.find((p) => p.id === soleOwnerId)?.colorKey
                          : undefined;

                        let cellBg = 'bg-[#0F1522]';
                        if (effectivePhase === 'RESULT' && soleOwnerColor) {
                          cellBg = PLAYER_STYLE[soleOwnerColor].territoryBg;
                        } else if (
                          effectivePhase === 'PLAYING' &&
                          soleOwnerColor &&
                          boardAnalysis.isFullySeparated
                        ) {
                          cellBg = PLAYER_STYLE[soleOwnerColor].territoryBg;
                        }

                        const canPlaceHere =
                          effectivePhase === 'PLACEMENT' &&
                          !occupant &&
                          currentPlayer &&
                          !currentPlayer.isAI &&
                          !isPaused &&
                          isMyOnlineTurn;

                        const canSelectHere =
                          effectivePhase === 'PLAYING' &&
                          effectiveSubPhase === 'SELECT_OR_MOVE' &&
                          occupant &&
                          currentPlayer &&
                          !currentPlayer.isAI &&
                          !isPaused &&
                          isMyOnlineTurn &&
                          occupant.playerId === currentPlayer.id;

                        const canMoveHere =
                          effectivePhase === 'PLAYING' &&
                          effectiveSubPhase === 'SELECT_OR_MOVE' &&
                          !isPaused &&
                          isMyOnlineTurn &&
                          Boolean(moveOpt);

                        const hWallKey = r < BOARD_SIZE - 1 ? `H:${r}:${c}` : null;
                        const vWallKey = c < BOARD_SIZE - 1 ? `V:${r}:${c}` : null;
                        const bottomWallOwner = hWallKey ? effectiveWalls.get(hWallKey) : undefined;
                        const rightWallOwner = vWallKey ? effectiveWalls.get(vWallKey) : undefined;
                        const bottomWallColor =
                          bottomWallOwner !== undefined
                            ? effectivePlayers.find((p) => p.id === bottomWallOwner)?.colorKey
                            : undefined;
                        const rightWallColor =
                          rightWallOwner !== undefined
                            ? effectivePlayers.find((p) => p.id === rightWallOwner)?.colorKey
                            : undefined;

                        const isMovedCell =
                          effectivePhase === 'PLAYING' &&
                          effectiveSubPhase === 'PLACE_WALL' &&
                          movedPiece?.r === r &&
                          movedPiece?.c === c;

                        const upEdge = isMovedCell ? edgeByDir.get('UP') : undefined;
                        const downEdge = isMovedCell ? edgeByDir.get('DOWN') : undefined;
                        const leftEdge = isMovedCell ? edgeByDir.get('LEFT') : undefined;
                        const rightEdge = isMovedCell ? edgeByDir.get('RIGHT') : undefined;

                        return (
                          <div
                            key={`${r}-${c}`}
                            className={`relative border border-slate-800/70 ${cellBg} ${
                              isMovedCell ? 'ring-2 ring-inset ring-emerald-400/70' : ''
                            }`}
                          >
                            {/* Main Cell Interactive Button */}
                            <button
                              type="button"
                              onClick={() => handleCellClick(r, c)}
                              disabled={!canPlaceHere && !canSelectHere && !canMoveHere}
                              aria-label={`${r + 1}행 ${c + 1}열${
                                occupant ? ` P${occupant.playerId} 말` : ''
                              }`}
                              className={`flex h-full w-full items-center justify-center transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                                canMoveHere
                                  ? moveOpt?.brokenWallKey
                                    ? 'bg-amber-400/20 hover:bg-amber-400/35 cursor-pointer'
                                    : 'bg-emerald-500/20 hover:bg-emerald-500/35 cursor-pointer'
                                  : canPlaceHere
                                    ? 'hover:bg-sky-500/15 cursor-pointer'
                                    : canSelectHere
                                      ? 'hover:bg-slate-700/40 cursor-pointer'
                                      : 'cursor-default'
                              }`}
                            >
                              {occupant ? (
                                renderPieceToken(
                                  occupant,
                                  Boolean(isSelected),
                                  Boolean(isMoved),
                                )
                              ) : canMoveHere ? (
                                <span
                                  className={`h-3 w-3 rounded-full ${
                                    moveOpt?.brokenWallKey
                                      ? 'bg-amber-300 ring-4 ring-amber-400/25'
                                      : 'bg-emerald-400 ring-4 ring-emerald-400/25'
                                  }`}
                                  aria-hidden="true"
                                />
                              ) : null}
                            </button>

                            {/* Permanent Bottom Wall Seam (Owner Piece Color + Glow) */}
                            {bottomWallOwner !== undefined && (
                              <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute -bottom-[2.5px] left-[2px] right-[2px] z-10 h-[5px] rounded-full ring-1 ring-slate-950/75 ${
                                  bottomWallColor
                                    ? `${PLAYER_STYLE[bottomWallColor].wallBarBg} ${PLAYER_STYLE[bottomWallColor].wallGlow}`
                                    : 'bg-slate-200'
                                } ${
                                  effectiveLastPlacedWallKey === hWallKey
                                    ? 'ring-2 ring-white/90'
                                    : ''
                                }`}
                              />
                            )}

                            {/* Permanent Right Wall Seam (Owner Piece Color + Glow) */}
                            {rightWallOwner !== undefined && (
                              <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute bottom-[2px] right-[-2.5px] top-[2px] z-10 w-[5px] rounded-full ring-1 ring-slate-950/75 ${
                                  rightWallColor
                                    ? `${PLAYER_STYLE[rightWallColor].wallBarBg} ${PLAYER_STYLE[rightWallColor].wallGlow}`
                                    : 'bg-slate-200'
                                } ${
                                  effectiveLastPlacedWallKey === vWallKey
                                    ? 'ring-2 ring-white/90'
                                    : ''
                                }`}
                              />
                            )}

                            {/* Recently broken wall subtle cue */}
                            {effectiveLastBrokenWallKey &&
                              (effectiveLastBrokenWallKey === hWallKey ||
                                effectiveLastBrokenWallKey === vWallKey) && (
                                <div
                                  aria-hidden="true"
                                  className={
                                    effectiveLastBrokenWallKey === hWallKey
                                      ? 'pointer-events-none absolute -bottom-[1px] left-1 right-1 z-10 h-[2px] border-b-2 border-dashed border-rose-400/70'
                                      : 'pointer-events-none absolute bottom-1 right-[-1px] top-1 z-10 w-[2px] border-r-2 border-dashed border-rose-400/70'
                                  }
                                />
                              )}

                            {/* Interactive Placeable Wall Hitboxes around Destination Cell */}
                            {upEdge && (
                              <button
                                type="button"
                                onClick={() => executePlaceWall(upEdge.wallKey)}
                                aria-label="위쪽 경계에 벽 설치"
                                className="absolute -top-2.5 left-0 right-0 z-20 flex h-5 items-center justify-center group/edge cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300"
                              >
                                <span className="h-2 w-[84%] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)] transition-transform group-hover/edge:scale-y-125" />
                              </button>
                            )}
                            {downEdge && (
                              <button
                                type="button"
                                onClick={() => executePlaceWall(downEdge.wallKey)}
                                aria-label="아래쪽 경계에 벽 설치"
                                className="absolute -bottom-2.5 left-0 right-0 z-20 flex h-5 items-center justify-center group/edge cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300"
                              >
                                <span className="h-2 w-[84%] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)] transition-transform group-hover/edge:scale-y-125" />
                              </button>
                            )}
                            {leftEdge && (
                              <button
                                type="button"
                                onClick={() => executePlaceWall(leftEdge.wallKey)}
                                aria-label="왼쪽 경계에 벽 설치"
                                className="absolute bottom-0 -left-2.5 top-0 z-20 flex w-5 items-center justify-center group/edge cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300"
                              >
                                <span className="h-[84%] w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)] transition-transform group-hover/edge:scale-x-125" />
                              </button>
                            )}
                            {rightEdge && (
                              <button
                                type="button"
                                onClick={() => executePlaceWall(rightEdge.wallKey)}
                                aria-label="오른쪽 경계에 벽 설치"
                                className="absolute bottom-0 -right-2.5 top-0 z-20 flex w-5 items-center justify-center group/edge cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300"
                              >
                                <span className="h-[84%] w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)] transition-transform group-hover/edge:scale-x-125" />
                              </button>
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
            <div className="space-y-2 sm:space-y-3">
              {/* Compact Player Strip */}
              {effectivePhase !== 'RESULT' && (
                <div
                  className={`grid gap-1.5 ${
                    effectivePlayers.length === 3 ? 'grid-cols-3 sm:grid-cols-1' : 'grid-cols-2 sm:grid-cols-1'
                  }`}
                >
                  {effectivePlayers.map((p) => {
                    const style = PLAYER_STYLE[p.colorKey];
                    const isTurn = currentPlayer?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between gap-1.5 rounded-2xl border-2 px-2 py-1.5 text-xs sm:px-3 sm:py-2 ${
                          isTurn
                            ? `${style.border} ${style.softBg}`
                            : 'border-[#2B2857] bg-[#1D1B3D]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-extrabold ${style.bgSolid}`}
                          >
                            P{p.id}
                          </span>
                          <span className="truncate font-bold text-white">
                            {p.name}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-white/75">
                          {effectiveRoundMode === 1 ? `부수기 ${p.wallBreaksLeft}` : '결승'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Placement Shape Picker */}
              {effectivePhase === 'PLACEMENT' && currentPlayer && (
                <div className="arcade-panel rounded-2xl p-3 sm:rounded-3xl sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs font-extrabold text-[#FFD21E] sm:text-sm">
                      말 배치 ({effectivePlacementStep + 1}/{effectivePlacementSeq.length})
                    </h2>
                    <div className="flex items-center gap-1 text-[10px]">
                      {effectivePlacementSeq.map((pid, idx) => (
                        <span
                          key={idx}
                          className={`rounded-md px-1.5 py-0.5 font-mono ${
                            idx === effectivePlacementStep
                              ? `${PLAYER_STYLE[effectivePlayers.find((p) => p.id === pid)?.colorKey ?? 'sky'].bgSolid} font-extrabold`
                              : idx < effectivePlacementStep
                                ? 'bg-[#121026] text-white/35 line-through'
                                : 'bg-[#121026] text-white/75'
                          }`}
                        >
                          P{pid}
                        </span>
                      ))}
                    </div>
                  </div>

                  {!currentPlayer.isAI &&
                    isMyOnlineTurn &&
                    remainingShapesForPlacer.length > 0 && (
                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        {remainingShapesForPlacer.map((shape) => (
                          <button
                            key={shape}
                            type="button"
                            onClick={() => setChosenShape(shape)}
                            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-extrabold transition-colors ${
                              chosenShape === shape
                                ? 'border-[#6B61FF] bg-[#6B61FF] text-white'
                                : 'border-[#2B2857] bg-[#121026] text-white hover:border-[#6B61FF]'
                            }`}
                          >
                            <span>{shape === 'square' ? '■ 사각 말' : '● 원형 말'}</span>
                          </button>
                        ))}
                      </div>
                    )}

                  {isOnline && !isMyOnlineTurn && (
                    <p className="mt-2 text-xs text-white/70">
                      상대방이 말 위치를 선택하고 있습니다.
                    </p>
                  )}
                </div>
              )}

              {/* Playing Phase Controls & Directional Wall Buttons */}
              {effectivePhase === 'PLAYING' && currentPlayer && (
                <div className="arcade-panel rounded-2xl p-3 sm:rounded-3xl sm:p-4 space-y-2.5 sm:space-y-3.5">
                  {/* Directional Quick Wall Placement Buttons (during PLACE_WALL) */}
                  {effectiveSubPhase === 'PLACE_WALL' && emptyEdges.length > 0 && isMyOnlineTurn && (
                    <div className="rounded-2xl border-2 border-[#6B61FF] bg-[#121026] p-2.5">
                      <p className="text-[11px] font-extrabold text-[#FF61D2]">
                        벽 설치 방향 선택 (보드 초록선 터치 가능)
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {emptyEdges.map((edge) => (
                          <button
                            key={edge.wallKey}
                            type="button"
                            disabled={isPaused}
                            onClick={() => executePlaceWall(edge.wallKey)}
                            className="min-h-10 rounded-xl bg-[#FFD21E] px-2.5 py-1.5 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] transition-all hover:bg-[#FF61D2] active:translate-y-[1px] disabled:opacity-45 whitespace-nowrap"
                          >
                            {edge.label} 벽
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Wall Break Skill (Round 1 only) */}
                  {effectiveRoundMode === 1 && (
                    <div>
                      <button
                        type="button"
                        disabled={
                          currentPlayer.isAI ||
                          effectiveSubPhase !== 'SELECT_OR_MOVE' ||
                          currentPlayer.wallBreaksLeft <= 0 ||
                          isPaused
                        }
                        onClick={() => setWallBreakActive((prev) => !prev)}
                        className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-11 ${
                          wallBreakActive
                            ? 'border-[#FFD21E] bg-[#FFD21E] text-[#121026]'
                            : 'border-[#2B2857] bg-[#121026] text-white hover:border-[#FFD21E]'
                        }`}
                      >
                        <Hammer className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {wallBreakActive
                            ? '벽 부수기 활성화됨 (취소)'
                            : currentPlayer.wallBreaksLeft > 0
                              ? `벽 부수기 사용 (잔여 ${currentPlayer.wallBreaksLeft}회)`
                              : '벽 부수기 소진됨'}
                        </span>
                      </button>

                      {wallBreakActive && (
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-[#FFD21E]">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>주황색 칸 선택 시 경로의 벽 1개를 파괴합니다.</span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Movement Legend */}
                  <div className="border-t border-[#2B2857] pt-2 text-[11px] text-white/75 sm:pt-3 sm:text-xs">
                    <p className="sm:hidden">
                      <strong className="text-white">■</strong> 직선 1~2칸 ·{' '}
                      <strong className="text-white">●</strong> 1칸/꺾어 2칸 · 이동 후 벽 설치
                    </p>
                    <ul className="hidden space-y-1.5 leading-relaxed sm:block">
                      <li>
                        <span className="font-bold text-white">■ 사각 말:</span> 상·하·좌·우 직선 1~2칸 이동
                      </li>
                      <li>
                        <span className="font-bold text-white">● 원형 말:</span> 1칸 또는 90° 꺾어 총 2칸 이동
                      </li>
                      <li>
                        이동 후 도착 칸의 빈 면에 벽 1개를 설치해 턴을 마칩니다.
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Result Scoreboard */}
              {effectivePhase === 'RESULT' && (
                <div className="arcade-panel rounded-2xl p-3.5 sm:rounded-3xl sm:p-5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#FFD21E]">
                    <Trophy className="h-4 w-4" aria-hidden="true" />
                    <span>최종 영역 점수 판정</span>
                  </div>

                  <div className="mt-2.5 space-y-2">
                    {finalScores.map((res) => {
                      const style = PLAYER_STYLE[res.colorKey];
                      return (
                        <div
                          key={res.playerId}
                          className={`rounded-2xl border-2 px-3 py-2 ${
                            res.isWinner
                              ? `${style.border} ${style.softBg}`
                              : 'border-[#2B2857] bg-[#121026]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-xs font-bold text-white/70">
                                {res.rank}위
                              </span>
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-extrabold ${style.bgSolid}`}
                              >
                                P{res.playerId}
                              </span>
                              <span className="truncate text-xs font-extrabold text-white sm:text-sm">
                                {res.name}
                              </span>
                              {res.isWinner && (
                                <span className="shrink-0 text-[11px] font-extrabold text-[#FFD21E]">
                                  승리
                                </span>
                              )}
                            </div>

                            <span className="shrink-0 font-mono text-base font-extrabold tabular-nums text-white sm:text-lg">
                              {res.totalCells}
                              <span className="ml-0.5 font-sans text-[11px] font-normal text-white/70">
                                칸
                              </span>
                            </span>
                          </div>

                          <div className="mt-1 hidden items-center gap-2 text-[11px] text-white/70 sm:flex">
                            <span>독립 구역 {res.componentCount}개</span>
                            <span aria-hidden="true" className="text-white/35">·</span>
                            <span>최대 구역 {res.maxComponentCells}칸</span>
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
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFD21E] px-3 py-2 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] transition-all hover:bg-[#FF61D2] disabled:opacity-60 whitespace-nowrap sm:min-h-11"
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
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#6B61FF] px-3 py-2 text-xs font-bold text-white shadow-[0_3px_0_#433AB5] transition-all hover:bg-[#FF61D2] hover:text-[#121026] whitespace-nowrap sm:min-h-11"
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
                        onClick={startGame}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFD21E] px-3 py-2 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] transition-all hover:bg-[#FF61D2] whitespace-nowrap sm:min-h-11"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>다시하기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhase('SETUP')}
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-3 py-2 text-xs font-bold text-white transition-colors hover:border-[#6B61FF] whitespace-nowrap sm:min-h-11"
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
