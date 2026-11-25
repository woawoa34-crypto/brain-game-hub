import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { database, ensureAnonymousAuth } from '../firebase';
import type {
  OnlinePlayerInfo,
  OnlineRole,
  OnlineRoomData,
  SelectableGameId,
} from '../types/online';

const ROOM_SESSION_KEY = 'brain_survival_online_session';
const NICKNAME_STORAGE_KEY = 'brain_survival_online_nickname';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface StoredRoomSession {
  roomCode: string;
  role: OnlineRole;
}

export function getSavedNickname(): string {
  try {
    const stored = window.localStorage.getItem(NICKNAME_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : '플레이어 1';
  } catch {
    return '플레이어 1';
  }
}

export function saveNickname(nickname: string): void {
  try {
    const clean = nickname.trim();
    if (clean) {
      window.localStorage.setItem(NICKNAME_STORAGE_KEY, clean);
    }
  } catch {
    // Storage unavailable
  }
}

export function getStoredRoomSession(): StoredRoomSession | null {
  try {
    const raw = window.sessionStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRoomSession>;
    if (
      typeof parsed.roomCode === 'string' &&
      parsed.roomCode.length === 4 &&
      (parsed.role === 'P1' || parsed.role === 'P2')
    ) {
      return { roomCode: parsed.roomCode, role: parsed.role };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveRoomSession(session: StoredRoomSession): void {
  try {
    window.sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable
  }
}

export function clearRoomSession(): void {
  try {
    window.sessionStorage.removeItem(ROOM_SESSION_KEY);
  } catch {
    // Storage unavailable
  }
}

function generateFourCharCode(): string {
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Background garbage collection: removes /rooms/{code} older than 24 hours.
 */
export async function cleanupExpiredRooms(): Promise<void> {
  try {
    const roomsRef = ref(database, 'rooms');
    const snap = await get(roomsRef);
    if (!snap.exists()) return;

    const now = Date.now();
    const tasks: Array<Promise<void>> = [];

    snap.forEach((child) => {
      const val = child.val() as Partial<OnlineRoomData> | null;
      const createdAt = typeof val?.createdAt === 'number' ? val.createdAt : 0;
      if (createdAt > 0 && now - createdAt > ROOM_TTL_MS && child.key) {
        tasks.push(remove(ref(database, `rooms/${child.key}`)));
      }
    });

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  } catch {
    // Silent background GC failure should never interrupt room creation
  }
}

export async function createOnlineRoom(
  nickname: string,
  initialGame: SelectableGameId = 'WALLBADUK_GAME',
): Promise<{ roomCode: string; role: OnlineRole }> {
  const user = await ensureAnonymousAuth();
  const cleanName = nickname.trim() || '플레이어 1';
  saveNickname(cleanName);

  // Trigger non-blocking 24h expired rooms cleanup in background
  void cleanupExpiredRooms();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generateFourCharCode();
    const roomRef = ref(database, `rooms/${roomCode}`);
    const snap = await get(roomRef);
    if (snap.exists()) continue;

    const p1: OnlinePlayerInfo = {
      uid: user.uid,
      nickname: cleanName,
      ready: false,
      connected: true,
      lastSeen: Date.now(),
    };

    const initialRoom: OnlineRoomData = {
      roomCode,
      status: 'WAITING',
      selectedGame: initialGame,
      hostUid: user.uid,
      hostRole: 'P1',
      firstTurnRole: 'P1',
      matchNumber: 1,
      createdAt: Date.now(),
      isPaused: false,
      pausedBy: null,
      scores: { P1: 0, P2: 0 },
      lastScoredMatchKey: null,
      presence: {
        P1: { online: true, lastSeen: Date.now() },
      },
      reaction: null,
      players: {
        P1: p1,
      },
      gameState: null,
    };

    await set(roomRef, initialRoom);
    saveRoomSession({ roomCode, role: 'P1' });
    return { roomCode, role: 'P1' };
  }

  throw new Error('방 코드를 생성하지 못했습니다. 다시 시도해 주세요.');
}

export function resolveHostRole(room: OnlineRoomData | null | undefined): OnlineRole {
  if (!room) return 'P1';
  if (room.hostRole === 'P1' || room.hostRole === 'P2') {
    if (room.players?.[room.hostRole]) return room.hostRole;
  }
  if (room.players?.P2?.uid && room.players.P2.uid === room.hostUid) return 'P2';
  if (room.players?.P1) return 'P1';
  if (room.players?.P2) return 'P2';
  return 'P1';
}

export async function joinOnlineRoom(
  rawCode: string,
  nickname: string,
): Promise<{ roomCode: string; role: OnlineRole }> {
  const roomCode = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
    throw new Error('4자리 영문/숫자 방 코드를 정확히 입력해주세요.');
  }

  const user = await ensureAnonymousAuth();
  const cleanName = nickname.trim() || '플레이어 2';
  saveNickname(cleanName);

  const roomRef = ref(database, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) {
    throw new Error(`방 코드 '${roomCode}'을(를) 찾을 수 없습니다.`);
  }

  let assignedRole: OnlineRole = 'P2';
  const txResult = await runTransaction(roomRef, (current: OnlineRoomData | null) => {
    if (!current) {
      return current;
    }

    const existingP1 = current.players?.P1;
    const existingP2 = current.players?.P2;

    if (existingP1?.uid === user.uid) {
      assignedRole = 'P1';
      return {
        ...current,
        presence: {
          ...(current.presence ?? {}),
          P1: { online: true, lastSeen: Date.now() },
        },
        players: {
          ...current.players,
          P1: {
            ...existingP1,
            nickname: cleanName,
            connected: true,
            lastSeen: Date.now(),
          },
        },
      };
    }

    if (existingP2?.uid === user.uid) {
      assignedRole = 'P2';
      return {
        ...current,
        presence: {
          ...(current.presence ?? {}),
          P2: { online: true, lastSeen: Date.now() },
        },
        players: {
          ...current.players,
          P2: {
            ...existingP2,
            nickname: cleanName,
            connected: true,
            lastSeen: Date.now(),
          },
        },
      };
    }

    if (current.status === 'PLAYING') {
      return undefined;
    }

    // If P2 slot is free or disconnected, join as P2; if P2 is host and P1 is free, join as P1
    const p2Busy = Boolean(existingP2 && existingP2.connected);
    const p1Busy = Boolean(existingP1 && existingP1.connected);

    if (!p2Busy) {
      assignedRole = 'P2';
      return {
        ...current,
        scores: current.scores ?? { P1: 0, P2: 0 },
        presence: {
          ...(current.presence ?? {}),
          P2: { online: true, lastSeen: Date.now() },
        },
        players: {
          ...current.players,
          P2: {
            uid: user.uid,
            nickname: cleanName,
            ready: false,
            connected: true,
            lastSeen: Date.now(),
          },
        },
      };
    }

    if (!p1Busy) {
      assignedRole = 'P1';
      return {
        ...current,
        scores: current.scores ?? { P1: 0, P2: 0 },
        presence: {
          ...(current.presence ?? {}),
          P1: { online: true, lastSeen: Date.now() },
        },
        players: {
          ...current.players,
          P1: {
            uid: user.uid,
            nickname: cleanName,
            ready: false,
            connected: true,
            lastSeen: Date.now(),
          },
        },
      };
    }

    return undefined;
  });

  if (!txResult.committed) {
    const latest = (await get(roomRef)).val() as OnlineRoomData | null;
    if (!latest) {
      throw new Error(`방 코드 '${roomCode}'이(가) 종료되었습니다.`);
    }
    if (latest.status === 'PLAYING') {
      throw new Error('이미 게임이 진행 중인 방입니다.');
    }
    throw new Error('이미 두 명의 플레이어가 모두 입장해 있습니다.');
  }

  saveRoomSession({ roomCode, role: assignedRole });
  return { roomCode, role: assignedRole };
}

export async function recoverStoredRoomSession(): Promise<{
  roomCode: string;
  role: OnlineRole;
} | null> {
  const stored = getStoredRoomSession();
  if (!stored) return null;

  try {
    const user = await ensureAnonymousAuth();
    const roomRef = ref(database, `rooms/${stored.roomCode}`);
    const snap = await get(roomRef);
    if (!snap.exists()) {
      clearRoomSession();
      return null;
    }

    const room = snap.val() as OnlineRoomData;
    const slot = room.players?.[stored.role];
    if (!slot || (slot.uid && slot.uid !== user.uid)) {
      clearRoomSession();
      return null;
    }

    await update(ref(database, `rooms/${stored.roomCode}`), {
      [`players/${stored.role}/connected`]: true,
      [`players/${stored.role}/lastSeen`]: serverTimestamp(),
      [`presence/${stored.role}/online`]: true,
      [`presence/${stored.role}/lastSeen`]: serverTimestamp(),
    });
    return stored;
  } catch {
    return null;
  }
}

export function subscribeToRoom(
  roomCode: string,
  onRoomUpdate: (room: OnlineRoomData | null) => void,
): Unsubscribe {
  const roomRef = ref(database, `rooms/${roomCode}`);
  return onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      onRoomUpdate(null);
      return;
    }
    onRoomUpdate(snapshot.val() as OnlineRoomData);
  });
}

