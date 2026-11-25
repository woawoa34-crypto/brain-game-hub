import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  HelpCircle,
  KeyRound,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { BlindMazeGame } from './components/BlindMazeGame';
import { ConfirmExitModal } from './components/ConfirmExitModal';
import { FlagMemoryGame } from './components/FlagMemoryGame';
import { GradientCupGame } from './components/GradientCupGame';
import { LobbyScreen, type LobbyMode } from './components/LobbyScreen';
import { PauseModal } from './components/PauseModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { QuickReactionBar, ReactionToast } from './components/QuickReactions';
import { QuickRulebookModal } from './components/QuickRulebookModal';
import { RulesModal } from './components/RulesModal';
import { WallBadukGame } from './components/WallBadukGame';
import { WordChainGame } from './components/WordChainGame';
import { useFullscreen } from './hooks/useFullscreen';
import {
  attachPresenceHeartbeat,
  clearRoomSession,
  createOnlineRoom,
  delegateHostIfDisconnected,
  getSavedNickname,
  joinOnlineRoom,
  leaveOnlineRoom,
  recoverStoredRoomSession,
  resolveHostRole,
  returnRoomToWaiting,
  saveNickname,
  setRoomPaused,
  subscribeToRoom,
  type StoredRoomSession,
} from './services/onlineRoom';
import type { ActiveGame } from './types';
import type { OnlineRoomData } from './types/online';
import { soundEngine, unlockAudio } from './utils/sound';

const API_KEY_STORAGE_KEY = 'brain_survival_gemini_api_key';

const GAME_TITLES: Record<Exclude<ActiveGame, 'LOBBY'>, string> = {
  WORD_GAME: '말결 (AI 유사어 추리)',
  FLAG_GAME: '국기 기억력 테스트',
  WALLBADUK_GAME: '벽바둑 2',
  BLIND_MAZE_GAME: '블라인드 미로 탈출',
  GRADIENT_CUP_GAME: '그라데이션 컵 심리전',
};

