export interface SpeechCallbacks {
  readonly onStart?: () => void;
  readonly onEnd?: () => void;
}

export function cancelSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore speech synthesis errors on unsupported platforms
  }
}

export function speakWord(word: string, callbacks: SpeechCallbacks = {}): void {
  if (!word || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    callbacks.onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 1.02;
    utterance.onstart = () => {
      callbacks.onStart?.();
    };
    utterance.onend = () => {
      callbacks.onEnd?.();
    };
    utterance.onerror = () => {
      callbacks.onEnd?.();
    };
    window.speechSynthesis.speak(utterance);
  } catch {
    callbacks.onEnd?.();
  }
}
