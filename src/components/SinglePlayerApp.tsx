/**
 * SinglePlayerApp.tsx
 * -----------------------------------------------------------------------
 * 1인 플레이 화면 흐름(타이틀 -> 카운트다운 -> 플레이 -> 일시정지/게임오버)을 조립하는 컴포넌트.
 * PRD 4.1 사용자 시나리오의 순서를 그대로 따른다.
 * 이 컴포넌트는 화면 전환/레이아웃만 담당하며, 실제 게임 로직은 useGameEngine(엔진 훅)에,
 * 이펙트는 useEffects에, 사운드는 useSound에 위임한다 (관심사 분리).
 *
 * 기존 App.tsx의 1인 플레이 로직을 그대로 옮긴 것으로, 대전 모드 추가를 위해
 * App.tsx는 "싱글/대전" 두 모드를 라우팅하는 얇은 컴포넌트로 분리되었다.
 * (대전 모드 진입 진입점만 onOpenMultiplayer prop으로 추가됨 — 그 외 로직은 변경 없음)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { previewNext } from "../engine";
import { useGameEngine } from "../hooks/useGameEngine";
import { useEffects } from "../hooks/useEffects";
import { useSound } from "../hooks/useSound";
import { useHighScore } from "../hooks/useHighScore";
import { useIsMobile } from "../hooks/useIsMobile";
import { GameBoard } from "./GameBoard";
import { HoldPanel } from "./HoldPanel";
import { MiniPiece } from "./MiniPiece";
import { NextQueue } from "./NextQueue";
import { ScoreBoard } from "./ScoreBoard";
import { SoundControl } from "./SoundControl";
import { TouchControls } from "./TouchControls";
import { EffectPopups } from "./effects/EffectPopups";
import { TitleScreen } from "./screens/TitleScreen";
import { CountdownOverlay } from "./screens/CountdownOverlay";
import { PauseOverlay } from "./screens/PauseOverlay";
import { GameOverScreen } from "./screens/GameOverScreen";

/** 화면 흐름 단계 (엔진의 GameStatus와는 별개인, 순수 UI 레이어의 상태) */
type AppPhase = "title" | "countdown" | "game";

/** 카운트다운 시작 값 (3, 2, 1 -> 0은 "GO!" 표시) */
const COUNTDOWN_START = 3;
/** 카운트다운 한 단계당 대기 시간(ms) */
const COUNTDOWN_STEP_MS = 700;
/** "GO!" 표시 후 실제 게임 시작까지 대기 시간(ms) */
const COUNTDOWN_GO_MS = 450;

/** SinglePlayerApp props */
export interface SinglePlayerAppProps {
  /** 타이틀 화면의 "대전 모드" 버튼 클릭 시 호출된다 (없으면 버튼 숨김) */
  readonly onOpenMultiplayer?: () => void;
}

