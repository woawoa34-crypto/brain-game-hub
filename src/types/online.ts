import type { GeneratedMaze, CardinalDir } from '../games/blindmaze/generator';
import type { Piece } from '../games/wallbaduk/types';
import type { ActiveGame, HintEntry } from '../types';

export type OnlineRole = 'P1' | 'P2';
export type SelectableGameId = Exclude<ActiveGame, 'LOBBY'>;
export type RoomStatus = 'WAITING' | 'PLAYING';

export interface OnlinePlayerInfo {
  uid: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
}

export interface OnlinePresenceInfo {
  online: boolean;
  lastSeen?: number;
}

export interface OnlineReactionPayload {
  sender: string;
  text: string;
  id: number;
}

export interface OnlineWordChainState {
  phase: 'STARTING' | 'PLAYING' | 'RESULT';
  maskedCount: number;
  currentTurn: OnlineRole;
  hints?: HintEntry[];
  wrongGuesses?: string[];
  pendingRequest?: {
    id: string;
    type: 'hint' | 'guess' | 'giveup';
    by: OnlineRole;
    word: string;
    createdAt: number;
  } | null;
  lastError?: string | null;
  winner?: OnlineRole | 'GAVE_UP' | null;
  revealedWord?: string | null;
  hintCount: number;
  answerAttempts: number;
  roundKey: number;
}

export interface FlagSubmissionRecord {
  selectedCodes: string[];
  hits: number;
  wrong: number;
  elapsedMs: number;
  submittedAt: number;
}

export interface OnlineFlagMemoryState {
  phase: 'EXPOSURE' | 'RECALL' | 'RESULT';
  secondsPerFlag: number;
  totalCycles: number;
  exposureCodes: string[];
  targetCodes: string[];
  gridCodes: string[];
  startedAt: number;
  submissions?: {
    P1?: FlagSubmissionRecord;
    P2?: FlagSubmissionRecord;
  };
  roundKey: number;
}

export interface OnlineWallBadukState {
  phase: 'PLACEMENT' | 'PLAYING' | 'RESULT';
  roundMode: 2;
  placementSeq: number[];
  placementStep: number;
  turnIndex: number;
  subPhase: 'SELECT_OR_MOVE' | 'PLACE_WALL';
  movedPieceId: string | null;
  pieces?: Piece[];
  walls?: Record<string, number>;
  lastBrokenWallKey?: string | null;
  lastPlacedWallKey?: string | null;
  turnCount: number;
  statusNotice?: string | null;
  endReason?: string;
  roundKey: number;
}

export interface OnlineMazeExplorer {
  id: 1 | 2;
  name: string;
  r: number;
  c: number;
  dir: CardinalDir;
  rotationDeg: number;
  collisions: number;
  steps: number;
  trajectory: Array<{ r: number; c: number }>;
}

export interface OnlineBlindMazeState {
  phase: 'MEMORIZE' | 'EXPLORE' | 'RESULT';
  boardSize: 6 | 7;
  memorizeSeconds: 3 | 5;
  maze: GeneratedMaze;
  explorers: OnlineMazeExplorer[];
  activeTurn: OnlineRole;
  winnerId?: 1 | 2 | null;
  collisionNotice?: string | null;
  roundKey: number;
}

export interface OnlineCupRoundRecord {
  round: number;
  leadPlayer: 1 | 2;
  p1CupIdx: number;
  p1Value: number;
  p2CupIdx: number;
  p2Value: number;
  winner: 1 | 2 | 'DRAW';
}

export interface OnlineGradientCupState {
  phase: 'PLACEMENT' | 'BATTLE' | 'RESULT';
  setupReady: { P1: boolean; P2: boolean };
  round: number;
  leadRole: OnlineRole;
  battleSubPhase: 'LEAD_PICK' | 'FOLLOW_PICK' | 'REVEAL_WAIT' | 'REVEAL';
  usedIndices?: { P1?: number[]; P2?: number[] };
  leadCupIdx?: number | null;
  followCupIdx?: number | null;
  roundReveals?: Record<string, { P1?: number; P2?: number }>;
  scores: { P1: number; P2: number };
  history?: OnlineCupRoundRecord[];
  finalSetups?: { P1?: number[]; P2?: number[] };
  roundKey: number;
}

export interface OnlineGameStateEnvelope {
  wordChain?: OnlineWordChainState | null;
  flagMemory?: OnlineFlagMemoryState | null;
  wallBaduk?: OnlineWallBadukState | null;
  blindMaze?: OnlineBlindMazeState | null;
  gradientCup?: OnlineGradientCupState | null;
}

export interface OnlineRoomData {
  roomCode: string;
  status: RoomStatus;
  selectedGame: SelectableGameId;
  hostUid: string;
  hostRole?: OnlineRole;
  firstTurnRole?: OnlineRole;
  matchNumber?: number;
  createdAt: number;
  startedAt?: number;
  isPaused?: boolean;
  pausedBy?: string | null;
  scores?: {
    P1: number;
    P2: number;
  };
  lastScoredMatchKey?: string | null;
  presence?: {
    P1?: OnlinePresenceInfo;
    P2?: OnlinePresenceInfo;
  };
  reaction?: OnlineReactionPayload | null;
  players: {
    P1?: OnlinePlayerInfo;
    P2?: OnlinePlayerInfo;
  };
  gameState?: OnlineGameStateEnvelope | null;
}

export interface OnlineGameSharedProps {
  isPaused?: boolean;
  onlineRoom?: OnlineRoomData | null;
  myRole?: OnlineRole | null;
  onReturnToWaitingRoom?: () => void;
  onlineReactionBar?: React.ReactNode;
}

