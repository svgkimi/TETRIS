/**
 * BattleScreen.tsx
 * -----------------------------------------------------------------------
 * 대전(1:1 versus) 실제 플레이 화면 (v2). 로컬 엔진(useGameEngine)을 "내 시드"로 시작하고
 * (양쪽이 서로 다른 시드를 받으므로 블록 시퀀스가 다르다 — 랜덤 블록),
 * - [공격전] 내 락 이벤트 -> calculateAttackLines -> sendAttack 로 공격을 내보내고
 * - [공격전] 상대 공격(onOpponentAttack) -> RECEIVE_GARBAGE 디스패치로 가비지를 받고
 * - 내 보드 변화 -> sendBoardSync 로 상대 미리보기용 스냅샷을 보내고
 * - 게임오버 -> sendTopOut(점수 포함), 승패 판정(공격전: 먼저 죽으면 패배 /
 *   스코어전: 둘 다 게임오버 후 점수 비교), 재대결(ready 재전송 -> 새 match_start로 재시작)
 * 을 모두 담당한다. 네트워킹은 useMultiplayer(부모가 넘겨준 결과)만 사용하고,
 * 게임 규칙은 src/engine만 사용한다 (관심사 분리 — 이 컴포넌트에 게임 로직을 직접 구현하지 않는다).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateAttackLines, previewNext, type Board } from "../../engine";
import { useGameEngine } from "../../hooks/useGameEngine";
import { useSound } from "../../hooks/useSound";
import { useEffects } from "../../hooks/useEffects";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { MatchStartInfo, UseMultiplayerResult } from "../../hooks/useMultiplayer";
import { GameBoard } from "../GameBoard";
import { HoldPanel } from "../HoldPanel";
import { NextQueue } from "../NextQueue";
import { ScoreBoard } from "../ScoreBoard";
import { SoundControl } from "../SoundControl";
import { TouchControls } from "../TouchControls";
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
  /** match_start 수신 정보 (내 시드/모드/재대결 감지용 token). token이 바뀌면 새 매치로 재시작한다 */
  readonly matchStart: MatchStartInfo;
  /** 상단 표시용 방 이름 */
  readonly roomName: string | null;
  readonly network: UseMultiplayerResult;
  /** 방은 유지한 채 매치를 접고 로비로 돌아가기 (leaveRoom) */
  readonly onLeaveRoom: () => void;
  /** 대전 모드 완전 종료 (연결 끊고 메인으로) */
  readonly onExit: () => void;
}

/**
 * 대전 화면을 렌더링한다.
 * 입력: BattleScreenProps / 출력: JSX
 */
