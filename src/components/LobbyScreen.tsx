import {
  ArrowRight,
  Compass,
  Flag,
  Globe,
  Grid3x3,
  Layers2,
  Sparkles,
  User,
} from 'lucide-react';
import type { ActiveGame } from '../types';
import type { OnlineRole, OnlineRoomData } from '../types/online';
import { OnlineLobbyPanel } from './OnlineLobbyPanel';

export type LobbyMode = 'local' | 'online';

interface LobbyScreenProps {
  savedApiKey: string;
  hasServerKey: boolean;
  lobbyMode: LobbyMode;
  onLobbyModeChange: (mode: LobbyMode) => void;
  onSelectGame: (game: Exclude<ActiveGame, 'LOBBY'>) => void;
  // Online multiplayer props
  nickname: string;
  onNicknameChange: (name: string) => void;
  onlineRoom: OnlineRoomData | null;
  myRole: OnlineRole | null;
  initialJoinCode?: string;
  onlineBusy: boolean;
  onlineError: string | null;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onClearOnlineError: () => void;
}

export function LobbyScreen({
  savedApiKey,
  hasServerKey,
  lobbyMode,
  onLobbyModeChange,
  onSelectGame,
  nickname,
  onNicknameChange,
  onlineRoom,
  myRole,
  initialJoinCode,
  onlineBusy,
  onlineError,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onClearOnlineError,
}: LobbyScreenProps) {
  const apiReady = Boolean(savedApiKey.trim()) || hasServerKey;

  const games: Array<{
    id: Exclude<ActiveGame, 'LOBBY'>;
    tag: string;
    title: string;
    desc: string;
    meta: string;
    cta: string;
    icon: typeof Sparkles;
    accentText: string;
    ctaBg: string;
  }> = [
    {
      id: 'WORD_GAME',
      tag: '게임 1 · AI 의미 추리',
      title: '말결 (유사어 추리)',
      desc: '한국어 연상·유사도 5단계 채점으로 숨겨진 정답 단어를 맞혀보세요.',
      meta: apiReady ? 'API 연결 준비됨' : 'Gemini API 키 필요',
      cta: '플레이',
      icon: Sparkles,
      accentText: 'text-sky-400',
      ctaBg: 'bg-sky-400 hover:bg-sky-300',
    },
    {
      id: 'FLAG_GAME',
      tag: '게임 2 · 순간 시각 기억',
      title: '국기 기억력 테스트',
      desc: '빠르게 지나가는 10개 국기를 기억해 5×5 배열에서 5개를 찾아내세요.',
      meta: '70개국 · 키 불필요',
      cta: '시작',
      icon: Flag,
      accentText: 'text-emerald-400',
      ctaBg: 'bg-emerald-500 hover:bg-emerald-400',
    },
    {
      id: 'WALLBADUK_GAME',
      tag: '게임 3 · 영역 분리 전략',
      title: '벽바둑 2',
      desc: '7×7 보드에서 사각·원형 말을 이동하고 내 색상의 벽을 세워 영토를 점령하세요.',
      meta: '3인전/1:1 · AI 봇',
      cta: '시작',
      icon: Grid3x3,
      accentText: 'text-amber-300',
      ctaBg: 'bg-amber-400 hover:bg-amber-300',
    },
    {
      id: 'BLIND_MAZE_GAME',
      tag: '게임 4 · 인지 지도',
      title: '블라인드 미로 탈출',
      desc: '3~5초간 공개된 미로를 기억해 어둠 속에서 4방향 화살표로 탈출하세요.',
      meta: '솔로 & 2인 레이스',
      cta: '시작',
      icon: Compass,
      accentText: 'text-violet-300',
      ctaBg: 'bg-violet-400 hover:bg-violet-300',
    },
    {
      id: 'GRADIENT_CUP_GAME',
      tag: '게임 5 · 7개의 컵 심리전',
      title: '그라데이션 컵 심리전',
      desc: '대칭 그라데이션 색상의 7개 컵 색상만 보고 상대 숫자를 추리하세요.',
      meta: '1인 vs AI & 2인 대전',
      cta: '시작',
      icon: Layers2,
      accentText: 'text-cyan-300',
      ctaBg: 'bg-cyan-400 hover:bg-cyan-300',
    },
  ];

  return (
    <main className="mx-auto flex h-full w-full max-w-6xl flex-col justify-between overflow-y-auto px-3 py-2 sm:overflow-hidden sm:px-5 sm:py-4">
      {/* Compact Header + Local / Online Mode Switcher */}
      <section className="flex shrink-0 flex-col items-center justify-between gap-2 sm:flex-row sm:gap-4">
        <div className="text-center sm:text-left">
          <p className="text-[11px] font-medium text-sky-400 sm:text-xs">
            한국어 두뇌 서바이벌 미니게임 허브
          </p>
          <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-50 sm:text-2xl [text-wrap:balance]">
            {lobbyMode === 'online'
              ? '🌐 실시간 온라인 친구 대전'
              : '어휘 추리 · 순간 기억력 · 전략 심리전'}
          </h1>
        </div>

        {/* Mode Switcher */}
        <div
          role="tablist"
          aria-label="플레이 방식 선택"
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-800 bg-[#131926] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={lobbyMode === 'local'}
            onClick={() => onLobbyModeChange('local')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
              lobbyMode === 'local'
                ? 'bg-sky-400 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            <span>로컬 플레이</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lobbyMode === 'online'}
            onClick={() => onLobbyModeChange('online')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
              lobbyMode === 'online'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>🌐 온라인 친구 대전</span>
            {onlineRoom && (
              <span className="ml-0.5 rounded bg-slate-950/20 px-1.5 py-0.5 font-mono text-[10px]">
                {onlineRoom.roomCode}
              </span>
            )}
          </button>
        </div>
      </section>

      {lobbyMode === 'online' ? (
        <section className="mt-2.5 min-h-0 flex-1 sm:mt-3.5">
          <OnlineLobbyPanel
            nickname={nickname}
            onNicknameChange={onNicknameChange}
            room={onlineRoom}
            myRole={myRole}
            initialJoinCode={initialJoinCode}
            isBusy={onlineBusy}
            errorMessage={onlineError}
            onCreateRoom={onCreateRoom}
            onJoinRoom={onJoinRoom}
            onLeaveRoom={onLeaveRoom}
            onClearError={onClearOnlineError}
          />
        </section>
      ) : (
        <section
          aria-label="미니게임 선택"
          className="mt-2.5 grid min-h-0 flex-1 grid-cols-1 gap-2 sm:mt-3.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
        >
          {games.map((game, index) => {
            const Icon = game.icon;
            const spanLastOnMd =
              index === games.length - 1 ? 'sm:col-span-2 lg:col-span-2' : '';

            return (
              <article
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className={`group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#131926] p-3 transition-colors duration-150 hover:border-slate-600 sm:flex-col sm:items-stretch sm:justify-between sm:rounded-2xl sm:p-4 lg:p-5 ${spanLastOnMd}`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`flex items-center gap-1.5 text-[11px] font-medium sm:text-xs ${game.accentText}`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                    <span className="truncate">{game.tag}</span>
                  </div>
                  <h2 className="mt-0.5 truncate text-sm font-bold text-slate-50 sm:mt-2 sm:text-lg">
                    {game.title}
                  </h2>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400 sm:mt-1.5 sm:line-clamp-2 sm:text-xs sm:leading-relaxed">
                    {game.desc}
                  </p>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-2 sm:mt-3 sm:border-t sm:border-slate-800/80 sm:pt-3">
                  <span className="hidden truncate text-xs text-slate-400 sm:inline">
                    {game.meta}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGame(game.id);
                    }}
                    className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:min-h-10 sm:rounded-xl sm:px-4 whitespace-nowrap ${game.ctaBg}`}
                  >
                    <span>{game.cta}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
