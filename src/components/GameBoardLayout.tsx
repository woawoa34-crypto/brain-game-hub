import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, HelpCircle, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';

interface SquareBoardBoxProps {
  children: ReactNode;
  maxPx?: number;
  className?: string;
}

/**
 * Measures available parent width & height via ResizeObserver and sizes
 * a crisp 1:1 square container to min(width, height, maxPx) so board grids
 * never clip, squash, or trigger vertical overflow on Fold 8 cover or main screens.
 */
export function SquareBoardBox({
  children,
  maxPx = 640,
  className = '',
}: SquareBoardBoxProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<number>(280);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const avail = Math.min(rect.width, rect.height, maxPx);
      if (avail > 0) {
        setSize(Math.max(150, Math.floor(avail)));
      }
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [maxPx]);

  return (
    <div
      ref={hostRef}
      className={`flex h-full w-full min-h-0 min-w-0 items-center justify-center ${className}`}
    >
      <div
        style={{ width: `${size}px`, height: `${size}px` }}
        className="shrink-0"
      >
        {children}
      </div>
    </div>
  );
}

interface GameBoardLayoutProps {
  /** Optional built-in 44px slim header title (rendered when `onBackToLobby` is also provided) */
  title?: string;
  /** Optional back-to-lobby handler for standalone 44px slim header */
  onBackToLobby?: () => void;
  /** Optional extra content placed on the right side of the 44px header before Pause/Fullscreen buttons */
  headerRightExtra?: ReactNode;
  /** Optional rulebook quick popup handler */
  onOpenRulebook?: () => void;
  /** Optional pause toggle support for built-in header */
  isPaused?: boolean;
  onTogglePause?: () => void;
  /** In-game status bar (turn, timer, score) */
  topBar?: ReactNode;
  /** Left 65% on Fold 8 unfolded (>=640px) / Middle main stage on Fold 8 cover (<640px) */
  boardArea?: ReactNode;
  /** Right 35% on Fold 8 unfolded (>=640px) / Bottom thumb pad on Fold 8 cover (<640px) */
  controlArea?: ReactNode;
  /** Alias for boardArea */
  mainStage?: ReactNode;
  /** Alias for controlArea */
  controlPanel?: ReactNode;
  /** Optional compact quick-reaction bar displayed cleanly in online matches */
  onlineReactionBar?: ReactNode;
  /** Optional notice banner rendered cleanly without breaking 100dvh */
  noticeBar?: ReactNode;
  /** Allow boardArea internal scroll (for text lists like Malgyeol) */
  scrollableMain?: boolean;
}

/**
 * Shared one-screen (100dvh, overflow-hidden) responsive frame for Galaxy Z Fold 8:
 * - Unfolded / Tablet / PC (>= 640px): 65% Left Board Area + 35% Right Control Area
 * - Cover Screen / Narrow Mobile (< 640px): 3-tier Top HUD -> Middle Board -> Bottom Thumb Controls
 */
export function GameBoardLayout({
  title,
  onBackToLobby,
  headerRightExtra,
  onOpenRulebook,
  isPaused,
  onTogglePause,
  topBar,
  boardArea,
  controlArea,
  mainStage,
  controlPanel,
  onlineReactionBar,
  noticeBar,
  scrollableMain = false,
}: GameBoardLayoutProps) {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const resolvedBoard = boardArea ?? mainStage;
  const resolvedControl = controlArea ?? controlPanel;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-2.5 py-1.5 sm:px-5 sm:py-2.5">
      {/* Optional standalone 44px fixed slim header */}
      {(title || onBackToLobby) && (
        <div className="mb-1.5 flex h-11 shrink-0 items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-[#131926] px-2.5 sm:px-3.5">
          <div className="flex min-w-0 items-center gap-2">
            {onBackToLobby && (
              <button
                type="button"
                onClick={onBackToLobby}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-slate-800/90 px-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 hover:text-white whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                <span>로비로</span>
              </button>
            )}
            {title && (
              <h2 className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                {title}
              </h2>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {headerRightExtra}
            {onOpenRulebook && (
              <button
                type="button"
                onClick={onOpenRulebook}
                aria-label="10초 요약 룰북 열기"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap"
              >
                <HelpCircle className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                <span>룰북</span>
              </button>
            )}
            {onTogglePause && (
              <button
                type="button"
                onClick={onTogglePause}
                aria-label={isPaused ? '게임 재개' : '일시정지'}
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  isPaused
                    ? 'border-amber-400/70 bg-amber-400/20 text-amber-200'
                    : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>재개</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>일시정지</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? '창 모드로 전환' : '전체 화면으로 전환'}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                isFullscreen
                  ? 'border-sky-400/60 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                  : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>창 모드</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>전체 화면</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Top HUD */}
      {topBar && <div className="shrink-0">{topBar}</div>}

      {noticeBar && <div className="mt-1.5 shrink-0">{noticeBar}</div>}

      {/* Main Split Table (>= 640px: 65% Left / 35% Right; < 640px: Middle / Bottom) */}
      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-2 sm:mt-2.5 sm:flex-row sm:gap-4">
        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col sm:w-[65%] sm:flex-none ${
            scrollableMain ? 'overflow-y-auto pr-0.5' : 'overflow-hidden justify-center'
          }`}
        >
          {resolvedBoard}
        </section>

        <aside className="flex shrink-0 flex-col justify-center gap-2 sm:w-[35%] sm:min-h-0 sm:justify-start sm:overflow-y-auto">
          {resolvedControl}
          {onlineReactionBar}
        </aside>
      </div>
    </div>
  );
}
