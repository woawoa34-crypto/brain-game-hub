import { X } from 'lucide-react';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#121026]/85 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      onClick={onClose}
    >
      <div
        className="arcade-panel max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="rules-modal-title" className="font-display text-2xl font-bold text-[#FFD21E]">
            미니게임 안내
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#2B2857] bg-[#121026] text-white transition-colors hover:border-[#6B61FF] hover:bg-[#6B61FF] focus-visible:outline-2 focus-visible:outline-[#FFD21E]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm leading-relaxed text-white/85">
          <div>
            <h3 className="font-display text-xl font-bold text-[#6B61FF]">게임 1. 말결 (AI 유사어 추리)</h3>
            <p className="mt-1 text-white/75">
              솔로 모드에서는 AI가 한국어 일반 명사 1개를 출제하고, 출제자 모드에서는 직접 입력한
              단어가 마스킹됩니다. 힌트 단어를 입력하면 AI가 5단계 한국어 연상·의미 채점 기준표에 따라
              유사도 점수(0%~100%)와 짧은 근거를 함께 제공합니다.
            </p>
            <dl className="mt-2.5 space-y-1.5 border-t-2 border-[#2B2857] pt-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 font-bold text-[#FF61D2]">
                  <span className="h-2 w-5 rounded-full bg-[#FF61D2]" aria-hidden="true" />
                  <span>90% 이상 · 핵심 연관어</span>
                </dt>
                <dd className="text-white/70">동의어·핵심 1순위 짝꿍</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 font-bold text-emerald-300">
                  <span className="h-2 w-5 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span>70% ~ 89.9% · 밀접한 관련</span>
                </dt>
                <dd className="text-white/70">동일 범주·밀접한 상황</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 font-bold text-[#FFD21E]">
                  <span className="h-2 w-5 rounded-full bg-[#FFD21E]" aria-hidden="true" />
                  <span>45% ~ 69.9% · 간접 연상</span>
                </dt>
                <dd className="text-white/70">공통 속성·간접 연결</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 font-bold text-white/60">
                  <span className="h-2 w-5 rounded-full bg-white/40" aria-hidden="true" />
                  <span>45% 미만 · 약한/무관</span>
                </dt>
                <dd className="text-white/70">다른 방향을 탐색해보세요</dd>
              </div>
            </dl>
          </div>

          <div className="border-t-2 border-[#2B2857] pt-4">
            <h3 className="font-display text-xl font-bold text-[#FF61D2]">게임 2. 국기 기억력 테스트</h3>
            <p className="mt-1 text-white/75">
              누구나 바로 즐길 수 있는 시각 기억력 테스트입니다. 무작위로 뽑힌 10개의 실제
              국기가 설정된 시간 간격(기본 0.5초)과 사이클 횟수(기본 3회)만큼 반복 표시된 뒤,
              5×5 배열(25개 국기)에서 방금 본 국기 5개를 정확히 찾아내면 됩니다.
            </p>
          </div>

          <div className="border-t-2 border-[#2B2857] pt-4">
            <h3 className="font-display text-xl font-bold text-[#FFD21E]">게임 3. 벽바둑 2 (영역 분리 전략)</h3>
            <p className="mt-1 text-white/75">
              7×7 보드에서 사각 말(■: 직선 1~2칸)과 원형 말(●: 1칸 또는 90도 꺾어 2칸)을 이동한
              뒤 도착한 칸의 빈 경계에 벽을 세웁니다. 모든 플레이어의 말이 서로 다른 구역으로 완전히
              분리되면 종료되며, 내 말이 속한 독립 구역 칸 수의 합계(중복 제외)로 승패를 겨룹니다.
            </p>
          </div>

          <div className="border-t-2 border-[#2B2857] pt-4">
            <h3 className="font-display text-xl font-bold text-sky-400">게임 4. 블라인드 미로 탈출</h3>
            <p className="mt-1 text-white/75">
              6×6 또는 7×7 무작위 미로를 3초 또는 5초 동안 기억한 뒤, 벽과 출구(E)가 가려진 상태에서
              상·하·좌·우 4방향 화살표(D-Pad)를 눌러 1칸씩 이동해 탈출합니다.
              솔로 타임어택과 2인 턴제 레이스(1회 이동마다 턴 교대)를 즐길 수 있습니다.
            </p>
          </div>

          <div className="border-t-2 border-[#2B2857] pt-4">
            <h3 className="font-display text-xl font-bold text-emerald-400">게임 5. 그라데이션 컵 심리전</h3>
            <p className="mt-1 text-white/75">
              1·7번이 가장 짙고 4번이 가장 옅은 대칭 색상의 7개 컵에 0~9 숫자를 오름차순(합계 30 이하)으로
              숨긴 뒤, 7라운드 동안 중앙 가림막에 놓인 상대 컵의 색상만 보고 숫자를 추리해 승부합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-2xl bg-[#FFD21E] px-5 py-2.5 text-sm font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-[#FF61D2] whitespace-nowrap shrink-0"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
