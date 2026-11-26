import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_KEYS,
  isSurvivalEnabled,
  WORDS_PER_CHAPTER,
  type AuthMeResponse,
  type DifficultyKey,
  type MatchHistoryItem,
  type MatchMode,
  type MatchResultsPayload,
  type OpponentProgress,
  type RoomSnapshot,
  type WayfaringStyle,
  type WordIssuePayload,
} from '@starspell/shared';
import { fetchMultiplayerHistory, MultiplayerSocketClient } from '../multiplayer/socketClient';

export interface MultiplayerModalProps {
  open: boolean;
  account: AuthMeResponse | null;
  difficulty: DifficultyKey;
  onOpenAuth: () => void;
  onClose: () => void;
}

export function MultiplayerModal({
  open,
  account,
  difficulty,
  onOpenAuth,
  onClose,
}: MultiplayerModalProps) {
  const clientRef = useRef<MultiplayerSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [tab, setTab] = useState<'play' | 'history'>('play');
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [wordIssue, setWordIssue] = useState<WordIssuePayload | null>(null);
  const [opponents, setOpponents] = useState<OpponentProgress[]>([]);
  const [results, setResults] = useState<MatchResultsPayload | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [createDiff, setCreateDiff] = useState<DifficultyKey>(difficulty);
  const [createStyle, setCreateStyle] = useState<WayfaringStyle>('STARLIGHT');
  const [createMode, setCreateMode] = useState<MatchMode>('COMPETITION');
  const [createRanked, setCreateRanked] = useState(false);
  const survivalAllowed = isSurvivalEnabled();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [countdownLeft, setCountdownLeft] = useState<number>(0);

  useEffect(() => {
    if (!open || !account) return;
    const client = new MultiplayerSocketClient();
    clientRef.current = client;
    client.connect({
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onRoomState: (nextRoom) => {
        setRoom(nextRoom);
        if (nextRoom.status === 'active') {
          setResults(null);
        }
      },
      onWordIssue: (issue) => {
        setWordIssue(issue);
        setAnswer('');
      },
      onMatchProgress: (prog) => setOpponents(prog),
      onMatchResults: (res) => {
        setResults(res);
        setWordIssue(null);
      },
      onSessionReplaced: (info) => setError(info.message),
    });

    return () => {
      client.disconnect();
      clientRef.current = null;
      setConnected(false);
    };
  }, [open, account]);

  useEffect(() => {
    if (!room?.countdownEndsAt || room.status !== 'countdown') {
      setCountdownLeft(0);
      return;
    }
    const update = () => {
      const rem = Math.max(0, Math.ceil(((room.countdownEndsAt ?? 0) - Date.now()) / 1000));
      setCountdownLeft(rem);
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [room?.countdownEndsAt, room?.status]);

  useEffect(() => {
    if (open && account && tab === 'history') {
      void fetchMultiplayerHistory()
        .then(setHistory)
        .catch(() => setHistory([]));
    }
  }, [open, account, tab]);

  if (!open) return null;
  const cfg = DIFFICULTY_CONFIGS[room?.difficulty ?? createDiff];

  const handleCreate = async () => {
    if (!clientRef.current) return;
    setError(null);
    clientRef.current.resetSeq();
    const ack = await clientRef.current.emitCommand<RoomSnapshot>('room.create', '', {
      difficulty: createDiff,
      style: createStyle,
      mode: createMode,
      isRanked: createRanked,
    });
    if (!ack.ok) {
      setError(ack.error?.message ?? 'Unable to create room');
      return;
    }
    if (ack.data) {
      setRoom(ack.data);
      setResults(null);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientRef.current) return;
    setError(null);
    clientRef.current.resetSeq();
    const ack = await clientRef.current.emitCommand<{
      room: RoomSnapshot;
      wordIssue?: WordIssuePayload;
      opponents?: OpponentProgress[];
    }>('room.join', joinCode.trim(), { code: joinCode.trim() });
    if (!ack.ok) {
      setError(ack.error?.message ?? 'Unable to join room');
      return;
    }
    if (ack.data) {
      setRoom(ack.data.room);
      if (ack.data.wordIssue) setWordIssue(ack.data.wordIssue);
      if (ack.data.opponents) setOpponents(ack.data.opponents);
      setResults(null);
    }
  };

  const handleToggleReady = async () => {
    if (!clientRef.current || !room || !account) return;
    const me = room.players.find((p) => p.userId === account.user.id);
    const ack = await clientRef.current.emitCommand<RoomSnapshot>('room.ready', room.code, {
      ready: !(me?.isReady ?? false),
    });
    if (!ack.ok) setError(ack.error?.message ?? 'Failed to update ready state');
  };

  const handleStartMatch = async () => {
    if (!clientRef.current || !room) return;
    setError(null);
    clientRef.current.resetSeq();
    const ack = await clientRef.current.emitCommand<RoomSnapshot>('room.start', room.code, {});
    if (!ack.ok) setError(ack.error?.message ?? 'Cannot start match');
  };

  const handleLeave = async () => {
    if (clientRef.current && room) {
      await clientRef.current.emitCommand('room.leave', room.code, {});
    }
    setRoom(null);
    setWordIssue(null);
    setOpponents([]);
    setResults(null);
    setError(null);
  };

  const handleSolve = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientRef.current || !room || !wordIssue?.currentWord) return;
    setError(null);
    const ack = await clientRef.current.emitCommand<WordIssuePayload>(
      'word.solve',
      room.code,
      { slot: wordIssue.slot, answer: answer.trim() },
      { incrementSeq: true, matchId: wordIssue.matchId },
    );
    if (!ack.ok) {
      setError(ack.error?.message ?? 'Word rejected');
    }
  };

  const handleSkip = async () => {
    if (!clientRef.current || !room || !wordIssue?.currentWord) return;
    setError(null);
    const ack = await clientRef.current.emitCommand<WordIssuePayload>(
      'word.skip',
      room.code,
      { slot: wordIssue.slot },
      { incrementSeq: true, matchId: wordIssue.matchId },
    );
    if (!ack.ok) {
      setError(ack.error?.message ?? 'Unable to skip');
    }
  };

  const meInRoom = room?.players.find((p) => p.userId === account?.user.id);
  const isOwner = room?.ownerId === account?.user.id;
  const connectedCount = room?.players.filter((p) => p.isConnected).length ?? 0;
  const allReady = room ? room.players.filter((p) => p.isConnected).every((p) => p.isReady) : false;

  return (
    <div
      id="multiplayer-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Canyon Competition"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="twilight-glass rounded-[2rem] w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-2xl text-amber-50">Canyon Competition</h2>
            <p className="text-xs text-amber-100/70">
              {connected ? 'Connected to match server' : 'Connecting…'}
            </p>
          </div>
          <button
            id="btn-close-multiplayer"
            type="button"
            aria-label="Close Multiplayer"
            onClick={() => {
              void handleLeave();
              onClose();
            }}
            className="twilight-pill w-9 h-9 rounded-full flex items-center justify-center text-amber-100 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        {!account ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-amber-100/85">
              Sign in or create an account to host or join Competition rooms and save match history.
            </p>
            <button
              id="btn-mp-signin"
              type="button"
              onClick={onOpenAuth}
              className={`rounded-full px-6 py-2.5 font-semibold text-sm text-slate-950 bg-gradient-to-r cursor-pointer ${cfg.ctaClasses}`}
            >
              Sign In / Sign Up
            </button>
          </div>
        ) : (
          <>
            {!room && (
              <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-slate-950/50 border border-amber-200/15">
                <button
                  id="tab-mp-play"
                  type="button"
                  onClick={() => setTab('play')}
                  className={`rounded-full py-1.5 text-xs font-semibold cursor-pointer ${
                    tab === 'play' ? 'bg-amber-300 text-slate-950' : 'text-amber-100/80'
                  }`}
                >
                  Create / Join
                </button>
                <button
                  id="tab-mp-history"
                  type="button"
                  onClick={() => setTab('history')}
                  className={`rounded-full py-1.5 text-xs font-semibold cursor-pointer ${
                    tab === 'history' ? 'bg-amber-300 text-slate-950' : 'text-amber-100/80'
                  }`}
                >
                  Match History
                </button>
              </div>
            )}

            {error && (
              <p
                id="mp-error-banner"
                className="rounded-xl px-3.5 py-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-300/30"
              >
                {error}
              </p>
            )}

            {room && !connected && (
              <p
                id="mp-reconnect-banner"
                className="rounded-xl px-3.5 py-2 text-xs text-amber-200 bg-amber-500/15 border border-amber-300/30"
              >
                Connection lost. Reconnecting to match…
              </p>
            )}

            {!room && tab === 'history' && (
              <div id="mp-history-list" className="flex flex-col gap-2">
                {history.length === 0 ? (
                  <p className="text-xs text-amber-100/70 py-4 text-center">
                    No multiplayer matches played yet.
                  </p>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.matchId}
                      className="twilight-pill rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-amber-100"
                    >
                      <div>
                        <span className="font-bold text-amber-50">
                          #{item.rank} {item.isDraw ? '(Draw)' : ''}
                        </span>{' '}
                        • Room {item.roomCode} • {item.difficulty}
                      </div>
                      <div className="tabular-nums text-amber-200/90">
                        {item.score} pts • {item.wordsSolved}/{WORDS_PER_CHAPTER} •{' '}
                        {item.playerStatus}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {!room && tab === 'play' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="twilight-pill rounded-2xl p-4 flex flex-col gap-3">
                  <h3 className="font-display font-bold text-base text-amber-50">Create Room</h3>
                  <select
                    id="select-mp-create-diff"
                    value={createDiff}
                    onChange={(e) => setCreateDiff(e.target.value as DifficultyKey)}
                    className="rounded-xl px-3 py-2 text-xs bg-slate-950/60 border border-amber-200/20 text-amber-50"
                  >
                    {DIFFICULTY_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {DIFFICULTY_CONFIGS[k].label}
                      </option>
                    ))}
                  </select>
                  <select
                    id="select-mp-create-style"
                    value={createStyle}
                    onChange={(e) => setCreateStyle(e.target.value as WayfaringStyle)}
                    className="rounded-xl px-3 py-2 text-xs bg-slate-950/60 border border-amber-200/20 text-amber-50"
                  >
                    <option value="STARLIGHT">Storybook</option>
                    <option value="ECHO">Evening Echo</option>
                    <option value="FLASH">Sunbeam</option>
                  </select>
                  <select
                    id="select-mp-create-mode"
                    value={createMode}
                    onChange={(e) => setCreateMode(e.target.value as MatchMode)}
                    className="rounded-xl px-3 py-2 text-xs bg-slate-950/60 border border-amber-200/20 text-amber-50"
                  >
                    <option value="COMPETITION">Competition (15 words)</option>
                    {survivalAllowed && <option value="SURVIVAL">Survival (60 words)</option>}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-amber-100/90 cursor-pointer">
                    <input
                      id="chk-mp-ranked"
                      type="checkbox"
                      checked={createRanked}
                      onChange={(e) => setCreateRanked(e.target.checked)}
                    />
                    <span>Ranked Room (affects Rating)</span>
                  </label>
                  <button
                    id="btn-mp-create"
                    type="button"
                    disabled={!connected}
                    onClick={() => void handleCreate()}
                    className={`rounded-full py-2.5 font-semibold text-xs text-slate-950 bg-gradient-to-r cursor-pointer disabled:opacity-50 ${cfg.ctaClasses}`}
                  >
                    Create Room
                  </button>
                </div>

                <form
                  onSubmit={(e) => void handleJoin(e)}
                  className="twilight-pill rounded-2xl p-4 flex flex-col gap-3 justify-between"
                >
                  <div className="flex flex-col gap-2">
                    <h3 className="font-display font-bold text-base text-amber-50">Join Room</h3>
                    <input
                      id="input-mp-join-code"
                      type="text"
                      required
                      maxLength={8}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="5-letter code"
                      className="rounded-xl px-3.5 py-2 text-sm uppercase tracking-widest bg-slate-950/60 border border-amber-200/20 text-amber-50"
                    />
                  </div>
                  <button
                    id="btn-mp-join"
                    type="submit"
                    disabled={!connected}
                    className="twilight-pill rounded-full py-2.5 text-xs font-semibold text-amber-50 hover:border-amber-200/40 cursor-pointer disabled:opacity-50"
                  >
                    Join Room
                  </button>
                </form>
              </div>
            )}

            {room && results && (
              <div id="mp-results-view" className="flex flex-col gap-3">
                <h3 className="font-display font-bold text-xl text-amber-50">
                  {results.status === 'interrupted' ? 'Match Interrupted' : 'Match Results'}
                </h3>
                <div className="flex flex-col gap-2">
                  {results.results.map((r) => (
                    <div
                      key={r.userId}
                      className="twilight-pill rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-amber-100"
                    >
                      <span className="font-bold text-amber-50">
                        #{r.rank} {r.isDraw ? '(Draw)' : ''} @{r.username}
                      </span>
                      <span className="tabular-nums">
                        {r.score} pts • {r.wordsSolved}/{room.maxWords} • {r.status} • +
                        {r.xpAwarded} XP
                        {r.ratingDelta !== undefined
                          ? ` • ${r.ratingDelta >= 0 ? '+' : ''}${String(r.ratingDelta)} MMR`
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    id="btn-mp-results-history"
                    type="button"
                    onClick={() => {
                      void handleLeave();
                      setTab('history');
                    }}
                    className="twilight-pill rounded-full px-4 py-2 text-xs font-semibold text-amber-100 cursor-pointer"
                  >
                    View Match History
                  </button>
                </div>
              </div>
            )}

            {room && !results && room.status === 'waiting' && (
              <div id="mp-waiting-room" className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="twilight-pill rounded-full px-4 py-1.5 text-xs font-bold text-amber-50">
                    Room Code: <span id="mp-room-code">{room.code}</span>
                  </div>
                  <span className="text-xs text-amber-100/80">
                    {DIFFICULTY_CONFIGS[room.difficulty].label} • {room.mode} •{' '}
                    {room.isRanked ? 'Ranked' : 'Unranked'}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {room.players.map((p) => (
                    <div
                      key={p.userId}
                      className="twilight-pill rounded-2xl px-4 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-amber-50">
                        @{p.username} {p.isOwner ? '(Owner)' : ''}
                      </span>
                      <span
                        className={
                          p.isReady ? 'text-emerald-300 font-semibold' : 'text-amber-100/60'
                        }
                      >
                        {p.isReady ? 'Ready' : 'Not Ready'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    id="btn-mp-leave"
                    type="button"
                    onClick={() => void handleLeave()}
                    className="twilight-pill rounded-full px-4 py-2 text-xs font-semibold text-rose-200 cursor-pointer"
                  >
                    Leave
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-mp-ready"
                      type="button"
                      onClick={() => void handleToggleReady()}
                      className="twilight-pill rounded-full px-5 py-2 text-xs font-semibold text-amber-50 cursor-pointer"
                    >
                      {meInRoom?.isReady ? 'Unready' : 'Ready'}
                    </button>
                    {isOwner && (
                      <button
                        id="btn-mp-start"
                        type="button"
                        disabled={connectedCount < 2 || !allReady}
                        onClick={() => void handleStartMatch()}
                        className={`rounded-full px-5 py-2 font-semibold text-xs text-slate-950 bg-gradient-to-r cursor-pointer disabled:opacity-50 ${cfg.ctaClasses}`}
                      >
                        Start Match
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {room && !results && room.status === 'countdown' && (
              <div id="mp-countdown" className="py-8 text-center flex flex-col gap-2">
                <div className="text-xs uppercase tracking-widest text-amber-200/80">
                  Match Starting
                </div>
                <div className="font-display font-bold text-5xl text-amber-50 tabular-nums">
                  {countdownLeft}
                </div>
              </div>
            )}

            {room && !results && room.status === 'active' && (
              <div id="mp-active-match" className="flex flex-col gap-4">
                <div id="mp-opponents-strip" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {opponents.map((op) => (
                    <div
                      key={op.userId}
                      className="twilight-pill rounded-2xl px-3 py-2 text-xs flex flex-col gap-0.5"
                    >
                      <span className="font-semibold text-amber-50 truncate">@{op.username}</span>
                      <span className="text-amber-100/80 tabular-nums">
                        {op.wordIndex}/{room.maxWords} • {op.score} pts • {Math.ceil(op.timeLeft)}s
                      </span>
                    </div>
                  ))}
                </div>

                {wordIssue?.currentWord ? (
                  <form onSubmit={(e) => void handleSolve(e)} className="flex flex-col gap-3">
                    <div className="twilight-pill rounded-2xl p-4 flex flex-col gap-2">
                      <div className="flex justify-between text-xs text-amber-200/90 tabular-nums">
                        <span id="mp-my-slot">
                          Word {wordIssue.slot + 1} / {room.maxWords}
                        </span>
                        <span id="mp-my-score">Score {wordIssue.score}</span>
                      </div>
                      <p className="text-sm text-amber-50 font-medium">
                        {wordIssue.currentWord.definition}
                      </p>
                      <p className="text-[11px] text-amber-100/60">
                        Starts with: {wordIssue.currentWord.word[0]?.toUpperCase()} (
                        {wordIssue.currentWord.word.length} letters)
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <input
                        id="mp-word-input"
                        type="text"
                        autoFocus
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type spelling…"
                        className="flex-1 rounded-xl px-3.5 py-2.5 text-sm bg-slate-950/60 border border-amber-200/20 text-amber-50"
                      />
                      <button
                        id="btn-mp-submit"
                        type="submit"
                        className={`rounded-full px-5 py-2 font-semibold text-xs text-slate-950 bg-gradient-to-r cursor-pointer ${cfg.ctaClasses}`}
                      >
                        Submit
                      </button>
                      <button
                        id="btn-mp-skip"
                        type="button"
                        onClick={() => void handleSkip()}
                        className="twilight-pill rounded-full px-4 py-2 text-xs font-semibold text-amber-100 cursor-pointer"
                      >
                        Skip
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="text-center text-sm text-amber-100/80 py-4">
                    Waiting for other players to finish…
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
