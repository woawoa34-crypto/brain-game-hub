export type CardinalDir = 'N' | 'E' | 'S' | 'W';

export interface MazeCell {
  r: number;
  c: number;
  walls: {
    N: boolean;
    E: boolean;
    S: boolean;
    W: boolean;
  };
}

export interface GeneratedMaze {
  size: number;
  grid: MazeCell[][];
  start: { r: number; c: number };
  exit: { r: number; c: number };
  initialDir: CardinalDir;
}

const DIR_DELTAS: Record<CardinalDir, { dr: number; dc: number; opposite: CardinalDir }> = {
  N: { dr: -1, dc: 0, opposite: 'S' },
  E: { dr: 0, dc: 1, opposite: 'W' },
  S: { dr: 1, dc: 0, opposite: 'N' },
  W: { dr: 0, dc: -1, opposite: 'E' },
};

const DIR_ORDER: CardinalDir[] = ['N', 'E', 'S', 'W'];

export const DIR_LABELS_KO: Record<CardinalDir, string> = {
  N: '북쪽',
  E: '동쪽',
  S: '남쪽',
  W: '서쪽',
};

export function turnLeft90(dir: CardinalDir): CardinalDir {
  const idx = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(idx + 3) % 4];
}

export function turnRight90(dir: CardinalDir): CardinalDir {
  const idx = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(idx + 1) % 4];
}

export function getForwardDelta(dir: CardinalDir): { dr: number; dc: number } {
  return { dr: DIR_DELTAS[dir].dr, dc: DIR_DELTAS[dir].dc };
}

export function generateMaze(size: number): GeneratedMaze {
  const grid: MazeCell[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (__, c) => ({
      r,
      c,
      walls: { N: true, E: true, S: true, W: true },
    })),
  );

  const visited: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  const start = {
    r: Math.floor(Math.random() * size),
    c: Math.floor(Math.random() * size),
  };

  // Randomized DFS (Iterative stack)
  const stack: Array<{ r: number; c: number }> = [start];
  visited[start.r][start.c] = true;

  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const shuffledDirs = [...DIR_ORDER].sort(() => Math.random() - 0.5);
    let moved = false;

    for (const dir of shuffledDirs) {
      const { dr, dc, opposite } = DIR_DELTAS[dir];
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (visited[nr][nc]) continue;

      grid[cur.r][cur.c].walls[dir] = false;
      grid[nr][nc].walls[opposite] = false;
      visited[nr][nc] = true;
      stack.push({ r: nr, c: nc });
      moved = true;
      break;
    }

    if (!moved) {
      stack.pop();
    }
  }

  // BFS from start to pick the farthest cell as Exit (E)
  const dist: number[][] = Array.from({ length: size }, () =>
    Array(size).fill(-1),
  );
  const queue: Array<{ r: number; c: number }> = [start];
  dist[start.r][start.c] = 0;

  let farthest = start;
  let maxDist = 0;

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const d = dist[cur.r][cur.c];
    if (d > maxDist) {
      maxDist = d;
      farthest = cur;
    }

    for (const dir of DIR_ORDER) {
      if (grid[cur.r][cur.c].walls[dir]) continue;
      const { dr, dc } = DIR_DELTAS[dir];
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (dist[nr][nc] !== -1) continue;
      dist[nr][nc] = d + 1;
      queue.push({ r: nr, c: nc });
    }
  }

  // Choose initial facing direction from open exits of start
  const openDirs = DIR_ORDER.filter((dir) => !grid[start.r][start.c].walls[dir]);
  const initialDir = openDirs[0] ?? 'N';

  return {
    size,
    grid,
    start,
    exit: farthest,
    initialDir,
  };
}
