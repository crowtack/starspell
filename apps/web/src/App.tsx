import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BASE_GLOW_RADIUS_PX,
  DIFFICULTY_CONFIGS,
  STREAK_MILESTONES,
  WORDS_PER_CHAPTER,
  clampFrameDelta,
  createInitialSoloState,
  reduce,
  type ActiveCheckpoint,
  type DifficultyKey,
  type SaveData,
  type SoloSessionDto,
  type SoloState,
  type SyncStatus,
  type UserSettingsSave,
  type WayfaringStyle,
} from '@starspell/shared';
import { getActiveSoloSession } from './api/solo';
import { AuthModal } from './components/AuthModal';
import { ConfirmDialog, type ConfirmDialogMode } from './components/ConfirmDialog';
import { GameplayArena, type MilestoneToast } from './components/GameplayArena';
import { GuestImportModal } from './components/GuestImportModal';
import { LeaderboardsModal } from './components/LeaderboardsModal';
import { LobbyOverlay } from './components/LobbyOverlay';
import { MultiplayerModal } from './components/MultiplayerModal';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { SummaryModal } from './components/SummaryModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { TopHud } from './components/TopHud';
import { CelestialAudioEngine } from './engine/audio';
import { SunsetSceneryEngine } from './engine/scenery';
import { useAuth } from './hooks/useAuth';
import { SoloSyncManager, type SyncConflictInfo } from './sync/soloSyncManager';
import {
  clearActiveCheckpoint,
  loadActiveCheckpoint,
  saveActiveCheckpoint,
} from './storage/activeCheckpoint';
import { loadSave, persistSave } from './storage/saveStore';
import { resolveChapterSeed } from './utils/seed';
import { cancelSpeech, speakWord } from './utils/speech';

type ScreenState = 'LOBBY' | 'MODE_SELECT' | 'PLAYING' | 'SUMMARY';

function computeStreakGlow(streak: number): string {
  let glow = `${BASE_GLOW_RADIUS_PX}px`;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.streak) {
      glow = m.glow;
    }
  }
  return glow;
}

function applyThemeCssVars(diffKey: DifficultyKey, streak: number): void {
  const cfg = DIFFICULTY_CONFIGS[diffKey];
  const root = document.documentElement.style;
  root.setProperty('--stage-primary', cfg.primary);
  root.setProperty('--stage-secondary', cfg.secondary);
  root.setProperty('--stage-glow', cfg.glow);
  root.setProperty('--stage-ring', cfg.primary);
  root.setProperty('--glow-radius', computeStreakGlow(streak));
}

