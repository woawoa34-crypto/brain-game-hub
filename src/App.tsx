import { useEffect, useState } from 'react';
import { Home, KeyRound, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { ApiKeyModal } from './components/ApiKeyModal';
import { BlindMazeGame } from './components/BlindMazeGame';
import { FlagMemoryGame } from './components/FlagMemoryGame';
import { GradientCupGame } from './components/GradientCupGame';
import { LobbyScreen } from './components/LobbyScreen';
import { RulesModal } from './components/RulesModal';
import { WallBadukGame } from './components/WallBadukGame';
import { WordChainGame } from './components/WordChainGame';
import { useFullscreen } from './hooks/useFullscreen';
import type { ActiveGame } from './types';
import { soundEngine } from './utils/sound';

const API_KEY_STORAGE_KEY = 'brain_survival_gemini_api_key';

export default function App() {
  const [activeGame, setActiveGame] = useState<ActiveGame>('LOBBY');
  const [savedApiKey, setSavedApiKey] = useState<string>(() => {
    try {
      return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyPromptReason, setApiKeyPromptReason] = useState<'manual' | 'word_game'>('manual');
  const [muted, setMuted] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  const isApiConnected = Boolean(savedApiKey.trim()) || hasServerKey;

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: { hasServerKey?: boolean }) => {
        setHasServerKey(Boolean(data.hasServerKey));
      })
      .catch(() => {
        setHasServerKey(false);
      });
  }, []);

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

  const handleSelectGame = (game: ActiveGame) => {
    setActiveGame(game);
    if (game === 'WORD_GAME' && !savedApiKey.trim() && !hasServerKey) {
      setApiKeyPromptReason('word_game');
      setApiKeyModalOpen(true);
    }
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

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Slim Top Bar */}
      <header className="z-30 h-12 shrink-0 border-b border-slate-800/80 bg-[#0B0F17]/95 backdrop-blur-sm sm:h-13">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-6 sm:px-5">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleSelectGame('LOBBY')}
            className="font-display text-base font-bold tracking-tight text-slate-50 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-sky-400 sm:text-lg whitespace-nowrap shrink-0"
          >
            두뇌 서바이벌
          </button>

          {/* Zone 2: Clean single-line navigation links */}
          <nav aria-label="허브 탐색" className="flex items-center gap-2.5 text-xs font-medium text-slate-400 sm:gap-4 sm:text-sm">
            <button
              type="button"
              onClick={() => handleSelectGame('WORD_GAME')}
              className={`hidden md:inline-block py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'WORD_GAME' ? 'text-sky-400' : 'hover:text-slate-100'
              }`}
            >
              말결
            </button>
            <button
              type="button"
              onClick={() => handleSelectGame('FLAG_GAME')}
              className={`hidden md:inline-block py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'FLAG_GAME' ? 'text-emerald-400' : 'hover:text-slate-100'
              }`}
            >
              국기 기억력
            </button>
            <button
              type="button"
              onClick={() => handleSelectGame('WALLBADUK_GAME')}
              className={`hidden md:inline-block py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'WALLBADUK_GAME' ? 'text-amber-300' : 'hover:text-slate-100'
              }`}
            >
              벽바둑 2
            </button>
            <button
              type="button"
              onClick={() => handleSelectGame('BLIND_MAZE_GAME')}
              className={`hidden md:inline-block py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'BLIND_MAZE_GAME' ? 'text-violet-300' : 'hover:text-slate-100'
              }`}
            >
              블라인드 미로
            </button>
            <button
              type="button"
              onClick={() => handleSelectGame('GRADIENT_CUP_GAME')}
              className={`hidden lg:inline-block py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'GRADIENT_CUP_GAME' ? 'text-cyan-300' : 'hover:text-slate-100'
              }`}
            >
              7개의 컵
            </button>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="py-1 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
            >
              게임 방법
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
              className="inline-flex items-center gap-1 py-1 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
              <span className="hidden lg:inline">{muted ? '음소거' : '효과음'}</span>
            </button>
          </nav>

          {/* Zone 3: Primary Actions (Fullscreen Toggle + API Status Badge / Lobby) */}
          <div className="flex items-center gap-1.5 shrink-0 sm:gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? '창 모드로 전환' : '전체 화면으로 전환'}
              className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 sm:min-h-9 sm:px-3 whitespace-nowrap shrink-0 ${
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

            {activeGame === 'LOBBY' ? (
              <button
                type="button"
                onClick={openManualApiKeyModal}
                aria-label={
                  isApiConnected
                    ? 'Gemini API 연결됨 (클릭하여 키 수정 또는 삭제)'
                    : 'Gemini API 미등록 (클릭하여 키 등록)'
                }
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 sm:min-h-9 sm:px-3 whitespace-nowrap shrink-0 ${
                  isApiConnected
                    ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-amber-400/45 bg-amber-500/12 text-amber-200 hover:bg-amber-500/20'
                }`}
              >
                <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{isApiConnected ? 'API 연결됨' : 'API 미등록'}</span>
              </button>
            ) : (
              <>
                {activeGame === 'WORD_GAME' && (
                  <button
                    type="button"
                    onClick={openManualApiKeyModal}
                    aria-label="Gemini API 키 설정"
                    title={isApiConnected ? 'API 연결됨 (수정/삭제)' : 'API 미등록 (키 등록)'}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 sm:min-h-9 sm:px-2.5 whitespace-nowrap shrink-0 ${
                      isApiConnected
                        ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20'
                        : 'border-amber-400/45 bg-amber-500/12 text-amber-200 hover:bg-amber-500/20'
                    }`}
                  >
                    <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {isApiConnected ? 'API 연결됨' : 'API 미등록'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSelectGame('LOBBY')}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400 sm:min-h-9 sm:px-3 whitespace-nowrap shrink-0"
                >
                  <Home className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>로비로</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div
        className={`flex-1 min-h-0 ${
          activeGame === 'LOBBY' ? 'overflow-y-auto' : 'overflow-hidden'
        }`}
      >
        {activeGame === 'LOBBY' && (
          <LobbyScreen
            savedApiKey={savedApiKey}
            hasServerKey={hasServerKey}
            onSelectGame={(game) => handleSelectGame(game)}
          />
        )}

        {activeGame === 'WORD_GAME' && (
          <WordChainGame
            customApiKey={savedApiKey}
            onBackToLobby={() => handleSelectGame('LOBBY')}
          />
        )}

        {activeGame === 'FLAG_GAME' && (
          <FlagMemoryGame onBackToLobby={() => handleSelectGame('LOBBY')} />
        )}

        {activeGame === 'WALLBADUK_GAME' && (
          <WallBadukGame onBackToLobby={() => handleSelectGame('LOBBY')} />
        )}

        {activeGame === 'BLIND_MAZE_GAME' && (
          <BlindMazeGame onBackToLobby={() => handleSelectGame('LOBBY')} />
        )}

        {activeGame === 'GRADIENT_CUP_GAME' && (
          <GradientCupGame onBackToLobby={() => handleSelectGame('LOBBY')} />
        )}
      </div>

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
