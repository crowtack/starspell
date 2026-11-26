# Starspell M1 — Manual Audio Listening Checklist

Audio synthesis and Web Audio API output cannot be verified by screenshots or automated headless DOM tests. Please run this checklist manually in a desktop browser (`pnpm dev`) and confirm each item:

1. **Lobby Ambient Toggle**
   - [ ] Click `Play Sunset Breeze` in the top-left lobby bar: beatless warm chords, gentle wind noise, and sparse harp notes begin playing.
   - [ ] Switch difficulty cards (`Easy` → `Intermediate` → `Hard`) and toggle ambient off/on: label updates (`Sunset Breeze`, `Twilight Breeze`, `Eclipse Wind`) and music stops cleanly when toggled off.

2. **Per-Difficulty Soundtracks & BPM**
   - [ ] Start an `Easy` chapter: warm major-7th arpeggio + soft kick at **96 BPM**.
   - [ ] Start an `Intermediate` chapter: moonlit `Am(maj7)` progression + syncopated kick at **106 BPM**.
   - [ ] Start a `Hard` chapter: dark sawtooth pads, staccato triangle accents, and timpani hits at **118 BPM**.

3. **Adaptive Streak Stems**
   - [ ] Reach **Streak 3**: high pentatonic bell chimes fade in smoothly.
   - [ ] Reach **Streak 5**: extra rhythmic kick layer enters.
   - [ ] Reach **Streak 8+**: melodic triangle lead enters.
   - [ ] Skip a word while on a streak: streak-reset descending tone plays and streak stem fades out.

4. **Critical Tension & Countdown Ticks (< 5s)**
   - [ ] Let the chapter clock drop below **5.0s**: high tension pulse stem fades in and distinct countdown ticks sound at 4s, 3s, 2s, 1s.

5. **Interactive Typing & Gameplay SFX**
   - [ ] Type a correct letter: ascending pentatonic chime plays.
   - [ ] Type an incorrect letter: low muted thud plays.
   - [ ] Press Backspace: soft descending pluck plays.
   - [ ] Complete a word: 4-note ascending arpeggio plays (pitch-shifted slightly upward with streak).
   - [ ] Hit a milestone (3, 5, 8, 12, 20): milestone chime plays alongside the floating toast.
   - [ ] Finish chapter (victory): 5-note victory fanfare plays.
   - [ ] Let clock expire (timeout): 4-note descending resolve plays.

6. **Controls: Mute & Settings Sliders**
   - [ ] Click the HUD Mute button: all audio silences smoothly; clicking again restores previous levels.
   - [ ] Open Settings (`Sound & Scenery`): adjust `Master Volume`, `Ambient Sunset Music`, and `Chimes & Keystrokes` sliders and toggle `Background Music`, `Soft Typing Sounds`, and `Milestone Chimes`; verify immediate response and persistence across reload.
