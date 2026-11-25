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
      ? 'bg-emerald-500'
      : tier === 'medium'
        ? 'bg-amber-400'
        : 'bg-slate-500';

  const scoreTextColor =
    tier === 'high'
      ? 'text-emerald-400'
      : tier === 'medium'
        ? 'text-amber-300'
        : 'text-slate-400';

  const tierTextColor =
    tier === 'high'
      ? 'text-emerald-300/90'
      : tier === 'medium'
        ? 'text-amber-200/85'
        : 'text-slate-400';

  const scaleX = Math.max(0.02, Math.min(1, hint.similarity / 100));

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`group rounded-xl border px-4 py-3 transition-colors duration-150 ${
        isLatest
          ? 'border-sky-500/45 bg-sky-500/[0.07]'
          : 'border-slate-800/80 bg-[#131926] hover:border-slate-700/80'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="w-6 shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-500">
            {rank}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="truncate text-base font-semibold text-slate-100">
                {hint.word}
              </span>
              {isLatest && (
                <span className="text-xs font-medium text-sky-400 whitespace-nowrap">
                  방금 입력
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
              <span className={tierTextColor}>{label}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                #{hint.order}
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-slate-600">·</span>
              <span className="hidden sm:inline font-mono tabular-nums text-slate-500">
                cos {hint.rawCosine.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {onSelectForGuess && (
            <button
              type="button"
              onClick={() => onSelectForGuess(hint.word)}
              className="hidden sm:inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-slate-400 opacity-0 transition-opacity duration-150 hover:bg-slate-800 hover:text-slate-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sky-400 group-hover:opacity-100 whitespace-nowrap shrink-0"
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
        className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800/90"
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
