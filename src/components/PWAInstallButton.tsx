import { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="홈 화면에 앱으로 설치"
        className="inline-flex h-8 items-center gap-1 rounded-xl border-2 border-[#A62983] bg-[#FF61D2] px-2 text-[11px] font-extrabold text-[#121026] shadow-[0_3px_0_#A62983] transition-all active:translate-y-[2px] active:shadow-none sm:px-2.5 sm:text-xs whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">앱 설치</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="iOS 홈 화면 추가 안내"
          className="inline-flex h-8 items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#1D1B3D] px-2 text-[11px] font-bold text-white shadow-[0_3px_0_#15132d] transition-all hover:border-[#6B61FF] active:translate-y-[2px] active:shadow-none whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5 text-[#FF61D2]" aria-hidden="true" />
          <span className="hidden sm:inline">앱 설치</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#121026]/85 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="arcade-panel w-full max-w-sm rounded-3xl p-5 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-xl font-bold text-[#FFD21E]">홈 화면에 앱 추가 (iOS)</h3>
              <p className="mt-2.5 text-xs leading-relaxed text-white/85">
                1. Safari 하단 <strong>공유(네모+화살표)</strong> 버튼을 누르세요.
                <br />
                2. 아래로 내려 <strong>홈 화면에 추가</strong>를 선택하세요.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 min-h-10 w-full rounded-2xl bg-[#FFD21E] px-4 py-2 text-xs font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00]"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-2xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1.5 text-[11px] font-bold text-[#FFD21E] shadow-[0_4px_0_#15132d]"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#FFD21E]" aria-hidden="true" />
      <span>오프라인 모드 (캐시 실행 중)</span>
    </div>
  );
}
