import { useState, type FormEvent } from 'react';
import {
  Check,
  Compass,
  Copy,
  Crown,
  DoorOpen,
  Flag,
  Grid3x3,
  Layers2,
  Link2,
  Loader2,
  Play,
  PlusCircle,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  resetRoomScores,
  selectRoomGame,
  setPlayerReady,
  startRoomGame,
  updatePlayerNickname,
} from '../services/onlineRoom';
import type { OnlineRole, OnlineRoomData, SelectableGameId } from '../types/online';

interface OnlineLobbyPanelProps {
  nickname: string;
  onNicknameChange: (name: string) => void;
  room: OnlineRoomData | null;
  myRole: OnlineRole | null;
  initialJoinCode?: string;
  isBusy: boolean;
  errorMessage: string | null;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onClearError: () => void;
}

const ONLINE_GAMES: Array<{
  id: SelectableGameId;
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
  accent: string;
}> = [
  {
    id: 'WORD_GAME',
    title: '말결',
    subtitle: '방장 AI 대리 채점 추리',
    icon: Sparkles,
    accent: 'text-sky-400',
  },
  {
    id: 'FLAG_GAME',
    title: '국기 기억력',
    subtitle: '공통 10국기 스피드 매치',
    icon: Flag,
    accent: 'text-emerald-400',
  },
  {
    id: 'WALLBADUK_GAME',
    title: '벽바둑 2',
    subtitle: '1:1 턴제 영토 분리전',
    icon: Grid3x3,
    accent: 'text-amber-300',
  },
  {
    id: 'BLIND_MAZE_GAME',
    title: '블라인드 미로',
    subtitle: '4방향 D-Pad 미로 탈출',
    icon: Compass,
    accent: 'text-violet-300',
  },
  {
    id: 'GRADIENT_CUP_GAME',
    title: '7개의 컵 심리전',
    subtitle: '비공개 라운드 심리 대결',
    icon: Layers2,
    accent: 'text-cyan-300',
  },
];

