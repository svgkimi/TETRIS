/**
 * BattleScreen.tsx
 * -----------------------------------------------------------------------
 * 대전(1:1 versus) 실제 플레이 화면. 로컬 엔진(useGameEngine)을 매치 시드로 시작하고,
 * - 내 락 이벤트 -> calculateAttackLines -> sendAttack 로 공격을 내보내고
 * - 상대 공격(onOpponentAttack) -> RECEIVE_GARBAGE 디스패치로 가비지를 받고
 * - 내 보드 변화 -> sendBoardSync 로 상대 미리보기용 스냅샷을 보내고
 * - 게임오버 -> sendTopOut, opponentTopOut -> 승패 판정
 * 을 모두 담당한다. 네트워킹은 useMultiplayer(부모가 넘겨준 결과)만 사용하고,
 * 게임 규칙은 src/engine만 사용한다 (관심사 분리 — 이 컴포넌트에 게임 로직을 직접 구현하지 않는다).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateAttackLines, previewNext, type Board } from "../../engine";
import { useGameEngine } from "../../hooks/useGameEngine";
import { useSound } from "../../hooks/useSound";
import { useEffects } from "../../hooks/useEffects";
import type { UseMultiplayerResult } from "../../hooks/useMultiplayer";
import { GameBoard } from "../GameBoard";
import { HoldPanel } from "../HoldPanel";
import { NextQueue } from "../NextQueue";
import { ScoreBoard } from "../ScoreBoard";
import { EffectPopups } from "../effects/EffectPopups";
import { OpponentBoardPreview } from "./OpponentBoardPreview";

/**
 * board_sync로 주고받는 보드 요약 형식. 양쪽 클라이언트가 동일한 코드를 실행하므로
 * 이 타입 하나로 송신/수신을 모두 표현한다 (서버는 이 내용을 그대로 중계만 한다).
 */
interface BoardSyncSummary {
  readonly board: Board;
  readonly score: number;
  readonly level: number;
  readonly combo: number;
  readonly linesCleared: number;
}

/** 알 수 없는 값(unknown)이 BoardSyncSummary 형태인지 검사하는 타입 가드 */
function isBoardSyncSummary(value: unknown): value is BoardSyncSummary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.board) && typeof candidate.score === "number";
}

/** 대전 결과 (아직 결정 안 됨/승/패/무승부) */
type MatchResult = "none" | "win" | "lose" | "draw";

/** BattleScreen props */
export interface BattleScreenProps {
  /** 매치 시작 시드 (양쪽 클라이언트가 동일한 값을 받아 같은 피스 시퀀스를 공유) */
  readonly matchSeed: number;
  readonly network: UseMultiplayerResult;
  /** 대전 종료 후 로비/메인으로 돌아가기 (네트워크 연결 종료까지 책임짐) */
  readonly onExit: () => void;
}

/**
 * 대전 화면을 렌더링한다.
 * 입력: BattleScreenProps / 출력: JSX
 */
