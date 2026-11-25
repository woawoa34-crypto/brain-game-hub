import { useEffect, useState } from 'react';
import { Home, Volume2, VolumeX } from 'lucide-react';
import { FlagMemoryGame } from './components/FlagMemoryGame';
import { LobbyScreen } from './components/LobbyScreen';
import { RulesModal } from './components/RulesModal';
import { WordChainGame } from './components/WordChainGame';
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
  const [muted, setMuted] = useState(false);

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

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-800/80 bg-[#0B0F17]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-4 px-4 sm:gap-8 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveGame('LOBBY')}
            className="font-display text-lg font-bold tracking-tight text-slate-50 transition-colors hover:text-sky-300 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
          >
            두뇌 서바이벌
          </button>

          {/* Zone 2: Clean single-line navigation links */}
          <nav aria-label="허브 탐색" className="flex items-center gap-4 text-sm font-medium text-slate-400 sm:gap-6">
            <button
              type="button"
              onClick={() => setActiveGame('WORD_GAME')}
              className={`hidden sm:inline-block py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'WORD_GAME' ? 'text-sky-400' : 'hover:text-slate-100'
              }`}
            >
              말결
            </button>
            <button
              type="button"
              onClick={() => setActiveGame('FLAG_GAME')}
              className={`hidden sm:inline-block py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeGame === 'FLAG_GAME' ? 'text-emerald-400' : 'hover:text-slate-100'
              }`}
            >
              국기 기억력
            </button>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="py-1.5 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
            >
              게임 방법
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
              className="inline-flex items-center gap-1.5 py-1.5 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
              ) : (
                <Volume2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
              <span className="hidden md:inline">{muted ? '음소거' : '효과음'}</span>
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            {activeGame === 'LOBBY' ? (
              <a
                href="#api-key-settings"
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
              >
                API 키 설정
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setActiveGame('LOBBY')}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
              >
                <Home className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                <span>로비로</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">
        {activeGame === 'LOBBY' && (
          <LobbyScreen
            savedApiKey={savedApiKey}
            hasServerKey={hasServerKey}
            onSelectGame={(game) => setActiveGame(game)}
            onSaveApiKey={handleSaveApiKey}
            onClearApiKey={handleClearApiKey}
          />
        )}

        {activeGame === 'WORD_GAME' && (
          <WordChainGame
            customApiKey={savedApiKey}
            onBackToLobby={() => setActiveGame('LOBBY')}
          />
        )}

        {activeGame === 'FLAG_GAME' && (
          <FlagMemoryGame onBackToLobby={() => setActiveGame('LOBBY')} />
        )}
      </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
