class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, startOffset = 0, type: OscillatorType = 'sine', volume = 0.08): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playHintResult(similarity: number): void {
    if (similarity >= 80) {
      this.playTone(523.25, 0.14, 0, 'triangle', 0.08);
      this.playTone(659.25, 0.16, 0.07, 'triangle', 0.08);
      this.playTone(783.99, 0.22, 0.14, 'sine', 0.09);
    } else if (similarity >= 50) {
      this.playTone(440, 0.13, 0, 'sine', 0.07);
      this.playTone(554.37, 0.18, 0.07, 'sine', 0.07);
    } else {
      this.playTone(311.13, 0.14, 0, 'sine', 0.05);
    }
  }

  public playWrongGuess(): void {
    this.playTone(260, 0.13, 0, 'triangle', 0.07);
    this.playTone(210, 0.18, 0.09, 'triangle', 0.07);
  }

  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 0.28, idx * 0.09, 'triangle', 0.09);
    });
  }

  public playTick(): void {
    this.playTone(587.33, 0.06, 0, 'sine', 0.035);
  }

  public playSelect(): void {
    this.playTone(520, 0.07, 0, 'sine', 0.045);
  }
}

export const soundEngine = new SoundEngine();
