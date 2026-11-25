import { useEffect, useState, type FormEvent } from 'react';
import { Check, Eye, EyeOff, KeyRound, Trash2, X } from 'lucide-react';

interface ApiKeyModalProps {
  open: boolean;
  savedApiKey: string;
  hasServerKey: boolean;
  promptReason: 'manual' | 'word_game';
  onSaveApiKey: (key: string) => void;
  onClearApiKey: () => void;
  onClose: () => void;
}

export function ApiKeyModal({
  open,
  savedApiKey,
  hasServerKey,
  promptReason,
  onSaveApiKey,
  onClearApiKey,
  onClose,
}: ApiKeyModalProps) {
  const [keyInput, setKeyInput] = useState(savedApiKey);
  const [showKey, setShowKey] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKeyInput(savedApiKey);
      setShowKey(false);
      setNotice(null);
    }
  }, [open, savedApiKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isConnected = Boolean(savedApiKey) || hasServerKey;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) {
      onClearApiKey();
      setNotice('저장된 API 키를 삭제했습니다.');
      return;
    }
    onSaveApiKey(trimmed);
    onClose();
  };

  const handleDelete = () => {
    setKeyInput('');
    onClearApiKey();
    setNotice('저장된 API 키가 브라우저에서 삭제되었습니다.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#131926] p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                isConnected
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                  : 'border-amber-400/40 bg-amber-500/15 text-amber-300'
              }`}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="api-key-modal-title"
                className="text-base font-bold text-slate-50"
              >
                Gemini API 키 설정
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {savedApiKey
                  ? '브라우저(localStorage)에 영구 저장됨'
                  : hasServerKey
                    ? '서버 기본 키 연결됨 (개인 키로 덮어쓰기 가능)'
                    : '말결(AI 유사어 추리) 플레이에 필요합니다'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="창 닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Auto-prompt 안내 banner when entering 말결 without a key */}
        {promptReason === 'word_game' && !isConnected && (
          <div className="mt-4 rounded-xl border border-sky-500/35 bg-sky-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-sky-200">
            <strong className="font-semibold text-sky-300">말결</strong>은 Gemini 임베딩 모델로 단어 유사도를 계산합니다.
            API 키를 한 번만 저장해 두면 브라우저에 영구 보관되어 다음부터는 입력창 없이 바로 실행됩니다.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="modal-gemini-api-key"
              className="block text-xs font-semibold text-slate-300"
            >
              개인 Gemini API 키
            </label>
            <div className="relative mt-1.5">
              <input
                id="modal-gemini-api-key"
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIza... 형태의 Gemini API 키 입력"
                autoComplete="off"
                autoFocus
                className="min-h-11 w-full rounded-xl border border-slate-700/80 bg-[#0B0F17] py-2.5 pl-3.5 pr-11 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'API 키 숨기기' : 'API 키 보기'}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              입력한 키는 이 브라우저의 <span className="font-mono text-slate-400">localStorage</span>에만 보관되며,
              다른 게임(국기·벽바둑 2·블라인드 미로·7개의 컵)은 API 키 없이 동작합니다.
            </p>
          </div>

          {notice && (
            <p role="status" className="text-xs font-medium text-emerald-400">
              {notice}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 whitespace-nowrap"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>저장 후 닫기</span>
            </button>

            {savedApiKey && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-[#0B0F17] px-3.5 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:border-rose-500/60 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-rose-400 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>키 삭제</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
