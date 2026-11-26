import { motion } from 'motion/react';
import { getSimilarityLabel, getSimilarityTier, type HintEntry } from '../types';

interface HintRowProps {
  hint: HintEntry;
  rank: number;
  isLatest: boolean;
  onSelectForGuess?: (word: string) => void;
}

export function HintRow({ hint, rank, isLatest, onSelectForGuess }: HintRowProps) {
  const tier = getSimilarityTier(hint.similarity);
  const label = getSimilarityLabel(hint.similarity);

  const barColor =
    tier === 'high'
      ? 'bg-[#FF61D2]'
      : tier === 'medium'
        ? 'bg-[#FFD21E]'
        : 'bg-white/40';

  const scoreTextColor =
    tier === 'high'
      ? 'text-[#FF61D2]'
      : tier === 'medium'
        ? 'text-[#FFD21E]'
        : 'text-white/65';

  const tierTextColor =
    tier === 'high'
      ? 'text-[#FF61D2]'
      : tier === 'medium'
        ? 'text-[#FFD21E]'
        : 'text-white/60';

  const scaleX = Math.max(0.02, Math.min(1, hint.similarity / 100));

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`group rounded-2xl border-2 px-4 py-3 transition-colors duration-150 ${
        isLatest
          ? 'border-[#FFD21E] bg-[#1D1B3D] shadow-[0_4px_0_#9E7D00]'
          : 'border-[#2B2857] bg-[#1D1B3D] hover:border-[#6B61FF]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="w-6 shrink-0 font-mono text-xs font-bold tabular-nums text-white/50">
            {rank}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="truncate text-base font-bold text-white">
                {hint.word}
              </span>
              {isLatest && (
                <span className="font-mono text-xs font-bold text-[#FFD21E] whitespace-nowrap">
                  방금 입력
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-white/70">
              <span className={tierTextColor}>{label}</span>
              <span aria-hidden="true" className="text-white/35">·</span>
              <span className="font-mono tabular-nums text-white/50">
                #{hint.order}
              </span>
              {hint.reason && (
                <>
                  <span aria-hidden="true" className="text-white/35">·</span>
                  <span className="truncate text-white/85">{hint.reason}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {onSelectForGuess && (
            <button
              type="button"
              onClick={() => onSelectForGuess(hint.word)}
              className="hidden sm:inline-flex items-center rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2.5 py-1 text-xs font-bold text-white opacity-0 transition-all duration-150 hover:border-[#6B61FF] hover:bg-[#6B61FF] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#FFD21E] group-hover:opacity-100 whitespace-nowrap shrink-0"
              title="이 단어를 정답 도전 입력창에 채우기"
            >
              정답 도전
            </button>
          )}
          <span className={`font-mono text-lg font-bold tabular-nums tracking-tight ${scoreTextColor}`}>
            {hint.similarity.toFixed(1)}%
          </span>
        </div>
      </div>

      <div
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#121026]"
        role="progressbar"
        aria-valuenow={Math.round(hint.similarity)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${hint.word} 유사도 ${hint.similarity.toFixed(1)}% (${label})`}
      >
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-out ${barColor}`}
          style={{ transform: `scaleX(${scaleX})` }}
        />
      </div>
    </motion.li>
  );
}
