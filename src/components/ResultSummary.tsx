import { useState } from 'react';
import { Check, Copy, Home, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { HintRow } from './HintRow';
import type { GameMode, HintEntry } from '../types';

interface ResultSummaryProps {
  won: boolean;
  mode: GameMode;
  targetWord: string;
  hintCount: number;
  answerAttempts: number;
  totalAttempts: number;
  sortedHints: HintEntry[];
  wrongGuesses: string[];
  isStartingSolo?: boolean;
  onPlaySoloAgain?: () => void;
  onReturnToTitle?: () => void;
  // Optional online multiplayer controls
  isOnline?: boolean;
  isHost?: boolean;
  hostNickname?: string;
  winnerName?: string | null;
  isRematching?: boolean;
  onOnlineRematch?: () => void;
  onReturnToWaitingRoom?: () => void;
}

export function ResultSummary({
  won,
  mode,
  targetWord,
  hintCount,
  answerAttempts,
  totalAttempts,
  sortedHints,
  wrongGuesses,
  isStartingSolo = false,
  onPlaySoloAgain,
  onReturnToTitle,
  isOnline = false,
  isHost = false,
  hostNickname = '방장',
  winnerName = null,
  isRematching = false,
  onOnlineRematch,
  onReturnToWaitingRoom,
}: ResultSummaryProps) {
  const [copied, setCopied] = useState(false);

  const bestHint = sortedHints[0];

  const handleCopySummary = async () => {
    const modeLabel = isOnline
      ? '온라인 1:1 대전'
      : mode === 'solo'
        ? '솔로 플레이'
        : '출제자 모드';
    const topHintLine = bestHint
      ? `최고 유사 힌트: ${bestHint.word} (${bestHint.similarity.toFixed(1)}%)`
      : '힌트 없이 바로 도전';
    const statusLine = isOnline
      ? winnerName
        ? `말결 온라인 승리: ${winnerName}`
        : `말결 온라인 종료`
      : won
        ? `말결 정답 성공 (${modeLabel})`
        : `말결 도전 기록 (${modeLabel})`;
    const text = [
      statusLine,
      `정답: ${targetWord}`,
      `총 시도: ${totalAttempts}회 (힌트 ${hintCount} · 정답 도전 ${answerAttempts})`,
      topHintLine,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="rounded-2xl border border-slate-800 bg-[#131926] p-6 sm:p-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div
              className={`flex items-center gap-2 text-xs font-semibold ${
                won || winnerName ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {(won || winnerName) && <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>
                {isOnline
                  ? winnerName
                    ? `${winnerName}님이 정답을 맞혀 승리했습니다!`
                    : '정답을 공개하며 대결이 종료되었습니다'
                  : won
                    ? '정답을 맞혔습니다'
                    : '정답을 공개했습니다'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-400">
                {isOnline ? '온라인 대전' : mode === 'solo' ? '솔로 플레이' : '출제자 모드'}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-xs font-medium text-slate-400">정답 단어</span>
              <h1 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
                {targetWord || '—'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <span>복사됨</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>결과 복사</span>
                </>
              )}
            </button>

            {isOnline ? (
              <>
                {isHost && onOnlineRematch && (
                  <button
                    type="button"
                    disabled={isRematching}
                    onClick={onOnlineRematch}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span>{isRematching ? '준비 중...' : '같은 게임 바로 재대결'}</span>
                  </button>
                )}
                {onReturnToWaitingRoom && (
                  <button
                    type="button"
                    onClick={onReturnToWaitingRoom}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    <span>대기실로 돌아가기</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {onPlaySoloAgain && (
                  <button
                    type="button"
                    disabled={isStartingSolo}
                    onClick={onPlaySoloAgain}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>{isStartingSolo ? '준비 중...' : '솔로 바로 다시하기'}</span>
                  </button>
                )}
                {onReturnToTitle && (
                  <button
                    type="button"
                    onClick={onReturnToTitle}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span>모드 선택</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isOnline && !isHost && (
          <p className="mt-3 text-xs text-slate-400">
            방장({hostNickname})이 재대결 또는 대기실 복귀를 선택할 수 있습니다.
          </p>
        )}

        {/* Clean unboxed KPI row */}
        <dl className="mt-7 grid grid-cols-2 gap-4 border-t border-slate-800 pt-6 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-400">총 시도 횟수</dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
              {totalAttempts}
              <span className="ml-0.5 font-sans text-sm font-normal text-slate-400">회</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">힌트 탐색</dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
              {hintCount}
              <span className="ml-0.5 font-sans text-sm font-normal text-slate-400">회</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">정답 도전</dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
              {answerAttempts}
              <span className="ml-0.5 font-sans text-sm font-normal text-slate-400">회</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">최고 유사도</dt>
            <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-400">
              {bestHint ? `${bestHint.similarity.toFixed(1)}%` : '—'}
            </dd>
          </div>
        </dl>

        {wrongGuesses.length > 0 && (
          <div className="mt-5 border-t border-slate-800/80 pt-4 text-xs text-slate-400">
            <span>오답 도전 기록: </span>
            <span className="text-slate-300">{wrongGuesses.join(' · ')}</span>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-200">
            힌트 기록 ({sortedHints.length}개)
          </h2>
          <span className="text-xs text-slate-400">유사도 높은 순</span>
        </div>

        {sortedHints.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-[#131926]/60 px-5 py-8 text-center text-sm text-slate-400">
            입력한 힌트 단어가 없습니다.
          </div>
        ) : (
          <ol className="space-y-2.5">
            {sortedHints.map((hint, idx) => (
              <HintRow key={hint.id} hint={hint} rank={idx + 1} isLatest={false} />
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
