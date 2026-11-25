import { useEffect, useRef, useState, type ReactNode } from 'react';

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
        setSize(Math.max(160, Math.floor(avail)));
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
  /** Ultra-slim top bar (back/turn/timer/score) */
  topBar: ReactNode;
  /** Left 65% on Fold 8 unfolded (>=640px) / Middle main stage on Fold 8 cover (<640px) */
  mainStage: ReactNode;
  /** Right 35% on Fold 8 unfolded (>=640px) / Bottom thumb pad on Fold 8 cover (<640px) */
  controlPanel: ReactNode;
  /** Optional notice banner rendered cleanly without breaking 100dvh */
  noticeBar?: ReactNode;
  /** Allow mainStage internal scroll (for text lists like Malgyeol) */
  scrollableMain?: boolean;
}

/**
 * Shared one-screen (100dvh, overflow-hidden) responsive frame for Galaxy Z Fold 8:
 * - Unfolded / Tablet / PC (>= 640px): 65% Left Main Stage + 35% Right Control Panel
 * - Cover Screen / Narrow Mobile (< 640px): 3-tier Top HUD -> Middle Board -> Bottom Thumb Controls
 */
export function GameBoardLayout({
  topBar,
  mainStage,
  controlPanel,
  noticeBar,
  scrollableMain = false,
}: GameBoardLayoutProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-2.5 py-2 sm:px-5 sm:py-3">
      {/* Top HUD */}
      <div className="shrink-0">{topBar}</div>

      {noticeBar && <div className="mt-1.5 shrink-0">{noticeBar}</div>}

      {/* Main Split Table (>= 640px: 65% Left / 35% Right; < 640px: Middle / Bottom) */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 sm:mt-3 sm:flex-row sm:gap-4">
        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col sm:w-[65%] sm:flex-none ${
            scrollableMain ? 'overflow-y-auto pr-0.5' : 'overflow-hidden justify-center'
          }`}
        >
          {mainStage}
        </section>

        <aside className="flex shrink-0 flex-col justify-center sm:w-[35%] sm:min-h-0 sm:justify-start sm:overflow-y-auto">
          {controlPanel}
        </aside>
      </div>
    </div>
  );
}
