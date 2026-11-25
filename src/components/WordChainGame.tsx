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
  type HintEntry,
} from '../types';
import type { OnlineGameSharedProps, OnlineRole, OnlineWordChainState } from '../types/online';
import { soundEngine } from '../utils/sound';
import {
  generateSoloKoreanNoun,
  normalizeWord,
  resolveStoredApiKey,
  sanitizeDisplayWord,
  scoreHintWithRubric,
} from '../utils/wordChainGemini';
import { GameBoardLayout } from './GameBoardLayout';
import { HintRow } from './HintRow';
import { ResultSummary } from './ResultSummary';
import { StartScreen } from './StartScreen';
import { VictoryConfetti } from './VictoryConfetti';

const ONLINE_SHOT_CLOCK_SEC = 45;

interface ClientWordSession {
  mode: GameMode;
  targetWord: string;
  targetNormalized: string;
  hintCount: number;
  answerAttempts: number;
  hintsByNormalized: Map<string, HintEntry>;
  finished: boolean;
}

interface WordChainGameProps extends OnlineGameSharedProps {
  customApiKey: string;
  onBackToLobby: () => void;
}

export function WordChainGame({
  customApiKey,
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

  // Online shot clock + client-side session refs
  const [shotClock, setShotClock] = useState<number>(ONLINE_SHOT_CLOCK_SEC);
  const [isRematching, setIsRematching] = useState(false);
  const localSessionRef = useRef<ClientWordSession | null>(null);
  const hostSessionRef = useRef<ClientWordSession | null>(null);
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
    hostSessionRef.current = null;
    setErrorMessage(null);
    setHintInput('');
    setGuessInput('');
    setGuessFeedback(null);

    const stateRef = getRoomGameStateRef(onlineRoom.roomCode, 'wordChain');
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

    try {
      const apiKey = resolveStoredApiKey(customApiKey);
      const targetWord = await generateSoloKoreanNoun(apiKey);
      hostSessionRef.current = {
        mode: 'solo',
        targetWord,
        targetNormalized: normalizeWord(targetWord),
        hintCount: 0,
        answerAttempts: 0,
        hintsByNormalized: new Map(),
        finished: false,
      };
      await fbUpdate(stateRef, {
        phase: 'PLAYING',
        maskedCount: Math.max(2, Math.min(8, targetWord.length)),
        currentTurn: firstTurnRole,
        lastError: null,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '방장의 Gemini API 키를 확인해 주세요. 출제에 실패했습니다.';
      showErrorNotice(msg);
      await fbUpdate(stateRef, {
        lastError: msg,
      });
    }
  }, [isOnline, isHost, onlineRoom, matchNumber, firstTurnRole, customApiKey, showErrorNotice]);

  // Online Host Initialization for each matchNumber
  useEffect(() => {
    if (!isOnline || !isHost || !onlineRoom) return;
    if (onlineWord && onlineWord.roundKey === matchNumber) return;
    if (initializedRoundRef.current === matchNumber) return;

    initializedRoundRef.current = matchNumber;
    void startOnlineHostMatch();
  }, [isOnline, isHost, onlineRoom, onlineWord, matchNumber, startOnlineHostMatch]);

  // Process incoming online requests on Host (for both P1 & P2) directly via Gemini REST API
  useEffect(() => {
    if (!isOnline || !isHost || !onlineRoom || !onlineWord) return;
    const req = onlineWord.pendingRequest;
    if (!req || req.id === processedReqIdRef.current) return;
    const hostSession = hostSessionRef.current;
    if (!hostSession) return;

    processedReqIdRef.current = req.id;

    const processReq = async () => {
      const stateRef = getRoomGameStateRef(onlineRoom.roomCode, 'wordChain');
      const nextTurn: OnlineRole = req.by === 'P1' ? 'P2' : 'P1';
      const curHints = onlineWord.hints ?? [];
      const curWrong = onlineWord.wrongGuesses ?? [];

      try {
        if (req.type === 'hint') {
          const rawWord = sanitizeDisplayWord(req.word);
          if (!rawWord || rawWord.length > 25) {
            throw new Error('힌트 단어를 1~25자 이내로 입력해 주세요.');
          }

          const normalized = normalizeWord(rawWord);
          const existing = hostSession.hintsByNormalized.get(normalized);
          if (existing) {
            await fbUpdate(stateRef, {
              pendingRequest: null,
              lastError: `'${existing.word}'은(는) 이미 입력된 힌트입니다.`,
            });
            return;
          }

          const isExactMatch = normalized === hostSession.targetNormalized;
          let similarity = 100;
          let reason = '정답 단어와 완전 일치';

          if (!isExactMatch) {
            const apiKey = resolveStoredApiKey(customApiKey);
            const rubricResult = await scoreHintWithRubric(
              hostSession.targetWord,
              rawWord,
              apiKey,
            );
            similarity = rubricResult.score;
            reason = rubricResult.reason;
          }

          hostSession.hintCount += 1;
          const returnedHint: HintEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            word: rawWord,
            similarity,
            rawCosine: Math.round((similarity / 100) * 1000) / 1000,
            reason,
            order: hostSession.hintCount,
            isExactMatch,
          };
          hostSession.hintsByNormalized.set(normalized, returnedHint);

          if (returnedHint.isExactMatch) {
            hostSession.finished = true;
            await fbUpdate(stateRef, {
              hints: [...curHints, returnedHint],
              hintCount: hostSession.hintCount,
              answerAttempts: hostSession.answerAttempts,
              phase: 'RESULT',
              winner: req.by,
              revealedWord: returnedHint.word,
              pendingRequest: null,
              lastError: null,
            });
            return;
          }

          await fbUpdate(stateRef, {
            hints: [...curHints, returnedHint],
            hintCount: hostSession.hintCount,
            answerAttempts: hostSession.answerAttempts,
            currentTurn: nextTurn,
            pendingRequest: null,
            lastError: null,
          });
        } else if (req.type === 'guess') {
          const rawWord = sanitizeDisplayWord(req.word);
          hostSession.answerAttempts += 1;
          const isCorrect = normalizeWord(rawWord) === hostSession.targetNormalized;

          if (isCorrect) {
            hostSession.finished = true;
            await fbUpdate(stateRef, {
              hintCount: hostSession.hintCount,
              answerAttempts: hostSession.answerAttempts,
              phase: 'RESULT',
              winner: req.by,
              revealedWord: hostSession.targetWord,
              pendingRequest: null,
              lastError: null,
            });
          } else {
            const nextWrong = curWrong.includes(rawWord) ? curWrong : [...curWrong, rawWord];
            await fbUpdate(stateRef, {
              wrongGuesses: nextWrong,
              hintCount: hostSession.hintCount,
              answerAttempts: hostSession.answerAttempts,
              currentTurn: nextTurn,
              pendingRequest: null,
              lastError: `'${rawWord}'은(는) 정답이 아닙니다.`,
            });
          }
        } else if (req.type === 'giveup') {
          hostSession.finished = true;
          await fbUpdate(stateRef, {
            hintCount: hostSession.hintCount,
            answerAttempts: hostSession.answerAttempts,
            phase: 'RESULT',
            winner: 'GAVE_UP',
            revealedWord: hostSession.targetWord,
            pendingRequest: null,
            lastError: null,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.';
        showErrorNotice(msg);
        await fbUpdate(stateRef, {
          pendingRequest: null,
          lastError: msg,
        });
      }
    };

    void processReq();
  }, [isOnline, isHost, onlineRoom, onlineWord, customApiKey, showErrorNotice]);

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
      const apiKey = resolveStoredApiKey(customApiKey);
      if (!apiKey) {
        throw new Error(
          "Gemini API 키가 등록되지 않았습니다. 상단의 'API 미등록' 버튼을 눌러 개인 API 키를 먼저 등록해 주세요.",
        );
      }

      let targetWord = '';
      if (selectedMode === 'setter') {
        const rawCustom = sanitizeDisplayWord(customWord ?? '');
        if (!rawCustom) {
          throw new Error('정답 단어를 입력해주세요.');
        }
        if (rawCustom.length > 20) {
          throw new Error('정답 단어는 20자 이내로 입력해주세요.');
        }
        targetWord = rawCustom;
      } else {
        targetWord = await generateSoloKoreanNoun(apiKey);
      }

      const newSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localSessionRef.current = {
        mode: selectedMode,
        targetWord,
        targetNormalized: normalizeWord(targetWord),
        hintCount: 0,
        answerAttempts: 0,
        hintsByNormalized: new Map(),
        finished: false,
      };

      resetRoundState();
      setSessionId(newSessionId);
      setMode(selectedMode);
      setMaskedCount(Math.max(2, Math.min(8, targetWord.length)));
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
    localSessionRef.current = null;
    setSessionId(null);
    setPhase('TITLE');
  };

  const dispatchOnlineRequest = async (type: 'hint' | 'guess' | 'giveup', word: string) => {
    if (!onlineRoom || !myRole || !onlineWord || onlineWord.phase !== 'PLAYING') return;
    if (onlineWord.currentTurn !== myRole || isPaused || onlineWord.pendingRequest) return;

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

    const session = localSessionRef.current;
    if (!sessionId || !session || session.finished || isSubmittingHint || isPaused) return;

    if (word.length > 25) {
      showErrorNotice('힌트 단어는 25자 이내로 입력해주세요.');
      return;
    }

    setErrorMessage(null);
    setAlreadyTriedNotice(null);
    setIsSubmittingHint(true);

    try {
      const normalized = normalizeWord(word);
      const existing = session.hintsByNormalized.get(normalized);
      if (existing) {
        setLatestHintId(existing.id);
        setAlreadyTriedNotice(`'${existing.word}'은(는) 이미 입력한 힌트입니다.`);
        setHintInput('');
        hintInputRef.current?.focus();
        return;
      }

      const isExactMatch = normalized === session.targetNormalized;
      let similarity = 100;
      let reason = '정답 단어와 완전 일치';

      if (!isExactMatch) {
        const apiKey = resolveStoredApiKey(customApiKey);
        const rubricResult = await scoreHintWithRubric(session.targetWord, word, apiKey);
        similarity = rubricResult.score;
        reason = rubricResult.reason;
      }

      session.hintCount += 1;
      const returnedHint: HintEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        word,
        similarity,
        rawCosine: Math.round((similarity / 100) * 1000) / 1000,
        reason,
        order: session.hintCount,
        isExactMatch,
      };
      session.hintsByNormalized.set(normalized, returnedHint);

      setHintCount(session.hintCount);
      setAnswerAttempts(session.answerAttempts);
      setLatestHintId(returnedHint.id);
      setHints((prev) => [...prev, returnedHint]);
      void soundEngine.playHintResult(returnedHint.similarity);

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

    const session = localSessionRef.current;
    if (!sessionId || !session || session.finished || isSubmittingGuess || isPaused) return;

    setErrorMessage(null);
    setGuessFeedback(null);
    setIsSubmittingGuess(true);

    try {
      session.answerAttempts += 1;
      const isCorrect = normalizeWord(word) === session.targetNormalized;
      const nextTotal = session.hintCount + session.answerAttempts;

      setHintCount(session.hintCount);
      setAnswerAttempts(session.answerAttempts);
      setTotalAttempts(nextTotal);

      if (isCorrect) {
        session.finished = true;
        void soundEngine.playVictory();
        setRevealedWord(session.targetWord);
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

    const session = localSessionRef.current;
    if (!sessionId || !session || isGivingUp) return;
    setErrorMessage(null);
    setIsGivingUp(true);

    try {
      session.finished = true;
      setRevealedWord(session.targetWord);
      setHintCount(session.hintCount);
      setAnswerAttempts(session.answerAttempts);
      setTotalAttempts(session.hintCount + session.answerAttempts);
      setConfirmingGiveUp(false);
      setPhase('GAVE_UP');
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

  // Online Preparing screen
  if (isOnline && (!onlineWord || onlineWord.phase === 'STARTING')) {
    return (
      <div className="flex h-full min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" aria-hidden="true" />
        <p className="text-base font-bold text-slate-100">
          방장({onlineRoom?.players?.[hostRole]?.nickname ?? hostRole})이 AI 단어를 출제하고 있습니다...
        </p>
        {onlineWord?.lastError && (
          <div className="max-w-md space-y-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <p>{onlineWord.lastError}</p>
            {isHost && (
              <button
                type="button"
                onClick={() => void startOnlineHostMatch()}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-300"
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
            className="mt-2 min-h-10 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            대기실로 돌아가기
          </button>
        )}
      </div>
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
          <section className="rounded-2xl border border-slate-800 bg-[#131926] p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {winnerName
                      ? `${winnerName}님이 정답을 맞혀 승리했습니다!`
                      : '정답을 공개하며 대결이 종료되었습니다'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-xs text-slate-400">정답 단어</span>
                  <h1 className="text-3xl font-bold text-slate-50">
                    {onlineWord.revealedWord ?? '—'}
                  </h1>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  힌트 {onlineWord.hintCount}회 · 정답 도전 {onlineWord.answerAttempts}회
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {isHost && (
                  <button
                    type="button"
                    disabled={isRematching}
                    onClick={() => void handleOnlineRematch()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:opacity-60 whitespace-nowrap"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span>{isRematching ? '준비 중...' : '같은 게임 바로 재대결'}</span>
                  </button>
                )}
                {onReturnToWaitingRoom && (
                  <button
                    type="button"
                    onClick={onReturnToWaitingRoom}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    <span>대기실로 돌아가기</span>
                  </button>
                )}
              </div>
            </div>
            {!isHost && (
              <p className="mt-3 text-xs text-slate-400">
                방장({onlineRoom?.players?.[hostRole]?.nickname ?? hostRole})이 재대결 또는 대기실 복귀를 선택할 수 있습니다.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#131926] p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              힌트 기록 ({sortedHints.length}개)
            </h2>
            {sortedHints.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
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
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={onBackToLobby}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400 whitespace-nowrap"
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
    );
  }

  // Local VICTORY / GAVE_UP
  if (!isOnline && (phase === 'VICTORY' || phase === 'GAVE_UP')) {
    return (
      <div className="h-full overflow-y-auto">
        {phase === 'VICTORY' && <VictoryConfetti />}
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={handleReturnToTitle}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-100 whitespace-nowrap"
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
    );
  }

  // PLAYING PHASE (Both Local & Online): One-Screen 100dvh Fold 8 GameBoardLayout
  const onlineTurnRole = onlineWord?.currentTurn ?? 'P1';
  const onlineTurnNickname = onlineRoom?.players?.[onlineTurnRole]?.nickname ?? onlineTurnRole;
  const inputsDisabled = isPaused || (isOnline && !isMyOnlineTurn);
  const pendingOnlineCall = Boolean(isOnline && onlineWord?.pendingRequest);
  const displayError = isOnline ? (onlineWord?.lastError ?? errorMessage) : errorMessage;

  const toastBanner = errorToast ? (
    <div
      role="alert"
      className="fixed left-1/2 top-14 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-rose-500/60 bg-[#1A1320]/95 px-4 py-2.5 text-xs font-semibold text-rose-200 shadow-2xl backdrop-blur-md"
    >
      <span>{errorToast}</span>
      <button
        type="button"
        onClick={() => setErrorToast(null)}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/20"
      >
        닫기
      </button>
    </div>
  ) : null;

  return (
    <>
      {toastBanner}
      <GameBoardLayout
        scrollableMain
      onlineReactionBar={onlineReactionBar}
      topBar={
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#131926] px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2.5">
            {!isOnline && (
              <button
                type="button"
                onClick={handleReturnToTitle}
                aria-label="모드 선택으로"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 text-slate-300 transition-colors hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-100 sm:text-sm">말결</span>
              <span className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#0B0F17] px-2 py-0.5">
                {Array.from({ length: Math.min(6, Math.max(4, activeMaskedCount)) }).map((_, i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-slate-400"
                    aria-hidden="true"
                  />
                ))}
              </span>
              {isOnline && (
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    isMyOnlineTurn
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {isMyOnlineTurn ? '내 차례' : `${onlineTurnNickname} 차례`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            {!isOnline && (
              <>
                <span className="hidden sm:inline">
                  {mode === 'solo' ? '솔로 모드' : '출제자 모드'}
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-slate-600">·</span>
              </>
            )}
            <span className="font-mono tabular-nums text-slate-200">힌트 {activeHintCount}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono tabular-nums text-slate-200">
              도전 {activeAnswerAttempts}
            </span>
            {isOnline && (
              <div className="ml-1 flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2 py-0.5">
                <Clock
                  className={`h-3 w-3 ${shotClock <= 10 ? 'text-rose-400' : 'text-sky-400'}`}
                  aria-hidden="true"
                />
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${
                    shotClock <= 10 ? 'text-rose-400' : 'text-slate-100'
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
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
          >
            {displayError}
          </div>
        ) : isOnline && !isMyOnlineTurn ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" aria-hidden="true" />
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
            <div className="shrink-0 rounded-xl border border-sky-500/35 bg-[#131926] px-3.5 py-2.5 sm:px-4 sm:py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 sm:text-xs">
                    <span className="font-medium text-sky-400">최근 측정</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="font-mono tabular-nums">{latestHint.rank}위</span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span>{getSimilarityLabel(latestHint.entry.similarity)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-base font-bold text-slate-100 sm:text-lg">
                    {latestHint.entry.word}
                  </p>
                  {latestHint.entry.reason && (
                    <p className="truncate text-[11px] text-slate-300/90 sm:text-xs">
                      {latestHint.entry.reason}
                    </p>
                  )}
                  {!isOnline && alreadyTriedNotice && (
                    <p className="text-[11px] text-amber-300/90">{alreadyTriedNotice}</p>
                  )}
                </div>

                <span
                  className={`font-mono text-xl font-bold tabular-nums sm:text-2xl ${
                    getSimilarityTier(latestHint.entry.similarity) === 'high'
                      ? 'text-emerald-400'
                      : getSimilarityTier(latestHint.entry.similarity) === 'medium'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                  }`}
                >
                  {latestHint.entry.similarity.toFixed(1)}%
                </span>
              </div>

              {!isOnline && latestHint.entry.isExactMatch && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    정답 단어와 일치합니다!
                  </span>
                  <button
                    type="button"
                    onClick={() => submitAnswerChallenge(latestHint.entry.word)}
                    disabled={isSubmittingGuess}
                    className="min-h-8 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-400 whitespace-nowrap"
                  >
                    정답 완료하기
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-xs font-semibold text-slate-300 sm:text-sm">
              힌트 유사도 순위{' '}
              <span className="font-mono font-normal tabular-nums text-slate-400">
                ({sortedHints.length})
              </span>
            </h2>
            <span className="text-[11px] text-slate-500">높은 유사도 순 자동 정렬</span>
          </div>

          {sortedHints.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-[#131926]/50 px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-200 sm:text-base">
                첫 번째 힌트 단어를 입력해보세요
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400 sm:text-sm">
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
        <div className="rounded-xl border border-slate-800 bg-[#131926] p-3 sm:rounded-2xl sm:p-4">
          {/* Mobile Cover (<640px): Compact 2-tab switch */}
          <div className="mb-2.5 flex items-center gap-1.5 rounded-lg bg-[#0B0F17] p-1 sm:hidden">
            <button
              type="button"
              onClick={() => setMobileInputTab('hint')}
              className={`min-h-9 flex-1 rounded-md text-xs font-bold transition-colors ${
                mobileInputTab === 'hint'
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              힌트 측정
            </button>
            <button
              type="button"
              onClick={() => setMobileInputTab('guess')}
              className={`min-h-9 flex-1 rounded-md text-xs font-bold transition-colors ${
                mobileInputTab === 'guess'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
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
              className="hidden text-xs font-semibold text-slate-100 sm:block sm:text-sm"
            >
              힌트 단어 입력
            </label>
            <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">
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
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700/80 bg-[#0B0F17] px-3.5 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={
                  isSubmittingHint ||
                  pendingOnlineCall ||
                  inputsDisabled ||
                  hintInput.trim().length === 0
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-3.5 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0 sm:px-4 sm:text-sm"
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

          <hr className="my-4 hidden border-slate-800/90 sm:block" />

          {/* Answer Challenge Form */}
          <form
            onSubmit={handleGuessSubmit}
            className={`${mobileInputTab === 'guess' ? 'block' : 'hidden sm:block'} ${
              shakeGuess ? 'animate-shake' : ''
            }`}
          >
            <label
              htmlFor="guess-answer-input"
              className="hidden text-xs font-semibold text-emerald-300 sm:block sm:text-sm"
            >
              정답 도전
            </label>
            <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">
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
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-emerald-500/35 bg-[#0B0F17] px-3.5 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={
                  isSubmittingGuess ||
                  pendingOnlineCall ||
                  inputsDisabled ||
                  guessInput.trim().length === 0
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0 sm:px-4 sm:text-sm"
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
              <p role="status" className="mt-1.5 text-xs font-medium text-rose-300">
                {guessFeedback}
              </p>
            )}

            {activeWrongGuesses.length > 0 && (
              <p className="mt-1.5 truncate text-[11px] text-slate-500">
                오답: <span className="text-slate-400">{activeWrongGuesses.join(' · ')}</span>
              </p>
            )}
          </form>

          {/* Give Up & Mobile Criteria Toggle */}
          <div className="mt-2.5 border-t border-slate-800/80 pt-2.5 sm:mt-4 sm:pt-3.5">
            {!confirmingGiveUp ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={inputsDisabled || pendingOnlineCall}
                  onClick={() => setConfirmingGiveUp(true)}
                  className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-rose-300 disabled:opacity-40 whitespace-nowrap"
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>포기 및 정답 보기</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCriteriaMobile((prev) => !prev)}
                  aria-expanded={showCriteriaMobile}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-700/80 bg-[#0B0F17] px-2 py-1 text-[11px] font-medium text-slate-300 hover:border-sky-400/50 sm:hidden whitespace-nowrap"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>판정 기준</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">정답을 볼까요?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmingGiveUp(false)}
                    disabled={isGivingUp}
                    className="min-h-8 rounded-lg border border-slate-700 px-2.5 py-1 font-medium text-slate-300 hover:bg-slate-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleGiveUp}
                    disabled={isGivingUp}
                    className="min-h-8 rounded-lg bg-rose-500/90 px-2.5 py-1 font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                  >
                    {isGivingUp ? '불러오는 중' : '정답 보기'}
                  </button>
                </div>
              </div>
            )}

            {showCriteriaMobile && (
              <div className="mt-2 rounded-lg border border-slate-800 bg-[#0B0F17] p-2.5 text-[11px] sm:hidden">
                <p className="mb-1.5 font-semibold text-slate-200">유사도 판정 기준</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <span className="font-mono text-emerald-400">90+ · 핵심 연관어</span>
                  <span className="font-mono text-emerald-300">70+ · 밀접한 상황</span>
                  <span className="font-mono text-amber-300">45+ · 간접 연상</span>
                  <span className="font-mono text-slate-400">20+ · 약한 · 20- 무관</span>
                </div>
              </div>
            )}

            <div className="mt-3.5 hidden rounded-xl border border-slate-800/90 bg-[#0B0F17]/90 p-3 sm:block">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">유사도 판정 기준</span>
                <span className="text-[11px] text-slate-500">한국어 연상 채점</span>
              </div>
              <dl className="mt-2 space-y-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-medium text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span className="font-mono">90+</span>
                  </dt>
                  <dd className="truncate text-slate-300">핵심 연관어 · 동의어/1순위 짝꿍</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-medium text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500/80" aria-hidden="true" />
                    <span className="font-mono">70+</span>
                  </dt>
                  <dd className="truncate text-slate-300">밀접한 관련 · 같은 범주/상황</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-medium text-amber-300">
                    <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                    <span className="font-mono">45+</span>
                  </dt>
                  <dd className="truncate text-slate-400">간접 연상 · 공통 속성/배경</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 font-medium text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden="true" />
                    <span className="font-mono">20+ / 20-</span>
                  </dt>
                  <dd className="truncate text-slate-500">약한 연결 / 의미 무관함</dd>
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
