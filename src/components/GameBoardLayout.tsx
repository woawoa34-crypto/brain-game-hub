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
      const isFoldOrDesktop = window.innerWidth >= 680;
      const avail = isFoldOrDesktop
        ? Math.min(rect.width, rect.height, maxPx)
        : Math.min(rect.width, Math.max(240, window.innerHeight * 0.54), maxPx);
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
      className={`flex w-full min-h-0 min-w-0 items-center justify-center min-[680px]:h-full ${className}`}
    >
      <div
        style={{ width: `${size}px`, height: `${size}px` }}
        className="max-w-full shrink-0"
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
    <div className="mx-auto flex w-full max-w-6xl flex-col overflow-y-auto px-3 py-2 text-sm min-[680px]:h-full min-[680px]:overflow-hidden min-[680px]:px-5 min-[680px]:py-2.5">
      {/* Optional standalone 44px fixed slim header */}
      {(title || onBackToLobby) && (
        <div className="mb-1.5 flex h-11 shrink-0 items-center justify-between gap-2 rounded-2xl border-[3px] border-[#2B2857] bg-[#1D1B3D] px-2.5 shadow-[0_4px_0_#15132d] sm:px-3.5">
          <div className="flex min-w-0 items-center gap-2">
            {onBackToLobby && (
              <button
                type="button"
                onClick={onBackToLobby}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2.5 text-xs font-bold text-white transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#FF61D2]" aria-hidden="true" />
                <span>로비로</span>
              </button>
            )}
            {title && (
              <h2 className="truncate font-display text-base font-bold text-[#FFD21E] sm:text-lg">
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
                className="inline-flex h-8 items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 text-xs font-bold text-white transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
              >
                <HelpCircle className="h-3.5 w-3.5 text-[#FFD21E]" aria-hidden="true" />
                <span>룰북</span>
              </button>
            )}
            {onTogglePause && (
              <button
                type="button"
                onClick={onTogglePause}
                aria-label={isPaused ? '게임 재개' : '일시정지'}
                className={`inline-flex h-8 items-center gap-1 rounded-xl border-2 px-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
                  isPaused
                    ? 'border-[#C7A100] bg-[#FFD21E] text-[#121026]'
                    : 'border-[#2B2857] bg-[#121026] text-white hover:border-[#6B61FF]'
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
              className={`inline-flex h-8 items-center gap-1 rounded-xl border-2 px-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
                isFullscreen
                  ? 'border-[#5349D9] bg-[#6B61FF] text-white'
                  : 'border-[#2B2857] bg-[#121026] text-white hover:border-[#6B61FF]'
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

      {/* Main Split Table (>= 680px: 65% Left / 35% Right; < 680px: Vertical Scrollable Stack) */}
      <div className="mt-1.5 flex flex-col gap-2 min-[680px]:mt-2.5 min-[680px]:min-h-0 min-[680px]:flex-1 min-[680px]:flex-row min-[680px]:gap-4">
        <section
          className={`flex min-w-0 flex-col min-[680px]:min-h-0 min-[680px]:w-[65%] min-[680px]:flex-none ${
            scrollableMain
              ? 'max-h-[46dvh] overflow-y-auto pr-0.5 min-[680px]:max-h-none'
              : 'items-center justify-center min-[680px]:overflow-hidden'
          }`}
        >
          {resolvedBoard}
        </section>

        <aside className="flex shrink-0 flex-col justify-center gap-2 pb-4 min-[680px]:w-[35%] min-[680px]:min-h-0 min-[680px]:justify-start min-[680px]:overflow-y-auto min-[680px]:pb-0">
          {resolvedControl}
          {onlineReactionBar}
        </aside>
      </div>
    </div>
  );
}
