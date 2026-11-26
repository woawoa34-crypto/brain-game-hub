import { AlertTriangle, DoorOpen, Home, Play } from 'lucide-react';

interface ConfirmExitModalProps {
  open: boolean;
  isOnline: boolean;
  onCancel: () => void;
  onReturnToWaitingRoom?: () => void;
  onConfirmExit: () => void;
}

export function ConfirmExitModal({
  open,
  isOnline,
  onCancel,
  onReturnToWaitingRoom,
  onConfirmExit,
}: ConfirmExitModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#121026]/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-exit-title"
      onClick={onCancel}
    >
      <div
        className="arcade-panel w-full max-w-sm rounded-3xl p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="arcade-icon-box mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFD21E] text-[#121026]">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2
          id="confirm-exit-title"
          className="font-display mt-4 text-xl font-bold text-white sm:text-2xl"
        >
          진행 중인 게임을 종료하고 나가시겠습니까?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-white/75">
          {isOnline
            ? '대기실로 돌아가면 방과 누적 전적이 유지되며, 방을 완전히 나가면 연결이 종료됩니다.'
            : '현재 진행 중인 라운드 기록은 저장되지 않습니다.'}
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD21E] px-4 py-2 text-xs font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] active:shadow-none sm:text-sm"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>계속 플레이</span>
          </button>

          {isOnline && onReturnToWaitingRoom && (
            <button
              type="button"
              onClick={onReturnToWaitingRoom}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#6B61FF] px-4 py-2 text-xs font-bold text-white shadow-[0_4px_0_#433AB5] transition-all hover:bg-[#7A71FF] active:translate-y-[2px] active:shadow-none sm:text-sm"
            >
              <Home className="h-4 w-4 text-[#FFD21E]" aria-hidden="true" />
              <span>대기실로 돌아가기</span>
            </button>
          )}

          <button
            type="button"
            onClick={onConfirmExit}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-400/60 bg-rose-500/15 px-4 py-2 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-500/30 sm:text-sm"
          >
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            <span>{isOnline ? '방 완전히 나가기' : '로비로 나가기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