/**
 * Tracks both RTDB `.info/connected` + `onDisconnect` and page visibility
 * (`document.visibilityState`) so screen-locks or app switches immediately show as idle.
 */
export function attachPresenceHeartbeat(
  roomCode: string,
  role: OnlineRole,
): Unsubscribe {
  const connectedRef = ref(database, '.info/connected');
  const playerConnectedRef = ref(database, `rooms/${roomCode}/players/${role}/connected`);
  const presenceOnlineRef = ref(database, `rooms/${roomCode}/presence/${role}/online`);
  const presenceLastSeenRef = ref(database, `rooms/${roomCode}/presence/${role}/lastSeen`);
  const playerLastSeenRef = ref(database, `rooms/${roomCode}/players/${role}/lastSeen`);

  const setOnlineState = (isOnline: boolean) => {
    void set(presenceOnlineRef, isOnline);
    void set(presenceLastSeenRef, serverTimestamp());
    void set(playerLastSeenRef, serverTimestamp());
  };

  const unsubConnected = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      void onDisconnect(playerConnectedRef).set(false);
      void onDisconnect(presenceOnlineRef).set(false);
      void set(playerConnectedRef, true);
      setOnlineState(document.visibilityState !== 'hidden');
    }
  });

  const handleVisibilityChange = () => {
    setOnlineState(document.visibilityState !== 'hidden');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    unsubConnected();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

export async function updatePlayerNickname(
  roomCode: string,
  role: OnlineRole,
  nickname: string,
): Promise<void> {
  const clean = nickname.trim() || (role === 'P1' ? '플레이어 1' : '플레이어 2');
  saveNickname(clean);
  await update(ref(database, `rooms/${roomCode}/players/${role}`), {
    nickname: clean,
    lastSeen: serverTimestamp(),
  });
}

export async function setPlayerReady(
  roomCode: string,
  role: OnlineRole,
  ready: boolean,
): Promise<void> {
  await update(ref(database, `rooms/${roomCode}/players/${role}`), {
    ready,
    lastSeen: serverTimestamp(),
  });
}

export async function selectRoomGame(
  roomCode: string,
  game: SelectableGameId,
): Promise<void> {
  await update(ref(database, `rooms/${roomCode}`), {
    selectedGame: game,
  });
}

export async function startRoomGame(roomCode: string): Promise<void> {
  const roomRef = ref(database, `rooms/${roomCode}`);
  await runTransaction(roomRef, (current: OnlineRoomData | null) => {
    if (!current) return current;
    return {
      ...current,
      status: 'PLAYING',
      startedAt: Date.now(),
      firstTurnRole: current.firstTurnRole ?? 'P1',
      matchNumber: (current.matchNumber ?? 0) + 1,
      isPaused: false,
      pausedBy: null,
      gameState: null,
    };
  });
}

export async function rematchSameGame(
  roomCode: string,
  currentFirstTurn: OnlineRole = 'P1',
): Promise<void> {
  const roomRef = ref(database, `rooms/${roomCode}`);
  await runTransaction(roomRef, (current: OnlineRoomData | null) => {
    if (!current) return current;
    const baseFirst = current.firstTurnRole ?? currentFirstTurn;
    const nextFirstTurn: OnlineRole = baseFirst === 'P1' ? 'P2' : 'P1';
    return {
      ...current,
      status: 'PLAYING',
      startedAt: Date.now(),
      firstTurnRole: nextFirstTurn,
      matchNumber: (current.matchNumber ?? 1) + 1,
      isPaused: false,
      pausedBy: null,
      gameState: null,
    };
  });
}

export async function returnRoomToWaiting(roomCode: string): Promise<void> {
  const roomRef = ref(database, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return;
  const room = snap.val() as OnlineRoomData;

  const updates: Record<string, unknown> = {
    status: 'WAITING',
    isPaused: false,
    pausedBy: null,
    gameState: null,
  };
  if (room.players?.P1) {
    updates['players/P1/ready'] = false;
  }
  if (room.players?.P2) {
    updates['players/P2/ready'] = false;
  }
  await update(roomRef, updates);
}

export async function delegateHostIfDisconnected(
  roomCode: string,
  candidateRole: OnlineRole,
): Promise<void> {
  const user = await ensureAnonymousAuth();
  const roomRef = ref(database, `rooms/${roomCode}`);
  await runTransaction(roomRef, (current: OnlineRoomData | null) => {
    if (!current) return current;
    const curHostRole = resolveHostRole(current);
    if (curHostRole === candidateRole) return current;
    const curHostPlayer = current.players?.[curHostRole];
    const myPlayer = current.players?.[candidateRole];
    if (!myPlayer) return current;

    // Only delegate if current host slot is missing or completely disconnected
    if (curHostPlayer && curHostPlayer.connected) {
      return current;
    }

    return {
      ...current,
      hostRole: candidateRole,
      hostUid: myPlayer.uid || user.uid,
    };
  });
}

export async function setRoomPaused(
  roomCode: string,
  isPaused: boolean,
  pausedByNickname?: string,
): Promise<void> {
  await update(ref(database, `rooms/${roomCode}`), {
    isPaused,
    pausedBy: isPaused ? (pausedByNickname ?? '플레이어') : null,
  });
}

/**
 * Atomically increments cumulative win count for winnerRole exactly once per matchKey.
 */
export async function recordMatchWinnerScore(
  roomCode: string,
  winnerRole: OnlineRole,
  matchKey: string,
): Promise<void> {
  const roomRef = ref(database, `rooms/${roomCode}`);
  await runTransaction(roomRef, (current: OnlineRoomData | null) => {
    if (!current) return current;
    if (current.lastScoredMatchKey === matchKey) {
      return current;
    }
    const prevScores = current.scores ?? { P1: 0, P2: 0 };
    return {
      ...current,
      lastScoredMatchKey: matchKey,
      scores: {
        P1: winnerRole === 'P1' ? (prevScores.P1 ?? 0) + 1 : (prevScores.P1 ?? 0),
        P2: winnerRole === 'P2' ? (prevScores.P2 ?? 0) + 1 : (prevScores.P2 ?? 0),
      },
    };
  });
}

export async function resetRoomScores(roomCode: string): Promise<void> {
  await update(ref(database, `rooms/${roomCode}`), {
    scores: { P1: 0, P2: 0 },
    lastScoredMatchKey: null,
  });
}

export async function sendRoomReaction(
  roomCode: string,
  senderNickname: string,
  text: string,
): Promise<void> {
  await set(ref(database, `rooms/${roomCode}/reaction`), {
    sender: senderNickname,
    text,
    id: Date.now(),
  });
}

export async function leaveOnlineRoom(
  roomCode: string,
  role: OnlineRole,
): Promise<void> {
  clearRoomSession();
  try {
    const roomRef = ref(database, `rooms/${roomCode}`);
    const otherRole: OnlineRole = role === 'P1' ? 'P2' : 'P1';

    await runTransaction(roomRef, (current: OnlineRoomData | null) => {
      if (!current) return current;
      const otherPlayer = current.players?.[otherRole];

      // If no other participant remains in the room, delete the room completely
      if (!otherPlayer) {
        return null;
      }

      const nextPlayers = { ...(current.players ?? {}) };
      delete nextPlayers[role];
      nextPlayers[otherRole] = {
        ...otherPlayer,
        ready: false,
      };

      const nextPresence = { ...(current.presence ?? {}) };
      delete nextPresence[role];

      return {
        ...current,
        status: 'WAITING' as const,
        hostRole: otherRole,
        hostUid: otherPlayer.uid,
        isPaused: false,
        pausedBy: null,
        gameState: null,
        players: nextPlayers,
        presence: nextPresence,
      };
    });
  } catch {
    // Ignore cleanup errors on leave
  }
}

export function getRoomGameStateRef(roomCode: string, gameKey: string) {
  return ref(database, `rooms/${roomCode}/gameState/${gameKey}`);
}
