/**
 * TouchControls.tsx
 * -----------------------------------------------------------------------
 * 모바일(터치) 환경 전용 가상 게임패드. 데스크톱 키보드 입력(useGameEngine의
 * 키 리스너)과는 완전히 분리된 별도 입력 경로이며, 엔진 로직은 건드리지 않고
 * useGameEngine이 노출하는 `dispatch` / `triggerHardDrop` / `pause` / `resume`만 사용한다.
 *
 * - 좌/우 이동, 소프트드롭: pointerdown 동안 DAS(최초 지연 후) + ARR(반복 간격)로 자동 반복한다.
 *   (useGameEngine의 키보드 DAS_DELAY_MS=150 / ARR_INTERVAL_MS=35와 동일한 값을 사용해
 *   키보드와 터치의 조작감을 통일한다.)
 * - 하드드롭/회전(시계·반시계)/홀드/일시정지: pointerdown 시 1회만 발동.
 * - 모든 버튼은 touch-action: none + preventDefault로 스크롤/더블탭 확대/컨텍스트 메뉴를 막는다.
 *
 * 입력: TouchControlsProps(엔진 dispatch류 콜백, 현재 상태) / 출력: 하단 고정 터치 버튼 레이아웃 JSX
 */

import { useCallback, useRef } from "react";
import type { EngineAction, GameStatus } from "../engine";
import type { SoundEffects } from "../hooks/useSound";

/** 최초 입력 후 자동 반복이 시작되기까지의 지연시간(ms). useGameEngine의 DAS_DELAY_MS와 동일 */
const DAS_DELAY_MS = 150;
/** 자동 반복 간격(ms). useGameEngine의 ARR_INTERVAL_MS와 동일 */
const ARR_INTERVAL_MS = 35;

/** TouchControls 컴포넌트 props */
export interface TouchControlsProps {
  /** 임의의 엔진 액션을 전달한다 (이동/회전/홀드 등) */
  readonly dispatch: (action: EngineAction) => void;
  /** 하드드롭 전용 함수 (잔상 이펙트 + 효과음 포함, 키보드 Space와 동일 동작) */
  readonly triggerHardDrop: () => void;
  /** 현재 게임 상태 (paused 여부로 일시정지 버튼 라벨/동작 결정) */
  readonly status: GameStatus;
  readonly onPause: () => void;
  /** 버튼 탭에 맞춰 재생할 효과음 (없으면 무음) */
  readonly sounds?: SoundEffects;
}

/** 자동 반복(DAS/ARR) 대상이 되는 액션 종류 */
type RepeatableAction = "MOVE_LEFT" | "MOVE_RIGHT" | "SOFT_DROP";

/**
 * 눌러서 즉시 1회 실행 + 누르고 있으면 자동 반복되는 버튼 하나를 구현하는 내부 훅.
 * 입력: 반복 시작/1회 실행 콜백 / 출력: pointerdown/up/leave/cancel에 바인딩할 핸들러
 */
function useHoldRepeat(fire: (isFirst: boolean) => void) {
  const dasTimeout = useRef<number | undefined>(undefined);
  const arrInterval = useRef<number | undefined>(undefined);

  const clear = useCallback(() => {
    if (dasTimeout.current !== undefined) window.clearTimeout(dasTimeout.current);
    if (arrInterval.current !== undefined) window.clearInterval(arrInterval.current);
    dasTimeout.current = undefined;
    arrInterval.current = undefined;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      clear();
      fire(true);
      dasTimeout.current = window.setTimeout(() => {
        arrInterval.current = window.setInterval(() => fire(false), ARR_INTERVAL_MS);
      }, DAS_DELAY_MS);
    },
    [clear, fire],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      clear();
    },
    [clear],
  );

  return { onPointerDown, onPointerUp, onPointerLeave: onPointerUp, onPointerCancel: onPointerUp };
}

/** 공통 버튼 스타일 (기존 시각 언어: border-white/10, bg-white/5와 통일된 반투명 다크 스타일) */
const BUTTON_BASE =
  "flex select-none items-center justify-center rounded-2xl border border-white/10 bg-white/5 font-bold text-white/80 shadow-[0_0_12px_rgba(0,0,0,0.4)] backdrop-blur-sm active:scale-95 active:bg-white/15 transition";

/**
 * 주요 액션(이동/회전/드롭) 버튼 크기. 뷰포트 폭에 비례해 32px~56px 사이로 스케일되어,
 * 8개 버튼을 한 줄에 배치해도 어떤 폭의 모바일 화면에서도 화면 밖으로 잘리지 않는다.
 */
const PRIMARY_SIZE = "h-[clamp(2rem,11vw,3.5rem)] w-[clamp(2rem,11vw,3.5rem)]";
/** 보조 액션(홀드/일시정지) 버튼 크기. 주요 버튼보다 한 단계 작게, 같은 방식으로 스케일된다. */
const SECONDARY_SIZE = "h-[clamp(1.75rem,9vw,2.75rem)] w-[clamp(1.75rem,9vw,2.75rem)]";
/** 버튼 안 아이콘/텍스트 크기도 버튼 크기에 맞춰 함께 스케일된다 */
const PRIMARY_TEXT = "text-[clamp(1rem,5vw,1.5rem)]";
const SECONDARY_TEXT = "text-[clamp(0.55rem,2.6vw,0.7rem)]";

