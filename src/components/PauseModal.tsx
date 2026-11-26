import { Home, Pause, Play, RotateCcw } from 'lucide-react';

interface PauseModalProps {
  open: boolean;
  isOnline: boolean;
  pausedBy?: string | null;
  onResume: () => void;
  onRestartLocal?: () => void;
  onExit: () => void;
}

/**
 * High-opacity blurred anti-cheat pause overlay covering the active game viewport
 * so hidden boards, flags, mazes, or cups cannot be peeked at while paused.
 */
export function PauseModal({
  open,
  isOnline,
  pausedBy,
  onResume,
  onRestartLocal,
  onExit,
}: PauseModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-12 z-40 flex items-center justify-center bg-[#121026]/95 p-4 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
    >
      <div className="arcade-panel w-full max-w-sm rounded-3xl p-6 text-center">
        <div className="arcade-icon-box mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFD21E] text-[#121026]">
          <Pause className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2
          id="pause-modal-title"
          className="font-display mt-4 text-2xl font-bold text-[#FFD21E] sm:text-3xl"
        >
          {isOnline
            ? `${pausedBy || '상대방'}님이 게임을 일시정지했습니다`
            : '게임 일시정지'}
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-white/75 sm:text-sm">
          {isOnline
            ? '양쪽 기기의 모든 제한 시간 타이머와 조작이 안전하게 멈췄습니다.'
            : '진행 중인 타이머가 멈췄으며 보드 화면이 가려졌습니다.'}
        </p>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-4 py-2.5 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] active:shadow-none whitespace-nowrap"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>{isOnline ? '게임 재개' : '계속하기'}</span>
          </button>

          {!isOnline && onRestartLocal && (
            <button
              type="button"
              onClick={onRestartLocal}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#6B61FF] px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#433AB5] transition-all hover:bg-[#7A71FF] active:translate-y-[2px] active:shadow-none whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>처음부터 다시하기</span>
            </button>
          )}

          <button
            type="button"
            onClick={onExit}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-4 py-2.5 text-sm font-bold text-white/80 transition-colors hover:border-[#6B61FF] hover:text-white whitespace-nowrap"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>{isOnline ? '대기실로 나가기' : '로비로 나가기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