export function BattleScreen({ matchSeed, network, onExit }: BattleScreenProps) {
  const { sounds, music } = useSound();
  const { state, ghost, hardDropTrail, start, dispatch } = useGameEngine({ sounds });
  const { shake, popups } = useEffects(state.lastScoreEvent);

  const {
    status: networkStatus,
    opponentBoardSummary,
    opponentTopOut,
    sendAttack,
    sendBoardSync,
    sendTopOut,
    onOpponentAttack,
  } = network;

  // ---- 매치 시드로 내 엔진을 정확히 1회 시작한다 (matchSeed가 새로 갱신될 때만 재시작) ----
  const startedSeedRef = useRef<number | null>(null);
  useEffect(() => {
    if (startedSeedRef.current === matchSeed) return;
    startedSeedRef.current = matchSeed;
    start(matchSeed);
  }, [matchSeed, start]);

  // 대전 중에는 배경음악을 재생하고, 화면을 벗어나면 멈춘다.
  useEffect(() => {
    if (state.status === "playing") {
      music.start();
    } else {
      music.stop();
    }
    return () => music.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // ---- 내 락 이벤트 -> 공격 라인 계산 -> 상대에게 전송 ----
  const lastSentScoreEventRef = useRef<typeof state.lastScoreEvent>(null);
  useEffect(() => {
    const event = state.lastScoreEvent;
    if (!event || event === lastSentScoreEventRef.current) return;
    lastSentScoreEventRef.current = event;
    const lines = calculateAttackLines(event);
    if (lines > 0) sendAttack(lines);
  }, [state.lastScoreEvent, sendAttack]);

  // ---- 상대 공격 수신 -> 내 엔진에 가비지 반영 + 짧은 시각 피드백(붉은 테두리 플래시) ----
  const [attackFlashToken, setAttackFlashToken] = useState(0);
  const flashTimeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = onOpponentAttack((lines) => {
      dispatch({ type: "RECEIVE_GARBAGE", lines });
      sounds.hardDrop();
      setAttackFlashToken((prev) => prev + 1);
      if (flashTimeoutRef.current !== undefined) window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = window.setTimeout(() => setAttackFlashToken(0), 320);
    });
    return () => {
      unsubscribe();
      if (flashTimeoutRef.current !== undefined) window.clearTimeout(flashTimeoutRef.current);
    };
  }, [onOpponentAttack, dispatch, sounds]);

  // ---- 내 보드 변화(락/가비지 수신) 시점마다 상대에게 보드 스냅샷 전송 ----
  useEffect(() => {
    const summary: BoardSyncSummary = {
      board: state.board,
      score: state.score,
      level: state.level,
      combo: state.combo,
      linesCleared: state.totalLinesCleared,
    };
    sendBoardSync(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.board]);

  // ---- 게임오버 전환 시 상대에게 top-out 통지 (1회만) ----
  const sentTopOutRef = useRef(false);
  useEffect(() => {
    if (state.status === "gameover" && !sentTopOutRef.current) {
      sentTopOutRef.current = true;
      sendTopOut();
    }
  }, [state.status, sendTopOut]);

  // ---- 승패 판정: 내가 먼저 죽으면 패배, 상대가 먼저 죽으면 승리, 동시면 무승부 ----
  const [result, setResult] = useState<MatchResult>("none");
  useEffect(() => {
    if (result !== "none") return;
    if (state.status === "gameover" && opponentTopOut) {
      setResult("draw");
    } else if (state.status === "gameover") {
      setResult("lose");
    } else if (opponentTopOut) {
      setResult("win");
    }
  }, [state.status, opponentTopOut, result]);

  const opponentSummary = isBoardSyncSummary(opponentBoardSummary) ? opponentBoardSummary : null;
  const nextPreview = useMemo(() => previewNext(state.pieceQueue, 5), [state.pieceQueue]);

  const opponentLeftMidMatch = networkStatus === "opponent_left" && result === "none";

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#0a0a0f] p-4">
      <div className="flex items-start gap-4">
        <div className="flex flex-col gap-4 pt-1">
          <HoldPanel hold={state.hold} />
          <ScoreBoard
            score={state.score}
            level={state.level}
            totalLinesCleared={state.totalLinesCleared}
            combo={state.combo}
            backToBack={state.backToBack}
          />
          <NextQueue upcoming={nextPreview} />
        </div>

        <div
          className={`relative rounded-xl transition-shadow ${
            attackFlashToken > 0 ? "ring-4 ring-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.6)]" : ""
          }`}
        >
          <GameBoard
            board={state.board}
            active={state.active}
            ghost={ghost}
            status={state.status}
            lastScoreEvent={state.lastScoreEvent}
            hardDropTrail={hardDropTrail}
            shake={shake}
          />
          <EffectPopups popups={popups} />

          {result !== "none" && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-10 py-8">
                <h2
                  className={`text-4xl font-black tracking-widest drop-shadow-[0_0_20px_rgba(0,0,0,0.5)] ${
                    result === "win"
                      ? "text-cyan-300"
                      : result === "lose"
                        ? "text-rose-400"
                        : "text-white/70"
                  }`}
                >
                  {result === "win" ? "승리!" : result === "lose" ? "패배" : "무승부"}
                </h2>
                <span className="text-xs tracking-widest text-white/40">
                  최종 점수 <span className="font-mono text-white">{state.score.toLocaleString("en-US")}</span>
                </span>
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-full bg-cyan-400 px-8 py-2 font-bold text-black transition hover:scale-105 active:scale-95"
                >
                  메인으로
                </button>
              </div>
            </div>
          )}

          {opponentLeftMidMatch && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-10 py-8">
                <h2 className="text-2xl font-black tracking-widest text-amber-300">상대방이 나갔습니다</h2>
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-full bg-cyan-400 px-8 py-2 font-bold text-black transition hover:scale-105 active:scale-95"
                >
                  메인으로
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 pt-1">
          <OpponentBoardPreview board={opponentSummary?.board ?? null} label="상대방" />
          {opponentSummary && (
            <div className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
              <div className="flex justify-between">
                <span>SCORE</span>
                <span className="font-mono text-white">{opponentSummary.score.toLocaleString("en-US")}</span>
              </div>
              <div className="flex justify-between">
                <span>LEVEL</span>
                <span className="font-mono text-white">{opponentSummary.level}</span>
              </div>
              <div className="flex justify-between">
                <span>COMBO</span>
                <span className="font-mono text-white">{opponentSummary.combo > 0 ? `x${opponentSummary.combo}` : "-"}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
