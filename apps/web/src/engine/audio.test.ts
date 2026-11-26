import { describe, expect, it, vi } from 'vitest';
import { CelestialAudioEngine, type AudioSettingsSnapshot } from './audio';

interface MockAudioParam {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

function createMockParam(initial = 0): MockAudioParam {
  return {
    value: initial,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function createMockAudioContext() {
  const gainNodes: Array<{ gain: MockAudioParam; connect: ReturnType<typeof vi.fn> }> = [];
  const compressor = {
    threshold: createMockParam(),
    knee: createMockParam(),
    ratio: createMockParam(),
    attack: createMockParam(),
    release: createMockParam(),
    connect: vi.fn(),
  };
  const channelData = new Float32Array(44100 * 2);

  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 10,
    sampleRate: 44100,
    destination: { kind: 'destination' },
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createDynamicsCompressor: vi.fn(() => compressor),
    createGain: vi.fn(() => {
      const node = {
        gain: createMockParam(1),
        connect: vi.fn(),
      };
      gainNodes.push(node);
      return node;
    }),
    createBuffer: vi.fn(() => ({
      getChannelData: () => channelData,
    })),
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: createMockParam(440),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass',
      frequency: createMockParam(1000),
      Q: createMockParam(1),
      connect: vi.fn(),
    })),
  };

  return {
    ctx: ctx as unknown as AudioContext,
    raw: ctx,
    compressor,
    gainNodes,
  };
}

describe('CelestialAudioEngine', () => {
  it('configures compressor, gain bus hierarchy, and volume mapping', () => {
    const mock = createMockAudioContext();
    let settings: AudioSettingsSnapshot = {
      masterVol: 0.8,
      musicVol: 0.65,
      sfxVol: 0.85,
      musicEnabled: true,
      typingSfxEnabled: true,
      gameSfxEnabled: true,
    };

    const engine = new CelestialAudioEngine({
      getSettings: () => settings,
      audioContextFactory: () => mock.ctx,
    });

    engine.ensureContext();

    expect(mock.compressor.threshold.value).toBe(-14);
    expect(mock.compressor.knee.value).toBe(18);
    expect(mock.compressor.ratio.value).toBe(4);
    expect(mock.compressor.attack.value).toBe(0.004);
    expect(mock.compressor.release.value).toBe(0.22);
    expect(mock.compressor.connect).toHaveBeenCalledWith(mock.raw.destination);

    // Gain nodes order: masterGain, musicBus, typingBus, sfxBus, stemLobby, stemBase, stemStreak, stemTension
    expect(mock.gainNodes).toHaveLength(8);
    const [master, music, typing, sfx, stemLobby, stemBase, stemStreak, stemTension] =
      mock.gainNodes;

    expect(stemLobby?.connect).toHaveBeenCalledWith(music);
    expect(stemBase?.connect).toHaveBeenCalledWith(music);
    expect(stemStreak?.connect).toHaveBeenCalledWith(music);
    expect(stemTension?.connect).toHaveBeenCalledWith(music);
    expect(music?.connect).toHaveBeenCalledWith(master);
    expect(typing?.connect).toHaveBeenCalledWith(master);
    expect(sfx?.connect).toHaveBeenCalledWith(master);
    expect(master?.connect).toHaveBeenCalledWith(mock.compressor);

    expect(master?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.8, 10, 0.05);
    expect(music?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.65, 10, 0.28);
    expect(typing?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.85, 10, 0.06);
    expect(sfx?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.85, 10, 0.06);

    // Disable music & typing SFX
    settings = { ...settings, musicEnabled: false, typingSfxEnabled: false, gameSfxEnabled: false };
    engine.applySettings();
    expect(music?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.28);
    expect(typing?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.06);
    expect(sfx?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.06);

    // Mute toggle
    expect(engine.toggleMute()).toBe(true);
    expect(master?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.05);
    expect(engine.toggleMute()).toBe(false);
    expect(master?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.8, 10, 0.05);

    engine.destroy();
  });

  it('switches stem targets for LOBBY, GAMEPLAY, streak >= 3, and tension, and maps BPM', () => {
    const mock = createMockAudioContext();
    const engine = new CelestialAudioEngine({
      getSettings: () => ({
        masterVol: 0.8,
        musicVol: 0.65,
        sfxVol: 0.85,
        musicEnabled: true,
        typingSfxEnabled: true,
        gameSfxEnabled: true,
      }),
      audioContextFactory: () => mock.ctx,
    });

    engine.setMusicMode('LOBBY', 'EASY');
    expect(engine.getBpm()).toBe(74);

    const [, , , , stemLobby, stemBase, stemStreak, stemTension] = mock.gainNodes;
    expect(stemLobby?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.28);
    expect(stemBase?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.28);

    engine.setMusicMode('GAMEPLAY', 'INTERMEDIATE');
    expect(engine.getBpm()).toBe(106);
    expect(stemLobby?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.28);
    expect(stemBase?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.28);
    expect(stemStreak?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.28);

    engine.setStreak(3);
    expect(stemStreak?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.28);

    engine.setTension(true);
    expect(stemTension?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.28);

    engine.setDifficulty('HARD');
    expect(engine.getBpm()).toBe(118);

    engine.setDifficulty('EASY');
    expect(engine.getBpm()).toBe(96);

    engine.destroy();
  });
});
