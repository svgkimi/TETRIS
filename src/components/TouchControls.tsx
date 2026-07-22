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
 * - 하드드롭/회전(시계 방향 1개만 제공 - 버튼 수를 줄이기 위해 반시계 회전은 없앰)/홀드/일시정지:
 *   pointerdown 시 1회만 발동.
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
 * 버튼 크기를 고정 px/vw 계산식이 아니라 flexbox 비율로 결정한다: 각 버튼은
 * flex-1(같은 그룹 내 동일 비율) + aspect-square로, 부모(그룹)에게 남는 너비를
 * 자동으로 나눠 갖는다. 화면이 좁아지면 그룹 너비가 줄고 버튼도 함께 줄어들며,
 * 화면이 넓어지면 max-width 상한까지 커진다 - 기기별 고정 breakpoint 없이
 * 모든 화면 폭에서 항상 "그 화면에 맞는 크기"가 된다.
 */
const PRIMARY_BUTTON = "flex-1 aspect-square max-w-16 min-w-0";
/** 보조 액션(홀드/일시정지)은 주요 버튼보다 작은 그룹 비율(flex-[0.8])과 낮은 상한으로 한 단계 작게 유지 */
const SECONDARY_BUTTON = "flex-1 aspect-square max-w-12 min-w-0";
/** 아이콘/텍스트 크기는 버튼 한 변 길이에 비례(cqw 대신 %로 근사): 그룹의 실제 렌더 크기를 모르므로 상한 폭 대비 비율로 고정 */
const PRIMARY_TEXT = "text-[clamp(0.9rem,6vw,1.5rem)]";
const SECONDARY_TEXT = "text-[clamp(0.5rem,3vw,0.7rem)]";

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

  // 회전은 시계 방향 한 종류만 제공한다 (버튼 개수를 줄이기 위해 반시계 회전 버튼은 제거).
  const handleRotate = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      dispatch({ type: "ROTATE_CW" });
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
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md touch-none select-none items-end gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      style={{ touchAction: "none" }}
      data-testid="touch-controls"
    >
      {/* 좌측: 이동(좌/우) + 소프트드롭 - 그룹 너비를 화면 폭에 맞춰 자동으로 나눠 갖는다 */}
      <div className="flex flex-1 items-end gap-1.5">
        <button
          type="button"
          aria-label="왼쪽 이동"
          className={`${BUTTON_BASE} ${PRIMARY_BUTTON} ${PRIMARY_TEXT}`}
          {...leftRepeat}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="오른쪽 이동"
          className={`${BUTTON_BASE} ${PRIMARY_BUTTON} ${PRIMARY_TEXT}`}
          {...rightRepeat}
        >
          ▶
        </button>
        <button
          type="button"
          aria-label="소프트드롭"
          className={`${BUTTON_BASE} ${PRIMARY_BUTTON} ${PRIMARY_TEXT}`}
          {...softDropRepeat}
        >
          ▼
        </button>
      </div>

      {/* 중앙: 홀드 + 일시정지 (보조 액션 - 그룹 자체를 좁게 잡아 버튼도 한 단계 작다) */}
      <div className="flex flex-[0.8] items-end gap-1.5">
        <button
          type="button"
          aria-label="홀드"
          onPointerDown={handleHold}
          className={`${BUTTON_BASE} ${SECONDARY_BUTTON} ${SECONDARY_TEXT}`}
        >
          HOLD
        </button>
        <button
          type="button"
          aria-label="일시정지"
          onPointerDown={handlePause}
          className={`${BUTTON_BASE} ${SECONDARY_BUTTON} ${PRIMARY_TEXT}`}
        >
          ❚❚
        </button>
      </div>

      {/* 우측: 회전(시계 방향 하나만) + 하드드롭 (드롭은 색상으로 강조) */}
      <div className="flex flex-1 items-end gap-1.5">
        <button
          type="button"
          aria-label="회전"
          onPointerDown={handleRotate}
          className={`${BUTTON_BASE} ${PRIMARY_BUTTON} ${PRIMARY_TEXT}`}
        >
          ↻
        </button>
        <button
          type="button"
          aria-label="하드드롭"
          onPointerDown={handleHardDrop}
          className={`${BUTTON_BASE} ${PRIMARY_BUTTON} ${SECONDARY_TEXT} border-cyan-300/40 bg-cyan-300/10 text-cyan-100`}
        >
          DROP
        </button>
      </div>
    </div>
  );
}
