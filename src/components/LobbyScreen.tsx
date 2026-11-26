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
  const games: Array<{
    id: Exclude<ActiveGame, 'LOBBY'>;
    tag: string;
    title: string;
    desc: string;
    meta: string;
    cta: string;
    icon: typeof Sparkles;
    iconBg: string;
  }> = [
    {
      id: 'WORD_GAME',
      tag: 'AI Reasoning',
      title: '말결',
      desc: 'AI 유사어 추리 게임. 단어의 의미 결을 따라 정답을 맞히세요.',
      meta: 'AI 유사도 채점',
      cta: '플레이',
      icon: Sparkles,
      iconBg: 'bg-[#6B61FF] text-white',
    },
    {
      id: 'FLAG_GAME',
      tag: 'Memory Test',
      title: '국기 퀴즈',
      desc: '빠르게 지나가는 10개 국기를 기억해 5×5 배열에서 5개를 찾아내세요.',
      meta: '70개국 시각 기억',
      cta: '시작',
      icon: Flag,
      iconBg: 'bg-[#FF61D2] text-[#121026]',
    },
    {
      id: 'WALLBADUK_GAME',
      tag: 'Territory Logic',
      title: '벽바둑 2',
      desc: '7×7 보드에서 말을 이동하고 내 색상의 벽을 세워 영토를 점령하세요.',
      meta: '3인전/1:1 · AI 봇',
      cta: '시작',
      icon: Grid3x3,
      iconBg: 'bg-[#FFD21E] text-[#121026]',
    },
    {
      id: 'BLIND_MAZE_GAME',
      tag: 'Blind Escape',
      title: '블라인드 미로',
      desc: '3~5초간 공개된 미로를 기억해 어둠 속에서 4방향 화살표로 탈출하세요.',
      meta: '솔로 & 2인 레이스',
      cta: '시작',
      icon: Compass,
      iconBg: 'bg-sky-400 text-[#121026]',
    },
    {
      id: 'GRADIENT_CUP_GAME',
      tag: 'Mind Game',
      title: '7개의 컵 심리전',
      desc: '대칭 그라데이션 컵의 색상만 보고 상대 숫자를 추리해 승부하세요.',
      meta: '1인 vs AI & 2인 대전',
      cta: '시작',
      icon: Layers2,
      iconBg: 'bg-emerald-400 text-[#121026]',
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col justify-between overflow-y-auto px-3 py-3 text-sm min-[680px]:h-full min-[680px]:overflow-hidden min-[680px]:px-5 min-[680px]:py-4">
      {/* Variation 2 Playful Toybox Arcade Hero + Mode Switcher */}
      <section className="flex shrink-0 flex-col items-center justify-between gap-3 border-b border-white/10 pb-3 min-[680px]:flex-row min-[680px]:gap-4">
        <div className="relative flex items-center gap-3 text-center sm:text-left">
          <div className="relative">
            <span className="inline-block rounded bg-white/10 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-widest text-[#6B61FF] sm:text-[11px]">
              KOR_HUB · BRAIN SURVIVAL
            </span>
            <h1 className="arcade-hero-title mt-1 text-3xl font-bold leading-none -rotate-1 sm:text-4xl lg:text-5xl [text-wrap:balance]">
              {lobbyMode === 'online' ? '온라인 친구 대전' : '브레인 서바이벌'}
            </h1>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-5 -top-1 hidden text-lg text-[#FFD21E] sm:inline"
            >
              ★
            </span>
          </div>
        </div>

        {/* Mode Switcher */}
        <div
          role="tablist"
          aria-label="플레이 방식 선택"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-[3px] border-[#2B2857] bg-[#1D1B3D] p-1 shadow-[0_6px_0_#15132d]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={lobbyMode === 'local'}
            onClick={() => onLobbyModeChange('local')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
              lobbyMode === 'local'
                ? 'bg-[#FFD21E] text-[#121026] shadow-[0_2px_0_#9E7D00]'
                : 'text-white/75 hover:text-white'
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
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
              lobbyMode === 'online'
                ? 'bg-[#FF61D2] text-[#121026] shadow-[0_2px_0_#A62983]'
                : 'text-white/75 hover:text-white'
            }`}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>온라인 친구 대전</span>
            {onlineRoom && (
              <span className="ml-0.5 rounded-md bg-[#121026] px-1.5 py-0.5 font-mono text-[10px] text-[#FFD21E]">
                {onlineRoom.roomCode}
              </span>
            )}
          </button>
        </div>
      </section>

      {lobbyMode === 'online' ? (
        <section className="mt-3 min-h-0 flex-1 sm:mt-4">
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
          className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
        >
          {games.map((game, index) => {
            const Icon = game.icon;
            const spanLastOnMd =
              index === games.length - 1 ? 'sm:col-span-2 lg:col-span-2' : '';

            return (
              <article
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className={`arcade-card group flex cursor-pointer items-center justify-between gap-3 rounded-[24px] p-3.5 sm:flex-col sm:items-stretch sm:justify-between sm:p-5 ${spanLastOnMd}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3.5 sm:flex-col sm:items-start sm:gap-2.5">
                  <div
                    className={`arcade-icon-box flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] sm:h-14 sm:w-14 sm:rounded-[20px] ${game.iconBg}`}
                  >
                    <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-white/50 sm:text-[11px]">
                      {game.tag}
                    </span>
                    <h2 className="truncate text-lg font-black leading-tight text-white sm:mt-0.5 sm:text-xl">
                      {game.title}
                    </h2>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/70">
                      {game.desc}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-2 sm:mt-2 sm:border-t sm:border-white/10 sm:pt-3">
                  <span className="hidden truncate font-mono text-[11px] font-bold text-[#6B61FF] sm:inline">
                    {game.meta}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGame(game.id);
                    }}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[#FFD21E] px-3.5 py-1.5 text-xs font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all group-hover:bg-[#FF61D2] group-hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD21E] sm:min-h-10 sm:px-4 whitespace-nowrap shrink-0"
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
