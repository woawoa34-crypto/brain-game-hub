import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Flag,
  HelpCircle,
  Home,
  Loader2,
  Lock,
  RotateCcw,
  Search,
  Send,
  Trophy,
} from 'lucide-react';
import { set as fbSet, update as fbUpdate } from 'firebase/database';
import {
  getRoomGameStateRef,
  recordMatchWinnerScore,
  rematchSameGame,
  resolveHostRole,
} from '../services/onlineRoom';
import {
  getSimilarityLabel,
  getSimilarityTier,
  type GameMode,
  type GamePhase,
  type GiveUpResponse,
  type GuessAnswerResponse,
  type HintEntry,
  type StartGameResponse,
  type SubmitHintResponse,
} from '../types';
import type { OnlineGameSharedProps, OnlineRole, OnlineWordChainState } from '../types/online';
import { soundEngine } from '../utils/sound';
import { GameBoardLayout } from './GameBoardLayout';
import { HintRow } from './HintRow';
import { ResultSummary } from './ResultSummary';
import { StartScreen } from './StartScreen';
import { VictoryConfetti } from './VictoryConfetti';

const ONLINE_SHOT_CLOCK_SEC = 45;
const API_REQUEST_TIMEOUT_MS = 18000;

function sanitizeDisplayWord(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

async function postGameApi<T>(
  url: string,
  body: Record<string, unknown>,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let parsed: (T & { error?: unknown }) | null = null;
    try {
      parsed = JSON.parse(rawText) as T & { error?: unknown };
    } catch {
      throw new Error(
        `[HTTP ${res.status}] 서버 응답이 올바른 JSON 형식이 아닙니다. 백엔드 서버 상태를 확인해 주세요.`,
      );
    }

    if (!res.ok) {
      const serverMsg =
        parsed && typeof parsed.error === 'string' && parsed.error.trim()
          ? parsed.error.trim()
          : `요청 처리에 실패했습니다.`;
      throw new Error(
        serverMsg.startsWith('[HTTP ') ? serverMsg : `[HTTP ${res.status}] ${serverMsg}`,
      );
    }

    return parsed;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('요청 시간이 초과되었습니다 (18초). 다시 시도해 주세요.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

interface WordChainGameProps extends OnlineGameSharedProps {
  onBackToLobby: () => void;
}

export function WordChainGame({
  onBackToLobby,
  isPaused = false,
  onlineRoom,
  myRole,
  onReturnToWaitingRoom,
  onlineReactionBar,
}: WordChainGameProps) {
  const isOnline = Boolean(onlineRoom && myRole);
  const hostRole: OnlineRole = resolveHostRole(onlineRoom);
  const isHost = Boolean(isOnline && myRole === hostRole);
  const matchNumber = onlineRoom?.matchNumber ?? 1;
  const firstTurnRole: OnlineRole = onlineRoom?.firstTurnRole ?? 'P1';
  const onlineWord = onlineRoom?.gameState?.wordChain ?? null;

  // Local state
  const [phase, setPhase] = useState<GamePhase>('TITLE');
  const [mode, setMode] = useState<GameMode>('solo');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [maskedCount, setMaskedCount] = useState<number>(4);

  const [hints, setHints] = useState<HintEntry[]>([]);
  const [latestHintId, setLatestHintId] = useState<string | null>(null);
  const [alreadyTriedNotice, setAlreadyTriedNotice] = useState<string | null>(null);
  const [hintCount, setHintCount] = useState(0);
  const [answerAttempts, setAnswerAttempts] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [revealedWord, setRevealedWord] = useState<string>('');
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);

  const [hintInput, setHintInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [guessFeedback, setGuessFeedback] = useState<string | null>(null);
  const [shakeGuess, setShakeGuess] = useState(false);
  const [mobileInputTab, setMobileInputTab] = useState<'hint' | 'guess'>('hint');
  const [showCriteriaMobile, setShowCriteriaMobile] = useState(false);

  const [isStartingSolo, setIsStartingSolo] = useState(false);
  const [isStartingSetter, setIsStartingSetter] = useState(false);
  const [isSubmittingHint, setIsSubmittingHint] = useState(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isGivingUp, setIsGivingUp] = useState(false);
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Online shot clock + server session ref
  const [shotClock, setShotClock] = useState<number>(ONLINE_SHOT_CLOCK_SEC);
  const [isRematching, setIsRematching] = useState(false);
  const hostSessionIdRef = useRef<string | null>(null);
  const initializedRoundRef = useRef<number>(0);
  const processedReqIdRef = useRef<string | null>(null);
  const scoredMatchRef = useRef<string | null>(null);
  const shotClockGuardRef = useRef<boolean>(false);

  const hintInputRef = useRef<HTMLInputElement | null>(null);
  const guessInputRef = useRef<HTMLInputElement | null>(null);

  const showErrorNotice = useCallback((msg: string) => {
    setErrorMessage(msg);
    setErrorToast(msg);
  }, []);

  useEffect(() => {
    if (!errorToast) return;
    const timer = window.setTimeout(() => setErrorToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [errorToast]);

  // Effective synced data for display
  const activeHints = useMemo(
    () => (isOnline ? (onlineWord?.hints ?? []) : hints),
    [isOnline, onlineWord?.hints, hints],
  );
  const activeWrongGuesses = useMemo(
    () => (isOnline ? (onlineWord?.wrongGuesses ?? []) : wrongGuesses),
    [isOnline, onlineWord?.wrongGuesses, wrongGuesses],
  );
  const activeHintCount = isOnline ? (onlineWord?.hintCount ?? 0) : hintCount;
  const activeAnswerAttempts = isOnline ? (onlineWord?.answerAttempts ?? 0) : answerAttempts;
  const activeMaskedCount = isOnline ? (onlineWord?.maskedCount ?? 4) : maskedCount;

  const sortedHints = useMemo(() => {
    return [...activeHints].sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      if (b.rawCosine !== a.rawCosine) return b.rawCosine - a.rawCosine;
      return a.order - b.order;
    });
  }, [activeHints]);

  const latestHint = useMemo(() => {
    if (isOnline) {
      if (sortedHints.length === 0) return null;
      const latestByOrder = [...activeHints].sort((a, b) => b.order - a.order)[0];
      if (!latestByOrder) return null;
      const index = sortedHints.findIndex((h) => h.id === latestByOrder.id);
      return index >= 0 ? { entry: sortedHints[index], rank: index + 1 } : null;
    }
    if (!latestHintId) return null;
    const index = sortedHints.findIndex((h) => h.id === latestHintId);
    if (index === -1) return null;
    return { entry: sortedHints[index], rank: index + 1 };
  }, [isOnline, activeHints, latestHintId, sortedHints]);

  const startOnlineHostMatch = useCallback(async () => {
    if (!isOnline || !isHost || !onlineRoom) return;
    processedReqIdRef.current = null;
    hostSessionIdRef.current = null;
    setErrorMessage(null);
    setHintInput('');
    setGuessInput('');
    setGuessFeedback(null);

    const stateRef = getRoomGameStateRef(onlineRoom.roomCode, 'wordChain');
    try {
      await fbSet(stateRef, {
        phase: 'STARTING',
        maskedCount: 4,
        currentTurn: firstTurnRole,
        hints: [],
        wrongGuesses: [],
        pendingRequest: null,
        lastError: null,
        winner: null,
        revealedWord: null,
        hintCount: 0,
        answerAttempts: 0,
        roundKey: matchNumber,
      } satisfies OnlineWordChainState);

      const started = await postGameApi<StartGameResponse>('/api/game/start', {
        mode: 'solo',
      });
      hostSessionIdRef.current = started.sessionId;

      await fbUpdate(stateRef, {
        phase: 'PLAYING',
        maskedCount: started.maskedCount,
        currentTurn: firstTurnRole,
        lastError: null,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'AI 단어 출제에 실패했습니다.';
      showErrorNotice(msg);
      try {
        await fbUpdate(stateRef, {
          lastError: msg,
        });
      } catch {
        // Ignore secondary RTDB write failure
      }
    }
  }, [isOnline, isHost, onlineRoom, matchNumber, firstTurnRole, showErrorNotice]);

  // Online Host Initialization for each matchNumber
  useEffect(() => {
    if (!isOnline || !isHost || !onlineRoom) return;
    if (onlineWord && onlineWord.roundKey === matchNumber) return;
    if (initializedRoundRef.current === matchNumber) return;

    initializedRoundRef.current = matchNumber;
    void startOnlineHostMatch();
  }, [isOnline, isHost, onlineRoom, onlineWord, matchNumber, startOnlineHostMatch]);

  // Process incoming online requests on Host via server /api/game/* routes
  useEffect(() => {
    if (!isOnline || !isHost || !onlineRoom || !onlineWord) return;
    const req = onlineWord.pendingRequest;
    if (!req || req.id === processedReqIdRef.current) return;

    const hostSessionId = hostSessionIdRef.current;
    const stateRef = getRoomGameStateRef(onlineRoom.roomCode, 'wordChain');
    if (!hostSessionId) {
      processedReqIdRef.current = req.id;
      void fbUpdate(stateRef, {
        pendingRequest: null,
        lastError: '방장 세션이 초기화되었습니다. 다시 출제를 시도해 주세요.',
      });
      return;
    }

    processedReqIdRef.current = req.id;

    const processReq = async () => {
      const nextTurn: OnlineRole = req.by === 'P1' ? 'P2' : 'P1';
      const curHints = onlineWord.hints ?? [];
      const curWrong = onlineWord.wrongGuesses ?? [];

      try {
        if (req.type === 'hint') {
          const rawWord = sanitizeDisplayWord(req.word);
          if (!rawWord || rawWord.length > 25) {
            throw new Error('힌트 단어를 1~25자 이내로 입력해 주세요.');
          }

          const data = await postGameApi<SubmitHintResponse>('/api/game/hint', {
            sessionId: hostSessionId,
            word: rawWord,
          });

          if (data.alreadyTried) {
            await fbUpdate(stateRef, {
              pendingRequest: null,
              lastError: `'${data.hint.word}'은(는) 이미 입력된 힌트입니다.`,
            });
            return;
          }

          if (data.hint.isExactMatch) {
            await fbUpdate(stateRef, {
              hints: [...curHints, data.hint],
              hintCount: data.hintCount,
              answerAttempts: data.answerAttempts,
              phase: 'RESULT',
              winner: req.by,
              revealedWord: data.hint.word,
              pendingRequest: null,
              lastError: null,
            });
            return;
          }

          await fbUpdate(stateRef, {
            hints: [...curHints, data.hint],
            hintCount: data.hintCount,
            answerAttempts: data.answerAttempts,
            currentTurn: nextTurn,
            pendingRequest: null,
            lastError: null,
          });
        } else if (req.type === 'guess') {
          const rawWord = sanitizeDisplayWord(req.word);
          const data = await postGameApi<GuessAnswerResponse>('/api/game/guess', {
            sessionId: hostSessionId,
            word: rawWord,
          });

          if (data.correct) {
            await fbUpdate(stateRef, {
              hintCount: data.hintCount,
              answerAttempts: data.answerAttempts,
              phase: 'RESULT',
              winner: req.by,
              revealedWord: data.targetWord ?? rawWord,
              pendingRequest: null,
              lastError: null,
            });
          } else {
            const nextWrong = curWrong.includes(rawWord) ? curWrong : [...curWrong, rawWord];
            await fbUpdate(stateRef, {
              wrongGuesses: nextWrong,
              hintCount: data.hintCount,
              answerAttempts: data.answerAttempts,
              currentTurn: nextTurn,
              pendingRequest: null,
              lastError: `'${rawWord}'은(는) 정답이 아닙니다.`,
            });
          }
        } else if (req.type === 'giveup') {
          const data = await postGameApi<GiveUpResponse>('/api/game/give-up', {
            sessionId: hostSessionId,
          });
          await fbUpdate(stateRef, {
            hintCount: data.hintCount,
            answerAttempts: data.answerAttempts,
            phase: 'RESULT',
            winner: 'GAVE_UP',
            revealedWord: data.targetWord,
            pendingRequest: null,
            lastError: null,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.';
        showErrorNotice(msg);
        try {
          await fbUpdate(stateRef, {
            pendingRequest: null,
            lastError: msg,
          });
        } catch {
          // Ignore secondary RTDB write failure
        }
      }
    };

    void processReq();
  }, [isOnline, isHost, onlineRoom, onlineWord, showErrorNotice]);

  // Watchdog: prevent stuck pendingRequest in online mode if host timed out or disconnected
  useEffect(() => {
    if (!isOnline || !onlineRoom || !onlineWord?.pendingRequest) return;
    const req = onlineWord.pendingRequest;
    const ageMs = Date.now() - req.createdAt;
    const waitMs = Math.max(500, 20000 - ageMs);

    const timer = window.setTimeout(() => {
      if (isHost || req.by === myRole) {
        void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wordChain'), {
          pendingRequest: null,
          lastError: '⏱️ 요청 처리 시간이 초과되었습니다. 다시 시도해 주세요.',
        });
      }
    }, waitMs);

    return () => window.clearTimeout(timer);
  }, [isOnline, isHost, myRole, onlineRoom, onlineWord?.pendingRequest]);

  // Play sound & record winner score in online mode when RESULT arrives
  useEffect(() => {
    if (!isOnline || !onlineRoom || !onlineWord) return;
    if (onlineWord.phase !== 'RESULT') return;
    const key = `WORD_GAME_${onlineWord.roundKey}`;
    if (scoredMatchRef.current === key) return;
    scoredMatchRef.current = key;

    if (onlineWord.winner === myRole) {
      soundEngine.playVictory();
    } else if (onlineWord.winner === 'GAVE_UP') {
      soundEngine.playWrongGuess();
    } else {
      soundEngine.playTick();
    }

    if (onlineWord.winner === 'P1' || onlineWord.winner === 'P2') {
      void recordMatchWinnerScore(onlineRoom.roomCode, onlineWord.winner, key);
    }
  }, [isOnline, onlineRoom, onlineWord, myRole]);

  // Online 45s Shot Clock (pauses when isPaused, auto-passes turn at 0s on active turn player's device)
  const isMyOnlineTurn = Boolean(
    isOnline &&
      onlineWord?.phase === 'PLAYING' &&
      onlineWord.currentTurn === myRole &&
      !onlineWord.pendingRequest,
  );

  useEffect(() => {
    if (!isOnline || !onlineWord || onlineWord.phase !== 'PLAYING') return;
    setShotClock(ONLINE_SHOT_CLOCK_SEC);
    shotClockGuardRef.current = false;
  }, [
    isOnline,
    onlineWord?.phase,
    onlineWord?.currentTurn,
    onlineWord?.hintCount,
    onlineWord?.answerAttempts,
    onlineWord?.roundKey,
  ]);

  useEffect(() => {
    if (!isOnline || !onlineRoom || !onlineWord || onlineWord.phase !== 'PLAYING') return;
    if (isPaused || onlineWord.pendingRequest) return;

    const timer = window.setInterval(() => {
      setShotClock((prev) => {
        if (prev <= 1) {
          if (isMyOnlineTurn && !shotClockGuardRef.current && myRole) {
            shotClockGuardRef.current = true;
            const nextTurn: OnlineRole = myRole === 'P1' ? 'P2' : 'P1';
            const myName = onlineRoom.players?.[myRole]?.nickname ?? myRole;
            void fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wordChain'), {
              currentTurn: nextTurn,
              lastError: `${myName}님 제한 시간(45초) 초과로 턴이 자동으로 넘어갔습니다.`,
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isOnline, onlineRoom, onlineWord, isPaused, isMyOnlineTurn, myRole]);

  const resetRoundState = () => {
    setHints([]);
    setLatestHintId(null);
    setAlreadyTriedNotice(null);
    setHintCount(0);
    setAnswerAttempts(0);
    setTotalAttempts(0);
    setRevealedWord('');
    setWrongGuesses([]);
    setHintInput('');
    setGuessInput('');
    setGuessFeedback(null);
    setConfirmingGiveUp(false);
    setErrorMessage(null);
    setMobileInputTab('hint');
    setShowCriteriaMobile(false);
  };

  const startGame = async (selectedMode: GameMode, customWord?: string) => {
    setErrorMessage(null);

    if (selectedMode === 'solo') {
      setIsStartingSolo(true);
    } else {
      setIsStartingSetter(true);
    }

    try {
      const payload: { mode: GameMode; customWord?: string } = { mode: selectedMode };
      if (selectedMode === 'setter') {
        const rawCustom = sanitizeDisplayWord(customWord ?? '');
        if (!rawCustom) {
          throw new Error('정답 단어를 입력해주세요.');
        }
        if (rawCustom.length > 20) {
          throw new Error('정답 단어는 20자 이내로 입력해주세요.');
        }
        payload.customWord = rawCustom;
      }

      const data = await postGameApi<StartGameResponse>('/api/game/start', payload);

      resetRoundState();
      setSessionId(data.sessionId);
      setMode(data.mode);
      setMaskedCount(data.maskedCount);
      setPhase('PLAYING');

      window.setTimeout(() => {
        hintInputRef.current?.focus();
      }, 60);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '게임을 시작하는 중 오류가 발생했습니다.';
      showErrorNotice(msg);
    } finally {
      setIsStartingSolo(false);
      setIsStartingSetter(false);
    }
  };

  const handleReturnToTitle = () => {
    resetRoundState();
    setSessionId(null);
    setPhase('TITLE');
  };

  const dispatchOnlineRequest = async (type: 'hint' | 'guess' | 'giveup', word: string) => {
    if (!onlineRoom || !myRole || !onlineWord || onlineWord.phase !== 'PLAYING') return;
    if (onlineWord.currentTurn !== myRole || isPaused || onlineWord.pendingRequest) return;

    try {
      await fbUpdate(getRoomGameStateRef(onlineRoom.roomCode, 'wordChain'), {
        pendingRequest: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type,
          by: myRole,
          word,
          createdAt: Date.now(),
        },
        lastError: null,
      });
    } catch (err) {
      showErrorNotice(
        err instanceof Error ? err.message : '온라인 요청 전송 중 오류가 발생했습니다.',
      );
    }
  };

  const handleHintSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const word = sanitizeDisplayWord(hintInput);
    if (!word) return;

    if (isOnline) {
      if (!isMyOnlineTurn) return;
      setHintInput('');
      await dispatchOnlineRequest('hint', word);
      return;
    }

    if (!sessionId || isSubmittingHint || isPaused) return;

    if (word.length > 25) {
      showErrorNotice('힌트 단어는 25자 이내로 입력해주세요.');
      return;
    }

    setErrorMessage(null);
    setAlreadyTriedNotice(null);
    setIsSubmittingHint(true);

    try {
      const data = await postGameApi<SubmitHintResponse>('/api/game/hint', {
        sessionId,
        word,
      });

      setHintCount(data.hintCount);
      setAnswerAttempts(data.answerAttempts);
      setLatestHintId(data.hint.id);

      if (data.alreadyTried) {
        setAlreadyTriedNotice(`'${data.hint.word}'은(는) 이미 입력한 힌트입니다.`);
      } else {
        setHints((prev) => [...prev, data.hint]);
        void soundEngine.playHintResult(data.hint.similarity);
      }

      setHintInput('');
      hintInputRef.current?.focus();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '유사도 계산 중 오류가 발생했습니다.';
      showErrorNotice(msg);
    } finally {
      setIsSubmittingHint(false);
    }
  };

  const submitAnswerChallenge = async (candidateWord: string) => {
    const word = sanitizeDisplayWord(candidateWord);
    if (!word) return;

    if (isOnline) {
      if (!isMyOnlineTurn) return;
      setGuessInput('');
      await dispatchOnlineRequest('guess', word);
      return;
    }

    if (!sessionId || isSubmittingGuess || isPaused) return;

    setErrorMessage(null);
    setGuessFeedback(null);
    setIsSubmittingGuess(true);

    try {
      const data = await postGameApi<GuessAnswerResponse>('/api/game/guess', {
        sessionId,
        word,
      });

      setHintCount(data.hintCount);
      setAnswerAttempts(data.answerAttempts);
      setTotalAttempts(data.totalAttempts);

      if (data.correct) {
        void soundEngine.playVictory();
        setRevealedWord(data.targetWord ?? word);
        setPhase('VICTORY');
      } else {
        void soundEngine.playWrongGuess();
        setWrongGuesses((prev) => (prev.includes(word) ? prev : [...prev, word]));
        setGuessFeedback(`'${word}'은(는) 정답이 아닙니다.`);
        setGuessInput('');
        setShakeGuess(false);
        window.requestAnimationFrame(() => setShakeGuess(true));
        window.setTimeout(() => setShakeGuess(false), 280);
        guessInputRef.current?.focus();
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '정답 확인 중 오류가 발생했습니다.';
      showErrorNotice(msg);
    } finally {
      setIsSubmittingGuess(false);
    }
  };

  const handleGuessSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitAnswerChallenge(guessInput);
  };

  const handleGiveUp = async () => {
    if (isOnline) {
      setConfirmingGiveUp(false);
      await dispatchOnlineRequest('giveup', '');
      return;
    }

    if (!sessionId || isGivingUp) return;
    setErrorMessage(null);
    setIsGivingUp(true);

    try {
      const data = await postGameApi<GiveUpResponse>('/api/game/give-up', {
        sessionId,
      });
      setRevealedWord(data.targetWord);
      setHintCount(data.hintCount);
      setAnswerAttempts(data.answerAttempts);
      setTotalAttempts(data.totalAttempts);
      setConfirmingGiveUp(false);
      setPhase('GAVE_UP');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '포기 처리 중 오류가 발생했습니다.';
      showErrorNotice(msg);
    } finally {
      setIsGivingUp(false);
    }
  };

  const handlePrefillGuess = (word: string) => {
    if (isOnline && !isMyOnlineTurn) return;
    setGuessInput(word);
    setGuessFeedback(null);
    setMobileInputTab('guess');
    window.setTimeout(() => guessInputRef.current?.focus(), 30);
  };

  const handleOnlineRematch = async () => {
    if (!onlineRoom || !isHost || isRematching) return;
    setIsRematching(true);
    try {
      await rematchSameGame(onlineRoom.roomCode, firstTurnRole);
    } finally {
      setIsRematching(false);
    }
  };

  const toastBanner = errorToast ? (
    <div
      role="alert"
      className="fixed left-1/2 top-14 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-2xl border-[3px] border-rose-400 bg-[#1D1B3D] px-4 py-2.5 text-xs font-bold text-rose-200 shadow-[0_6px_0_#15132d]"
    >
      <span>{errorToast}</span>
      <button
        type="button"
        onClick={() => setErrorToast(null)}
        className="shrink-0 rounded-lg border border-rose-400/50 px-1.5 py-0.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/25"
      >
        닫기
      </button>
    </div>
  ) : null;

  // Online Preparing screen
  if (isOnline && (!onlineWord || onlineWord.phase === 'STARTING')) {
    return (
      <>
        {toastBanner}
        <div className="flex h-full min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="arcade-panel max-w-md space-y-3 rounded-3xl p-6">
            {!onlineWord?.lastError ? (
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6B61FF]" aria-hidden="true" />
            ) : (
              <Lock className="mx-auto h-8 w-8 text-rose-400" aria-hidden="true" />
            )}
            <p className="text-base font-extrabold text-white">
              {onlineWord?.lastError
                ? 'AI 단어 출제를 완료하지 못했습니다'
                : `방장(${onlineRoom?.players?.[hostRole]?.nickname ?? hostRole})이 AI 단어를 출제하고 있습니다...`}
            </p>
            {onlineWord?.lastError && (
              <div className="space-y-2 rounded-2xl border-2 border-rose-400 bg-[#121026] px-4 py-3 text-xs text-rose-200">
                <p>{onlineWord.lastError}</p>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => void startOnlineHostMatch()}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[#FFD21E] px-3 py-1.5 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] hover:bg-[#FF61D2]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>다시 출제 시도</span>
                  </button>
                )}
              </div>
            )}
            {onReturnToWaitingRoom && (
              <button
                type="button"
                onClick={onReturnToWaitingRoom}
                className="mt-2 min-h-10 rounded-2xl border-2 border-[#2B2857] bg-[#121026] px-4 py-2 text-xs font-bold text-white transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E]"
              >
                대기실로 돌아가기
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // Online Result screen
  if (isOnline && onlineWord?.phase === 'RESULT') {
    const winnerRole = onlineWord.winner;
    const winnerName =
      winnerRole === 'P1' || winnerRole === 'P2'
        ? (onlineRoom?.players?.[winnerRole]?.nickname ?? winnerRole)
        : null;
    const iWon = winnerRole === myRole;

    return (
      <div className="h-full overflow-y-auto px-4 py-6 sm:px-6">
        {iWon && <VictoryConfetti />}
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="arcade-panel rounded-3xl p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#FF61D2]">
                  <Trophy className="h-4 w-4 text-[#FFD21E]" aria-hidden="true" />
                  <span>
                    {winnerName
                      ? `${winnerName}님이 정답을 맞혀 승리했습니다!`
                      : '정답을 공개하며 대결이 종료되었습니다'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-xs font-bold text-white/70">정답 단어</span>
                  <h1 className="font-display text-4xl font-bold text-[#FFD21E]">
                    {onlineWord.revealedWord ?? '—'}
                  </h1>
                </div>
                <p className="mt-1.5 font-mono text-xs text-white/75">
                  힌트 {onlineWord.hintCount}회 · 정답 도전 {onlineWord.answerAttempts}회
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {isHost && (
                  <button
                    type="button"
                    disabled={isRematching}
                    onClick={() => void handleOnlineRematch()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-[#FFD21E] px-4 py-2 text-xs font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] disabled:opacity-60 whitespace-nowrap"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span>{isRematching ? '준비 중...' : '같은 게임 바로 재대결'}</span>
                  </button>
                )}
                {onReturnToWaitingRoom && (
                  <button
                    type="button"
                    onClick={onReturnToWaitingRoom}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-[#6B61FF] px-4 py-2 text-xs font-bold text-white shadow-[0_4px_0_#433AB5] transition-all hover:bg-[#FF61D2] hover:text-[#121026] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] whitespace-nowrap"
                  >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    <span>대기실로 돌아가기</span>
                  </button>
                )}
              </div>
            </div>
            {!isHost && (
              <p className="mt-3 text-xs text-white/70">
                방장({onlineRoom?.players?.[hostRole]?.nickname ?? hostRole})이 재대결 또는 대기실 복귀를 선택할 수 있습니다.
              </p>
            )}
          </section>

          <section className="arcade-panel rounded-3xl p-5">
            <h2 className="mb-3 font-display text-lg font-bold text-[#FF61D2]">
              힌트 기록 ({sortedHints.length}개)
            </h2>
            {sortedHints.length === 0 ? (
              <p className="py-6 text-center text-xs text-white/65">
                입력한 힌트 단어가 없습니다.
              </p>
            ) : (
              <ol className="space-y-2">
                {sortedHints.map((hint, idx) => (
                  <HintRow key={hint.id} hint={hint} rank={idx + 1} isLatest={false} />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Local TITLE
  if (!isOnline && phase === 'TITLE') {
    return (
      <>
        {toastBanner}
        <div className="h-full overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
            <button
              type="button"
              onClick={onBackToLobby}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1 text-xs font-bold text-white shadow-[0_3px_0_#15132d] transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>로비로 돌아가기</span>
            </button>
          </div>
          <StartScreen
            isStartingSolo={isStartingSolo}
            isStartingSetter={isStartingSetter}
            errorMessage={errorMessage}
            onStartSolo={() => startGame('solo')}
            onStartSetter={(word) => startGame('setter', word)}
            onClearError={() => setErrorMessage(null)}
          />
        </div>
      </>
    );
  }

  // Local VICTORY / GAVE_UP
  if (!isOnline && (phase === 'VICTORY' || phase === 'GAVE_UP')) {
    return (
      <>
        {toastBanner}
        <div className="h-full overflow-y-auto">
          {phase === 'VICTORY' && <VictoryConfetti />}
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
            <button
              type="button"
              onClick={handleReturnToTitle}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1 text-xs font-bold text-white shadow-[0_3px_0_#15132d] transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E] whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>모드 선택으로</span>
            </button>
          </div>
          <ResultSummary
            won={phase === 'VICTORY'}
            mode={mode}
            targetWord={revealedWord}
            hintCount={hintCount}
            answerAttempts={answerAttempts}
            totalAttempts={totalAttempts}
            sortedHints={sortedHints}
            wrongGuesses={wrongGuesses}
            isStartingSolo={isStartingSolo}
            onPlaySoloAgain={() => startGame('solo')}
            onReturnToTitle={handleReturnToTitle}
          />
        </div>
      </>
    );
  }

  // PLAYING PHASE (Both Local & Online): One-Screen 100dvh Fold 8 GameBoardLayout
  const onlineTurnRole = onlineWord?.currentTurn ?? 'P1';
  const onlineTurnNickname = onlineRoom?.players?.[onlineTurnRole]?.nickname ?? onlineTurnRole;
  const inputsDisabled = isPaused || (isOnline && !isMyOnlineTurn);
  const pendingOnlineCall = Boolean(isOnline && onlineWord?.pendingRequest);
  const displayError = isOnline ? (onlineWord?.lastError ?? errorMessage) : errorMessage;

  return (
    <>
      {toastBanner}
      <GameBoardLayout
        scrollableMain
      onlineReactionBar={onlineReactionBar}
      topBar={
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-[3px] border-[#2B2857] bg-[#1D1B3D] px-3 py-2 shadow-[0_4px_0_#15132d] sm:px-4">
          <div className="flex items-center gap-2.5">
            {!isOnline && (
              <button
                type="button"
                onClick={handleReturnToTitle}
                aria-label="모드 선택으로"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[#2B2857] bg-[#121026] text-white transition-colors hover:border-[#6B61FF] hover:text-[#FFD21E]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-[#6B61FF]" aria-hidden="true" />
              <span className="font-display text-base font-bold text-[#FFD21E] sm:text-lg">말결</span>
              <span className="flex items-center gap-1 rounded-lg border-2 border-[#2B2857] bg-[#121026] px-2 py-0.5">
                {Array.from({ length: Math.min(6, Math.max(4, activeMaskedCount)) }).map((_, i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[#FF61D2]"
                    aria-hidden="true"
                  />
                ))}
              </span>
              {isOnline && (
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold ${
                    isMyOnlineTurn
                      ? 'border-[#FF61D2] bg-[#FF61D2] text-[#121026]'
                      : 'border-[#2B2857] bg-[#121026] text-white/75'
                  }`}
                >
                  {isMyOnlineTurn ? '내 차례' : `${onlineTurnNickname} 차례`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/75">
            {!isOnline && (
              <>
                <span className="hidden font-bold sm:inline">
                  {mode === 'solo' ? '솔로 모드' : '출제자 모드'}
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-white/35">·</span>
              </>
            )}
            <span className="font-mono font-bold tabular-nums text-white">힌트 {activeHintCount}</span>
            <span aria-hidden="true" className="text-white/35">·</span>
            <span className="font-mono font-bold tabular-nums text-white">
              도전 {activeAnswerAttempts}
            </span>
            {isOnline && (
              <div className="ml-1 flex items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 py-0.5">
                <Clock
                  className={`h-3 w-3 ${shotClock <= 10 ? 'text-rose-400' : 'text-[#FFD21E]'}`}
                  aria-hidden="true"
                />
                <span
                  className={`font-mono text-xs font-extrabold tabular-nums ${
                    shotClock <= 10 ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {shotClock}s
                </span>
              </div>
            )}
          </div>
        </div>
      }
      noticeBar={
        displayError ? (
          <div
            role="alert"
            className="rounded-2xl border-2 border-rose-400 bg-[#1D1B3D] px-3 py-2 text-xs font-bold text-rose-200"
          >
            {displayError}
          </div>
        ) : isOnline && !isMyOnlineTurn ? (
          <div className="flex items-center gap-2 rounded-2xl border-2 border-[#2B2857] bg-[#1D1B3D] px-3 py-1.5 text-xs font-bold text-white">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6B61FF]" aria-hidden="true" />
            <span>
              {pendingOnlineCall
                ? 'AI 채점 요청을 처리하는 중...'
                : `상대방(${onlineTurnNickname})의 행동을 기다리는 중...`}
            </span>
          </div>
        ) : undefined
      }
      boardArea={
        <div className="flex flex-col gap-2.5 pb-1">
          {latestHint && (
            <div className="shrink-0 rounded-2xl border-[3px] border-[#FF61D2] bg-[#1D1B3D] px-3.5 py-2.5 shadow-[0_6px_0_#15132d] sm:px-4 sm:py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/75 sm:text-xs">
                    <span className="font-extrabold text-[#FF61D2]">최근 측정</span>
                    <span aria-hidden="true" className="text-white/35">·</span>
                    <span className="font-mono font-bold tabular-nums">{latestHint.rank}위</span>
                    <span aria-hidden="true" className="text-white/35">·</span>
                    <span>{getSimilarityLabel(latestHint.entry.similarity)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-base font-extrabold text-white sm:text-lg">
                    {latestHint.entry.word}
                  </p>
                  {latestHint.entry.reason && (
                    <p className="truncate text-[11px] text-white/80 sm:text-xs">
                      {latestHint.entry.reason}
                    </p>
                  )}
                  {!isOnline && alreadyTriedNotice && (
                    <p className="text-[11px] font-bold text-[#FFD21E]">{alreadyTriedNotice}</p>
                  )}
                </div>

                <span
                  className={`font-mono text-xl font-extrabold tabular-nums sm:text-2xl ${
                    getSimilarityTier(latestHint.entry.similarity) === 'high'
                      ? 'text-[#FF61D2]'
                      : getSimilarityTier(latestHint.entry.similarity) === 'medium'
                        ? 'text-[#FFD21E]'
                        : 'text-white/85'
                  }`}
                >
                  {latestHint.entry.similarity.toFixed(1)}%
                </span>
              </div>

              {!isOnline && latestHint.entry.isExactMatch && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#2B2857] pt-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[#FF61D2]">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    정답 단어와 일치합니다!
                  </span>
                  <button
                    type="button"
                    onClick={() => submitAnswerChallenge(latestHint.entry.word)}
                    disabled={isSubmittingGuess}
                    className="min-h-8 rounded-xl bg-[#FFD21E] px-3 py-1 text-xs font-extrabold text-[#121026] shadow-[0_3px_0_#9E7D00] hover:bg-[#FF61D2] whitespace-nowrap"
                  >
                    정답 완료하기
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-xs font-bold text-white sm:text-sm">
              힌트 유사도 순위{' '}
              <span className="font-mono font-bold tabular-nums text-[#FFD21E]">
                ({sortedHints.length})
              </span>
            </h2>
            <span className="text-[11px] text-white/60">높은 유사도 순 자동 정렬</span>
          </div>

          {sortedHints.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#2B2857] bg-[#1D1B3D]/70 px-5 py-10 text-center">
              <p className="text-sm font-extrabold text-[#FFD21E] sm:text-base">
                첫 번째 힌트 단어를 입력해보세요
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-white/75 sm:text-sm">
                자연, 음식, 도구, 장소, 감정처럼 넓은 범위의 단어로 시작하면
                정답의 의미 영역을 빠르게 좁힐 수 있습니다.
              </p>
            </div>
          ) : (
            <ol className="space-y-2" aria-label="유사도 순 힌트 목록">
              {sortedHints.map((hint, idx) => (
                <HintRow
                  key={hint.id}
                  hint={hint}
                  rank={idx + 1}
                  isLatest={latestHint?.entry.id === hint.id}
                  onSelectForGuess={handlePrefillGuess}
                />
              ))}
            </ol>
          )}
        </div>
      }
      controlArea={
        <div className="arcade-panel rounded-2xl p-3 sm:rounded-3xl sm:p-4">
          {/* Mobile Cover (<640px): Compact 2-tab switch */}
          <div className="mb-2.5 flex items-center gap-1.5 rounded-xl border-2 border-[#2B2857] bg-[#121026] p-1 sm:hidden">
            <button
              type="button"
              onClick={() => setMobileInputTab('hint')}
              className={`min-h-9 flex-1 rounded-lg text-xs font-extrabold transition-colors ${
                mobileInputTab === 'hint'
                  ? 'bg-[#6B61FF] text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              힌트 측정
            </button>
            <button
              type="button"
              onClick={() => setMobileInputTab('guess')}
              className={`min-h-9 flex-1 rounded-lg text-xs font-extrabold transition-colors ${
                mobileInputTab === 'guess'
                  ? 'bg-[#FFD21E] text-[#121026]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              정답 도전
            </button>
          </div>

          {/* Hint Form */}
          <form
            onSubmit={handleHintSubmit}
            className={mobileInputTab === 'hint' ? 'block' : 'hidden sm:block'}
          >
            <label
              htmlFor="hint-word-input"
              className="hidden text-xs font-extrabold text-[#FF61D2] sm:block sm:text-sm"
            >
              힌트 단어 입력
            </label>
            <p className="mt-0.5 hidden text-xs text-white/70 sm:block">
              정답과의 의미 유사도(0%~100%)를 측정합니다.
            </p>
            <div className="flex gap-2 sm:mt-2.5">
              <input
                ref={hintInputRef}
                id="hint-word-input"
                type="text"
                value={hintInput}
                onChange={(e) => setHintInput(e.target.value)}
                placeholder={inputsDisabled ? '상대방 차례 대기 중' : '힌트 단어 (예: 바다, 사과)'}
                maxLength={25}
                autoComplete="off"
                disabled={isSubmittingHint || pendingOnlineCall || inputsDisabled}
                className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-3.5 py-2 text-base text-white placeholder:text-white/40 focus:border-[#6B61FF] focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={
                  isSubmittingHint ||
                  pendingOnlineCall ||
                  inputsDisabled ||
                  hintInput.trim().length === 0
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#6B61FF] px-3.5 py-2 text-xs font-extrabold text-white shadow-[0_4px_0_#433AB5] transition-all hover:bg-[#FF61D2] hover:text-[#121026] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none whitespace-nowrap shrink-0 sm:px-4 sm:text-sm"
              >
                {isSubmittingHint || pendingOnlineCall ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                <span>측정</span>
              </button>
            </div>
          </form>

          <hr className="my-4 hidden border-[#2B2857] sm:block" />

          {/* Answer Challenge Form */}
          <form
            onSubmit={handleGuessSubmit}
            className={`${mobileInputTab === 'guess' ? 'block' : 'hidden sm:block'} ${
              shakeGuess ? 'animate-shake' : ''
            }`}
          >
            <label
              htmlFor="guess-answer-input"
              className="hidden text-xs font-extrabold text-[#FFD21E] sm:block sm:text-sm"
            >
              정답 도전
            </label>
            <p className="mt-0.5 hidden text-xs text-white/70 sm:block">
              정답이 떠올랐다면 아래에 입력해 맞혀보세요.
            </p>
            <div className="flex gap-2 sm:mt-2.5">
              <input
                ref={guessInputRef}
                id="guess-answer-input"
                type="text"
                value={guessInput}
                onChange={(e) => {
                  if (guessFeedback) setGuessFeedback(null);
                  setGuessInput(e.target.value);
                }}
                placeholder={inputsDisabled ? '상대방 차례 대기 중' : '정답 단어를 입력하세요'}
                maxLength={25}
                autoComplete="off"
                disabled={isSubmittingGuess || pendingOnlineCall || inputsDisabled}
                className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-3.5 py-2 text-base text-white placeholder:text-white/40 focus:border-[#FFD21E] focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={
                  isSubmittingGuess ||
                  pendingOnlineCall ||
                  inputsDisabled ||
                  guessInput.trim().length === 0
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#FFD21E] px-3.5 py-2 text-xs font-extrabold text-[#121026] shadow-[0_4px_0_#9E7D00] transition-all hover:bg-[#FF61D2] hover:shadow-[0_4px_0_#A62983] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none whitespace-nowrap shrink-0 sm:px-4 sm:text-sm"
              >
                {isSubmittingGuess || pendingOnlineCall ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                <span>확인</span>
              </button>
            </div>

            {guessFeedback && (
              <p role="status" className="mt-1.5 text-xs font-bold text-rose-300">
                {guessFeedback}
              </p>
            )}

            {activeWrongGuesses.length > 0 && (
              <p className="mt-1.5 truncate text-[11px] text-white/60">
                오답: <span className="text-white/85">{activeWrongGuesses.join(' · ')}</span>
              </p>
            )}
          </form>

          {/* Give Up & Mobile Criteria Toggle */}
          <div className="mt-2.5 border-t border-[#2B2857] pt-2.5 sm:mt-4 sm:pt-3.5">
            {!confirmingGiveUp ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={inputsDisabled || pendingOnlineCall}
                  onClick={() => setConfirmingGiveUp(true)}
                  className="inline-flex min-h-8 items-center gap-1.5 text-xs font-bold text-white/70 transition-colors hover:text-rose-300 disabled:opacity-40 whitespace-nowrap"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>포기 및 정답 보기</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCriteriaMobile((prev) => !prev)}
                  aria-expanded={showCriteriaMobile}
                  className="inline-flex min-h-8 items-center gap-1 rounded-xl border-2 border-[#2B2857] bg-[#121026] px-2 py-1 text-[11px] font-bold text-white hover:border-[#6B61FF] sm:hidden whitespace-nowrap"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-[#FFD21E]" aria-hidden="true" />
                  <span>판정 기준</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-white">정답을 볼까요?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmingGiveUp(false)}
                    disabled={isGivingUp}
                    className="min-h-8 rounded-xl border-2 border-[#2B2857] px-2.5 py-1 font-bold text-white hover:border-[#6B61FF]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleGiveUp}
                    disabled={isGivingUp}
                    className="min-h-8 rounded-xl bg-rose-500 px-2.5 py-1 font-extrabold text-white shadow-[0_3px_0_#9F1239] hover:bg-rose-400 disabled:opacity-60"
                  >
                    {isGivingUp ? '불러오는 중' : '정답 보기'}
                  </button>
                </div>
              </div>
            )}

            {showCriteriaMobile && (
              <div className="mt-2 rounded-xl border-2 border-[#2B2857] bg-[#121026] p-2.5 text-[11px] sm:hidden">
                <p className="mb-1.5 font-bold text-[#FFD21E]">유사도 판정 기준</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <span className="font-mono text-[#FF61D2]">90+ · 핵심 연관어</span>
                  <span className="font-mono text-emerald-300">70+ · 밀접한 상황</span>
                  <span className="font-mono text-[#FFD21E]">45+ · 간접 연상</span>
                  <span className="font-mono text-white/65">20+ · 약한 · 20- 무관</span>
                </div>
              </div>
            )}

            <div className="mt-3.5 hidden rounded-2xl border-2 border-[#2B2857] bg-[#121026] p-3 sm:block">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#FFD21E]">유사도 판정 기준</span>
                <span className="text-[11px] text-white/60">한국어 연상 채점</span>
              </div>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-bold text-[#FF61D2]">
                    <span className="h-2 w-2 rounded-full bg-[#FF61D2]" aria-hidden="true" />
                    <span className="font-mono">90+</span>
                  </dt>
                  <dd className="truncate text-white/85">핵심 연관어 · 동의어/1순위 짝꿍</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-bold text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span className="font-mono">70+</span>
                  </dt>
                  <dd className="truncate text-white/85">밀접한 관련 · 같은 범주/상황</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-bold text-[#FFD21E]">
                    <span className="h-2 w-2 rounded-full bg-[#FFD21E]" aria-hidden="true" />
                    <span className="font-mono">45+</span>
                  </dt>
                  <dd className="truncate text-white/75">간접 연상 · 공통 속성/배경</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-bold text-white/65">
                    <span className="h-2 w-2 rounded-full bg-white/50" aria-hidden="true" />
                    <span className="font-mono">20+ / 20-</span>
                  </dt>
                  <dd className="truncate text-white/60">약한 연결 / 의미 무관함</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      }
    />
    </>
  );
}
