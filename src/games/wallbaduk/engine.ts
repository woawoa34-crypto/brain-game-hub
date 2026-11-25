import type {
  BoardAnalysis,
  ComponentInfo,
  Direction,
  EdgeOption,
  MoveOption,
  Piece,
  PieceShape,
  PlayerScoreResult,
  PlayerState,
  RoundMode,
} from './types';

export const BOARD_SIZE = 7;

const DIRS: Array<{ dir: Direction; dr: number; dc: number; label: string }> = [
  { dir: 'UP', dr: -1, dc: 0, label: '위' },
  { dir: 'DOWN', dr: 1, dc: 0, label: '아래' },
  { dir: 'LEFT', dr: 0, dc: -1, label: '왼쪽' },
  { dir: 'RIGHT', dr: 0, dc: 1, label: '오른쪽' },
];

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

export function getEdgeWallKey(r: number, c: number, dir: Direction): string | null {
  if (dir === 'UP') {
    if (r <= 0) return null;
    return `H:${r - 1}:${c}`;
  }
  if (dir === 'DOWN') {
    if (r >= BOARD_SIZE - 1) return null;
    return `H:${r}:${c}`;
  }
  if (dir === 'LEFT') {
    if (c <= 0) return null;
    return `V:${r}:${c - 1}`;
  }
  if (c >= BOARD_SIZE - 1) return null;
  return `V:${r}:${c}`;
}

export function getEdgeBetween(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): string | null {
  const dr = r2 - r1;
  const dc = c2 - c1;
  if (dr === -1 && dc === 0) return getEdgeWallKey(r1, c1, 'UP');
  if (dr === 1 && dc === 0) return getEdgeWallKey(r1, c1, 'DOWN');
  if (dr === 0 && dc === -1) return getEdgeWallKey(r1, c1, 'LEFT');
  if (dr === 0 && dc === 1) return getEdgeWallKey(r1, c1, 'RIGHT');
  return null;
}

export function getPerpendicularDirs(dir: Direction): Direction[] {
  if (dir === 'UP' || dir === 'DOWN') return ['LEFT', 'RIGHT'];
  return ['UP', 'DOWN'];
}

export function getOccupiedMap(pieces: Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    map.set(`${p.r},${p.c}`, p);
  }
  return map;
}

export function getInitialRound2Pieces(): Piece[] {
  return [
    { id: 'p1-c1', playerId: 1, shape: 'circle', r: 1, c: 1 },
    { id: 'p1-c2', playerId: 1, shape: 'circle', r: 5, c: 5 },
    { id: 'p2-c1', playerId: 2, shape: 'circle', r: 1, c: 5 },
    { id: 'p2-c2', playerId: 2, shape: 'circle', r: 5, c: 1 },
  ];
}

export function getPlacementSequence(roundMode: RoundMode): number[] {
  if (roundMode === 1) {
    // 1 -> 2 -> 3 then 3 -> 2 -> 1
    return [1, 2, 3, 3, 2, 1];
  }
  // Round 2: P1 -> P2 -> P2 -> P1 for 2 square pieces each
  return [1, 2, 2, 1];
}

export function getValidMoves(
  piece: Piece,
  pieces: Piece[],
  walls: ReadonlySet<string> | ReadonlyMap<string, number>,
  wallBreakMode: boolean,
): MoveOption[] {
  const occupied = getOccupiedMap(pieces);
  const results = new Map<string, MoveOption>();

  const tryAdd = (r: number, c: number, brokenWallKey: string | null) => {
    const key = `${r},${c}`;
    if (wallBreakMode && !brokenWallKey) {
      return;
    }
    if (!results.has(key)) {
      results.set(key, { r, c, brokenWallKey });
    }
  };

  for (const d1 of DIRS) {
    const r1 = piece.r + d1.dr;
    const c1 = piece.c + d1.dc;
    if (!inBounds(r1, c1)) continue;
    if (occupied.has(`${r1},${c1}`)) continue;

    const edge1 = getEdgeWallKey(piece.r, piece.c, d1.dir);
    if (!edge1) continue;
    const wall1Exists = walls.has(edge1);

    if (wall1Exists && !wallBreakMode) continue;

    const brokenAfterStep1 = wall1Exists ? edge1 : null;
    tryAdd(r1, c1, brokenAfterStep1);

    // Step 2
    const step2Dirs: Direction[] =
      piece.shape === 'square' ? [d1.dir] : getPerpendicularDirs(d1.dir);

    for (const dir2 of step2Dirs) {
      const meta2 = DIRS.find((item) => item.dir === dir2)!;
      const r2 = r1 + meta2.dr;
      const c2 = c1 + meta2.dc;
      if (!inBounds(r2, c2)) continue;
      if (occupied.has(`${r2},${c2}`)) continue;

      const edge2 = getEdgeWallKey(r1, c1, dir2);
      if (!edge2) continue;
      const wall2Exists = walls.has(edge2);

      if (wall2Exists) {
        if (!wallBreakMode || brokenAfterStep1 !== null) continue;
        tryAdd(r2, c2, edge2);
      } else {
        tryAdd(r2, c2, brokenAfterStep1);
      }
    }
  }

  return [...results.values()];
}