export function BattleScreen({ matchStart, roomName, network, onLeaveRoom, onExit }: BattleScreenProps) {
  const { enabled: soundEnabled, toggle: toggleSound, sounds, music } = useSound();
  const { state, ghost, hardDropTrail, start, dispatch, pause, triggerHardDrop } = useGameEngine({ sounds });
  const { shake, popups } = useEffects(state.lastScoreEvent);
  const isMobile = useIsMobile();

  const {
    status: networkStatus,
    opponentBoardSummary,
    opponentTopOut,
    opponentFinalScore,
    sendAttack,
    sendBoardSync,
    sendTopOut,
    sendReady,
    onOpponentAttack,
  } = network;

  const isScoreMode = matchStart.mode === "score";

  // ---- 매치별 로컬 상태 (재대결 시 token 변화로 전부 초기화) ----
  const [result, setResult] = useState<MatchResult>("none");
  // 재대결 요청을 보내고 상대의 ready를 기다리는 중인지
  const [rematchRequested, setRematchRequested] = useState(false);
  const sentTopOutRef = useRef(false);
  const lastSentScoreEventRef = useRef<typeof state.lastScoreEvent>(null);

  // ---- 새 match_start(token 갱신)마다 내 시드로 엔진을 재시작하고 매치 상태를 초기화한다 ----
  const startedTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (startedTokenRef.current === matchStart.token) return;
    startedTokenRef.current = matchStart.token;
    sentTopOutRef.current = false;
    lastSentScoreEventRef.current = null;
    setResult("none");
    setRematchRequested(false);
    start(matchStart.seed);
  }, [matchStart, start]);

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

  // ---- [공격전 전용] 내 락 이벤트 -> 공격 라인 계산 -> 상대에게 전송 ----
  useEffect(() => {
    if (isScoreMode) return; // 스코어전에서는 공격을 보내지 않는다 (서버도 무시)
    const event = state.lastScoreEvent;
    if (!event || event === lastSentScoreEventRef.current) return;
    lastSentScoreEventRef.current = event;
    const lines = calculateAttackLines(event);
    if (lines > 0) sendAttack(lines);
  }, [state.lastScoreEvent, sendAttack, isScoreMode]);

  // ---- [공격전 전용] 상대 공격 수신 -> 내 엔진에 가비지 반영 + 짧은 시각 피드백(붉은 테두리 플래시) ----
  const [attackFlashToken, setAttackFlashToken] = useState(0);
  const flashTimeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (isScoreMode) return; // 스코어전에서는 가비지 수신 없음
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
  }, [onOpponentAttack, dispatch, sounds, isScoreMode]);

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

  // ---- 게임오버 전환 시 상대에게 top-out 통지 (매치당 1회, 스코어전 비교용 점수 포함) ----
  useEffect(() => {
    if (state.status === "gameover" && !sentTopOutRef.current) {
      sentTopOutRef.current = true;
      sendTopOut(state.score);
    }
  }, [state.status, state.score, sendTopOut]);

  // ---- 승패 판정 ----
  // 공격전: 내가 먼저 죽으면 패배, 상대가 먼저 죽으면 승리, 동시면 무승부
  // 스코어전: 둘 다 게임오버가 된 뒤 점수를 비교해 승/패/무 결정 (한쪽만 죽으면 관전 대기)
  useEffect(() => {
    if (result !== "none") return;
    const iAmDead = state.status === "gameover";
    if (isScoreMode) {
      if (iAmDead && opponentTopOut) {
        const theirScore = opponentFinalScore ?? 0;
        setResult(state.score > theirScore ? "win" : state.score < theirScore ? "lose" : "draw");
      }
      return;
    }
    if (iAmDead && opponentTopOut) {
      setResult("draw");
    } else if (iAmDead) {
      setResult("lose");
    } else if (opponentTopOut) {
      setResult("win");
    }
  }, [state.status, state.score, opponentTopOut, opponentFinalScore, result, isScoreMode]);

  /** 재대결 요청: 서버에 ready를 다시 보내고 상대의 ready(-> 새 match_start)를 기다린다 */
  const handleRematch = () => {
    setRematchRequested(true);
    sendReady();
  };

  const opponentSummary = isBoardSyncSummary(opponentBoardSummary) ? opponentBoardSummary : null;
  const nextPreview = useMemo(() => previewNext(state.pieceQueue, 5), [state.pieceQueue]);

  const opponentLeft = networkStatus === "opponent_left";
  // 스코어전에서 나만 게임오버이고 상대가 아직 플레이 중인 "관전 대기" 상태
  const waitingOpponentFinish =
    isScoreMode && state.status === "gameover" && !opponentTopOut && result === "none" && !opponentLeft;

  return (
    <div
      className={`flex h-full w-full flex-col items-center bg-[#0a0a0f] p-4 ${
        isMobile ? "justify-start gap-2 overflow-y-auto pb-32" : "justify-center gap-3 overflow-hidden"
      }`}
    >
      {/* ---- 상단: 방 이름 + 모드 표시 ---- */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-bold text-white/80">{roomName ?? "대전"}</span>
        <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs text-white/70">
          {isScoreMode ? "🏆 스코어전" : "⚔️ 공격전"}
        </span>
      </div>

      {/* ---- 모바일: 상대방 보드는 아주 작게 상단에 배치 ---- */}
      {isMobile && (
        <div className="flex w-full max-w-md items-center justify-center scale-[0.55] origin-top">
          <OpponentBoardPreview board={opponentSummary?.board ?? null} label="상대방" />
        </div>
      )}

      <div className={`flex items-start gap-4 ${isMobile ? "flex-wrap justify-center gap-2" : ""}`}>
        <div className={`flex flex-col gap-4 pt-1 ${isMobile ? "scale-[0.6] origin-top-right gap-1" : ""}`}>
          <HoldPanel hold={state.hold} />
          <ScoreBoard
            score={state.score}
            level={state.level}
            totalLinesCleared={state.totalLinesCleared}
            combo={state.combo}
            backToBack={state.backToBack}
          />
          <NextQueue upcoming={nextPreview} />
          {!isMobile && (
            <SoundControl
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              tracks={music.tracks}
              trackIndex={music.trackIndex}
              onSelectTrack={music.setTrackIndex}
              volume={music.volume}
              onChangeVolume={music.setVolume}
            />
          )}
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

          {/* ---- 스코어전: 상대가 아직 플레이 중일 때의 관전 대기 오버레이 ---- */}
          {waitingOpponentFinish && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-10 py-8">
                <h2 className="animate-pulse text-xl font-black tracking-widest text-cyan-300">
                  상대가 플레이 중...
                </h2>
                <span className="text-xs tracking-widest text-white/40">
                  내 점수 <span className="font-mono text-white">{state.score.toLocaleString("en-US")}</span>
                </span>
                <span className="text-xs text-white/40">양쪽 모두 끝나면 점수를 비교합니다</span>
              </div>
            </div>
          )}

          {/* ---- 결과 오버레이 (승/패/무 + 재대결/나가기) ---- */}
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
                  내 점수 <span className="font-mono text-white">{state.score.toLocaleString("en-US")}</span>
                  {isScoreMode && opponentFinalScore !== null && (
                    <>
                      {" · "}상대 점수{" "}
                      <span className="font-mono text-white">{opponentFinalScore.toLocaleString("en-US")}</span>
                    </>
                  )}
                </span>

                {opponentLeft ? (
                  <span className="text-xs text-amber-300">상대방이 방을 나갔습니다</span>
                ) : rematchRequested ? (
                  <span className="animate-pulse text-sm text-cyan-200">상대 준비 대기 중...</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRematch}
                    className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-8 py-2 font-bold text-black transition hover:scale-105 active:scale-95"
                  >
                    재대결
                  </button>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="rounded-full border border-white/20 bg-white/10 px-6 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/20"
                  >
                    로비로
                  </button>
                  <button
                    type="button"
                    onClick={onExit}
                    className="rounded-full border border-white/20 bg-white/5 px-6 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/10"
                  >
                    메인으로
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---- 매치 중 상대 이탈 오버레이 (결과가 아직 없을 때) ---- */}
          {opponentLeft && result === "none" && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/70 backdrop-blur-md">
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-10 py-8">
                <h2 className="text-2xl font-black tracking-widest text-amber-300">상대방이 나갔습니다</h2>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="rounded-full bg-cyan-400 px-8 py-2 font-bold text-black transition hover:scale-105 active:scale-95"
                  >
                    로비로
                  </button>
                  <button
                    type="button"
                    onClick={onExit}
                    className="rounded-full border border-white/20 bg-white/5 px-6 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/10"
                  >
                    메인으로
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`flex flex-col gap-4 pt-1 ${isMobile ? "scale-[0.6] origin-top-left gap-1" : ""}`}>
          {!isMobile && <OpponentBoardPreview board={opponentSummary?.board ?? null} label="상대방" />}
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

      {isMobile && (
        <TouchControls
          dispatch={dispatch}
          triggerHardDrop={triggerHardDrop}
          status={state.status}
          onPause={pause}
          sounds={sounds}
        />
      )}
    </div>
  );
}