function SinglePlayerApp({ onOpenMultiplayer }: SinglePlayerAppProps) {
  const { enabled: soundEnabled, toggle: toggleSound, sounds, music } = useSound();
  const { state, ghost, hardDropTrail, start, restart, pause, resume, dispatch, triggerHardDrop } = useGameEngine({
    sounds,
  });
  const { highScore, submitScore } = useHighScore();
  const { shake, popups } = useEffects(state.lastScoreEvent);
  const isMobile = useIsMobile();

  // 엔진 상태가 "playing"일 때만 배경음악을 재생하고, 그 외(일시정지/게임오버/준비)에는 멈춘다.
  useEffect(() => {
    if (state.status === "playing") {
      music.start();
    } else {
      music.stop();
    }
  }, [state.status, music]);

  const [phase, setPhase] = useState<AppPhase>("title");
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  /** "시작하기" 클릭: 카운트다운(3,2,1) 단계로 진입한다 (PRD 4.1 2단계) */
  const handleStartClick = useCallback(() => {
    // 이 onClick 핸들러 안에서 직접 사운드를 재생해, 실제 클릭 제스처 안에서 AudioContext가
    // 확실하게 생성/resume되도록 한다 (일부 브라우저는 전역 리스너를 통한 언락을 인정하지 않는다).
    sounds.uiSelect();
    setIsNewHighScore(false);
    setCountdownValue(COUNTDOWN_START);
    setPhase("countdown");
  }, [sounds]);

  // 카운트다운 진행: 1초 간격으로 감소시키다가 0이 되면 "GO!"를 잠깐 보여준 뒤 실제 엔진을 시작한다.
  useEffect(() => {
    if (phase !== "countdown" || countdownValue === null) return undefined;

    if (countdownValue > 0) {
      sounds.countdownTick();
      const timer = window.setTimeout(() => {
        setCountdownValue((prev) => (prev !== null ? prev - 1 : null));
      }, COUNTDOWN_STEP_MS);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      start();
      setCountdownValue(null);
      setPhase("game");
    }, COUNTDOWN_GO_MS);
    return () => window.clearTimeout(timer);
  }, [phase, countdownValue, start, sounds]);

  // 게임 오버 전환 시점에 최종 점수를 하이스코어로 제출한다.
  useEffect(() => {
    if (state.status === "gameover") {
      setIsNewHighScore(submitScore(state.score));
    }
  }, [state.status, state.score, submitScore]);

  /** 게임 오버/일시정지 메뉴의 "다시하기": 카운트다운 없이 즉시 새 게임을 시작한다 */
  const handleRestart = useCallback(() => {
    setIsNewHighScore(false);
    restart();
  }, [restart]);

  /** 게임 오버/일시정지 메뉴의 "메인으로": 타이틀 화면으로 복귀한다 */
  const handleMainMenu = useCallback(() => {
    setPhase("title");
  }, []);

  // 넥스트 큐 미리보기(5개)는 pieceQueue 참조가 바뀔 때만 새로 계산한다.
  const nextPreview = useMemo(() => previewNext(state.pieceQueue, 5), [state.pieceQueue]);

  return (
    <div
      className={
        isMobile && phase !== "title"
          ? "flex h-dvh w-full flex-col items-stretch overflow-hidden bg-[#0a0a0f]"
          : "flex h-full w-full items-center justify-center overflow-hidden bg-[#0a0a0f] p-4"
      }
    >
      {phase === "title" && (
        <TitleScreen
          highScore={highScore}
          soundEnabled={soundEnabled}
          onStart={handleStartClick}
          onToggleSound={toggleSound}
          musicTracks={music.tracks}
          musicTrackIndex={music.trackIndex}
          onSelectMusicTrack={music.setTrackIndex}
          onOpenMultiplayer={onOpenMultiplayer}
        />
      )}

      {phase !== "title" && !isMobile && (
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-4 pt-1">
            <HoldPanel hold={state.hold} />
            <SoundControl
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              tracks={music.tracks}
              trackIndex={music.trackIndex}
              onSelectTrack={music.setTrackIndex}
              volume={music.volume}
              onChangeVolume={music.setVolume}
            />
          </div>

          <div className="relative">
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
            {phase === "countdown" && countdownValue !== null && <CountdownOverlay value={countdownValue} />}
            {state.status === "paused" && (
              <PauseOverlay onResume={resume} onRestart={handleRestart} onMainMenu={handleMainMenu} />
            )}
            {state.status === "gameover" && (
              <GameOverScreen
                score={state.score}
                highScore={highScore}
                isNewHighScore={isNewHighScore}
                onRestart={handleRestart}
                onMainMenu={handleMainMenu}
              />
            )}
          </div>

          <div className="flex flex-col gap-4 pt-1">
            <ScoreBoard
              score={state.score}
              level={state.level}
              totalLinesCleared={state.totalLinesCleared}
              combo={state.combo}
              backToBack={state.backToBack}
            />
            <NextQueue upcoming={nextPreview} />
          </div>
        </div>
      )}

      {/* ---- 모바일 레이아웃: 상단에 컴팩트 HUD 바(HOLD/SCORE/NEXT/일시정지), 중앙에 남는 높이를 꽉 채우는
           반응형 보드, 하단에 터치 컨트롤 - 세 영역이 뷰포트 높이(h-dvh)를 정확히 나눠 가지므로
           스크롤이 필요 없고, 보드 하단이 터치 컨트롤에 가려지는 일도 구조적으로 발생하지 않는다. ---- */}
      {phase !== "title" && isMobile && (
        <div className="flex h-full w-full flex-col items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
          {/* 컴팩트 HUD: 점수를 가장 크게 중앙에 두고(주인공), HOLD/일시정지는 위 줄 양끝에
              작게, LEVEL·LINES·NEXT는 아래 줄에 보조 정보로 배치한다 */}
          <div className="flex w-full max-w-[300px] shrink-0 flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black/30">
                <MiniPiece type={state.hold.type} cellSize={8} dimmed={!state.hold.canHold} />
              </div>
              <span className="flex-1 text-center font-mono text-3xl font-black tracking-tight text-white drop-shadow-[0_0_14px_rgba(34,211,238,0.35)]">
                {state.score.toLocaleString("en-US")}
              </span>
              <button
                type="button"
                aria-label={state.status === "paused" ? "재개" : "일시정지"}
                onClick={state.status === "paused" ? resume : pause}
                disabled={state.status !== "playing" && state.status !== "paused"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/30 text-base text-white/80 disabled:opacity-30"
              >
                {state.status === "paused" ? "▶" : "❚❚"}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold tracking-widest text-white/40">
                LV.{state.level} · LINES {state.totalLinesCleared}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-semibold tracking-widest text-white/40">NEXT</span>
                <div className="flex items-center gap-1">
                  {nextPreview.slice(0, 3).map((type, index) => (
                    <div
                      key={index}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-black/30"
                      style={{ opacity: 1 - index * 0.25 }}
                    >
                      <MiniPiece type={type} cellSize={5} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 보드 영역: flex-1 + min-h-0으로 위/아래 영역이 차지하고 남은 높이를 정확히 채운다 */}
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="relative h-full w-full max-w-[300px]">
              <GameBoard
                board={state.board}
                active={state.active}
                ghost={ghost}
                status={state.status}
                lastScoreEvent={state.lastScoreEvent}
                hardDropTrail={hardDropTrail}
                shake={shake}
                responsive
              />
              <EffectPopups popups={popups} />
              {phase === "countdown" && countdownValue !== null && <CountdownOverlay value={countdownValue} />}
              {state.status === "paused" && (
                <PauseOverlay onResume={resume} onRestart={handleRestart} onMainMenu={handleMainMenu} />
              )}
              {state.status === "gameover" && (
                <GameOverScreen
                  score={state.score}
                  highScore={highScore}
                  isNewHighScore={isNewHighScore}
                  onRestart={handleRestart}
                  onMainMenu={handleMainMenu}
                />
              )}
            </div>
          </div>

          <div className="w-full shrink-0">
            <TouchControls
              dispatch={dispatch}
              triggerHardDrop={triggerHardDrop}
              status={state.status}
              sounds={sounds}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default SinglePlayerApp;