export function getEmptyEdgesForCell(
  r: number,
  c: number,
  walls: ReadonlySet<string> | ReadonlyMap<string, number>,
): EdgeOption[] {
  const options: EdgeOption[] = [];
  for (const d of DIRS) {
    const wallKey = getEdgeWallKey(r, c, d.dir);
    if (wallKey && !walls.has(wallKey)) {
      options.push({
        dir: d.dir,
        wallKey,
        label: d.label,
      });
    }
  }
  return options;
}

export function analyzeBoard(
  pieces: Piece[],
  walls: ReadonlySet<string> | ReadonlyMap<string, number>,
): BoardAnalysis {
  const cellToComponent: number[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(-1),
  );
  const occupied = getOccupiedMap(pieces);
  const components: ComponentInfo[] = [];

  for (let sr = 0; sr < BOARD_SIZE; sr += 1) {
    for (let sc = 0; sc < BOARD_SIZE; sc += 1) {
      if (cellToComponent[sr][sc] !== -1) continue;

      const compId = components.length;
      const queue: Array<{ r: number; c: number }> = [{ r: sr, c: sc }];
      const cells: Array<{ r: number; c: number }> = [];
      const playerSet = new Set<number>();
      cellToComponent[sr][sc] = compId;

      let head = 0;
      while (head < queue.length) {
        const cur = queue[head];
        head += 1;
        cells.push(cur);

        const occupant = occupied.get(`${cur.r},${cur.c}`);
        if (occupant) {
          playerSet.add(occupant.playerId);
        }

        for (const d of DIRS) {
          const nr = cur.r + d.dr;
          const nc = cur.c + d.dc;
          if (!inBounds(nr, nc)) continue;
          if (cellToComponent[nr][nc] !== -1) continue;

          const edgeKey = getEdgeWallKey(cur.r, cur.c, d.dir);
          if (!edgeKey || walls.has(edgeKey)) continue;

          cellToComponent[nr][nc] = compId;
          queue.push({ r: nr, c: nc });
        }
      }

      components.push({
        id: compId,
        cells,
        size: cells.length,
        playerIds: [...playerSet],
      });
    }
  }

  let sharedComponentsCount = 0;
  for (const comp of components) {
    if (comp.playerIds.length >= 2) {
      sharedComponentsCount += 1;
    }
  }

  return {
    components,
    cellToComponent,
    isFullySeparated: sharedComponentsCount === 0,
    sharedComponentsCount,
  };
}

export function calculateScores(
  players: PlayerState[],
  pieces: Piece[],
  analysis: BoardAnalysis,
): PlayerScoreResult[] {
  const raw = players.map((player) => {
    const ownedCompIds = new Set<number>();
    for (const piece of pieces) {
      if (piece.playerId === player.id) {
        const compId = analysis.cellToComponent[piece.r]?.[piece.c];
        if (compId !== undefined && compId !== -1) {
          ownedCompIds.add(compId);
        }
      }
    }

    let totalCells = 0;
    let maxComponentCells = 0;

    for (const compId of ownedCompIds) {
      const size = analysis.components[compId]?.size ?? 0;
      totalCells += size;
      if (size > maxComponentCells) {
        maxComponentCells = size;
      }
    }

    return {
      playerId: player.id,
      name: player.name,
      colorKey: player.colorKey,
      isAI: player.isAI,
      totalCells,
      maxComponentCells,
      componentCount: ownedCompIds.size,
      rank: 1,
      isWinner: false,
    };
  });

  const sorted = [...raw].sort((a, b) => {
    if (b.totalCells !== a.totalCells) return b.totalCells - a.totalCells;
    if (b.maxComponentCells !== a.maxComponentCells) {
      return b.maxComponentCells - a.maxComponentCells;
    }
    return a.playerId - b.playerId;
  });

  const top = sorted[0];
  return sorted.map((entry, idx) => {
    const tiedWithPrev =
      idx > 0 &&
      entry.totalCells === sorted[idx - 1].totalCells &&
      entry.maxComponentCells === sorted[idx - 1].maxComponentCells;
    const rank = tiedWithPrev ? sorted[idx - 1].rank : idx + 1;
    entry.rank = rank;
    entry.isWinner =
      entry.totalCells === top.totalCells &&
      entry.maxComponentCells === top.maxComponentCells;
    return entry;
  });
}

export function playerHasAnyLegalMove(
  player: PlayerState,
  pieces: Piece[],
  walls: ReadonlySet<string> | ReadonlyMap<string, number>,
): boolean {
  const owned = pieces.filter((p) => p.playerId === player.id);
  for (const piece of owned) {
    if (getValidMoves(piece, pieces, walls, false).length > 0) return true;
    if (
      player.wallBreaksLeft > 0 &&
      getValidMoves(piece, pieces, walls, true).length > 0
    ) {
      return true;
    }
  }
  return false;
}

