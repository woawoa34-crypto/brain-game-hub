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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-exit-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-[#131926] p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2
          id="confirm-exit-title"
          className="mt-4 text-base font-bold text-slate-50 sm:text-lg"
        >
          진행 중인 게임을 종료하고 나가시겠습니까?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          {isOnline
            ? '대기실로 돌아가면 방과 누적 전적이 유지되며, 방을 완전히 나가면 연결이 종료됩니다.'
            : '현재 진행 중인 라운드 기록은 저장되지 않습니다.'}
        </p>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 sm:text-sm"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            <span>계속 플레이</span>
          </button>

          {isOnline && onReturnToWaitingRoom && (
            <button
              type="button"
              onClick={onReturnToWaitingRoom}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-[#0B0F17] px-4 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 sm:text-sm"
            >
              <Home className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <span>대기실로 돌아가기</span>
            </button>
          )}

          <button
            type="button"
            onClick={onConfirmExit}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 sm:text-sm"
          >
            <DoorOpen className="h-4 w-4" aria-hidden="true" />
            <span>{isOnline ? '방 완전히 나가기' : '로비로 나가기'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
