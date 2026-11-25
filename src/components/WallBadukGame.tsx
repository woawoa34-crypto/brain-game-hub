import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Clock,
  Hammer,
  Play,
  RotateCcw,
  ShieldAlert,
  Trophy,
  User,
} from 'lucide-react';
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
import { soundEngine } from '../utils/sound';
import { VictoryConfetti } from './VictoryConfetti';

interface WallBadukGameProps {
  onBackToLobby: () => void;
}

const TURN_SECONDS = 90;

const PLAYER_STYLE: Record<
  'sky' | 'rose' | 'amber',
  {
    text: string;
    bgSolid: string;
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

export function WallBadukGame({ onBackToLobby }: WallBadukGameProps) {
  const [phase, setPhase] = useState<WallBadukPhase>('SETUP');
  const [roundMode, setRoundMode] = useState<RoundMode>(1);
  const [playerConfigs, setPlayerConfigs] = useState<PlayerConfig[]>(() =>
    makeDefaultPlayers(1),
  );

  // Active game state
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [walls, setWalls] = useState<Set<string>>(() => new Set());
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

  const [timeLeft, setTimeLeft] = useState<number>(TURN_SECONDS);
  const [turnCount, setTurnCount] = useState<number>(1);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<string>('');

  const timeoutGuardRef = useRef<boolean>(false);

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
    setWalls(new Set());
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
    setTimeLeft(TURN_SECONDS);
    setTurnCount(1);
    setStatusNotice(null);
    setEndReason('');
    timeoutGuardRef.current = false;
    setPhase('PLACEMENT');
  };

  const occupiedMap = useMemo(() => getOccupiedMap(pieces), [pieces]);
  const boardAnalysis = useMemo(() => analyzeBoard(pieces, walls), [pieces, walls]);

  const currentPlacementPlayerId =
    phase === 'PLACEMENT' ? (placementSeq[placementStep] ?? 1) : null;
  const currentPlayer =
    phase === 'PLACEMENT'
      ? players.find((p) => p.id === currentPlacementPlayerId) ?? players[0]
      : players[turnIndex] ?? players[0];

  const remainingShapesForPlacer = useMemo<PieceShape[]>(() => {
    if (phase !== 'PLACEMENT' || !currentPlacementPlayerId) return [];
    const owned = pieces.filter((p) => p.playerId === currentPlacementPlayerId);
    if (roundMode === 2) {
      return ['square'];
    }
    const hasSquare = owned.some((p) => p.shape === 'square');
    const hasCircle = owned.some((p) => p.shape === 'circle');
    const list: PieceShape[] = [];
    if (!hasSquare) list.push('square');
    if (!hasCircle) list.push('circle');
    return list;
  }, [phase, currentPlacementPlayerId, pieces, roundMode]);

  useEffect(() => {
    if (
      remainingShapesForPlacer.length > 0 &&
      !remainingShapesForPlacer.includes(chosenShape)
    ) {
      setChosenShape(remainingShapesForPlacer[0]);
    }
  }, [remainingShapesForPlacer, chosenShape]);

  const selectedPiece = useMemo(
    () => pieces.find((p) => p.id === selectedPieceId) ?? null,
    [pieces, selectedPieceId],
  );

  const movedPiece = useMemo(
    () => pieces.find((p) => p.id === movedPieceId) ?? null,
    [pieces, movedPieceId],
  );

  const validMoveOptions = useMemo<MoveOption[]>(() => {
    if (
      phase !== 'PLAYING' ||
      subPhase !== 'SELECT_OR_MOVE' ||
      !selectedPiece ||
      !currentPlayer ||
      selectedPiece.playerId !== currentPlayer.id
    ) {
      return [];
    }
    return getValidMoves(selectedPiece, pieces, walls, wallBreakActive);
  }, [phase, subPhase, selectedPiece, currentPlayer, pieces, walls, wallBreakActive]);

  const validMoveMap = useMemo(() => {
    const map = new Map<string, MoveOption>();
    for (const opt of validMoveOptions) {
      map.set(`${opt.r},${opt.c}`, opt);
    }
    return map;
  }, [validMoveOptions]);

  const emptyEdges = useMemo<EdgeOption[]>(() => {
    if (phase !== 'PLAYING' || subPhase !== 'PLACE_WALL' || !movedPiece) {
      return [];
    }
    return getEmptyEdgesForCell(movedPiece.r, movedPiece.c, walls);
  }, [phase, subPhase, movedPiece, walls]);

  const finalScores = useMemo(() => {
    if (phase !== 'RESULT') return [];
    return calculateScores(players, pieces, boardAnalysis);
  }, [phase, players, pieces, boardAnalysis]);

  // Complete a turn after walls and pieces are finalized
  const finalizeTurnAndAdvance = useCallback(
    (
      nextPieces: Piece[],
      nextWalls: Set<string>,
      nextPlayers: PlayerState[],
      curTurnIdx: number,
      notice?: string,
    ) => {
      const analysis = analyzeBoard(nextPieces, nextWalls);
      if (analysis.isFullySeparated) {
        soundEngine.playVictory();
        setPieces(nextPieces);
        setWalls(nextWalls);
        setPlayers(nextPlayers);
        setSelectedPieceId(null);
        setMovedPieceId(null);
        setWallBreakActive(false);
        setEndReason('모든 플레이어의 영역이 벽으로 완전히 분리되었습니다.');
        setPhase('RESULT');
        return;
      }

      // Find next player with at least one legal move
      const count = nextPlayers.length;
      let chosenNextIdx = -1;
      let skippedNames: string[] = [];

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
        setPieces(nextPieces);
        setWalls(nextWalls);
        setPlayers(nextPlayers);
        setSelectedPieceId(null);
        setMovedPieceId(null);
        setWallBreakActive(false);
        setEndReason('더 이상 이동할 수 있는 말이 없어 게임을 종료합니다.');
        setPhase('RESULT');
        return;
      }

      setPieces(nextPieces);
      setWalls(nextWalls);
      setPlayers(nextPlayers);
      setTurnIndex(chosenNextIdx);
      setSubPhase('SELECT_OR_MOVE');
      setSelectedPieceId(null);
      setMovedPieceId(null);
      setWallBreakActive(false);
      setTimeLeft(TURN_SECONDS);
      setTurnCount((prev) => prev + 1);
      timeoutGuardRef.current = false;

      if (skippedNames.length > 0) {
        setStatusNotice(
          `${skippedNames.join(', ')} 님은 이동 가능한 칸이 없어 턴을 건너뜁니다.`,
        );
      } else {
        setStatusNotice(notice ?? null);
      }
    },
    [],
  );

  // Placement action
  const executePlacePiece = useCallback(
    (r: number, c: number, shapeToPlace: PieceShape) => {
      if (phase !== 'PLACEMENT' || !currentPlayer) return;
      if (occupiedMap.has(`${r},${c}`)) return;

      const newPiece: Piece = {
        id: `p${currentPlayer.id}-${shapeToPlace}-${placementStep}`,
        playerId: currentPlayer.id,
        shape: shapeToPlace,
        r,
        c,
      };

      const nextPieces = [...pieces, newPiece];
      soundEngine.playSelect();

      if (placementStep + 1 < placementSeq.length) {
        setPieces(nextPieces);
        setPlacementStep((prev) => prev + 1);
        setTimeLeft(TURN_SECONDS);
        timeoutGuardRef.current = false;
        setStatusNotice(null);
      } else {
        // Placement finished -> start Turn 1 with Player 1
        setPieces(nextPieces);
        setTurnIndex(0);
        setSubPhase('SELECT_OR_MOVE');
        setSelectedPieceId(null);
        setMovedPieceId(null);
        setWallBreakActive(false);
        setTimeLeft(TURN_SECONDS);
        setTurnCount(1);
        timeoutGuardRef.current = false;
        setStatusNotice('말 배치가 완료되었습니다. 1번 플레이어부터 이동과 벽 설치를 시작하세요.');
        setPhase('PLAYING');
      }
    },
    [phase, currentPlayer, occupiedMap, placementStep, pieces, placementSeq.length],
  );

  // Move piece action
  const executeMovePiece = useCallback(
    (piece: Piece, move: MoveOption, autoNotice?: string) => {
      if (!currentPlayer) return;

      const nextPieces = pieces.map((p) =>
        p.id === piece.id ? { ...p, r: move.r, c: move.c } : p,
      );
      const nextWalls = new Set(walls);
      let nextPlayers = players;

      if (move.brokenWallKey) {
        nextWalls.delete(move.brokenWallKey);
        setLastBrokenWallKey(move.brokenWallKey);
        nextPlayers = players.map((p) =>
          p.id === currentPlayer.id
            ? { ...p, wallBreaksLeft: Math.max(0, p.wallBreaksLeft - 1) }
            : p,
        );
      } else {
        setLastBrokenWallKey(null);
      }

      soundEngine.playSelect();

      const availableEdges = getEmptyEdgesForCell(move.r, move.c, nextWalls);
      if (availableEdges.length === 0) {
        finalizeTurnAndAdvance(
          nextPieces,
          nextWalls,
          nextPlayers,
          turnIndex,
          autoNotice ?? '도착한 칸의 4면이 모두 막혀 있어 벽 설치 없이 다음 턴으로 넘어갑니다.',
        );
        return;
      }

      setPieces(nextPieces);
      setWalls(nextWalls);
      setPlayers(nextPlayers);
      setSelectedPieceId(piece.id);
      setMovedPieceId(piece.id);
      setWallBreakActive(false);
      setSubPhase('PLACE_WALL');
      setStatusNotice(autoNotice ?? null);
    },
    [currentPlayer, pieces, walls, players, turnIndex, finalizeTurnAndAdvance],
  );

  // Place wall action
  const executePlaceWall = useCallback(
    (wallKey: string, autoNotice?: string) => {
      if (phase !== 'PLAYING' || subPhase !== 'PLACE_WALL') return;
      const nextWalls = new Set(walls);
      nextWalls.add(wallKey);
      setLastPlacedWallKey(wallKey);
      soundEngine.playHintResult(85);
      finalizeTurnAndAdvance(pieces, nextWalls, players, turnIndex, autoNotice);
    },
    [phase, subPhase, walls, pieces, players, turnIndex, finalizeTurnAndAdvance],
  );

  // Handle cell click
  const handleCellClick = (r: number, c: number) => {
    if (!currentPlayer || currentPlayer.isAI) return;

    if (phase === 'PLACEMENT') {
      if (occupiedMap.has(`${r},${c}`)) return;
      executePlacePiece(r, c, chosenShape);
      return;
    }

    if (phase === 'PLAYING' && subPhase === 'SELECT_OR_MOVE') {
      const clickedOccupant = occupiedMap.get(`${r},${c}`);

      // Clicking own piece selects/deselects it
      if (clickedOccupant && clickedOccupant.playerId === currentPlayer.id) {
        soundEngine.playSelect();
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

  // Auto-play on 90s timeout
  const handleTurnTimeout = useCallback(() => {
    if (!currentPlayer) return;

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

    if (phase === 'PLAYING' && subPhase === 'PLACE_WALL' && movedPiece) {
      const edges = getEmptyEdgesForCell(movedPiece.r, movedPiece.c, walls);
      if (edges.length === 0) {
        finalizeTurnAndAdvance(pieces, walls, players, turnIndex);
      } else {
        const randomEdge = edges[Math.floor(Math.random() * edges.length)];
        executePlaceWall(
          randomEdge.wallKey,
          `${currentPlayer.name} 님의 제한 시간이 초과되어 임의의 벽이 설치되었습니다.`,
        );
      }
      return;
    }

    if (phase === 'PLAYING' && subPhase === 'SELECT_OR_MOVE') {
      const owned = pieces.filter((p) => p.playerId === currentPlayer.id);
      let candidatePiece: Piece | null = null;
      let candidateMoves: MoveOption[] = [];

      // First try currently selected piece if it has moves
      if (selectedPiece && selectedPiece.playerId === currentPlayer.id) {
        const normal = getValidMoves(selectedPiece, pieces, walls, false);
        const brk =
          currentPlayer.wallBreaksLeft > 0
            ? getValidMoves(selectedPiece, pieces, walls, true)
            : [];
        if (normal.length > 0) {
          candidatePiece = selectedPiece;
          candidateMoves = normal;
        } else if (brk.length > 0) {
          candidatePiece = selectedPiece;
          candidateMoves = brk;
        }
      }

      // Otherwise pick any owned piece with valid moves
      if (!candidatePiece) {
        const shuffledOwned = [...owned].sort(() => Math.random() - 0.5);
        for (const p of shuffledOwned) {
          const normal = getValidMoves(p, pieces, walls, false);
          if (normal.length > 0) {
            candidatePiece = p;
            candidateMoves = normal;
            break;
          }
        }
        if (!candidatePiece && currentPlayer.wallBreaksLeft > 0) {
          for (const p of shuffledOwned) {
            const brk = getValidMoves(p, pieces, walls, true);
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
          pieces,
          walls,
          players,
          turnIndex,
          `${currentPlayer.name} 님이 이동할 수 없어 턴이 넘어갑니다.`,
        );
        return;
      }

      const randomMove =
        candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
      const nextPieces = pieces.map((p) =>
        p.id === candidatePiece!.id
          ? { ...p, r: randomMove.r, c: randomMove.c }
          : p,
      );
      const nextWalls = new Set(walls);
      let nextPlayers = players;

      if (randomMove.brokenWallKey) {
        nextWalls.delete(randomMove.brokenWallKey);
        setLastBrokenWallKey(randomMove.brokenWallKey);
        nextPlayers = players.map((p) =>
          p.id === currentPlayer.id
            ? { ...p, wallBreaksLeft: Math.max(0, p.wallBreaksLeft - 1) }
            : p,
        );
      }

      const edges = getEmptyEdgesForCell(randomMove.r, randomMove.c, nextWalls);
      if (edges.length > 0) {
        const randomEdge = edges[Math.floor(Math.random() * edges.length)];
        nextWalls.add(randomEdge.wallKey);
        setLastPlacedWallKey(randomEdge.wallKey);
      }

      soundEngine.playWrongGuess();
      finalizeTurnAndAdvance(
        nextPieces,
        nextWalls,
        nextPlayers,
        turnIndex,
        `${currentPlayer.name} 님의 제한 시간(90초)이 종료되어 자동 이동 및 벽 설치가 진행되었습니다.`,
      );
    }
  }, [
    currentPlayer,
    phase,
    subPhase,
    remainingShapesForPlacer,
    pieces,
    walls,
    players,
    turnIndex,
    movedPiece,
    selectedPiece,
    executePlacePiece,
    executePlaceWall,
    finalizeTurnAndAdvance,
  ]);

  // 90s Countdown timer
  useEffect(() => {
    if (phase !== 'PLACEMENT' && phase !== 'PLAYING') return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (!timeoutGuardRef.current) {
            timeoutGuardRef.current = true;
            window.setTimeout(() => handleTurnTimeout(), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase, handleTurnTimeout]);

  // AI Bot Execution
  useEffect(() => {
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
        const nextWalls = new Set(walls);
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
          nextWalls.add(action.wallKey);
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

  const edgeByDir = useMemo(() => {
    const map = new Map<Direction, EdgeOption>();
    for (const e of emptyEdges) {
      map.set(e.dir, e);
    }
    return map;
  }, [emptyEdges]);

  const renderPieceToken = (piece: Piece, isSelected: boolean, isMoved: boolean) => {
    const style = PLAYER_STYLE[players.find((p) => p.id === piece.playerId)?.colorKey ?? 'sky'];
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

  return (
    <>
      {phase === 'RESULT' && <VictoryConfetti />}

      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <button
          type="button"
          onClick={phase === 'SETUP' ? onBackToLobby : () => setPhase('SETUP')}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{phase === 'SETUP' ? '로비로 돌아가기' : '게임 설정으로'}</span>
        </button>

        <span className="text-xs text-slate-500">
          7×7 영역 분리 전략 보드게임
        </span>
      </div>

      {/* SETUP SCREEN */}
      {phase === 'SETUP' && (
        <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          <section className="text-center">
            <p className="text-xs font-medium text-amber-300">
              게임 3 · 영역 분리 전략 보드게임
            </p>
            <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl [text-wrap:balance]">
              벽바둑 2
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 [text-wrap:balance]">
              사각 말(■)과 원형 말(●)을 이동시키고 칸 경계에 벽을 세워 영토를 확보하세요.
              모든 플레이어의 말이 서로 다른 구역으로 완전히 분리되면 넓은 영역을 차지한 쪽이 승리합니다.
            </p>
          </section>

          {/* Round Mode Selection */}
          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleRoundModeChange(1)}
              className={`rounded-2xl border p-5 text-left transition-colors ${
                roundMode === 1
                  ? 'border-sky-400 bg-sky-500/10'
                  : 'border-slate-800 bg-[#131926] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-sky-400">3인전</span>
                {roundMode === 1 && (
                  <span className="text-xs font-bold text-sky-300">선택됨</span>
                )}
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-slate-100">
                1라운드 모드 (3인전)
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                P1·P2·P3 각자 사각 말(■) 1개 + 원형 말(●) 1개 보유. 1→2→3, 3→2→1 역순 배치 후
                진행하며 각자 1회 &lsquo;벽 부수기&rsquo; 사용 가능.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleRoundModeChange(2)}
              className={`rounded-2xl border p-5 text-left transition-colors ${
                roundMode === 2
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-slate-800 bg-[#131926] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-300">1:1 결승전</span>
                {roundMode === 2 && (
                  <span className="text-xs font-bold text-amber-300">선택됨</span>
                )}
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-slate-100">
                2라운드 모드 (1:1 결승전)
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                P1·P2 각자 원형 말 2개가 대칭 위치에 고정 배치된 채 시작하며 사각 말 2개씩만
                스네이크 배치합니다. 벽 부수기 사용 불가.
              </p>
            </button>
          </section>

          {/* Players Setup */}
          <section className="mt-6 rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-100">
              참가자 설정 (로컬 멀티플레이 또는 AI 봇)
            </h2>

            <div className="mt-4 space-y-3">
              {playerConfigs.map((cfg) => {
                const style = PLAYER_STYLE[cfg.colorKey];
                return (
                  <div
                    key={cfg.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0B0F17] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${style.bgSolid}`}
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
                        className="min-h-10 w-full rounded-lg border border-slate-700/80 bg-[#131926] px-3 py-1.5 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 rounded-lg bg-[#131926] p-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updatePlayerConfig(cfg.id, { isAI: false })}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          !cfg.isAI
                            ? 'bg-slate-700 text-slate-100'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>사람</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePlayerConfig(cfg.id, { isAI: true })}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          cfg.isAI
                            ? 'bg-sky-400 text-slate-950'
                            : 'text-slate-400 hover:text-slate-200'
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
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>벽바둑 2 시작하기</span>
            </button>
          </section>
        </main>
      )}

      {/* ACTIVE GAME OR RESULT */}
      {(phase === 'PLACEMENT' || phase === 'PLAYING' || phase === 'RESULT') && (
        <main className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-7">
          {/* Top HUD */}
          <section className="mb-5 rounded-2xl border border-slate-800 bg-[#131926] p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{roundMode === 1 ? '1라운드 (3인전)' : '2라운드 (1:1 결승)'}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>
                    {phase === 'PLACEMENT'
                      ? `말 배치 (${placementStep + 1}/${placementSeq.length})`
                      : phase === 'PLAYING'
                        ? `${turnCount}턴 진행 중`
                        : '경기 종료'}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span
                    className={
                      boardAnalysis.isFullySeparated
                        ? 'font-semibold text-emerald-400'
                        : 'text-slate-300'
                    }
                  >
                    {boardAnalysis.isFullySeparated
                      ? '영역 완전 분리 완료'
                      : `분리 대기 (공유 구역 ${boardAnalysis.sharedComponentsCount}개)`}
                  </span>
                </div>

                {phase !== 'RESULT' && currentPlayer ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                    <span
                      className={`inline-flex h-6 items-center rounded-md px-2 font-mono text-xs font-bold ${
                        PLAYER_STYLE[currentPlayer.colorKey].bgSolid
                      }`}
                    >
                      P{currentPlayer.id}
                    </span>
                    <span className="text-base font-bold text-slate-100 sm:text-lg">
                      {currentPlayer.name}
                    </span>
                    {currentPlayer.isAI && (
                      <span className="text-xs font-medium text-sky-400">
                        AI 생각 중...
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {phase === 'PLACEMENT'
                        ? '· 빈칸을 눌러 말을 배치하세요'
                        : subPhase === 'SELECT_OR_MOVE'
                          ? selectedPiece
                            ? '· 이동할 하이라이트 칸을 선택하세요'
                            : '· 이동할 내 말을 클릭하세요'
                          : '· 도착한 칸의 빈 경계선(초록 면)을 눌러 벽을 세우세요'}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-2 text-base font-bold text-emerald-400 sm:text-lg">
                    <Trophy className="h-5 w-5" aria-hidden="true" />
                    <span>{endReason}</span>
                  </div>
                )}
              </div>

              {/* 90-Second Timer */}
              {phase !== 'RESULT' && (
                <div className="flex items-center gap-2.5 self-start rounded-xl border border-slate-800 bg-[#0B0F17] px-3.5 py-2 sm:self-center shrink-0">
                  <Clock
                    className={`h-4 w-4 ${
                      timeLeft <= 10
                        ? 'text-rose-400'
                        : timeLeft <= 20
                          ? 'text-amber-300'
                          : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-slate-400">남은 시간</span>
                  <span
                    className={`font-mono text-xl font-bold tabular-nums ${
                      timeLeft <= 10
                        ? 'text-rose-400'
                        : timeLeft <= 20
                          ? 'text-amber-300'
                          : 'text-slate-100'
                    }`}
                  >
                    {timeLeft}s
                  </span>
                </div>
              )}
            </div>

            {/* Player Status Strip */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-800 pt-3.5 sm:grid-cols-3">
              {players.map((p) => {
                const style = PLAYER_STYLE[p.colorKey];
                const isTurn = phase !== 'RESULT' && currentPlayer?.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                      isTurn
                        ? `${style.border} ${style.softBg}`
                        : 'border-slate-800/80 bg-[#0B0F17]/80'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold ${style.bgSolid}`}
                      >
                        P{p.id}
                      </span>
                      <span className="truncate font-semibold text-slate-100">
                        {p.name}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">
                      {roundMode === 1 ? `벽부수기 ${p.wallBreaksLeft}` : '결승'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {statusNotice && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-xs font-medium text-sky-200"
            >
              {statusNotice}
            </div>
          )}

          {/* Main Board + Side Controls / Results */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            {/* 7x7 Board Column */}
            <section className="lg:col-span-7">
              <div className="mx-auto w-full max-w-[490px] rounded-2xl border border-slate-800 bg-[#131926] p-3 sm:p-4">
                {/* Outer Wall Border */}
                <div className="relative aspect-square w-full border-[3px] border-slate-300/80 bg-[#0B0F17] select-none">
                  <div className="grid h-full w-full grid-cols-7 grid-rows-7">
                    {Array.from({ length: BOARD_SIZE }).map((_, r) =>
                      Array.from({ length: BOARD_SIZE }).map((__, c) => {
                        const occupant = occupiedMap.get(`${r},${c}`);
                        const moveOpt = validMoveMap.get(`${r},${c}`);
                        const isSelected =
                          occupant && occupant.id === selectedPieceId;
                        const isMoved = occupant && occupant.id === movedPieceId;

                        const compId = boardAnalysis.cellToComponent[r][c];
                        const comp = boardAnalysis.components[compId];
                        const soleOwnerId =
                          comp && comp.playerIds.length === 1
                            ? comp.playerIds[0]
                            : null;
                        const soleOwnerColor = soleOwnerId
                          ? players.find((p) => p.id === soleOwnerId)?.colorKey
                          : undefined;

                        // Territory coloring: vivid in RESULT, subtle hint during play when separated
                        let cellBg = 'bg-[#0F1522]';
                        if (phase === 'RESULT' && soleOwnerColor) {
                          cellBg = PLAYER_STYLE[soleOwnerColor].territoryBg;
                        } else if (
                          phase === 'PLAYING' &&
                          soleOwnerColor &&
                          boardAnalysis.isFullySeparated
                        ) {
                          cellBg = PLAYER_STYLE[soleOwnerColor].territoryBg;
                        }

                        const canPlaceHere =
                          phase === 'PLACEMENT' &&
                          !occupant &&
                          currentPlayer &&
                          !currentPlayer.isAI;

                        const canSelectHere =
                          phase === 'PLAYING' &&
                          subPhase === 'SELECT_OR_MOVE' &&
                          occupant &&
                          currentPlayer &&
                          !currentPlayer.isAI &&
                          occupant.playerId === currentPlayer.id;

                        const canMoveHere =
                          phase === 'PLAYING' &&
                          subPhase === 'SELECT_OR_MOVE' &&
                          Boolean(moveOpt);

                        const hWallKey = r < BOARD_SIZE - 1 ? `H:${r}:${c}` : null;
                        const vWallKey = c < BOARD_SIZE - 1 ? `V:${r}:${c}` : null;
                        const hasBottomWall = hWallKey ? walls.has(hWallKey) : false;
                        const hasRightWall = vWallKey ? walls.has(vWallKey) : false;

                        const isMovedCell =
                          phase === 'PLAYING' &&
                          subPhase === 'PLACE_WALL' &&
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

                            {/* Permanent Bottom Wall Seam */}
                            {hasBottomWall && (
                              <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute -bottom-[2px] left-0 right-0 z-10 h-[4px] ${
                                  lastPlacedWallKey === hWallKey
                                    ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.7)]'
                                    : 'bg-slate-200'
                                }`}
                              />
                            )}

                            {/* Permanent Right Wall Seam */}
                            {hasRightWall && (
                              <div
                                aria-hidden="true"
                                className={`pointer-events-none absolute bottom-0 right-[-2px] top-0 z-10 w-[4px] ${
                                  lastPlacedWallKey === vWallKey
                                    ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.7)]'
                                    : 'bg-slate-200'
                                }`}
                              />
                            )}

                            {/* Recently broken wall subtle cue */}
                            {lastBrokenWallKey &&
                              (lastBrokenWallKey === hWallKey ||
                                lastBrokenWallKey === vWallKey) && (
                                <div
                                  aria-hidden="true"
                                  className={
                                    lastBrokenWallKey === hWallKey
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

                {/* Mobile-friendly quick directional wall placement buttons */}
                {phase === 'PLAYING' && subPhase === 'PLACE_WALL' && emptyEdges.length > 0 && (
                  <div className="mt-4 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3">
                    <p className="text-xs font-semibold text-emerald-300">
                      도착한 칸의 벽을 세울 방향을 선택하세요 (보드 위 초록선 클릭도 가능)
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {emptyEdges.map((edge) => (
                        <button
                          key={edge.wallKey}
                          type="button"
                          onClick={() => executePlaceWall(edge.wallKey)}
                          className="min-h-10 flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-300 whitespace-nowrap"
                        >
                          {edge.label} 벽 설치
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Side Panel: Controls / Placement Picker / Final Results */}
            <section className="space-y-4 lg:col-span-5">
              {/* Placement Shape Picker */}
              {phase === 'PLACEMENT' && currentPlayer && (
                <div className="rounded-2xl border border-slate-800 bg-[#131926] p-5">
                  <h2 className="text-sm font-bold text-slate-100">
                    말 배치 순서 ({placementStep + 1} / {placementSeq.length})
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {roundMode === 1
                      ? '1→2→3 순서로 첫 번째 말을 배치한 뒤, 3→2→1 역순으로 두 번째 말을 배치합니다.'
                      : '고정된 원형 말(●) 외에 각자 사각 말(■) 2개를 P1→P2→P2→P1 순서로 배치합니다.'}
                  </p>

                  {!currentPlayer.isAI && remainingShapesForPlacer.length > 0 && (
                    <div className="mt-4">
                      <span className="text-xs font-medium text-slate-400">
                        배치할 말 모양
                      </span>
                      <div className="mt-2 grid grid-cols-2 gap-2.5">
                        {remainingShapesForPlacer.map((shape) => (
                          <button
                            key={shape}
                            type="button"
                            onClick={() => setChosenShape(shape)}
                            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                              chosenShape === shape
                                ? 'border-sky-400 bg-sky-500/15 text-sky-300'
                                : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <span>{shape === 'square' ? '■ 사각 말' : '● 원형 말'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
                    {placementSeq.map((pid, idx) => (
                      <span
                        key={idx}
                        className={`rounded px-2 py-0.5 font-mono ${
                          idx === placementStep
                            ? `${PLAYER_STYLE[players.find((p) => p.id === pid)?.colorKey ?? 'sky'].bgSolid} font-bold`
                            : idx < placementStep
                              ? 'bg-slate-800 text-slate-500 line-through'
                              : 'bg-slate-800/70 text-slate-400'
                        }`}
                      >
                        P{pid}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Playing Phase Controls & Wall Break Ability */}
              {phase === 'PLAYING' && currentPlayer && (
                <div className="rounded-2xl border border-slate-800 bg-[#131926] p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">말 이동 안내</h2>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-400">
                      <li>
                        <span className="font-semibold text-slate-200">■ 사각 말:</span> 상·하·좌·우
                        한 방향으로 직선 1칸 또는 2칸 이동
                      </li>
                      <li>
                        <span className="font-semibold text-slate-200">● 원형 말:</span> 1칸 이동
                        또는 1칸 후 90도 꺾어 1칸 더 이동 (총 2칸)
                      </li>
                      <li>
                        이동 후 도착한 칸의 빈 면 중 1곳에 반드시 벽을 세워 턴을 마칩니다.
                      </li>
                    </ul>
                  </div>

                  {roundMode === 1 && (
                    <div className="border-t border-slate-800 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-200">
                          특수 능력 · 벽 부수기
                        </span>
                        <span className="font-mono text-xs tabular-nums text-slate-400">
                          잔여 {currentPlayer.wallBreaksLeft}회
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={
                          currentPlayer.isAI ||
                          subPhase !== 'SELECT_OR_MOVE' ||
                          currentPlayer.wallBreaksLeft <= 0
                        }
                        onClick={() => setWallBreakActive((prev) => !prev)}
                        className={`mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          wallBreakActive
                            ? 'border-amber-400 bg-amber-400 text-slate-950'
                            : 'border-slate-700 bg-[#0B0F17] text-slate-200 hover:border-amber-400/60'
                        }`}
                      >
                        <Hammer className="h-4 w-4" aria-hidden="true" />
                        <span>
                          {wallBreakActive
                            ? '벽 부수기 활성화됨 (취소하려면 클릭)'
                            : currentPlayer.wallBreaksLeft > 0
                              ? '벽 부수기 사용하기 (1회 한정)'
                              : '벽 부수기 소진됨'}
                        </span>
                      </button>

                      {wallBreakActive && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            경로상 벽 1개를 부수고 지나갈 수 있는 주황색 칸을 선택하세요.
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Result Scoreboard */}
              {phase === 'RESULT' && (
                <div className="rounded-2xl border border-slate-800 bg-[#131926] p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Trophy className="h-4 w-4" aria-hidden="true" />
                    <span>최종 영역 점수 판정</span>
                  </div>

                  <p className="mt-1.5 text-xs text-slate-400">
                    각 플레이어의 말이 속한 독립 구역 칸 수를 합산합니다(동일 구역 중복 제외).
                    동률 시 가장 넓은 단일 구역 칸 수로 승자를 가립니다.
                  </p>

                  <div className="mt-4 space-y-2.5">
                    {finalScores.map((res) => {
                      const style = PLAYER_STYLE[res.colorKey];
                      return (
                        <div
                          key={res.playerId}
                          className={`rounded-xl border p-3.5 ${
                            res.isWinner
                              ? `${style.border} ${style.softBg}`
                              : 'border-slate-800 bg-[#0B0F17]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-sm font-bold text-slate-400">
                                {res.rank}위
                              </span>
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold ${style.bgSolid}`}
                              >
                                P{res.playerId}
                              </span>
                              <span className="font-bold text-slate-100">
                                {res.name}
                              </span>
                              {res.isWinner && (
                                <span className="text-xs font-bold text-emerald-400">
                                  승리
                                </span>
                              )}
                            </div>

                            <span className="font-mono text-xl font-bold tabular-nums text-slate-100">
                              {res.totalCells}
                              <span className="ml-0.5 font-sans text-xs font-normal text-slate-400">
                                칸
                              </span>
                            </span>
                          </div>

                          <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                            <span>독립 구역 {res.componentCount}개</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span>최대 단일 구역 {res.maxComponentCells}칸</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={startGame}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-300 whitespace-nowrap"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>다시하기</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhase('SETUP')}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
                    >
                      설정 변경
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      )}
    </>
  );
}