export function OnlineLobbyPanel({
  nickname,
  onNicknameChange,
  room,
  myRole,
  initialJoinCode = '',
  isBusy,
  errorMessage,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onClearError,
}: OnlineLobbyPanelProps) {
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftRoomName, setDraftRoomName] = useState('');

  const handleJoinSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isBusy) return;
    onJoinRoom(joinCode);
  };

  // Waiting Room View
  if (room && myRole) {
    const p1 = room.players?.P1;
    const p2 = room.players?.P2;
    const p1Online = room.presence?.P1?.online ?? p1?.connected ?? false;
    const p2Online = room.presence?.P2?.online ?? p2?.connected ?? false;
    const scores = room.scores ?? { P1: 0, P2: 0 };

    const myPlayer = myRole === 'P1' ? p1 : p2;
    const myReady = Boolean(myPlayer?.ready);
    const bothJoined = Boolean(p1 && p2);
    const bothReady = Boolean(p1?.ready && p2?.ready);
    const hostRole: OnlineRole =
      room.hostRole === 'P1' || room.hostRole === 'P2'
        ? room.hostRole
        : room.players?.P2?.uid === room.hostUid
          ? 'P2'
          : 'P1';
    const isHost = myRole === hostRole;

    const handleCopyCode = async () => {
      try {
        await navigator.clipboard.writeText(room.roomCode);
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2000);
      } catch {
        // Ignore clipboard errors
      }
    };

    const handleCopyInviteLink = async () => {
      try {
        const inviteUrl = new URL(window.location.href);
        inviteUrl.searchParams.set('room', room.roomCode);
        await navigator.clipboard.writeText(inviteUrl.toString());
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2500);
      } catch {
        // Ignore clipboard errors
      }
    };

    const handleSaveRoomNickname = async () => {
      const clean = draftRoomName.trim();
      setEditingName(false);
      if (!clean) return;
      onNicknameChange(clean);
      await updatePlayerNickname(room.roomCode, myRole, clean);
    };

    return (
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto sm:gap-3 sm:overflow-hidden">
        {/* Toast for Invite Link Copy */}
        {copiedLink && (
          <div
            role="status"
            className="fixed left-1/2 top-13 z-40 -translate-x-1/2 rounded-full border border-emerald-400/60 bg-[#131926]/95 px-4 py-1.5 text-xs font-bold text-emerald-300 shadow-xl backdrop-blur-md whitespace-nowrap"
          >
            초대 링크가 복사되었습니다!
          </div>
        )}

        {/* Top Room Code & Cumulative Scoreboard Banner */}
        <div className="shrink-0 rounded-xl border border-slate-800 bg-[#131926] p-2.5 sm:rounded-2xl sm:p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">방 코드</span>
              <span className="rounded-lg border border-sky-400/45 bg-sky-500/12 px-2.5 py-0.5 font-mono text-base font-extrabold tracking-widest text-sky-300 sm:text-lg">
                {room.roomCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-700 bg-[#0B0F17] px-2 py-1 text-[11px] font-semibold text-slate-200 transition-colors hover:border-sky-400/60 whitespace-nowrap"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span className="text-emerald-300">복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>코드 복사</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-500/45 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 whitespace-nowrap"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>초대 링크 복사</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onLeaveRoom}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 whitespace-nowrap"
            >
              <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>방 나가기</span>
            </button>
          </div>

          {/* Cumulative Scoreboard Bar */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-[#0B0F17] px-3 py-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">
              <span className="text-sky-300">
                P1({p1?.nickname ?? '대기 중'})
              </span>
              <span className="font-mono font-extrabold text-slate-100 tabular-nums">
                {scores.P1 ?? 0}승
              </span>
              <span className="text-slate-600">:</span>
              <span className="font-mono font-extrabold text-slate-100 tabular-nums">
                {scores.P2 ?? 0}승
              </span>
              <span className="text-rose-300">
                P2({p2?.nickname ?? '대기 중'})
              </span>
            </div>

            {isHost && (
              <button
                type="button"
                onClick={() => void resetRoomScores(room.roomCode)}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>전적 초기화</span>
              </button>
            )}
          </div>
        </div>

        {/* Main 2-Column Waiting Room Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-12 sm:gap-3.5">
          {/* Left: Players & Ready Control */}
          <section className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-[#131926] p-3 sm:col-span-5 sm:rounded-2xl sm:p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-200 sm:text-sm">
                  참가자 대기 현황
                </h2>
                <span className="font-mono text-[11px] text-slate-400">
                  {bothJoined ? '2/2 입장' : '1/2 대기'}
                </span>
              </div>

              {/* P1 Card */}
              <div
                className={`rounded-xl border p-2.5 sm:p-3 ${
                  p1
                    ? 'border-sky-500/35 bg-[#0B0F17]'
                    : 'border-dashed border-slate-800 bg-[#0B0F17]/60'
                }`}
              >
                {p1 ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-400 font-mono text-[11px] font-extrabold text-slate-950">
                        P1
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          {hostRole === 'P1' && (
                            <Crown className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
                          )}
                          <span className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                            {p1.nickname}
                          </span>
                          {myRole === 'P1' && (
                            <span className="text-[10px] font-semibold text-sky-400">(나)</span>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">
                          {p1Online ? '🟢 접속 중' : '🟡 일시 이탈'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        p1.ready
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p1.ready ? '준비 완료' : '대기 중'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />
                    <span>새로운 참가자의 입장을 기다리는 중...</span>
                  </div>
                )}
              </div>

              {/* P2 Card */}
              <div
                className={`rounded-xl border p-2.5 sm:p-3 ${
                  p2
                    ? 'border-rose-500/35 bg-[#0B0F17]'
                    : 'border-dashed border-slate-800 bg-[#0B0F17]/60'
                }`}
              >
                {p2 ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-400 font-mono text-[11px] font-extrabold text-slate-950">
                        P2
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          {hostRole === 'P2' && (
                            <Crown className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
                          )}
                          <span className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                            {p2.nickname}
                          </span>
                          {myRole === 'P2' && (
                            <span className="text-[10px] font-semibold text-rose-400">(나)</span>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">
                          {p2Online ? '🟢 접속 중' : '🟡 일시 이탈'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        p2.ready
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p2.ready ? '준비 완료' : '대기 중'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />
                    <span>친구의 입장을 기다리는 중...</span>
                  </div>
                )}
              </div>

              {/* Quick inline nickname edit for current player (helpful when P2 auto-joins via invite link) */}
              {editingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveRoomNickname();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={draftRoomName}
                    onChange={(e) => setDraftRoomName(e.target.value)}
                    maxLength={12}
                    autoFocus
                    placeholder="새 닉네임"
                    className="min-h-8 min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#0B0F17] px-2.5 text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="min-h-8 rounded-lg bg-sky-400 px-2.5 text-xs font-bold text-slate-950"
                  >
                    저장
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDraftRoomName(myPlayer?.nickname ?? nickname);
                    setEditingName(true);
                  }}
                  className="text-[11px] text-slate-400 underline-offset-2 hover:text-sky-300 hover:underline"
                >
                  내 닉네임 변경 ({myPlayer?.nickname ?? nickname})
                </button>
              )}
            </div>

            {/* Ready Toggle Button */}
            <button
              type="button"
              onClick={() => void setPlayerReady(room.roomCode, myRole, !myReady)}
              className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors sm:text-sm ${
                myReady
                  ? 'border border-emerald-400 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
              }`}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>{myReady ? '준비 완료됨 (취소)' : '준비 완료'}</span>
            </button>
          </section>

          {/* Right: 5-Game Selector + Host Start Button */}
          <section className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-[#131926] p-3 sm:col-span-7 sm:rounded-2xl sm:p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-slate-200 sm:text-sm">
                  대전 게임 선택
                </h2>
                <span className="text-[11px] text-slate-400">
                  {isHost ? '방장이 게임을 선택하세요' : `방장(${hostRole})이 선택한 게임`}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-2.5 sm:grid-cols-3 sm:gap-2">
                {ONLINE_GAMES.map((g) => {
                  const Icon = g.icon;
                  const selected = room.selectedGame === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => void selectRoomGame(room.roomCode, g.id)}
                      className={`flex flex-col items-start rounded-xl border p-2 text-left transition-colors sm:p-2.5 ${
                        selected
                          ? 'border-sky-400 bg-sky-500/15'
                          : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                      } ${!isHost ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <div className={`flex items-center gap-1.5 text-xs font-bold ${g.accent}`}>
                        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{g.title}</span>
                      </div>
                      <span className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                        {g.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={!bothJoined || !bothReady}
                onClick={() => void startRoomGame(room.roomCode)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:min-h-12 sm:text-sm"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>
                  {!bothJoined
                    ? '상대방 입장 대기 중...'
                    : !bothReady
                      ? '양쪽 모두 준비 완료 시 시작 가능'
                      : '양쪽 동시 게임 시작!'}
                </span>
              </button>
            ) : (
              <div className="flex min-h-11 items-center justify-center rounded-xl border border-slate-800 bg-[#0B0F17] px-4 py-2 text-center text-xs font-semibold text-slate-300">
                {myReady
                  ? `방장(${hostRole})이 게임을 시작하기를 기다리는 중...`
                  : '위에서 [준비 완료] 버튼을 눌러주세요.'}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Create or Join Room Screen
  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto sm:justify-center sm:gap-4 sm:overflow-hidden">
      {/* Nickname Input */}
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-slate-800 bg-[#131926] p-3 sm:rounded-2xl sm:p-4">
        <label
          htmlFor="online-nickname-input"
          className="block text-xs font-semibold text-slate-300"
        >
          내 플레이어 닉네임 (자동 저장)
        </label>
        <input
          id="online-nickname-input"
          type="text"
          maxLength={12}
          value={nickname}
          onChange={(e) => {
            if (errorMessage) onClearError();
            onNicknameChange(e.target.value);
          }}
          placeholder="예: 홍길동"
          className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mx-auto w-full max-w-2xl rounded-xl border border-rose-500/45 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      {/* Create vs Join Cards */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
        <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#131926] p-4 sm:rounded-2xl sm:p-5">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              <span>방장(P1)으로 방 개설</span>
            </div>
            <h2 className="mt-1.5 text-base font-bold text-slate-100 sm:text-lg">
              새 방 만들기
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              4자리 방 코드와 초대 링크를 생성해 친구와 5가지 두뇌 게임을 실시간으로 겨루세요.
            </p>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={onCreateRoom}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:opacity-60 sm:text-sm"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>방 생성 중...</span>
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                <span>방 만들기</span>
              </>
            )}
          </button>
        </div>

        <form
          onSubmit={handleJoinSubmit}
          className="flex flex-col justify-between rounded-xl border border-slate-800 bg-[#131926] p-4 sm:rounded-2xl sm:p-5"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>참가자(P2)로 합류</span>
            </div>
            <h2 className="mt-1.5 text-base font-bold text-slate-100 sm:text-lg">
              방 코드로 입장
            </h2>
            <label htmlFor="join-room-code-input" className="sr-only">
              4자리 방 코드
            </label>
            <input
              id="join-room-code-input"
              type="text"
              maxLength={4}
              value={joinCode}
              onChange={(e) => {
                if (errorMessage) onClearError();
                setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              }}
              placeholder="4자리 코드 (예: A7K9)"
              className="mt-2.5 min-h-11 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3 py-2 text-center font-mono text-lg font-extrabold tracking-widest uppercase text-slate-100 placeholder:text-xs placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isBusy || joinCode.trim().length !== 4}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:text-sm"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>입장 중...</span>
              </>
            ) : (
              <span>코드로 입장</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
