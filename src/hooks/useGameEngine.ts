/**
 * useGameEngine.ts
 * -----------------------------------------------------------------------
 * React와 순수 게임 엔진(src/engine)을 연결하는 유일한 접점(hook).
 * - requestAnimationFrame 기반 고정 타임스텝 루프로 매 프레임 TICK 액션을 dispatch한다.
 * - 키보드 입력을 수집해 엔진 액션으로 변환한다 (DAS/ARR 방식의 좌우/소프트드롭 자동 반복 포함).
 * - 브라우저 탭이 비활성화되면 자동으로 PAUSE 한다.
 * - 하드 드롭 잔상 이펙트에 필요한 정보(HardDropTrailInfo)는 엔진 상태를 오염시키지 않도록
 *   이 훅의 로컬 상태로 별도 관리한다.
 *
 * 성능 규칙(CLAUDE.md 60FPS 방어): 엔진 리듀서가 반환하는 EngineState는 실제로 값이 바뀐
 * 필드만 새 참조를 갖도록 설계되어 있으므로(gameEngine.ts 참고), 이 훅을 사용하는 컴포넌트들은
 * React.memo + 얕은 비교로 불필요한 재렌더링을 자연스럽게 피할 수 있다.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  applyAction,
  createInitialState,
  getGhostPiece,
  type ActivePiece,
  type EngineAction,
  type EngineState,
  type LineClearCategory,
  type RotationState,
  type TetrominoType,
} from "../engine";
import type { SoundEffects } from "./useSound";

/** 하드 드롭 낙하 궤적(잔상) 이펙트에 필요한 정보. 엔진 상태와 분리된 UI 전용 데이터 */
export interface HardDropTrailInfo {
  readonly type: TetrominoType;
  readonly rotation: RotationState;
  readonly x: number;
  readonly fromY: number;
  readonly toY: number;
  /** 같은 위치로 연속 하드 드롭되어도 이펙트가 재트리거되도록 매번 증가하는 토큰 */
  readonly token: number;
}

/** useGameEngine 훅 옵션 */
export interface UseGameEngineOptions {
  /** 입력/점수 이벤트에 맞춰 재생할 효과음 모음 (없으면 무음) */
  readonly sounds?: SoundEffects;
}

/** useGameEngine 훅의 반환 타입 */
export interface UseGameEngineResult {
  readonly state: EngineState;
  /** 현재 활성 피스가 하드 드롭될 경우 도달할 고스트 피스 (없으면 null) */
  readonly ghost: ActivePiece | null;
  readonly hardDropTrail: HardDropTrailInfo | null;
  readonly start: (seed?: number) => void;
  readonly restart: (seed?: number) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  /**
   * 엔진 리듀서에 임의의 EngineAction을 직접 전달한다 (예: 대전 모드의 RECEIVE_GARBAGE).
   * 싱글플레이 흐름에서는 사용하지 않아도 되며, start/restart/pause/resume이 대부분의 경우를 커버한다.
   */
  readonly dispatch: (action: EngineAction) => void;
}

/** 자동 반복(DAS: Delayed Auto Shift) 대상이 되는 액션 종류 */
type RepeatableAction = "MOVE_LEFT" | "MOVE_RIGHT" | "SOFT_DROP";

/** 최초 입력 후 자동 반복이 시작되기까지의 지연시간(ms) */
const DAS_DELAY_MS = 150;
/** 자동 반복 간격(ms, ARR: Auto Repeat Rate) */
const ARR_INTERVAL_MS = 35;

/** 라인 클리어 카테고리를 지워진 줄 수(정수)로 변환한다. 입력: category / 출력: 줄 수 */
function categoryToLineCount(category: LineClearCategory): number {
  switch (category) {
    case "single":
      return 1;
    case "double":
      return 2;
    case "triple":
      return 3;
    case "tetris":
      return 4;
    default:
      return 0;
  }
}

