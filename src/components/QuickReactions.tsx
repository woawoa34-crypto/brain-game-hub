import { useEffect, useRef, useState } from 'react';
import { sendRoomReaction } from '../services/onlineRoom';
import type { OnlineReactionPayload } from '../types/online';

const REACTION_PRESETS = ['😱 헉!', '😂 ㅋㅋㅋ', '🤔 음...', '🔥 가자!'] as const;
const COOLDOWN_MS = 1500;
const TOAST_DURATION_MS = 2500;

interface QuickReactionBarProps {
  roomCode: string;
  myNickname: string;
}

export function QuickReactionBar({ roomCode, myNickname }: QuickReactionBarProps) {
  const [coolingDown, setCoolingDown] = useState(false);

  const handleReact = async (text: string) => {
    if (coolingDown) return;
    setCoolingDown(true);
    window.setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
    try {
      await sendRoomReaction(roomCode, myNickname, text);
    } catch {
      // Ignore transient reaction network failure
    }
  };

  return (
    <div
      className="grid grid-cols-4 gap-1 rounded-xl border border-slate-800/90 bg-[#131926]/90 p-1.5"
      aria-label="빠른 이모지 리액션"
    >
      {REACTION_PRESETS.map((label) => (
        <button
          key={label}
          type="button"
          disabled={coolingDown}
          onClick={() => void handleReact(label)}
          className="min-h-8 rounded-lg border border-slate-800 bg-[#0B0F17] px-1 py-1 text-[11px] font-semibold text-slate-200 transition-all hover:border-sky-400/60 hover:bg-sky-500/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface ReactionToastProps {
  reaction: OnlineReactionPayload | null | undefined;
}

export function ReactionToast({ reaction }: ReactionToastProps) {
  const [visibleReaction, setVisibleReaction] = useState<OnlineReactionPayload | null>(null);
  const lastShownIdRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!reaction || !reaction.id) return;
    if (reaction.id <= lastShownIdRef.current) return;
    // Ignore stale reactions from earlier sessions older than 5s before mount
    if (reaction.id < mountedAtRef.current - 5000) {
      lastShownIdRef.current = reaction.id;
      return;
    }

    lastShownIdRef.current = reaction.id;
    setVisibleReaction(reaction);

    const timer = window.setTimeout(() => {
      setVisibleReaction((cur) => (cur?.id === reaction.id ? null : cur));
    }, TOAST_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [reaction]);

  if (!visibleReaction) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-13 z-40 -translate-x-1/2 px-3"
    >
      <div className="flex items-center gap-2 rounded-full border border-sky-400/60 bg-[#131926]/95 px-4 py-1.5 text-xs font-bold text-slate-100 shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <span className="text-sky-300">{visibleReaction.sender}</span>
        <span className="text-slate-500">:</span>
        <span className="text-sm">{visibleReaction.text}</span>
      </div>
    </div>
  );
}