export default function App() {
  const [saveData, setSaveData] = useState<SaveData>(() => loadSave());
  const [soloState, setSoloState] = useState<SoloState>(() =>
    createInitialSoloState({
      difficulty: saveData.selectedDifficulty,
      totalXp: saveData.profile.xp,
    }),
  );
  const [screenState, setScreenState] = useState<ScreenState>('LOBBY');
  const [selectedMode, setSelectedMode] = useState<WayfaringStyle>('STARLIGHT');
  const [savedCheckpoint, setSavedCheckpoint] = useState<ActiveCheckpoint | null>(() =>
    loadActiveCheckpoint(),
  );
  const [lobbyAmbientOn, setLobbyAmbientOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialTab, setAuthInitialTab] = useState<'login' | 'register'>('login');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [guestImportOpen, setGuestImportOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [leaderboardsOpen, setLeaderboardsOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmDialogMode | null>(null);
  const [muted, setMuted] = useState(false);
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [conflictState, setConflictState] = useState<{
    serverSession: SoloSessionDto | null;
    localWordIndex: number;
    localScore: number;
  } | null>(null);

  const { account, register, login, logout, saveProfile, syncSettings, refreshMe } = useAuth();
  const accountRef = useRef(account);
  accountRef.current = account;
  const soloSyncRef = useRef<SoloSyncManager | null>(null);
  const settingsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsPatchRef = useRef<Partial<UserSettingsSave>>({});
  const hydratedUserIdRef = useRef<string | null>(null);

  const [typedLetters, setTypedLetters] = useState<string[]>([]);
  const [glimpseMode, setGlimpseMode] = useState<'STARLIGHT' | 'FLASH' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneToast[]>([]);
  const [flashedKey, setFlashedKey] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(
    () => DIFFICULTY_CONFIGS[saveData.selectedDifficulty].initialClock,
  );

  // Refs for RAF loop, engines, and async timers
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneryRef = useRef<SunsetSceneryEngine | null>(null);
  const audioRef = useRef<CelestialAudioEngine | null>(null);

  const saveDataRef = useRef(saveData);
  saveDataRef.current = saveData;
  const soloStateRef = useRef(soloState);
  soloStateRef.current = soloState;
  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;
  const selectedModeRef = useRef(selectedMode);
  selectedModeRef.current = selectedMode;
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const confirmModeRef = useRef(confirmMode);
  confirmModeRef.current = confirmMode;
  const isVerifyingRef = useRef(isVerifying);
  isVerifyingRef.current = isVerifying;
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  const elapsedSinceEventRef = useRef(0);
  const lastSecondTickRef = useRef(-1);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const milestoneIdRef = useRef(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-wins settings hydration when an account session is active
  useEffect(() => {
    if (!account) {
      hydratedUserIdRef.current = null;
      return;
    }
    if (hydratedUserIdRef.current === account.user.id) {
      return;
    }
    hydratedUserIdRef.current = account.user.id;
    const serverSettings = account.settings;
    setSaveData((prev) => {
      const next = { ...prev, settings: serverSettings };
      saveDataRef.current = next;
      persistSave(next);
      return next;
    });
    document.body.classList.toggle('reduced-motion', serverSettings.reducedEffects);
    sceneryRef.current?.setReducedMotion(serverSettings.reducedEffects);
    audioRef.current?.applySettings();
  }, [account]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // SoloSyncManager lifecycle and active session / conflict hydration
  useEffect(() => {
    const mgr = new SoloSyncManager();
    soloSyncRef.current = mgr;
    const unsubStatus = mgr.onStatusChange(setSyncStatus);
    const unsubConflict = mgr.onConflict((info: SyncConflictInfo) => {
      void getActiveSoloSession()
        .then(({ session }) => {
          setConflictState({
            serverSession: session ?? info.serverSession,
            localWordIndex: soloStateRef.current.wordIndex,
            localScore: soloStateRef.current.score,
          });
        })
        .catch(() => {
          setConflictState({
            serverSession: info.serverSession,
            localWordIndex: soloStateRef.current.wordIndex,
            localScore: soloStateRef.current.score,
          });
        });
    });
    const unsubSynced = mgr.onServerSynced(() => {
      void refreshMe();
    });

    return () => {
      unsubStatus();
      unsubConflict();
      unsubSynced();
      mgr.destroy();
      soloSyncRef.current = null;
    };
  }, [refreshMe]);

  useEffect(() => {
    if (!account || !soloSyncRef.current) return;
    const mgr = soloSyncRef.current;
    void (async () => {
      const localSync = await mgr.hydrateFromDisk(account.user.id);
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const { session: serverSession } = await getActiveSoloSession();
        if (!serverSession) return;
        const localCp = loadActiveCheckpoint();

        if (!localSync && !localCp) {
          await mgr.adoptServerSession(account.user.id, serverSession);
          saveActiveCheckpoint({
            style: serverSession.style,
            soloState: serverSession.state,
            elapsedSinceLastEvent: 0,
          });
          setSavedCheckpoint(loadActiveCheckpoint());
        } else if (
          localSync &&
          (localSync.clientSessionId !== serverSession.clientSessionId ||
            serverSession.version > localSync.baseSeq)
        ) {
          setConflictState({
            serverSession,
            localWordIndex: localCp?.soloState.wordIndex ?? soloStateRef.current.wordIndex,
            localScore: localCp?.soloState.score ?? soloStateRef.current.score,
          });
        }
      } catch {
        // Ignore transient offline/API errors during hydration
      }
    })();
  }, [account]);

  const clearWordTimers = useCallback(() => {
    if (revealTimeoutRef.current !== null) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
    if (verifyIntervalRef.current !== null) {
      clearInterval(verifyIntervalRef.current);
      verifyIntervalRef.current = null;
    }
    if (verifyFinishTimeoutRef.current !== null) {
      clearTimeout(verifyFinishTimeoutRef.current);
      verifyFinishTimeoutRef.current = null;
    }
  }, []);

  const triggerPronounce = useCallback((word: string) => {
    speakWord(word, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });
  }, []);

  const flashVirtualKey = useCallback((key: string) => {
    setFlashedKey(key);
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = setTimeout(() => {
      setFlashedKey((curr) => (curr === key ? null : curr));
    }, 120);
  }, []);

  const pushMilestoneToast = useCallback((text: string) => {
    const id = ++milestoneIdRef.current;
    setMilestones((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setMilestones((prev) => prev.filter((item) => item.id !== id));
    }, 2150);
  }, []);

  // Initialize Scenery + Audio engines once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initialDiff = saveDataRef.current.selectedDifficulty;
    const scenery = new SunsetSceneryEngine(canvas, {
      initialEnvIndex: DIFFICULTY_CONFIGS[initialDiff].envIndex,
      initialReducedMotion: saveDataRef.current.settings.reducedEffects,
    });
    sceneryRef.current = scenery;

    const audio = new CelestialAudioEngine({
      getSettings: () => saveDataRef.current.settings,
    });
    audio.setDifficulty(initialDiff);
    audioRef.current = audio;

    if (saveDataRef.current.settings.reducedEffects) {
      document.body.classList.add('reduced-motion');
    }
    applyThemeCssVars(initialDiff, 0);

    return () => {
      clearWordTimers();
      cancelSpeech();
      scenery.destroy();
      audio.destroy();
    };
  }, [clearWordTimers]);

  // Apply theme CSS variables whenever difficulty or streak changes
  useEffect(() => {
    const diff =
      screenState === 'PLAYING' || screenState === 'SUMMARY'
        ? soloState.difficulty
        : saveData.selectedDifficulty;
    applyThemeCssVars(diff, screenState === 'PLAYING' ? soloState.streak : 0);
    sceneryRef.current?.setTargetEnv(DIFFICULTY_CONFIGS[diff].envIndex);
    audioRef.current?.setDifficulty(diff);
  }, [saveData.selectedDifficulty, screenState, soloState.difficulty, soloState.streak]);

  const startWordPresentation = useCallback(
    (word: string, mode: WayfaringStyle) => {
      clearWordTimers();
      setTypedLetters([]);
      setIsVerifying(false);
      setVerifiedCount(0);
      setGlimpseMode(null);

      if (mode === 'STARLIGHT') {
        setGlimpseMode('STARLIGHT');
        revealTimeoutRef.current = setTimeout(() => {
          setGlimpseMode(null);
        }, 750);
        triggerPronounce(word);
      } else if (mode === 'ECHO') {
        triggerPronounce(word);
      } else if (mode === 'FLASH') {
        setGlimpseMode('FLASH');
        revealTimeoutRef.current = setTimeout(() => {
          setGlimpseMode(null);
        }, 1100);
      }
    },
    [clearWordTimers, triggerPronounce],
  );

  const finalizeFailure = useCallback(
    (failedState: SoloState) => {
      clearWordTimers();
      cancelSpeech();
      setIsVerifying(true);
      setScreenState('SUMMARY');
      audioRef.current?.setTension(false);
      audioRef.current?.playTimeoutResolve();

      const cfg = DIFFICULTY_CONFIGS[failedState.difficulty];
      const prevSave = saveDataRef.current;
      const prevDiff = prevSave.difficulties[cfg.key];
      const nextSave: SaveData = {
        ...prevSave,
        profile: {
          ...prevSave.profile,
          xp: failedState.totalXp,
          level: failedState.level,
          highScore: Math.max(prevSave.profile.highScore, failedState.score),
          bestStreak: Math.max(prevSave.profile.bestStreak, failedState.bestChapterStreak),
        },
        difficulties: {
          ...prevSave.difficulties,
          [cfg.key]: {
            ...prevDiff,
            unlocked: true,
            highScore: Math.max(prevDiff.highScore, failedState.score),
            bestStreak: Math.max(prevDiff.bestStreak, failedState.bestChapterStreak),
          },
        },
      };
      setSaveData(nextSave);
      persistSave(nextSave);
      clearActiveCheckpoint();
      setSavedCheckpoint(null);
    },
    [clearWordTimers],
  );

  const finalizeVictory = useCallback(
    (victoryState: SoloState) => {
      clearWordTimers();
      cancelSpeech();
      setIsVerifying(true);
      setScreenState('SUMMARY');
      audioRef.current?.setTension(false);
      audioRef.current?.playVictoryFanfare();

      const cfg = DIFFICULTY_CONFIGS[victoryState.difficulty];
      const prevSave = saveDataRef.current;
      const prevDiff = prevSave.difficulties[cfg.key];
      const nextSave: SaveData = {
        ...prevSave,
        profile: {
          ...prevSave.profile,
          xp: victoryState.totalXp,
          level: victoryState.level,
          constellationsCleared: prevSave.profile.constellationsCleared + 1,
          highScore: Math.max(prevSave.profile.highScore, victoryState.score),
          bestStreak: Math.max(prevSave.profile.bestStreak, victoryState.bestChapterStreak),
        },
        difficulties: {
          ...prevSave.difficulties,
          [cfg.key]: {
            ...prevDiff,
            unlocked: true,
            completed: true,
            runsCleared: prevDiff.runsCleared + 1,
            highScore: Math.max(prevDiff.highScore, victoryState.score),
            bestStreak: Math.max(prevDiff.bestStreak, victoryState.bestChapterStreak),
          },
        },
      };
      setSaveData(nextSave);
      persistSave(nextSave);
      clearActiveCheckpoint();
      setSavedCheckpoint(null);
    },
    [clearWordTimers],
  );

  const beginChapter = useCallback(
    (chapNum = 1, keepRun = false) => {
      clearWordTimers();
      const diff = saveDataRef.current.selectedDifficulty;
      const seed = resolveChapterSeed(chapNum);
      const baseState = keepRun
        ? soloStateRef.current
        : createInitialSoloState({
            difficulty: diff,
            totalXp: saveDataRef.current.profile.xp,
          });
      const nextState = reduce(baseState, {
        type: 'chapter_started',
        difficulty: diff,
        chapter: chapNum,
        seed,
        keepRun,
      });

      soloStateRef.current = nextState;
      setSoloState(nextState);
      elapsedSinceEventRef.current = 0;
      timeLeftRef.current = nextState.timeLeft;
      setTimeLeft(nextState.timeLeft);
      lastSecondTickRef.current = Math.ceil(nextState.timeLeft);
      setScreenState('PLAYING');

      audioRef.current?.setStreak(nextState.streak);
      audioRef.current?.setTension(false);
      audioRef.current?.setMusicMode('GAMEPLAY', diff);

      saveActiveCheckpoint({
        style: selectedModeRef.current,
        soloState: nextState,
        elapsedSinceLastEvent: 0,
      });
      setSavedCheckpoint(loadActiveCheckpoint());

      if (accountRef.current && soloSyncRef.current) {
        const mgr = soloSyncRef.current;
        const userId = accountRef.current.user.id;
        const style = selectedModeRef.current;
        void (async () => {
          if (!keepRun || !mgr.getActiveLocalSession()) {
            await mgr.startNewSession({ userId, difficulty: diff, style, seed });
          }
          await mgr.recordEvent({
            type: 'chapter_started',
            chapter: chapNum,
            seed,
            keepRun,
          });
        })();
      }

      const firstWord = nextState.slots[0];
      if (firstWord) {
        startWordPresentation(firstWord.word, selectedModeRef.current);
      }
    },
    [clearWordTimers, startWordPresentation],
  );

  const completeCurrentWord = useCallback(() => {
    const currSolo = soloStateRef.current;
    const currentWord = currSolo.slots[currSolo.wordIndex];
    if (!currentWord || isVerifyingRef.current) return;

    setIsVerifying(true);
    isVerifyingRef.current = true;
    setGlimpseMode(null);

    const elapsedBeforeSolve = elapsedSinceEventRef.current;
    const nextSolo = reduce(currSolo, {
      type: 'word_solved',
      elapsedSeconds: elapsedBeforeSolve,
    });
    elapsedSinceEventRef.current = 0;
    soloStateRef.current = nextSolo;
    setSoloState(nextSolo);
    timeLeftRef.current = nextSolo.timeLeft;
    setTimeLeft(nextSolo.timeLeft);

    if (accountRef.current && soloSyncRef.current) {
      void soloSyncRef.current.recordEvent({
        type: 'word_solved',
        slot: currSolo.wordIndex,
        answer: currentWord.word,
        elapsedSeconds: elapsedBeforeSolve,
        elapsedMs: Math.round(elapsedBeforeSolve * 1000),
      });
    }

    if (nextSolo.status === 'failed') {
      finalizeFailure(nextSolo);
      return;
    }

    // Quirk Q4: credit word XP and wordsSolved immediately per solved word
    const cfg = DIFFICULTY_CONFIGS[nextSolo.difficulty];
    const prevSave = saveDataRef.current;
    const prevDiff = prevSave.difficulties[cfg.key];
    const nextSave: SaveData = {
      ...prevSave,
      profile: {
        ...prevSave.profile,
        xp: nextSolo.totalXp,
        level: nextSolo.level,
        wordsSolved: prevSave.profile.wordsSolved + 1,
      },
      difficulties: {
        ...prevSave.difficulties,
        [cfg.key]: {
          ...prevDiff,
          unlocked: true,
          wordsSolved: prevDiff.wordsSolved + 1,
        },
      },
    };
    saveDataRef.current = nextSave;
    setSaveData(nextSave);
    persistSave(nextSave);

    saveActiveCheckpoint({
      style: selectedModeRef.current,
      soloState: nextSolo,
      elapsedSinceLastEvent: 0,
    });

    audioRef.current?.setStreak(nextSolo.streak);
    audioRef.current?.playWordComplete(nextSolo.streak);
    sceneryRef.current?.emitPulseRing();

    const hitMilestone = STREAK_MILESTONES.find((m) => m.streak === nextSolo.streak);
    if (hitMilestone) {
      pushMilestoneToast(hitMilestone.label);
      audioRef.current?.playMilestone();
      sceneryRef.current?.emitPulseRing();
    }

    // Staggered 26ms-per-letter verification wave, 420ms total
    const len = currentWord.word.length;
    setVerifiedCount(1);
    let step = 1;
    verifyIntervalRef.current = setInterval(() => {
      step += 1;
      setVerifiedCount(step);
      if (step >= len && verifyIntervalRef.current !== null) {
        clearInterval(verifyIntervalRef.current);
        verifyIntervalRef.current = null;
      }
    }, 26);

    verifyFinishTimeoutRef.current = setTimeout(() => {
      if (verifyIntervalRef.current !== null) {
        clearInterval(verifyIntervalRef.current);
        verifyIntervalRef.current = null;
      }
      if (nextSolo.wordIndex >= WORDS_PER_CHAPTER) {
        const finished = reduce(soloStateRef.current, {
          type: 'chapter_finished',
          elapsedSeconds: 0,
        });
        soloStateRef.current = finished;
        setSoloState(finished);
        if (accountRef.current && soloSyncRef.current) {
          void soloSyncRef.current.recordEvent({
            type: 'chapter_finished',
            elapsedSeconds: 0,
          });
        }
        if (finished.status === 'victory') {
          finalizeVictory(finished);
        } else {
          finalizeFailure(finished);
        }
      } else {
        const nextWord = nextSolo.slots[nextSolo.wordIndex];
        if (nextWord) {
          startWordPresentation(nextWord.word, selectedModeRef.current);
        }
      }
    }, 420);
  }, [finalizeFailure, finalizeVictory, pushMilestoneToast, startWordPresentation]);

  const handleLetterInput = useCallback(
    (letter: string) => {
      if (
        screenStateRef.current !== 'PLAYING' ||
        isVerifyingRef.current ||
        settingsOpenRef.current ||
        confirmModeRef.current !== null
      ) {
        return;
      }
      const currSolo = soloStateRef.current;
      const currentWord = currSolo.slots[currSolo.wordIndex];
      if (!currentWord) return;

      if (revealTimeoutRef.current !== null) {
        clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      setGlimpseMode(null);

      const target = currentWord.word.toUpperCase();
      setTypedLetters((prev) => {
        if (prev.length >= target.length) return prev;
        const upper = letter.toUpperCase();
        const idx = prev.length;
        if (upper === target[idx]) {
          audioRef.current?.playKeyCorrect(idx);
        } else {
          audioRef.current?.playKeyError();
        }
        const next = [...prev, upper];
        if (next.length === target.length && next.join('') === target) {
          queueMicrotask(() => completeCurrentWord());
        }
        return next;
      });
    },
    [completeCurrentWord],
  );

  const handleBackspace = useCallback(() => {
    if (
      screenStateRef.current !== 'PLAYING' ||
      isVerifyingRef.current ||
      settingsOpenRef.current ||
      confirmModeRef.current !== null
    ) {
      return;
    }
    setTypedLetters((prev) => {
      if (prev.length === 0) return prev;
      audioRef.current?.playBackspace();
      return prev.slice(0, -1);
    });
  }, []);

  const handleSkipWord = useCallback(() => {
    if (
      screenStateRef.current !== 'PLAYING' ||
      isVerifyingRef.current ||
      settingsOpenRef.current ||
      confirmModeRef.current !== null
    ) {
      return;
    }
    const currSolo = soloStateRef.current;
    if (currSolo.streak > 0) {
      audioRef.current?.playStreakReset();
    }
    const elapsedBeforeSkip = elapsedSinceEventRef.current;
    const nextSolo = reduce(currSolo, {
      type: 'word_skipped',
      elapsedSeconds: elapsedBeforeSkip,
    });
    elapsedSinceEventRef.current = 0;
    soloStateRef.current = nextSolo;
    setSoloState(nextSolo);
    timeLeftRef.current = nextSolo.timeLeft;
    setTimeLeft(nextSolo.timeLeft);
    audioRef.current?.setStreak(nextSolo.streak);

    if (accountRef.current && soloSyncRef.current) {
      void soloSyncRef.current.recordEvent({
        type: 'word_skipped',
        slot: currSolo.wordIndex,
        elapsedSeconds: elapsedBeforeSkip,
      });
    }

    if (nextSolo.status === 'failed') {
      finalizeFailure(nextSolo);
      return;
    }

    saveActiveCheckpoint({
      style: selectedModeRef.current,
      soloState: nextSolo,
      elapsedSinceLastEvent: 0,
    });

    const nextWord = nextSolo.slots[nextSolo.wordIndex];
    if (nextWord) {
      startWordPresentation(nextWord.word, selectedModeRef.current);
    }
  }, [finalizeFailure, startWordPresentation]);

  const showLobbyStep1 = useCallback(() => {
    clearWordTimers();
    cancelSpeech();
    setConfirmMode(null);
    setScreenState('LOBBY');
    setSavedCheckpoint(loadActiveCheckpoint());
    audioRef.current?.setTension(false);
    audioRef.current?.setStreak(0);
    audioRef.current?.setMusicMode(
      lobbyAmbientOn ? 'LOBBY' : 'SILENT',
      saveDataRef.current.selectedDifficulty,
    );
  }, [clearWordTimers, lobbyAmbientOn]);

  const handleResumeCheckpoint = useCallback(() => {
    const cp = loadActiveCheckpoint();
    if (!cp) return;
    clearWordTimers();
    setSelectedMode(cp.style);
    selectedModeRef.current = cp.style;
    soloStateRef.current = cp.soloState;
    setSoloState(cp.soloState);
    elapsedSinceEventRef.current = cp.elapsedSinceLastEvent;
    const remaining = Math.max(0.1, cp.soloState.timeLeft - cp.elapsedSinceLastEvent);
    timeLeftRef.current = remaining;
    setTimeLeft(remaining);
    lastSecondTickRef.current = Math.ceil(remaining);

    setSaveData((prev) => {
      if (prev.selectedDifficulty === cp.soloState.difficulty) return prev;
      const next = { ...prev, selectedDifficulty: cp.soloState.difficulty };
      persistSave(next);
      return next;
    });

    setScreenState('PLAYING');
    audioRef.current?.setStreak(cp.soloState.streak);
    audioRef.current?.setTension(remaining < 5.0);
    audioRef.current?.setMusicMode('GAMEPLAY', cp.soloState.difficulty);

    const word = cp.soloState.slots[cp.soloState.wordIndex];
    if (word) {
      startWordPresentation(word.word, cp.style);
    }
  }, [clearWordTimers, startWordPresentation]);

  // Main 60fps RAF loop
  useEffect(() => {
    let rafId = 0;
    let prevTimestamp = performance.now();

    const loop = (now: number) => {
      const dt = clampFrameDelta((now - prevTimestamp) / 1000);
      prevTimestamp = now;

      sceneryRef.current?.update(dt);
      sceneryRef.current?.render();

      if (
        screenStateRef.current === 'PLAYING' &&
        !settingsOpenRef.current &&
        confirmModeRef.current === null &&
        !isVerifyingRef.current
      ) {
        elapsedSinceEventRef.current += dt;
        const nextLeft = Math.max(0, soloStateRef.current.timeLeft - elapsedSinceEventRef.current);
        timeLeftRef.current = nextLeft;
        setTimeLeft(nextLeft);

        const ceilSec = Math.ceil(nextLeft);
        if (nextLeft > 0 && nextLeft < 5.0 && ceilSec < lastSecondTickRef.current) {
          lastSecondTickRef.current = ceilSec;
          if (ceilSec >= 1 && ceilSec <= 4) {
            audioRef.current?.playCountdownTick();
          }
        } else if (nextLeft >= 5.0) {
          lastSecondTickRef.current = ceilSec;
        }

        audioRef.current?.setTension(nextLeft < 5.0);

        if (nextLeft <= 0) {
          const expired = reduce(soloStateRef.current, { type: 'clock_expired' });
          soloStateRef.current = expired;
          setSoloState(expired);
          if (accountRef.current && soloSyncRef.current) {
            void soloSyncRef.current.recordEvent({ type: 'clock_expired' });
          }
          finalizeFailure(expired);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [finalizeFailure]);

  // Active-chapter 5s periodic checkpoint + visibilitychange / pagehide
  useEffect(() => {
    const persistActive = () => {
      if (screenStateRef.current === 'PLAYING' && soloStateRef.current.status === 'playing') {
        saveActiveCheckpoint({
          style: selectedModeRef.current,
          soloState: soloStateRef.current,
          elapsedSinceLastEvent: elapsedSinceEventRef.current,
        });
      }
    };

    const intervalId = setInterval(persistActive, 500);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistActive();
      }
    };
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', persistActive);
    window.addEventListener('beforeunload', persistActive);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', persistActive);
      window.removeEventListener('beforeunload', persistActive);
    };
  }, []);

  // Global keyboard handler matching GAME_RULES.md §7
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (confirmModeRef.current !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setConfirmMode(null);
        }
        return;
      }

      if (settingsOpenRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setSettingsOpen(false);
          persistSave(saveDataRef.current);
        }
        return;
      }

      if (screenStateRef.current === 'LOBBY') {
        if (e.key === 'Enter') {
          e.preventDefault();
          setScreenState('MODE_SELECT');
        }
        return;
      }

      if (screenStateRef.current === 'MODE_SELECT') {
        if (e.key === 'Escape') {
          e.preventDefault();
          showLobbyStep1();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          beginChapter(1, false);
        }
        return;
      }

      if (screenStateRef.current === 'PLAYING') {
        if (e.key === 'Tab') {
          e.preventDefault();
          const w = soloStateRef.current.slots[soloStateRef.current.wordIndex];
          if (w) triggerPronounce(w.word);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          handleSkipWord();
          return;
        }
        if (e.key === 'Backspace') {
          e.preventDefault();
          flashVirtualKey('BACK');
          handleBackspace();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          flashVirtualKey('ENTER');
          const w = soloStateRef.current.slots[soloStateRef.current.wordIndex];
          if (w && !isVerifyingRef.current) {
            setTypedLetters((curr) => {
              if (curr.join('') === w.word.toUpperCase()) {
                queueMicrotask(() => completeCurrentWord());
              }
              return curr;
            });
          }
          return;
        }
        if (/^[a-zA-Z]$/.test(e.key)) {
          e.preventDefault();
          const upper = e.key.toUpperCase();
          flashVirtualKey(upper);
          handleLetterInput(upper);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    beginChapter,
    completeCurrentWord,
    flashVirtualKey,
    handleBackspace,
    handleLetterInput,
    handleSkipWord,
    showLobbyStep1,
    triggerPronounce,
  ]);

  const activeDifficulty =
    screenState === 'PLAYING' || screenState === 'SUMMARY'
      ? soloState.difficulty
      : saveData.selectedDifficulty;
  const activeCfg = DIFFICULTY_CONFIGS[activeDifficulty];
  const currentWord = soloState.slots[soloState.wordIndex] ?? null;

  return (
    <>
      <canvas id="cosmos-canvas" ref={canvasRef} />
      <div
        id="eclipse-vignette"
        className={`eclipse-vignette ${screenState === 'PLAYING' && timeLeft < 5.0 ? 'active' : ''}`}
      />

      {isOffline && (
        <div
          id="global-offline-banner"
          role="status"
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 twilight-pill rounded-full px-4 py-1.5 text-xs font-semibold text-amber-200"
        >
          Offline — solo play continues locally and will sync when reconnected
        </div>
      )}

      <TopHud
        visible={screenState === 'PLAYING' || screenState === 'SUMMARY'}
        difficulty={activeDifficulty}
        chapter={soloState.chapter}
        timeLeft={timeLeft}
        maxClock={activeCfg.initialClock}
        streak={soloState.streak}
        level={soloState.level}
        score={soloState.score}
        muted={muted}
        syncStatus={account ? syncStatus : null}
        onRetrySync={() => {
          void soloSyncRef.current?.flush();
        }}
        onHomeClick={() => {
          if (screenState === 'PLAYING') {
            setConfirmMode('leave_chapter');
          } else {
            showLobbyStep1();
          }
        }}
        onToggleMute={() => {
          audioRef.current?.ensureContext();
          const nextMuted = audioRef.current?.toggleMute() ?? !muted;
          setMuted(nextMuted);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <GameplayArena
        visible={screenState === 'PLAYING' || screenState === 'SUMMARY'}
        difficulty={activeDifficulty}
        wordIndex={soloState.wordIndex}
        currentWord={currentWord}
        typedLetters={typedLetters}
        glimpseMode={glimpseMode}
        isVerifying={isVerifying}
        verifiedCount={verifiedCount}
        isSpeaking={isSpeaking}
        milestones={milestones}
        flashedKey={flashedKey}
        onPronounce={() => {
          if (currentWord) triggerPronounce(currentWord.word);
        }}
        onSkip={handleSkipWord}
        onVirtualKey={(key) => {
          flashVirtualKey(key);
          if (key === 'BACK') {
            handleBackspace();
          } else if (key === 'ENTER') {
            if (
              currentWord &&
              typedLetters.join('') === currentWord.word.toUpperCase() &&
              !isVerifying
            ) {
              completeCurrentWord();
            }
          } else {
            handleLetterInput(key);
          }
        }}
      />

      <LobbyOverlay
        visible={screenState === 'LOBBY' || screenState === 'MODE_SELECT'}
        step={screenState === 'MODE_SELECT' ? 'MODE_SELECT' : 'LOBBY'}
        selectedDifficulty={saveData.selectedDifficulty}
        selectedMode={selectedMode}
        ambientOn={lobbyAmbientOn}
        saveData={saveData}
        savedCheckpoint={savedCheckpoint}
        account={account}
        syncStatus={account ? syncStatus : null}
        onRetrySync={() => {
          void soloSyncRef.current?.flush();
        }}
        onToggleAmbient={() => {
          setLobbyAmbientOn((prev) => {
            const next = !prev;
            audioRef.current?.setMusicMode(
              next ? 'LOBBY' : 'SILENT',
              saveDataRef.current.selectedDifficulty,
            );
            return next;
          });
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAuth={(tab = 'login') => {
          setAuthInitialTab(tab);
          setAuthModalOpen(true);
        }}
        onOpenProfile={() => setProfileModalOpen(true)}
        onOpenGuestImport={() => setGuestImportOpen(true)}
        onOpenMultiplayer={() => setMultiplayerOpen(true)}
        onOpenLeaderboards={() => setLeaderboardsOpen(true)}
        onLogout={() => {
          void logout();
        }}
        onSelectDifficulty={(diff) => {
          setSaveData((prev) => {
            const next = { ...prev, selectedDifficulty: diff };
            persistSave(next);
            return next;
          });
        }}
        onToModes={() => setScreenState('MODE_SELECT')}
        onBackToLobby={showLobbyStep1}
        onSelectMode={(mode) => setSelectedMode(mode)}
        onBeginJourney={() => beginChapter(1, false)}
        onResumeCheckpoint={handleResumeCheckpoint}
        onAbandonCheckpoint={() => setConfirmMode('abandon_checkpoint')}
      />

      <SettingsModal
        open={settingsOpen}
        difficulty={activeDifficulty}
        settings={saveData.settings}
        onChange={(patch: Partial<UserSettingsSave>) => {
          const nextSettings = { ...saveDataRef.current.settings, ...patch };
          const nextSave = { ...saveDataRef.current, settings: nextSettings };
          saveDataRef.current = nextSave;
          setSaveData(nextSave);
          if (patch.reducedEffects !== undefined) {
            document.body.classList.toggle('reduced-motion', patch.reducedEffects);
            sceneryRef.current?.setReducedMotion(patch.reducedEffects);
          }
          audioRef.current?.applySettings();
          if (account) {
            pendingSettingsPatchRef.current = {
              ...pendingSettingsPatchRef.current,
              ...patch,
            };
            if (settingsSyncTimerRef.current !== null) {
              clearTimeout(settingsSyncTimerRef.current);
            }
            settingsSyncTimerRef.current = setTimeout(() => {
              const toSend = pendingSettingsPatchRef.current;
              pendingSettingsPatchRef.current = {};
              settingsSyncTimerRef.current = null;
              void syncSettings(toSend).catch(() => undefined);
            }, 400);
          }
        }}
        onClose={() => {
          setSettingsOpen(false);
          persistSave(saveDataRef.current);
        }}
      />

      <SummaryModal
        open={screenState === 'SUMMARY'}
        victory={soloState.status === 'victory'}
        difficulty={soloState.difficulty}
        chapter={soloState.chapter}
        score={soloState.score}
        bestStreak={soloState.bestChapterStreak}
        xpEarned={soloState.chapterXp}
        missedWord={soloState.missedWord}
        onNextChapter={() => beginChapter(soloState.chapter + 1, true)}
        onReplayStage={() => beginChapter(1, false)}
        onReturnToLobby={showLobbyStep1}
      />

      <ConfirmDialog
        mode={confirmMode}
        difficulty={activeDifficulty}
        onSaveAndLeave={() => {
          saveActiveCheckpoint({
            style: selectedModeRef.current,
            soloState: soloStateRef.current,
            elapsedSinceLastEvent: elapsedSinceEventRef.current,
          });
          showLobbyStep1();
        }}
        onAbandon={() => {
          clearActiveCheckpoint();
          setSavedCheckpoint(null);
          if (accountRef.current && soloSyncRef.current) {
            void soloSyncRef.current.abandonCurrent('user');
          }
          if (confirmMode === 'leave_chapter') {
            showLobbyStep1();
          } else {
            setConfirmMode(null);
          }
        }}
        onCancel={() => setConfirmMode(null)}
      />

      <AuthModal
        open={authModalOpen}
        initialTab={authInitialTab}
        difficulty={activeDifficulty}
        onLogin={async (input) => {
          const me = await login(input);
          if (!me.profile.imported && saveDataRef.current.profile.xp > 0) {
            setGuestImportOpen(true);
          }
        }}
        onRegister={async (input) => {
          const me = await register(input);
          if (!me.profile.imported && saveDataRef.current.profile.xp > 0) {
            setGuestImportOpen(true);
          }
        }}
        onClose={() => setAuthModalOpen(false)}
      />

      <ProfileModal
        open={profileModalOpen}
        account={account}
        difficulty={activeDifficulty}
        onSave={saveProfile}
        onOpenGuestImport={() => {
          setProfileModalOpen(false);
          setGuestImportOpen(true);
        }}
        onClose={() => setProfileModalOpen(false)}
      />

      <GuestImportModal
        open={guestImportOpen}
        difficulty={activeDifficulty}
        saveData={saveData}
        onImported={() => {
          void refreshMe();
        }}
        onClose={() => setGuestImportOpen(false)}
      />

      <SyncConflictModal
        open={conflictState !== null}
        difficulty={activeDifficulty}
        serverSession={conflictState?.serverSession ?? null}
        localWordIndex={conflictState?.localWordIndex ?? 0}
        localScore={conflictState?.localScore ?? 0}
        onKeepServer={() => {
          const srv = conflictState?.serverSession;
          setConflictState(null);
          if (!srv || !soloSyncRef.current) return;
          void soloSyncRef.current.resolveConflictKeepServer(srv).then(() => {
            soloStateRef.current = srv.state;
            setSoloState(srv.state);
            setSelectedMode(srv.style);
            selectedModeRef.current = srv.style;
            saveActiveCheckpoint({
              style: srv.style,
              soloState: srv.state,
              elapsedSinceLastEvent: 0,
            });
            setSavedCheckpoint(loadActiveCheckpoint());
          });
        }}
        onKeepLocal={() => {
          const srvId = conflictState?.serverSession?.id ?? null;
          setConflictState(null);
          void soloSyncRef.current?.resolveConflictKeepLocal(srvId);
        }}
      />

      <MultiplayerModal
        open={multiplayerOpen}
        account={account}
        difficulty={activeDifficulty}
        onOpenAuth={() => {
          setMultiplayerOpen(false);
          setAuthInitialTab('login');
          setAuthModalOpen(true);
        }}
        onClose={() => setMultiplayerOpen(false)}
      />

      <LeaderboardsModal
        open={leaderboardsOpen}
        difficulty={activeDifficulty}
        onClose={() => setLeaderboardsOpen(false)}
      />
    </>
  );
}