/** keydown 이벤트의 code로부터 자동 반복 대상 액션을 판별한다 */
function resolveRepeatableAction(code: string): RepeatableAction | null {
  switch (code) {
    case "ArrowLeft":
      return "MOVE_LEFT";
    case "ArrowRight":
      return "MOVE_RIGHT";
    case "ArrowDown":
      return "SOFT_DROP";
    default:
      return null;
  }
}

/**
 * 테트리스 게임 엔진 + 입력 + 게임 루프를 결합하는 메인 훅.
 * 입력: options(효과음 콜백 등) / 출력: UseGameEngineResult
 */
export function useGameEngine(options?: UseGameEngineOptions): UseGameEngineResult {
  // 엔진 리듀서(applyAction)를 그대로 React useReducer에 연결한다.
  // gameEngine.ts의 모든 상태 전이 로직은 순수 함수이므로 React 쪽에서 재구현하지 않는다.
  const [state, applyAndSet] = useReducer(applyAction, undefined, () => createInitialState());

  // 최신 state/사운드를 이펙트 클로저 밖에서도 참조하기 위한 ref (키 리스너 재등록을 막기 위함)
  const stateRef = useRef(state);
  stateRef.current = state;
  const soundsRef = useRef<SoundEffects | undefined>(options?.sounds);
  soundsRef.current = options?.sounds;

  const [hardDropTrail, setHardDropTrail] = useState<HardDropTrailInfo | null>(null);
  const trailTokenRef = useRef(0);

  // ---- 게임 흐름 제어 함수 ----
  const start = useCallback((seed?: number) => applyAndSet({ type: "START", seed }), [applyAndSet]);
  const restart = useCallback((seed?: number) => applyAndSet({ type: "RESTART", seed }), [applyAndSet]);
  const pause = useCallback(() => applyAndSet({ type: "PAUSE" }), [applyAndSet]);
  const resume = useCallback(() => applyAndSet({ type: "RESUME" }), [applyAndSet]);

  const togglePause = useCallback(() => {
    const status = stateRef.current.status;
    if (status === "playing") applyAndSet({ type: "PAUSE" });
    else if (status === "paused") applyAndSet({ type: "RESUME" });
  }, [applyAndSet]);

  /** 하드 드롭: 잔상 이펙트 정보를 먼저 계산한 뒤 실제 엔진 액션을 적용한다 */
  const triggerHardDrop = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "playing" || !current.active) return;
    const ghostPiece = getGhostPiece(current);
    if (ghostPiece) {
      trailTokenRef.current += 1;
      setHardDropTrail({
        type: current.active.type,
        rotation: current.active.rotation,
        x: current.active.position.x,
        fromY: current.active.position.y,
        toY: ghostPiece.position.y,
        token: trailTokenRef.current,
      });
    }
    applyAndSet({ type: "HARD_DROP" });
    soundsRef.current?.hardDrop();
  }, [applyAndSet]);

  // ---- requestAnimationFrame 기반 게임 루프: 매 프레임 TICK 디스패치 ----
  useEffect(() => {
    let rafId = 0;
    let lastTime: number | null = null;
    const loop = (time: number) => {
      if (lastTime !== null) {
        const deltaMs = time - lastTime;
        applyAndSet({ type: "TICK", deltaMs });
      }
      lastTime = time;
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [applyAndSet]);

  // ---- 키보드 입력 처리 (DAS/ARR 자동 반복 포함) ----
  useEffect(() => {
    let dasTimeout: number | undefined;
    let arrInterval: number | undefined;
    let currentRepeatAction: RepeatableAction | null = null;

    const clearRepeat = () => {
      if (dasTimeout !== undefined) window.clearTimeout(dasTimeout);
      if (arrInterval !== undefined) window.clearInterval(arrInterval);
      dasTimeout = undefined;
      arrInterval = undefined;
      currentRepeatAction = null;
    };

    // playSound: ARR 자동 반복(35ms 간격)으로 호출될 때도 매번 소리를 내면, 소리 길이가
    // 반복 간격보다 길어 같은 톤이 계속 겹쳐 울리며 음질이 깨진 것처럼 들린다.
    // 그래서 키를 처음 누른 순간에만 소리를 내고, 그 이후 자동 반복 이동은 무음으로 처리한다.
    const dispatchRepeatable = (action: RepeatableAction, playSound: boolean) => {
      if (action === "MOVE_LEFT") {
        applyAndSet({ type: "MOVE_LEFT" });
        if (playSound) soundsRef.current?.move();
      } else if (action === "MOVE_RIGHT") {
        applyAndSet({ type: "MOVE_RIGHT" });
        if (playSound) soundsRef.current?.move();
      } else {
        applyAndSet({ type: "SOFT_DROP" });
        if (playSound) soundsRef.current?.softDrop();
      }
    };

    const startRepeat = (action: RepeatableAction) => {
      if (currentRepeatAction === action) return;
      clearRepeat();
      currentRepeatAction = action;
      dispatchRepeatable(action, true);
      dasTimeout = window.setTimeout(() => {
        arrInterval = window.setInterval(() => dispatchRepeatable(action, false), ARR_INTERVAL_MS);
      }, DAS_DELAY_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const repeatable = resolveRepeatableAction(event.code);
      if (repeatable) {
        event.preventDefault();
        if (!event.repeat) startRepeat(repeatable);
        return;
      }

      // OS의 키 반복(auto-repeat)은 단발성 액션(회전/하드드롭/홀드/일시정지)에서는 무시한다
      if (event.repeat) return;

      switch (event.code) {
        case "ArrowUp":
        case "KeyX":
          event.preventDefault();
          applyAndSet({ type: "ROTATE_CW" });
          soundsRef.current?.rotate();
          break;
        case "KeyZ":
          event.preventDefault();
          applyAndSet({ type: "ROTATE_CCW" });
          soundsRef.current?.rotate();
          break;
        case "KeyA":
          event.preventDefault();
          applyAndSet({ type: "ROTATE_180" });
          soundsRef.current?.rotate();
          break;
        case "Space":
          event.preventDefault();
          triggerHardDrop();
          break;
        case "KeyC":
        case "ShiftLeft":
        case "ShiftRight":
          event.preventDefault();
          applyAndSet({ type: "HOLD" });
          soundsRef.current?.hold();
          break;
        case "Escape":
        case "KeyP":
          event.preventDefault();
          togglePause();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const repeatable = resolveRepeatableAction(event.code);
      if (repeatable && currentRepeatAction === repeatable) {
        clearRepeat();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      clearRepeat();
    };
  }, [applyAndSet, togglePause, triggerHardDrop]);

  // ---- 탭 비활성화(포커스 아웃) 시 자동 일시정지 (PRD 4.2) ----
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && stateRef.current.status === "playing") {
        applyAndSet({ type: "PAUSE" });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [applyAndSet]);

  // ---- 점수 이벤트 -> 효과음 트리거 (lastScoreEvent 참조가 실제로 바뀔 때만 실행) ----
  useEffect(() => {
    const event = state.lastScoreEvent;
    const sounds = soundsRef.current;
    if (!event || !sounds) return;
    if (event.tSpin !== "none") {
      sounds.tSpin(categoryToLineCount(event.category));
    } else if (event.category === "tetris") {
      sounds.tetris();
    } else if (event.category !== "none") {
      sounds.lineClear(categoryToLineCount(event.category));
    } else {
      sounds.lock();
    }
    if (event.isLevelUp) {
      sounds.levelUp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastScoreEvent]);

  // ---- 게임오버 전환 시 효과음 ----
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    if (prevStatusRef.current !== "gameover" && state.status === "gameover") {
      soundsRef.current?.gameOver();
    }
    prevStatusRef.current = state.status;
  }, [state.status]);

  // 고스트 피스는 board/active 참조가 실제로 바뀔 때만 재계산한다 (매 TICK마다 재계산 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ghost = useMemo(() => getGhostPiece(state), [state.board, state.active]);

  return { state, ghost, hardDropTrail, start, restart, pause, resume, dispatch: applyAndSet };
}
