class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private unlocked = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  public isAudioUnlocked(): boolean {
    return this.unlocked && this.ctx?.state === 'running';
  }

  public async unlockAudio(): Promise<boolean> {
    const audioCtx = this.getOrCreateContext();
    if (!audioCtx) return false;

    try {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      // iOS Safari requires a silent buffer trigger within a user gesture to fully unlock output
      if (!this.unlocked) {
        const buffer = audioCtx.createBuffer(1, 1, 22050);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
      }
      if (audioCtx.state === 'running') {
        this.unlocked = true;
        return true;
      }
    } catch {
      // Ignore unlock errors on restricted contexts
    }
    return false;
  }

  private async ensureActiveContext(): Promise<AudioContext | null> {
    if (this.muted) return null;
    const audioCtx = this.getOrCreateContext();
    if (!audioCtx) return null;

    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch {
        return null;
      }
    }

    if (audioCtx.state === 'running') {
      this.unlocked = true;
    }

    return audioCtx;
  }

  private async playTone(
    freq: number,
    duration: number,
    startOffset = 0,
    type: OscillatorType = 'sine',
    volume = 0.08,
  ): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime + startOffset;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public async playHintResult(similarity: number): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (similarity >= 80) {
      void this.playTone(523.25, 0.14, 0, 'triangle', 0.08);
      void this.playTone(659.25, 0.16, 0.07, 'triangle', 0.08);
      void this.playTone(783.99, 0.22, 0.14, 'sine', 0.09);
    } else if (similarity >= 50) {
      void this.playTone(440, 0.13, 0, 'sine', 0.07);
      void this.playTone(554.37, 0.18, 0.07, 'sine', 0.07);
    } else {
      void this.playTone(311.13, 0.14, 0, 'sine', 0.05);
    }
  }

  public async playWrongGuess(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(260, 0.13, 0, 'triangle', 0.07);
    void this.playTone(210, 0.18, 0.09, 'triangle', 0.07);
  }

  public async playVictory(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      void this.playTone(freq, 0.28, idx * 0.09, 'triangle', 0.09);
    });
  }

  public async playTick(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(587.33, 0.06, 0, 'sine', 0.035);
  }

  public async playSelect(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(520, 0.07, 0, 'sine', 0.045);
  }

  public async playClick(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(620, 0.045, 0, 'sine', 0.04);
  }

  public async playPlace(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(392, 0.08, 0, 'triangle', 0.07);
    void this.playTone(523.25, 0.06, 0.03, 'sine', 0.05);
  }

  public async playError(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(220, 0.12, 0, 'triangle', 0.065);
    void this.playTone(175, 0.16, 0.08, 'triangle', 0.065);
  }

  public async playBump(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(150, 0.11, 0, 'triangle', 0.08);
  }

  public async playTurnAlert(): Promise<void> {
    const audioCtx = await this.ensureActiveContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    void this.playTone(659.25, 0.09, 0, 'sine', 0.055);
    void this.playTone(880, 0.12, 0.06, 'sine', 0.055);
  }
}

export const soundEngine = new SoundEngine();

export function unlockAudio(): Promise<boolean> {
  return soundEngine.unlockAudio();
}
