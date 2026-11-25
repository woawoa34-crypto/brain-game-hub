import { useCallback, useEffect, useState } from 'react';

interface FullscreenDoc extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenEl extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isImmersiveFallback, setIsImmersiveFallback] = useState<boolean>(false);

  useEffect(() => {
    const sync = () => {
      const doc = document as FullscreenDoc;
      const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(active);
      if (active) {
        setIsImmersiveFallback(false);
      }
    };

    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as FullscreenDoc;
    const el = document.documentElement as FullscreenEl;

    const currentlyNative = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);

    if (currentlyNative) {
      try {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } catch {
        setIsFullscreen(false);
      }
      setIsImmersiveFallback(false);
      return;
    }

    if (isImmersiveFallback) {
      setIsImmersiveFallback(false);
      return;
    }

    const canNative = Boolean(
      doc.fullscreenEnabled || el.requestFullscreen || el.webkitRequestFullscreen,
    );

    if (canNative) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
          return;
        }
        if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
          return;
        }
      } catch {
        // Fallback to CSS 100dvh immersive mode when browser/iOS blocks native fullscreen
      }
    }

    setIsImmersiveFallback(true);
  }, [isImmersiveFallback]);

  return {
    isFullscreen: isFullscreen || isImmersiveFallback,
    isNativeFullscreen: isFullscreen,
    isImmersiveFallback,
    toggleFullscreen,
  };
}
