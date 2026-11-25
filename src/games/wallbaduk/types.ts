export type RoundMode = 1 | 2;

export type PieceShape = 'square' | 'circle';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type WallBadukPhase = 'SETUP' | 'PLACEMENT' | 'PLAYING' | 'RESULT';

export type TurnSubPhase = 'SELECT_OR_MOVE' | 'PLACE_WALL';

export interface PlayerConfig {
  id: number;
  name: string;
  isAI: boolean;
  colorKey: 'sky' | 'rose' | 'amber';
}

export interface PlayerState extends PlayerConfig {
  wallBreaksLeft: number;
}

export interface Piece {
  id: string;
  playerId: number;
  shape: PieceShape;
  r: number;
  c: number;
}

export interface MoveOption {
  r: number;
  c: number;
  brokenWallKey: string | null;
}

export interface EdgeOption {
  dir: Direction;
  wallKey: string;
  label: string;
}

export interface ComponentInfo {
  id: number;
  cells: Array<{ r: number; c: number }>;
  size: number;
  playerIds: number[];
}

export interface PlayerScoreResult {
  playerId: number;
  name: string;
  colorKey: 'sky' | 'rose' | 'amber';
  isAI: boolean;
  totalCells: number;
  maxComponentCells: number;
  componentCount: number;
  rank: number;
  isWinner: boolean;
}

export interface BoardAnalysis {
  components: ComponentInfo[];
  cellToComponent: number[][];
  isFullySeparated: boolean;
  sharedComponentsCount: number;
}
