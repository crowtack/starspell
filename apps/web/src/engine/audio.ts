/* =========================================================================
   4. PROCEDURAL WEB AUDIO ENGINE (CelestialAudioEngine)
   ========================================================================= */
import { DIFFICULTY_CONFIGS, type DifficultyKey, type UserSettingsSave } from '@starspell/shared';

export type MusicMode = 'SILENT' | 'LOBBY' | 'GAMEPLAY';

export type AudioSettingsSnapshot = Pick<
  UserSettingsSave,
  'masterVol' | 'musicVol' | 'sfxVol' | 'musicEnabled' | 'typingSfxEnabled' | 'gameSfxEnabled'
>;

export interface CelestialAudioOptions {
  getSettings: () => AudioSettingsSnapshot;
  audioContextFactory?: () => AudioContext;
}

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export class CelestialAudioEngine {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  compressor: DynamicsCompressorNode | null;
  musicBus: GainNode | null;
  typingBus: GainNode | null;
  sfxBus: GainNode | null;
  stemLobby: GainNode | null;
  stemBase: GainNode | null;
  stemStreak: GainNode | null;
  stemTension: GainNode | null;

  noiseBuffer: AudioBuffer | null;
  schedulerTimer: ReturnType<typeof setInterval> | null;
  nextNoteTime: number;
  currentStep: number;

  mode: MusicMode;
  difficulty: DifficultyKey;
  streak: number;
  tensionActive: boolean;
  muted: boolean;

  private readonly getSettings: () => AudioSettingsSnapshot;
  private readonly audioContextFactory?: () => AudioContext;

  constructor(options: CelestialAudioOptions) {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.musicBus = null;
    this.typingBus = null;
    this.sfxBus = null;
    this.stemLobby = null;
    this.stemBase = null;
    this.stemStreak = null;
    this.stemTension = null;

    this.noiseBuffer = null;
    this.schedulerTimer = null;
    this.nextNoteTime = 0;
    this.currentStep = 0;

    this.mode = 'SILENT';
    this.difficulty = 'EASY';
    this.streak = 0;
    this.tensionActive = false;
    this.muted = false;

    this.getSettings = options.getSettings;
    this.audioContextFactory = options.audioContextFactory;
  }

  destroy(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.ctx && typeof this.ctx.close === 'function') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }

  ensureContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    let ctx: AudioContext | null = null;
    if (this.audioContextFactory) {
      ctx = this.audioContextFactory();
    } else if (typeof window !== 'undefined') {
      const webkitWindow = window as WebkitAudioWindow;
      const AudioCtx =
        typeof window.AudioContext === 'function'
          ? window.AudioContext
          : webkitWindow.webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (!ctx) return;

    this.ctx = ctx;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;

    this.masterGain = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.typingBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();

    this.stemLobby = this.ctx.createGain();
    this.stemBase = this.ctx.createGain();
    this.stemStreak = this.ctx.createGain();
    this.stemTension = this.ctx.createGain();

    this.stemLobby.gain.value = 0;
    this.stemBase.gain.value = 0;
    this.stemStreak.gain.value = 0;
    this.stemTension.gain.value = 0;

    this.stemLobby.connect(this.musicBus);
    this.stemBase.connect(this.musicBus);
    this.stemStreak.connect(this.musicBus);
    this.stemTension.connect(this.musicBus);

    this.musicBus.connect(this.masterGain);
    this.typingBus.connect(this.masterGain);
    this.sfxBus.connect(this.masterGain);

    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // Create white noise buffer for breeze & percussion
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.applySettings();
    this.startScheduler();
  }

  applySettings(): void {
    if (!this.ctx || !this.masterGain || !this.musicBus || !this.typingBus || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const s = this.getSettings();
    const masterTarget = this.muted ? 0 : s.masterVol;
    const musicTarget = s.musicEnabled ? s.musicVol : 0;

    this.masterGain.gain.setTargetAtTime(masterTarget, now, 0.05);
    this.musicBus.gain.setTargetAtTime(musicTarget, now, 0.28);
    this.typingBus.gain.setTargetAtTime(s.typingSfxEnabled ? s.sfxVol : 0, now, 0.06);
    this.sfxBus.gain.setTargetAtTime(s.gameSfxEnabled ? s.sfxVol : 0, now, 0.06);
    this.updateStemTargets();
  }

  updateStemTargets(): void {
    if (!this.ctx || !this.stemLobby || !this.stemBase || !this.stemStreak || !this.stemTension)
      return;
    const now = this.ctx.currentTime;
    const lobbyTarget = this.mode === 'LOBBY' ? 1.0 : 0.0;
    const baseTarget = this.mode === 'GAMEPLAY' ? 1.0 : 0.0;
    const streakTarget = this.mode === 'GAMEPLAY' && this.streak >= 3 ? 1.0 : 0.0;
    const tensionTarget = this.mode === 'GAMEPLAY' && this.tensionActive ? 1.0 : 0.0;

    this.stemLobby.gain.setTargetAtTime(lobbyTarget, now, 0.28);
    this.stemBase.gain.setTargetAtTime(baseTarget, now, 0.28);
    this.stemStreak.gain.setTargetAtTime(streakTarget, now, 0.28);
    this.stemTension.gain.setTargetAtTime(tensionTarget, now, 0.28);
  }

  setMusicMode(mode: MusicMode, difficulty?: DifficultyKey): void {
    this.mode = mode;
    if (difficulty) this.difficulty = difficulty;
    if (mode !== 'SILENT') this.ensureContext();
    this.updateStemTargets();
  }

  setDifficulty(difficulty: DifficultyKey): void {
    this.difficulty = difficulty;
  }

  setStreak(streak: number): void {
    this.streak = streak;
    this.updateStemTargets();
  }

  setTension(active: boolean): void {
    if (this.tensionActive !== active) {
      this.tensionActive = active;
      this.updateStemTargets();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applySettings();
    return this.muted;
  }

  startScheduler(): void {
    if (this.schedulerTimer !== null || !this.ctx) return;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.schedulerTimer = setInterval(() => {
      this.schedulerTick();
    }, 25);
  }

  getBpm(): number {
    if (this.mode === 'LOBBY') return 74;
    return DIFFICULTY_CONFIGS[this.difficulty].bpm;
  }

  schedulerTick(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const lookahead = 0.12;
    const settings = this.getSettings();
    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      if (this.mode !== 'SILENT' && settings.musicEnabled) {
        this.scheduleStep(this.currentStep, this.nextNoteTime);
      }
      const stepDur = 60 / this.getBpm() / 4; // 16th note
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 64;
    }
  }

  playOsc(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gainVal: number,
    dest: AudioNode,
    filterFreq = 0,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainVal, time + Math.min(0.03, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    if (filterFreq > 0) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, time);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  playNoiseBreeze(
    time: number,
    dur: number,
    centerFreq: number,
    gainVal: number,
    dest: AudioNode,
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(centerFreq, time);
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gainVal, time + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(time);
    src.stop(time + dur + 0.05);
  }

  playKick(time: number, gainVal: number, dest: AudioNode, pitchStart = 115): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitchStart, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    g.gain.setValueAtTime(gainVal, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  scheduleStep(step: number, time: number): void {
    if (!this.stemLobby || !this.stemBase || !this.stemStreak || !this.stemTension) return;
    const bar = Math.floor(step / 16); // 0..3
    const stepInBar = step % 16;

    /* --- LOBBY AMBIENT (Beatless) --- */
    if (this.mode === 'LOBBY') {
      const lobbyChords: ReadonlyArray<readonly number[]> = [
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [196.0, 246.94, 293.66, 329.63], // G6
        [220.0, 261.63, 329.63, 392.0], // Am7
        [130.81, 196.0, 246.94, 329.63], // Cmaj7
      ];
      if (stepInBar === 0) {
        const chord = lobbyChords[bar];
        if (chord) {
          for (const f of chord) {
            this.playOsc(f, time, 2.9, 'sine', 0.048, this.stemLobby);
          }
        }
        if (bar % 2 === 0) {
          this.playNoiseBreeze(time, 3.2, 460 + bar * 90, 0.032, this.stemLobby);
        }
      }
      if (stepInBar === 6 || stepInBar === 13) {
        const harpPool = [523.25, 587.33, 659.25, 783.99, 880.0];
        const note = harpPool[(step + bar) % harpPool.length] ?? 523.25;
        this.playOsc(note, time, 1.35, 'triangle', 0.038, this.stemLobby, 1900);
      }
      return;
    }

    /* --- GAMEPLAY SOUNDTRACKS --- */
    if (this.difficulty === 'EASY') {
      const chords: ReadonlyArray<readonly number[]> = [
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [130.81, 164.81, 196.0, 246.94], // Cmaj7
        [220.0, 261.63, 329.63, 392.0], // Am7
        [196.0, 261.63, 293.66, 349.23], // G7sus
      ];
      const chord = chords[bar];
      if (!chord) return;
      if (stepInBar === 0) {
        for (const f of chord) this.playOsc(f, time, 2.1, 'triangle', 0.036, this.stemBase, 1400);
        this.playOsc((chord[0] ?? 174.61) * 0.5, time, 1.4, 'sine', 0.09, this.stemBase);
      }
      if (step % 2 === 0) {
        const arp = (chord[(step / 2) % chord.length] ?? 220) * 2;
        this.playOsc(arp, time, 0.28, 'sine', 0.042, this.stemBase);
      }
      if (stepInBar === 0 || stepInBar === 8) {
        this.playKick(time, 0.14, this.stemBase, 92);
      }
    } else if (this.difficulty === 'INTERMEDIATE') {
      const chords: ReadonlyArray<readonly number[]> = [
        [220.0, 261.63, 329.63, 415.3], // Am(maj7)
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [146.83, 174.61, 220.0, 261.63], // Dm7
        [164.81, 207.65, 246.94, 293.66], // E7
      ];
      const chord = chords[bar];
      if (!chord) return;
      if (stepInBar === 0) {
        for (const f of chord) this.playOsc(f, time, 2.0, 'sine', 0.042, this.stemBase);
        this.playOsc((chord[0] ?? 220) * 0.5, time, 1.2, 'triangle', 0.08, this.stemBase, 320);
      }
      if (step % 2 === 0) {
        const arp = (chord[(step / 2) % 4] ?? 220) * (step % 4 === 0 ? 2 : 1);
        this.playOsc(arp, time, 0.24, 'sine', 0.046, this.stemBase);
      }
      if (stepInBar === 0 || stepInBar === 6 || stepInBar === 12) {
        this.playKick(time, 0.16, this.stemBase, 108);
      }
    } else {
      // HARD: Dark string pads, staccato accents & timpani
      const chords: ReadonlyArray<readonly number[]> = [
        [146.83, 174.61, 220.0, 277.18], // Dm(maj7)
        [116.54, 146.83, 174.61, 220.0], // Bbmaj7
        [196.0, 233.08, 293.66, 329.63], // Gm6
        [220.0, 277.18, 329.63, 392.0], // A7
      ];
      const chord = chords[bar];
      if (!chord) return;
      if (stepInBar === 0) {
        for (const f of chord) this.playOsc(f, time, 1.8, 'sawtooth', 0.022, this.stemBase, 850);
        this.playKick(time, 0.24, this.stemBase, 130); // Timpani hit
      }
      if (step % 2 === 0) {
        const stac = (chord[(step / 2) % 4] ?? 146.83) * 2;
        this.playOsc(stac, time, 0.14, 'triangle', 0.052, this.stemBase, 1800);
      }
      if (stepInBar === 4 || stepInBar === 10 || stepInBar === 14) {
        this.playKick(time, 0.16, this.stemBase, 96);
      }
    }

    /* --- ADAPTIVE STREAK STEM --- */
    if (this.streak >= 3 && (stepInBar === 3 || stepInBar === 11)) {
      const chimes = [783.99, 880.0, 1046.5, 1174.66];
      this.playOsc(
        chimes[(bar + stepInBar) % chimes.length] ?? 783.99,
        time,
        0.35,
        'sine',
        0.045,
        this.stemStreak,
      );
    }
    if (this.streak >= 5 && (stepInBar === 4 || stepInBar === 12)) {
      this.playKick(time, 0.14, this.stemStreak, 105);
    }
    if (this.streak >= 8 && (stepInBar === 2 || stepInBar === 8 || stepInBar === 14)) {
      const lead = [659.25, 783.99, 880.0, 1046.5];
      this.playOsc(
        lead[(step + bar) % lead.length] ?? 659.25,
        time,
        0.26,
        'triangle',
        0.048,
        this.stemStreak,
        2200,
      );
    }

    /* --- CRITICAL TENSION STEM (< 5s) --- */
    if (this.tensionActive && step % 4 === 0) {
      this.playOsc(587.33, time, 0.18, 'sine', 0.05, this.stemTension);
      this.playOsc(880.0, time, 0.12, 'triangle', 0.035, this.stemTension, 1600);
    }
  }

  /* --- INTERACTIVE SFX --- */
  playKeyCorrect(indexInWord: number): void {
    this.ensureContext();
    if (!this.ctx || !this.typingBus || !this.getSettings().typingSfxEnabled) return;
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
    const freq = pentatonic[indexInWord % pentatonic.length] ?? 523.25;
    const now = this.ctx.currentTime;
    this.playOsc(freq, now, 0.22, 'sine', 0.13, this.typingBus);
    this.playOsc(freq * 2, now, 0.12, 'triangle', 0.04, this.typingBus);
  }

  playKeyError(): void {
    this.ensureContext();
    if (!this.ctx || !this.typingBus || !this.getSettings().typingSfxEnabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.14);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(g);
    g.connect(this.typingBus);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playBackspace(): void {
    this.ensureContext();
    if (!this.ctx || !this.typingBus || !this.getSettings().typingSfxEnabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.08);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(g);
    g.connect(this.typingBus);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playWordComplete(streak: number): void {
    this.ensureContext();
    const sfxBus = this.sfxBus;
    if (!this.ctx || !sfxBus || !this.getSettings().gameSfxEnabled) return;
    const now = this.ctx.currentTime;
    const shift = Math.pow(1.02, Math.min(streak, 12));
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playOsc(f * shift, now + idx * 0.055, 0.34, 'sine', 0.13, sfxBus);
    });
  }

  playMilestone(): void {
    this.ensureContext();
    const sfxBus = this.sfxBus;
    if (!this.ctx || !sfxBus || !this.getSettings().gameSfxEnabled) return;
    const now = this.ctx.currentTime;
    [587.33, 739.99, 880.0, 1174.66].forEach((f, i) => {
      this.playOsc(f, now + i * 0.06, 0.45, 'triangle', 0.12, sfxBus, 2600);
    });
  }

  playStreakReset(): void {
    this.ensureContext();
    if (!this.ctx || !this.sfxBus || !this.getSettings().gameSfxEnabled) return;
    const now = this.ctx.currentTime;
    this.playOsc(246.94, now, 0.18, 'sine', 0.08, this.sfxBus);
    this.playOsc(196.0, now + 0.08, 0.24, 'sine', 0.08, this.sfxBus);
  }

  playCountdownTick(): void {
    this.ensureContext();
    if (!this.ctx || !this.sfxBus || !this.getSettings().gameSfxEnabled) return;
    this.playOsc(880, this.ctx.currentTime, 0.14, 'sine', 0.09, this.sfxBus);
  }

  playVictoryFanfare(): void {
    this.ensureContext();
    const sfxBus = this.sfxBus;
    if (!this.ctx || !sfxBus || !this.getSettings().gameSfxEnabled) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      this.playOsc(f, now + i * 0.09, 0.65, 'triangle', 0.14, sfxBus, 3000);
    });
  }

  playTimeoutResolve(): void {
    this.ensureContext();
    const sfxBus = this.sfxBus;
    if (!this.ctx || !sfxBus || !this.getSettings().gameSfxEnabled) return;
    const now = this.ctx.currentTime;
    [392.0, 349.23, 329.63, 261.63].forEach((f, i) => {
      this.playOsc(f, now + i * 0.14, 0.5, 'sine', 0.11, sfxBus);
    });
  }
}