/** 모바일 전용 가상 게임패드. 데스크톱에서는 렌더링되지 않는다(호출부에서 useIsMobile로 조건부 렌더) */
export function TouchControls({
  dispatch,
  triggerHardDrop,
  status,
  onPause,
  sounds,
}: TouchControlsProps) {
  const dispatchRepeatable = useCallback(
    (action: RepeatableAction, playSound: boolean) => {
      if (action === "MOVE_LEFT") {
        dispatch({ type: "MOVE_LEFT" });
        if (playSound) sounds?.move();
      } else if (action === "MOVE_RIGHT") {
        dispatch({ type: "MOVE_RIGHT" });
        if (playSound) sounds?.move();
      } else {
        dispatch({ type: "SOFT_DROP" });
        if (playSound) sounds?.softDrop();
      }
    },
    [dispatch, sounds],
  );

  const leftRepeat = useHoldRepeat((isFirst) => dispatchRepeatable("MOVE_LEFT", isFirst));
  const rightRepeat = useHoldRepeat((isFirst) => dispatchRepeatable("MOVE_RIGHT", isFirst));
  const softDropRepeat = useHoldRepeat((isFirst) => dispatchRepeatable("SOFT_DROP", isFirst));

  const handleHardDrop = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      triggerHardDrop();
    },
    [triggerHardDrop],
  );

  const handleRotateCw = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      dispatch({ type: "ROTATE_CW" });
      sounds?.rotate();
    },
    [dispatch, sounds],
  );

  const handleRotateCcw = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      dispatch({ type: "ROTATE_CCW" });
      sounds?.rotate();
    },
    [dispatch, sounds],
  );

  const handleHold = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      dispatch({ type: "HOLD" });
      sounds?.hold();
    },
    [dispatch, sounds],
  );

  // 이 컴포넌트는 status가 "playing"일 때만 렌더링되므로 (아래 early return 참고),
  // 여기서는 항상 일시정지로만 동작한다 (재개는 PauseOverlay에서 처리).
  const handlePause = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      onPause();
    },
    [onPause],
  );

  // 일시정지/게임오버 화면에서는 그 위에 뜨는 오버레이(PauseOverlay/GameOverScreen)와
  // 시각적으로 겹치지 않도록, 실제로 플레이 중일 때만 컨트롤을 노출한다.
  if (status !== "playing") return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md touch-none select-none items-end justify-between gap-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      style={{ touchAction: "none" }}
      data-testid="touch-controls"
    >
      {/* 좌측: 이동(좌/우) + 소프트드롭 */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="왼쪽 이동"
          className={`${BUTTON_BASE} ${PRIMARY_SIZE} ${PRIMARY_TEXT}`}
          {...leftRepeat}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="오른쪽 이동"
          className={`${BUTTON_BASE} ${PRIMARY_SIZE} ${PRIMARY_TEXT}`}
          {...rightRepeat}
        >
          ▶
        </button>
        <button
          type="button"
          aria-label="소프트드롭"
          className={`${BUTTON_BASE} ${PRIMARY_SIZE} ${PRIMARY_TEXT}`}
          {...softDropRepeat}
        >
          ▼
        </button>
      </div>

      {/* 중앙: 홀드 + 일시정지 (보조 액션 - 크기를 한 단계 작게 통일) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="홀드"
          onPointerDown={handleHold}
          className={`${BUTTON_BASE} ${SECONDARY_SIZE} ${SECONDARY_TEXT}`}
        >
          HOLD
        </button>
        <button
          type="button"
          aria-label="일시정지"
          onPointerDown={handlePause}
          className={`${BUTTON_BASE} ${SECONDARY_SIZE} ${PRIMARY_TEXT}`}
        >
          ❚❚
        </button>
      </div>

      {/* 우측: 회전(반시계/시계) + 하드드롭 (드롭은 색상으로 강조, 크기는 통일) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="반시계 회전"
          onPointerDown={handleRotateCcw}
          className={`${BUTTON_BASE} ${PRIMARY_SIZE} ${PRIMARY_TEXT}`}
        >
          ↺
        </button>
        <button
          type="button"
          aria-label="시계 회전"
          onPointerDown={handleRotateCw}
          className={`${BUTTON_BASE} ${PRIMARY_SIZE} ${PRIMARY_TEXT}`}
        >
          ↻
        </button>
        <button
          type="button"
          aria-label="하드드롭"
          onPointerDown={handleHardDrop}
          className={`${BUTTON_BASE} ${PRIMARY_SIZE} ${SECONDARY_TEXT} border-cyan-300/40 bg-cyan-300/10 text-cyan-100`}
        >
          DROP
        </button>
      </div>
    </div>
  );
}