export default function App() {
  const [activeGame, setActiveGame] = useState<ActiveGame>('LOBBY');
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('local');
  const [localRestartKey, setLocalRestartKey] = useState<number>(0);

  const [savedApiKey, setSavedApiKey] = useState<string>(() => {
    try {
      return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [hasServerKey] = useState<boolean>(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [quickRulebookOpen, setQuickRulebookOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyPromptReason, setApiKeyPromptReason] = useState<'manual' | 'word_game'>('manual');
  const [muted, setMuted] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // Online multiplayer state
  const [nickname, setNickname] = useState<string>(() => getSavedNickname());
  const [roomSession, setRoomSession] = useState<StoredRoomSession | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomData | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  const hadRoomSnapshotRef = useRef(false);
  const intentionalLeaveRef = useRef(false);
  const popGuardActiveRef = useRef(false);

  const isApiConnected = Boolean(savedApiKey.trim()) || hasServerKey;
  const isOnlineMatch = Boolean(roomSession && onlineRoom && onlineRoom.status === 'PLAYING');
  const isPaused = isOnlineMatch ? Boolean(onlineRoom?.isPaused) : localPaused;

  // Global first-interaction AudioContext unlock for iOS Safari & mobile browsers
  useEffect(() => {
    const handleUnlock = () => {
      void unlockAudio().then((unlocked) => {
        if (unlocked) {
          window.removeEventListener('touchstart', handleUnlock);
          window.removeEventListener('pointerdown', handleUnlock);
          window.removeEventListener('click', handleUnlock);
        }
      });
    };

    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('click', handleUnlock, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleUnlock);
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('click', handleUnlock);
    };
  }, []);

  // Auto-join via ?room=XXXX invite link or recover stored session on mount
  useEffect(() => {
    let active = true;
    const initOnline = async () => {
      try {
        const url = new URL(window.location.href);
        const rawRoomParam = url.searchParams.get('room')?.trim().toUpperCase() ?? '';
        if (/^[A-Z0-9]{4}$/.test(rawRoomParam)) {
          url.searchParams.delete('room');
          window.history.replaceState(null, '', url.toString());
          if (!active) return;
          setLobbyMode('online');
          setInitialJoinCode(rawRoomParam);
          setOnlineBusy(true);
          try {
            const joined = await joinOnlineRoom(rawRoomParam, getSavedNickname());
            if (!active) return;
            hadRoomSnapshotRef.current = false;
            setRoomSession(joined);
          } catch (err) {
            if (!active) return;
            setOnlineError(
              err instanceof Error ? err.message : '초대 링크 방에 입장하지 못했습니다.',
            );
          } finally {
            if (active) setOnlineBusy(false);
          }
          return;
        }

        const recovered = await recoverStoredRoomSession();
        if (active && recovered) {
          hadRoomSnapshotRef.current = false;
          setLobbyMode('online');
          setRoomSession(recovered);
        }
      } catch {
        // Ignore initialization errors
      }
    };

    void initOnline();
    return () => {
      active = false;
    };
  }, []);

  // Subscribe to RTDB room state + presence heartbeat
  useEffect(() => {
    if (!roomSession) {
      setOnlineRoom(null);
      hadRoomSnapshotRef.current = false;
      return;
    }

    const unsubRoom = subscribeToRoom(roomSession.roomCode, (nextRoom) => {
      if (!nextRoom) {
        if (hadRoomSnapshotRef.current && !intentionalLeaveRef.current) {
          setOnlineError('상대방이 방을 종료하여 대기실로 돌아왔습니다.');
        }
        intentionalLeaveRef.current = false;
        hadRoomSnapshotRef.current = false;
        clearRoomSession();
        setRoomSession(null);
        setOnlineRoom(null);
        setActiveGame('LOBBY');
        setConfirmExitOpen(false);
        return;
      }

      hadRoomSnapshotRef.current = true;
      setOnlineRoom(nextRoom);

      if (nextRoom.status === 'PLAYING') {
        setLobbyMode('online');
        setActiveGame(nextRoom.selectedGame);
      } else if (nextRoom.status === 'WAITING') {
        setConfirmExitOpen(false);
        setLocalPaused(false);
        setQuickRulebookOpen(false);
        setActiveGame((prev) => (prev !== 'LOBBY' ? 'LOBBY' : prev));
        setLobbyMode('online');
      }
    });

    const unsubPresence = attachPresenceHeartbeat(roomSession.roomCode, roomSession.role);

    return () => {
      unsubRoom();
      unsubPresence();
    };
  }, [roomSession]);

  // Automatic Host Delegation if current host disconnects completely
  useEffect(() => {
    if (!roomSession || !onlineRoom) return;
    const curHostRole = resolveHostRole(onlineRoom);
    if (curHostRole === roomSession.role) return;

    const hostPlayer = onlineRoom.players?.[curHostRole];
    if (!hostPlayer || !hostPlayer.connected) {
      const timer = window.setTimeout(() => {
        void delegateHostIfDisconnected(roomSession.roomCode, roomSession.role);
      }, 3000);
      return () => window.clearTimeout(timer);
    }
  }, [roomSession, onlineRoom]);

  // Mobile/Browser Back Gesture Defense while inside any active game
  useEffect(() => {
    if (activeGame === 'LOBBY') {
      popGuardActiveRef.current = false;
      return;
    }

    if (!popGuardActiveRef.current) {
      window.history.pushState({ brainSurvivalInGame: true }, '');
      popGuardActiveRef.current = true;
    }

    const handlePopState = () => {
      window.history.pushState({ brainSurvivalInGame: true }, '');
      setConfirmExitOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeGame]);

  const handleSaveApiKey = (key: string) => {
    setSavedApiKey(key);
    try {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } catch {
      // Storage unavailable
    }
  };

  const handleClearApiKey = () => {
    setSavedApiKey('');
    try {
      window.localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch {
      // Storage unavailable
    }
  };

  const handleNicknameChange = (name: string) => {
    setNickname(name);
    saveNickname(name);
  };

  const handleCreateRoom = async () => {
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      const created = await createOnlineRoom(nickname);
      hadRoomSnapshotRef.current = false;
      setRoomSession(created);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : '방 생성에 실패했습니다.');
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleJoinRoom = async (code: string) => {
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      const joined = await joinOnlineRoom(code, nickname);
      hadRoomSnapshotRef.current = false;
      setRoomSession(joined);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : '방 입장에 실패했습니다.');
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!roomSession) return;
    intentionalLeaveRef.current = true;
    const { roomCode, role } = roomSession;
    setRoomSession(null);
    setOnlineRoom(null);
    setActiveGame('LOBBY');
    setConfirmExitOpen(false);
    setLocalPaused(false);
    setQuickRulebookOpen(false);
    await leaveOnlineRoom(roomCode, role);
  };

  const handleReturnToWaitingRoom = async () => {
    if (!roomSession) return;
    setConfirmExitOpen(false);
    setLocalPaused(false);
    setQuickRulebookOpen(false);
    await returnRoomToWaiting(roomSession.roomCode);
  };

  const handleSelectGame = (game: ActiveGame) => {
    if (game === 'LOBBY') {
      if (activeGame !== 'LOBBY') {
        setConfirmExitOpen(true);
      }
      return;
    }
    setLocalPaused(false);
    setQuickRulebookOpen(false);
    setActiveGame(game);
    if (game === 'WORD_GAME' && !savedApiKey.trim() && !hasServerKey) {
      setApiKeyPromptReason('word_game');
      setApiKeyModalOpen(true);
    }
  };

  const handleConfirmExitGame = () => {
    setConfirmExitOpen(false);
    setLocalPaused(false);
    setQuickRulebookOpen(false);
    if (roomSession) {
      void handleLeaveRoom();
    } else {
      setActiveGame('LOBBY');
    }
  };

  const handleTogglePause = () => {
    if (activeGame === 'LOBBY') return;
    if (isOnlineMatch && roomSession) {
      const myName =
        onlineRoom?.players?.[roomSession.role]?.nickname ?? nickname ?? '플레이어';
      void setRoomPaused(roomSession.roomCode, !isPaused, myName);
    } else {
      setLocalPaused((prev) => !prev);
    }
  };

  const handleRestartLocalGame = () => {
    setLocalPaused(false);
    setLocalRestartKey((prev) => prev + 1);
  };

  const openManualApiKeyModal = () => {
    setApiKeyPromptReason('manual');
    setApiKeyModalOpen(true);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  // Online opponent status & scoreboard info for active in-game header
  const myRole = roomSession?.role ?? null;
  const opponentRole = myRole === 'P1' ? 'P2' : myRole === 'P2' ? 'P1' : null;
  const opponentPlayer = opponentRole ? onlineRoom?.players?.[opponentRole] : undefined;
  const opponentOnline = opponentRole
    ? (onlineRoom?.presence?.[opponentRole]?.online ?? opponentPlayer?.connected ?? false)
    : false;
  const myDisplayNickname =
    (myRole ? onlineRoom?.players?.[myRole]?.nickname : undefined) ?? nickname;

  const onlineReactionBar =
    isOnlineMatch && roomSession ? (
      <QuickReactionBar roomCode={roomSession.roomCode} myNickname={myDisplayNickname} />
    ) : undefined;

  return (
    <div className="flex min-h-[100dvh] w-full flex-col overflow-y-auto overflow-x-hidden bg-[#0B0F17] text-slate-100 min-[680px]:h-dvh min-[680px]:overflow-hidden">
      {/* Fixed 44px Slim Header across Lobby & Games */}
      <header className="sticky top-0 z-30 h-11 shrink-0 border-b border-slate-800/80 bg-[#0B0F17]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5">
          {/* Left Zone: Brand on Lobby, or [← 로비로/대기실] + Game Title + Online HUD */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            {activeGame === 'LOBBY' ? (
              <span className="font-display text-sm font-bold tracking-tight text-slate-50 sm:text-base whitespace-nowrap shrink-0">
                브레인 서바이벌
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmExitOpen(true)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-slate-800/90 px-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>{isOnlineMatch ? '나가기' : '로비로'}</span>
                </button>
                <span className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                  {GAME_TITLES[activeGame]}
                </span>

                {isOnlineMatch && onlineRoom && (
                  <div className="hidden items-center gap-1.5 rounded-lg border border-slate-800 bg-[#131926] px-2 py-0.5 text-[11px] md:inline-flex">
                    <span className="font-mono font-bold text-slate-200 tabular-nums">
                      P1 {onlineRoom.scores?.P1 ?? 0}:{onlineRoom.scores?.P2 ?? 0} P2
                    </span>
                    {opponentPlayer && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="truncate max-w-24 text-slate-300">
                          {opponentPlayer.nickname}
                        </span>
                        <span>{opponentOnline ? '🟢' : '🟡'}</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Center Nav (Desktop/Unfolded Quick Jump on Local Lobby) */}
          {activeGame === 'LOBBY' && lobbyMode === 'local' && (
            <nav
              aria-label="허브 탐색"
              className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-400"
            >
              <button
                type="button"
                onClick={() => handleSelectGame('WORD_GAME')}
                className="py-1 transition-colors hover:text-sky-400 whitespace-nowrap"
              >
                말결
              </button>
              <button
                type="button"
                onClick={() => handleSelectGame('FLAG_GAME')}
                className="py-1 transition-colors hover:text-emerald-400 whitespace-nowrap"
              >
                국기 기억력
              </button>
              <button
                type="button"
                onClick={() => handleSelectGame('WALLBADUK_GAME')}
                className="py-1 transition-colors hover:text-amber-300 whitespace-nowrap"
              >
                벽바둑 2
              </button>
              <button
                type="button"
                onClick={() => handleSelectGame('BLIND_MAZE_GAME')}
                className="py-1 transition-colors hover:text-violet-300 whitespace-nowrap"
              >
                블라인드 미로
              </button>
              <button
                type="button"
                onClick={() => handleSelectGame('GRADIENT_CUP_GAME')}
                className="py-1 transition-colors hover:text-cyan-300 whitespace-nowrap"
              >
                7개의 컵
              </button>
            </nav>
          )}

          {/* Right Zone: Lobby Rules / Sound / API Badge / PWA Install / [⏸ 일시정지] / [❓ 룰북] / Fullscreen */}
          <div className="flex items-center gap-1 shrink-0 sm:gap-1.5">
            {activeGame === 'LOBBY' && (
              <button
                type="button"
                onClick={() => setRulesOpen(true)}
                className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-100 whitespace-nowrap"
              >
                게임 방법
              </button>
            )}

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-100"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4 text-slate-300" aria-hidden="true" />
              )}
            </button>

            {(activeGame === 'LOBBY' || activeGame === 'WORD_GAME') && (
              <button
                type="button"
                onClick={openManualApiKeyModal}
                aria-label={
                  isApiConnected
                    ? 'Gemini API 연결됨 (클릭하여 키 수정 또는 삭제)'
                    : 'Gemini API 미등록 (클릭하여 키 등록)'
                }
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0 ${
                  isApiConnected
                    ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-amber-400/45 bg-amber-500/12 text-amber-200 hover:bg-amber-500/20'
                }`}
              >
                <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{isApiConnected ? 'API 연결됨' : 'API 미등록'}</span>
              </button>
            )}

            {activeGame === 'LOBBY' && <PWAInstallButton />}

            {activeGame !== 'LOBBY' && (
              <>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  aria-label={isPaused ? '게임 재개' : '일시정지'}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 sm:px-2.5 sm:text-xs ${
                    isPaused
                      ? 'border-amber-400/70 bg-amber-400/20 text-amber-200'
                      : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">재개</span>
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">일시정지</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setQuickRulebookOpen(true)}
                  aria-label="10초 요약 룰북 열기"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 text-[11px] font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0 sm:px-2.5 sm:text-xs"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>룰북</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? '창 모드로 전환' : '전체 화면으로 전환'}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0 ${
                isFullscreen
                  ? 'border-sky-400/60 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                  : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">창 모드</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">전체 화면</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto min-[680px]:overflow-hidden">
        {activeGame === 'LOBBY' && (
          <LobbyScreen
            savedApiKey={savedApiKey}
            hasServerKey={hasServerKey}
            lobbyMode={lobbyMode}
            onLobbyModeChange={setLobbyMode}
            onSelectGame={(game) => handleSelectGame(game)}
            nickname={nickname}
            onNicknameChange={handleNicknameChange}
            onlineRoom={onlineRoom}
            myRole={myRole}
            initialJoinCode={initialJoinCode}
            onlineBusy={onlineBusy}
            onlineError={onlineError}
            onCreateRoom={() => void handleCreateRoom()}
            onJoinRoom={(code) => void handleJoinRoom(code)}
            onLeaveRoom={() => void handleLeaveRoom()}
            onClearOnlineError={() => setOnlineError(null)}
          />
        )}

        {activeGame === 'WORD_GAME' && (
          <WordChainGame
            key={`word-${localRestartKey}`}
            customApiKey={savedApiKey}
            onBackToLobby={() => setConfirmExitOpen(true)}
            isPaused={isPaused}
            onlineRoom={isOnlineMatch ? onlineRoom : null}
            myRole={isOnlineMatch ? myRole : null}
            onReturnToWaitingRoom={
              isOnlineMatch ? () => void handleReturnToWaitingRoom() : undefined
            }
            onlineReactionBar={onlineReactionBar}
          />
        )}

        {activeGame === 'FLAG_GAME' && (
          <FlagMemoryGame
            key={`flag-${localRestartKey}`}
            onBackToLobby={() => setConfirmExitOpen(true)}
            isPaused={isPaused}
            onlineRoom={isOnlineMatch ? onlineRoom : null}
            myRole={isOnlineMatch ? myRole : null}
            onReturnToWaitingRoom={
              isOnlineMatch ? () => void handleReturnToWaitingRoom() : undefined
            }
            onlineReactionBar={onlineReactionBar}
          />
        )}

        {activeGame === 'WALLBADUK_GAME' && (
          <WallBadukGame
            key={`wallbaduk-${localRestartKey}`}
            onBackToLobby={() => setConfirmExitOpen(true)}
            isPaused={isPaused}
            onlineRoom={isOnlineMatch ? onlineRoom : null}
            myRole={isOnlineMatch ? myRole : null}
            onReturnToWaitingRoom={
              isOnlineMatch ? () => void handleReturnToWaitingRoom() : undefined
            }
            onlineReactionBar={onlineReactionBar}
          />
        )}

        {activeGame === 'BLIND_MAZE_GAME' && (
          <BlindMazeGame
            key={`blindmaze-${localRestartKey}`}
            onBackToLobby={() => setConfirmExitOpen(true)}
            isPaused={isPaused}
            onlineRoom={isOnlineMatch ? onlineRoom : null}
            myRole={isOnlineMatch ? myRole : null}
            onReturnToWaitingRoom={
              isOnlineMatch ? () => void handleReturnToWaitingRoom() : undefined
            }
            onlineReactionBar={onlineReactionBar}
          />
        )}

        {activeGame === 'GRADIENT_CUP_GAME' && (
          <GradientCupGame
            key={`cup-${localRestartKey}`}
            onBackToLobby={() => setConfirmExitOpen(true)}
            isPaused={isPaused}
            onlineRoom={isOnlineMatch ? onlineRoom : null}
            myRole={isOnlineMatch ? myRole : null}
            onReturnToWaitingRoom={
              isOnlineMatch ? () => void handleReturnToWaitingRoom() : undefined
            }
            onlineReactionBar={onlineReactionBar}
          />
        )}
      </div>

      {/* Anti-Cheat Blurred Pause Overlay */}
      <PauseModal
        open={activeGame !== 'LOBBY' && isPaused}
        isOnline={isOnlineMatch}
        pausedBy={onlineRoom?.pausedBy}
        onResume={handleTogglePause}
        onRestartLocal={!isOnlineMatch ? handleRestartLocalGame : undefined}
        onExit={
          isOnlineMatch
            ? () => void handleReturnToWaitingRoom()
            : handleConfirmExitGame
        }
      />

      {/* 10-Second Summary Quick Rulebook (does not pause or reset game) */}
      <QuickRulebookModal
        open={quickRulebookOpen}
        game={activeGame}
        onClose={() => setQuickRulebookOpen(false)}
      />

      {/* Accidental Exit & Mobile Back Gesture Guard */}
      <ConfirmExitModal
        open={confirmExitOpen}
        isOnline={isOnlineMatch}
        onCancel={() => setConfirmExitOpen(false)}
        onReturnToWaitingRoom={
          isOnlineMatch ? () => void handleReturnToWaitingRoom() : undefined
        }
        onConfirmExit={handleConfirmExitGame}
      />

      {/* Live Emoji Reaction Floating Toast */}
      {roomSession && <ReactionToast reaction={onlineRoom?.reaction} />}

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <ApiKeyModal
        open={apiKeyModalOpen}
        savedApiKey={savedApiKey}
        hasServerKey={hasServerKey}
        promptReason={apiKeyPromptReason}
        onSaveApiKey={handleSaveApiKey}
        onClearApiKey={handleClearApiKey}
        onClose={() => setApiKeyModalOpen(false)}
      />
    </div>
  );
}
