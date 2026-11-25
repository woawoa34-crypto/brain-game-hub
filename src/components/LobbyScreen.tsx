import { ArrowRight, Compass, Flag, Grid3x3, Layers2, Sparkles } from 'lucide-react';
import type { ActiveGame } from '../types';

interface LobbyScreenProps {
  savedApiKey: string;
  hasServerKey: boolean;
  onSelectGame: (game: Exclude<ActiveGame, 'LOBBY'>) => void;
}

export function LobbyScreen({
  savedApiKey,
  hasServerKey,
  onSelectGame,
}: LobbyScreenProps) {

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-medium text-sky-400">
          한국어 두뇌 서바이벌 미니게임 허브
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-50 sm:text-5xl [text-wrap:balance]">
          어휘 추리와 순간 기억력, 전략 심리전에 도전하세요
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base [text-wrap:balance]">
          말결, 국기 기억력 테스트, 벽바둑 2, 블라인드 미로 탈출, 그라데이션 컵 심리전까지
          다섯 가지 두뇌 서바이벌 게임을 한 곳에서 즐길 수 있습니다.
        </p>
      </section>

      {/* Five Game Selection Cards */}
      <section
        aria-label="미니게임 선택"
        className="mt-10 grid grid-cols-1 items-stretch gap-6 md:grid-cols-2"
      >
        {/* Game 1: 말결 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-sky-400">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 1 · Gemini 임베딩 추리</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              말결 (AI 유사어 추리)
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              출제자 모드 또는 AI 솔로 모드로 숨겨진 정답 단어를 맞혀보세요.
              힌트 단어를 입력하면 <span className="font-mono text-xs text-slate-300">gemini-embedding-001</span>이
              의미 유사도를 0%~100%로 계산해 높은 순으로 정렬합니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>출제자 & 솔로 모드</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                {savedApiKey || hasServerKey ? 'API 연결 준비됨' : 'Gemini API 키 필요'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('WORD_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <span>말결 플레이하기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Game 2: 국기 기억력 테스트 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <Flag className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 2 · 순간 시각 기억력</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              국기 기억력 테스트
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              빠르게 지나가는 10개의 실제 국기를 지정한 사이클만큼 반복 관찰한 뒤,
              5×5 배열의 25개 국기 중 앞서 본 5개 국기를 정확히 찾아내는 집중력 게임입니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>70개국 실제 국기</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-emerald-300/90">API 키 없이 바로 실행</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('FLAG_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 whitespace-nowrap"
            >
              <span>국기 기억력 테스트 시작</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Game 3: 벽바둑 2 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
              <Grid3x3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 3 · 영역 분리 전략</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              벽바둑 2
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              7×7 보드 위에서 사각·원형 말을 움직이고 벽을 설치해 영역을 분리하세요.
              1라운드 3인전(벽 부수기 1회)과 2라운드 1:1 결승전, 로컬 멀티 및 AI 봇을 지원합니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>로컬 대전 & AI 봇</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-amber-300/90">API 키 없이 바로 실행</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('WALLBADUK_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 whitespace-nowrap"
            >
              <span>벽바둑 2 시작하기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Game 4: 블라인드 미로 탈출 */}
        <article className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-violet-300">
              <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 4 · 인지 지도 & 시점 회전</span>
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-50">
              블라인드 미로 탈출
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              3~5초간 공개되는 6×6·7×7 미로를 기억한 뒤, 어둠 속에서 [좌회전 90°]·[전진]·[우회전 90°]만으로
              출구를 찾으세요. 솔로 타임어택과 2인 턴제 레이스를 지원합니다.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>솔로 타임어택 & 2인 레이스</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-violet-300/90">API 키 없이 바로 실행</span>
            </div>

            <button
              type="button"
              onClick={() => onSelectGame('BLIND_MAZE_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 whitespace-nowrap"
            >
              <span>블라인드 미로 시작하기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>

        {/* Game 5: 그라데이션 컵 심리전 */}
        <article className="flex flex-col justify-between gap-6 rounded-2xl border border-slate-800 bg-[#131926] p-6 transition-colors duration-150 hover:border-slate-700 sm:p-7 md:col-span-2 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
              <Layers2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>게임 5 · 7개의 컵 색상 심리전</span>
            </div>
            <h2 className="mt-2.5 text-xl font-bold text-slate-50">
              그라데이션 컵 심리전 (7개의 컵)
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              양 끝(1·7번)이 가장 짙고 가운데(4번)가 가장 옅은 대칭 색상의 7개 컵에
              0~9 숫자를 비내림차순(총합 30 이하)으로 배치한 뒤, 가림막 위 컵 색상만 보고 수 싸움을 펼치세요.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>1인 vs AI 봇 & 2인 로컬 대전</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-cyan-300/90">API 키 없이 바로 실행</span>
            </div>
          </div>

          <div className="shrink-0 md:w-64">
            <button
              type="button"
              onClick={() => onSelectGame('GRADIENT_CUP_GAME')}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors duration-150 hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 whitespace-nowrap"
            >
              <span>7개의 컵 시작하기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