export function chooseAIPlacement(
  playerId: number,
  remainingShapes: PieceShape[],
  pieces: Piece[],
  walls: ReadonlySet<string> | ReadonlyMap<string, number>,
): { r: number; c: number; shape: PieceShape } {
  const occupied = getOccupiedMap(pieces);
  const shape = remainingShapes[0] ?? 'square';

  let bestCell = { r: 0, c: 0 };
  let bestScore = -Infinity;

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (occupied.has(`${r},${c}`)) continue;

      const centerDist = Math.abs(r - 3) + Math.abs(c - 3);
      let score = (6 - centerDist) * 1.4 + Math.random() * 0.4;

      // Prefer moderate separation from opponent pieces, slight distance from own pieces
      for (const other of pieces) {
        const dist = Math.abs(other.r - r) + Math.abs(other.c - c);
        if (other.playerId === playerId) {
          score += dist >= 2 ? 1.5 : -2;
        } else {
          score += dist >= 2 ? 0.6 : -0.5;
        }
      }

      const emptyEdges = getEmptyEdgesForCell(r, c, walls).length;
      score += emptyEdges * 0.8;

      if (score > bestScore) {
        bestScore = score;
        bestCell = { r, c };
      }
    }
  }

  return { r: bestCell.r, c: bestCell.c, shape };
}

export function chooseAITurnAction(
  player: PlayerState,
  players: PlayerState[],
  pieces: Piece[],
  walls: ReadonlySet<string> | ReadonlyMap<string, number>,
): {
  pieceId: string;
  move: MoveOption;
  wallKey: string | null;
} | null {
  const owned = pieces.filter((p) => p.playerId === player.id);
  const candidates: Array<{
    piece: Piece;
    move: MoveOption;
    wallKey: string | null;
    score: number;
  }> = [];

  const currentAnalysis = analyzeBoard(pieces, walls);

  // Determine whether AI is currently trapped in a tiny component (<= 3 cells)
  let inTinyTrap = false;
  for (const p of owned) {
    const cid = currentAnalysis.cellToComponent[p.r][p.c];
    const comp = currentAnalysis.components[cid];
    if (comp && comp.size <= 3 && comp.playerIds.length === 1) {
      inTinyTrap = true;
    }
  }

  for (const piece of owned) {
    const normalMoves = getValidMoves(piece, pieces, walls, false);
    const breakMoves =
      player.wallBreaksLeft > 0
        ? getValidMoves(piece, pieces, walls, true)
        : [];

    const allMoves = [
      ...normalMoves,
      ...(normalMoves.length === 0 || inTinyTrap ? breakMoves : []),
    ];

    for (const move of allMoves) {
      const nextPieces = pieces.map((p) =>
        p.id === piece.id ? { ...p, r: move.r, c: move.c } : p,
      );
      const wallsAfterMove = new Set(walls.keys());
      if (move.brokenWallKey) {
        wallsAfterMove.delete(move.brokenWallKey);
      }

      const emptyEdges = getEmptyEdgesForCell(move.r, move.c, wallsAfterMove);
      const wallCandidates: Array<string | null> =
        emptyEdges.length > 0 ? emptyEdges.map((e) => e.wallKey) : [null];

      for (const wallKey of wallCandidates) {
        const nextWalls = new Set(wallsAfterMove.keys());
        if (wallKey) {
          nextWalls.add(wallKey);
        }

        const nextAnalysis = analyzeBoard(nextPieces, nextWalls);
        const scores = calculateScores(players, nextPieces, nextAnalysis);
        const myScore = scores.find((s) => s.playerId === player.id)!;
        const maxOppScore = Math.max(
          0,
          ...scores
            .filter((s) => s.playerId !== player.id)
            .map((s) => s.totalCells),
        );

        let evalScore =
          (myScore.totalCells - maxOppScore) * 3 +
          myScore.maxComponentCells * 0.8 +
          Math.random() * 0.6;

        if (move.brokenWallKey) {
          evalScore -= inTinyTrap ? 1 : 12;
        }

        if (nextAnalysis.isFullySeparated) {
          if (myScore.isWinner) {
            evalScore += 200;
          } else {
            evalScore -= 80;
          }
        }

        // Penalize trapping own moved piece inside a 1-cell box unless winning
        const movedCompId = nextAnalysis.cellToComponent[move.r][move.c];
        const movedCompSize = nextAnalysis.components[movedCompId]?.size ?? 0;
        if (movedCompSize <= 2 && !nextAnalysis.isFullySeparated) {
          evalScore -= 14;
        }

        candidates.push({ piece, move, wallKey, score: evalScore });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0];
  return {
    pieceId: chosen.piece.id,
    move: chosen.move,
    wallKey: chosen.wallKey,
  };
}
