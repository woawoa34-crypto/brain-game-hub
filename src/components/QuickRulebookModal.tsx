import { HelpCircle, Lightbulb, Trophy, X } from 'lucide-react';
import type { ActiveGame } from '../types';

type PlayableGame = Exclude<ActiveGame, 'LOBBY'>;

interface RulebookEntry {
  title: string;
  accent: string;
  summaryLines: [string, string, string];
  victoryCondition: string;
  controlTip: string;
}

const QUICK_RULEBOOK_DATA: Record<PlayableGame, RulebookEntry> = {
  WORD_GAME: {
    title: '말결 (AI 유사어 추리)',
    accent: 'text-sky-400',
    summaryLines: [
      '숨겨진 한국어 일반 명사 1개를 연상 힌트로 추리하는 게임입니다.',
      '힌트 단어를 입력하면 AI가 의미적 유사도를 0%~99.9%로 채점합니다.',
      '유사도가 높은 단어를 따라가며 핵심 정답 단어를 좁혀 나가세요.',
    ],
    victoryCondition: '정답 도전 칸에 숨겨진 단어를 정확히 입력해 맞히면 즉시 승리합니다.',
    controlTip: '힌트 목록의 단어를 터치하면 정답 도전 입력창에 자동으로 채워집니다.',
  },
  FLAG_GAME: {
    title: '국기 기억력 테스트',
    accent: 'text-emerald-400',
    summaryLines: [
      '무작위로 선정된 10개국의 국기가 짧은 간격으로 반복 노출됩니다.',
      '노출이 끝나면 5×5 배열에 놓인 25개 국기가 공개됩니다.',
      '25개 중 앞서 화면에 등장했던 5개 국기를 정확히 골라 제출하세요.',
    ],
    victoryCondition: '온라인 대결에서는 더 많은 국기를 맞힌 쪽(동점 시 더 빠른 제출)이 승리합니다.',
    controlTip: '색 배합이나 문양 특징을 짧게 입으로 되뇌며 보면 5개를 훨씬 쉽게 구분할 수 있습니다.',
  },
  WALLBADUK_GAME: {
    title: '벽바둑 2',
    accent: 'text-amber-300',
    summaryLines: [
      '사각 말(■ 직선 1~2칸) 또는 원형 말(● 1칸/90° 꺾어 2칸)을 번갈아 이동합니다.',
      '말을 옮긴 뒤 도착한 칸의 빈 경계선 1곳에 반드시 내 색상의 벽을 설치합니다.',
      '3인전에서는 각자 1회 제한으로 이동 경로의 벽을 부수는 스킬을 쓸 수 있습니다.',
    ],
    victoryCondition: '모든 플레이어가 서로 독립된 영역으로 분리되면 내 말이 속한 총 영토 칸 수가 가장 넓은 쪽이 승리합니다.',
    controlTip: '말을 이동한 뒤 보드 위 초록빛 경계선이나 우측 방향 버튼을 눌러 빠르게 벽을 세우세요.',
  },
  BLIND_MAZE_GAME: {
    title: '블라인드 미로 탈출',
    accent: 'text-violet-300',
    summaryLines: [
      '처음 3~5초 동안만 미로의 벽과 출발(S)·출구(E) 위치가 전체 공개됩니다.',
      '카운트다운이 끝나면 벽과 출구가 어둠 속으로 가려진 채 탐색이 시작됩니다.',
      '상·하·좌·우 4방향 D-Pad(또는 키보드)로 1칸씩 이동하며 벽 충돌 없이 출구(E)를 찾으세요.',
    ],
    victoryCondition: '미로 우측 하단 쪽 출구(E) 칸에 가장 먼저 도달하는 플레이어가 승리합니다.',
    controlTip: '2인 대전에서는 방향키 1회 입력마다 상대에게 턴이 넘어가며, 벽에 부딪혀도 턴이 교대됩니다.',
  },
  GRADIENT_CUP_GAME: {
    title: '그라데이션 컵 심리전',
    accent: 'text-cyan-300',
    summaryLines: [
      '1~7번 컵에 0~9 숫자를 오름차순(합계 30 이하, 같은 숫자 최대 2개)으로 비밀 배치합니다.',
      '컵 색상은 양끝(1·7번)이 가장 진하고 가운데(4번)가 가장 연한 대칭 구조입니다.',
      '7라운드 동안 선공이 먼저 낸 컵의 색상만 보고 후공이 맞대응 컵을 내어 숫자를 겨룹니다.',
    ],
    victoryCondition: '각 라운드 숫자가 큰 쪽이 +1점(무승부 0점)을 얻으며, 7라운드 총점이 높은 쪽이 승리합니다.',
    controlTip: '진한 1번(작은 수)과 7번(큰 수)의 색이 같다는 점을 이용해 상대의 허를 찌르세요.',
  },
};

interface QuickRulebookModalProps {
  open: boolean;
  game: ActiveGame;
  onClose: () => void;
}

export function QuickRulebookModal({ open, game, onClose }: QuickRulebookModalProps) {
  if (!open || game === 'LOBBY') return null;

  const entry = QUICK_RULEBOOK_DATA[game];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#121026]/85 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-rulebook-title"
      onClick={onClose}
    >
      <div
        className="arcade-panel w-full max-w-md rounded-3xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="arcade-icon-box flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFD21E] text-[#121026]">
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[11px] font-bold text-[#FFD21E]">10초 요약 룰북</p>
              <h2
                id="quick-rulebook-title"
                className="font-display text-xl font-bold text-[#FF61D2] sm:text-2xl"
              >
                {entry.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#2B2857] bg-[#121026] text-white transition-colors hover:border-[#6B61FF] hover:bg-[#6B61FF]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs leading-relaxed text-white sm:text-sm">
          <div className="rounded-2xl border-2 border-[#2B2857] bg-[#121026] p-3.5">
            <p className="mb-1.5 font-mono text-[11px] font-bold text-[#FFD21E]">핵심 규칙 3줄 요약</p>
            <ol className="space-y-1.5 text-xs text-white/90">
              {entry.summaryLines.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-mono font-bold text-[#FF61D2]">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border-2 border-[#6B61FF]/70 bg-[#121026] p-3">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#6B61FF]">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>승리 조건</span>
            </div>
            <p className="mt-1 text-xs text-white/90">{entry.victoryCondition}</p>
          </div>

          <div className="rounded-2xl border-2 border-[#FFD21E]/70 bg-[#121026] p-3">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#FFD21E]">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              <span>조작 팁</span>
            </div>
            <p className="mt-1 text-xs text-white/90">{entry.controlTip}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 w-full rounded-2xl bg-[#FFD21E] px-5 py-2 text-xs font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] sm:w-auto sm:text-sm"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
