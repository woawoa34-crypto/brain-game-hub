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
      className="grid grid-cols-4 gap-1.5 rounded-2xl border-2 border-[#2B2857] bg-[#1D1B3D] p-1.5 shadow-[0_4px_0_#15132d]"
      aria-label="빠른 이모지 리액션"
    >
      {REACTION_PRESETS.map((label) => (
        <button
          key={label}
          type="button"
          disabled={coolingDown}
          onClick={() => void handleReact(label)}
          className="min-h-8 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-1 py-1 text-[11px] font-bold text-white transition-all hover:border-[#6B61FF] hover:bg-[#6B61FF] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
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
      className="pointer-events-none fixed left-1/2 top-14 z-40 -translate-x-1/2 px-3"
    >
      <div className="flex items-center gap-2 rounded-2xl border-[3px] border-[#FFD21E] bg-[#1D1B3D] px-4 py-1.5 text-xs font-bold text-white shadow-[0_6px_0_#15132d]">
        <span className="text-[#FF61D2]">{visibleReaction.sender}</span>
        <span className="text-white/50">:</span>
        <span className="text-sm">{visibleReaction.text}</span>
      </div>
    </div>
  );
}
