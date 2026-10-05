/**
 * Celestial Web Audio Synthesizer for AKILI OS
 * Pure Web Audio API synthesized tones (no external audio assets required)
 */

class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  private humOscillator: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private isMuted: boolean = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.humGain) {
      this.humGain.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
    }
  }

  public getMuted() {
    return this.isMuted;
  }

  /**
   * Short celestial tactile chime (for button clicks, orb interactions)
   */
  public playClick(freq = 660, duration = 0.08) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio might be blocked by autoplay policies
    }
  }

  /**
   * Reactor Charge Sound (Rising frequency harmonic sweep)
   */
  public playChargeUp() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.7);

      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.75);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.75);
    } catch {
      // Ignore audio failure
    }
  }

  /**
   * Reactor Pulse / Unlock resonance
   */
  public playReactorPulse() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [432, 648, 864].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0.08, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.5);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Listening beep (Microphone active)
   */
  public playListeningTone() {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, this.ctx.currentTime);
      osc.frequency.setValueAtTime(780, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch {
      // Ignore
    }
  }

  /**
   * Alarm Tone Preview (Solar Chime harmonic)
   */
  public playAlarmChime(harmonicFreq = 432) {
    if (this.isMuted) return;
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const chords = [harmonicFreq, harmonicFreq * 1.25, harmonicFreq * 1.5];

      chords.forEach((freq, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);

        gain.gain.setValueAtTime(0.1, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.85);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Toggle background celestial core ambient hum
   */
  public toggleAmbientHum(enable: boolean) {
    try {
      this.initContext();
      if (!this.ctx) return;

      if (!enable) {
        if (this.humGain) {
          this.humGain.gain.setValueAtTime(0, this.ctx.currentTime);
        }
        return;
      }

      if (!this.humOscillator) {
        this.humOscillator = this.ctx.createOscillator();
        this.humGain = this.ctx.createGain();

        this.humOscillator.type = 'sine';
        this.humOscillator.frequency.setValueAtTime(54, this.ctx.currentTime); // 54Hz Deep sub-resonance

        this.humGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

        this.humOscillator.connect(this.humGain);
        this.humGain.connect(this.ctx.destination);

        this.humOscillator.start();
      } else if (this.humGain) {
        this.humGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      }
    } catch {
      // Ignore
    }
  }
}

export const celestialAudio = new AudioSynthesizer();
