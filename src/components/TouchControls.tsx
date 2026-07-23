/**
 * TouchControls.tsx
 * -----------------------------------------------------------------------
 * 모바일(터치) 환경 전용 가상 게임패드. 데스크톱 키보드 입력(useGameEngine의
 * 키 리스너)과는 완전히 분리된 별도 입력 경로이며, 엔진 로직은 건드리지 않고
 * useGameEngine이 노출하는 `dispatch` / `triggerHardDrop`만 사용한다.
 *
 * 배치(사용자 요청, "2 4" 구성): 좌측에 2개(◀ ▶ 이동), 우측에 닌텐도 게임패드 스타일의
 * 십자형(D-pad) 4버튼 - 위 = 하드드롭(DROP), 왼쪽 = 회전, 오른쪽 = 홀드, 아래 = 소프트드롭.
 * CSS Grid의 gridTemplateAreas로 십자 모양을 만든다(대각선 칸은 비워둠).
 *
 * - 좌/우 이동, 소프트드롭: pointerdown 동안 DAS(최초 지연 후) + ARR(반복 간격)로 자동 반복한다.
 *   (useGameEngine의 키보드 DAS_DELAY_MS=150 / ARR_INTERVAL_MS=35와 동일한 값을 사용해
 *   키보드와 터치의 조작감을 통일한다.)
 * - 하드드롭/회전(시계 방향 1개만 제공)/홀드: pointerdown 시 1회만 발동.
 * - 모든 버튼은 touch-action: none + preventDefault로 스크롤/더블탭 확대/컨텍스트 메뉴를 막는다.
 * - 모든 버튼은 pointerdown 시 짧은 진동(navigator.vibrate)으로 손끝에 클릭감을 준다.
 *   Vibration API를 지원하지 않는 브라우저(iOS Safari 등)에서는 조용히 무시된다.
 * - 일시정지 버튼은 여기 없다 - 상단 HUD 바로 옮겨졌다(호출부인 SinglePlayerApp 참고).
 * - 컨테이너는 position: fixed가 아니라 모바일 레이아웃의 일반 flex 자식이다. 보드 영역이
 *   항상 남은 공간에 맞춰 줄어들도록 만들어(GameBoard의 responsive 모드), 이 컨트롤 바가
 *   보드 하단을 겹쳐 가리는 문제 자체가 구조적으로 발생하지 않는다.
 *
 * 입력: TouchControlsProps(엔진 dispatch류 콜백, 현재 상태) / 출력: 터치 버튼 레이아웃 JSX
 */

import { useCallback, useRef } from "react";
import type { EngineAction, GameStatus } from "../engine";
import type { SoundEffects } from "../hooks/useSound";

/** 최초 입력 후 자동 반복이 시작되기까지의 지연시간(ms). useGameEngine의 DAS_DELAY_MS와 동일 */
const DAS_DELAY_MS = 150;
/** 자동 반복 간격(ms). useGameEngine의 ARR_INTERVAL_MS와 동일 */
const ARR_INTERVAL_MS = 35;
/** 버튼 탭 진동 길이(ms). 너무 길면 "웅"거리는 느낌이라 아주 짧게(클릭감만) 유지한다 */
const HAPTIC_TAP_MS = 12;

/** 터치 시 짧게 진동시켜 클릭감을 준다. Vibration API 미지원 브라우저에서는 조용히 무시한다 */
function vibrateTap() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(HAPTIC_TAP_MS);
  }
}

/** TouchControls 컴포넌트 props */
export interface TouchControlsProps {
  /** 임의의 엔진 액션을 전달한다 (이동/회전/홀드 등) */
  readonly dispatch: (action: EngineAction) => void;
  /** 하드드롭 전용 함수 (잔상 이펙트 + 효과음 포함, 키보드 Space와 동일 동작) */
  readonly triggerHardDrop: () => void;
  /** 현재 게임 상태 - "playing"이 아니면(일시정지/게임오버) 버튼을 비활성화한다 */
  readonly status: GameStatus;
  /** 버튼 탭에 맞춰 재생할 효과음 (없으면 무음) */
  readonly sounds?: SoundEffects;
}

/** 자동 반복(DAS/ARR) 대상이 되는 액션 종류 */
type RepeatableAction = "MOVE_LEFT" | "MOVE_RIGHT" | "SOFT_DROP";

/**
 * 눌러서 즉시 1회 실행 + 누르고 있으면 자동 반복되는 버튼 하나를 구현하는 내부 훅.
 * 최초 pointerdown 시 한 번만 진동시킨다(ARR로 반복될 때마다 울리면 부저처럼 거슬린다).
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
      vibrateTap();
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

/**
 * 공통 버튼 구조 스타일 (색상은 각 버튼마다 ACCENT_* 클래스로 덧붙인다).
 * 그라디언트 배경 + 컬러 글로우 + 또렷한 눌림 반응으로 "누르는 맛"을 살렸다.
 */
const BUTTON_BASE =
  "flex select-none items-center justify-center rounded-2xl border font-bold shadow-[0_2px_0_0_rgba(0,0,0,0.35)] backdrop-blur-sm transition active:translate-y-0.5 active:shadow-none";

/** 이동(◀▶): 시원한 시안 톤 */
const ACCENT_MOVE =
  "border-cyan-300/50 bg-gradient-to-b from-cyan-400/25 to-cyan-600/10 text-cyan-100 shadow-[0_2px_0_0_rgba(8,145,178,0.5),0_0_14px_rgba(34,211,238,0.35)] active:bg-cyan-400/35";
/** 소프트드롭(▼ 꾹 내리기, D-pad 아래): 인디고 톤 */
const ACCENT_SOFTDROP =
  "border-indigo-300/50 bg-gradient-to-b from-indigo-400/25 to-indigo-600/10 text-indigo-100 shadow-[0_2px_0_0_rgba(79,70,229,0.5),0_0_14px_rgba(129,140,248,0.35)] active:bg-indigo-400/35";
/** 홀드(D-pad 오른쪽): 홀드 슬롯과 통일감 있는 바이올렛 톤 */
const ACCENT_HOLD =
  "border-violet-300/50 bg-gradient-to-b from-violet-400/25 to-violet-600/10 text-violet-100 shadow-[0_2px_0_0_rgba(124,58,237,0.5),0_0_14px_rgba(196,181,253,0.35)] active:bg-violet-400/35";
/** 회전(D-pad 왼쪽): 활기찬 앰버 톤 */
const ACCENT_ROTATE =
  "border-amber-300/50 bg-gradient-to-b from-amber-400/25 to-amber-600/10 text-amber-100 shadow-[0_2px_0_0_rgba(217,119,6,0.5),0_0_14px_rgba(252,211,77,0.35)] active:bg-amber-400/35";
/** 하드드롭(D-pad 위): 가장 임팩트 있는 액션이므로 가장 강렬한 핫핑크/레드 톤으로 강조 */
const ACCENT_DROP =
  "border-rose-300/60 bg-gradient-to-b from-rose-400/35 to-rose-600/15 text-rose-100 shadow-[0_2px_0_0_rgba(190,18,60,0.6),0_0_18px_rgba(251,113,133,0.45)] active:bg-rose-400/45";

/** 좌측 이동 버튼(◀▶) 크기: 고정 64px 정사각형 */
const MOVE_BUTTON = "w-16 aspect-square";
/** 이동 버튼 아이콘 폰트 크기 */
const MOVE_TEXT = "text-2xl";

/** D-pad 한 칸의 크기(rem). 3x3 그리드로 십자 모양을 만든다 */
const DPAD_CELL_REM = 3.5;
/** D-pad 아이콘(회전/소프트드롭) 폰트 크기 */
const DPAD_ICON_TEXT = "text-2xl";
/** D-pad 텍스트 라벨(HOLD/DROP) 폰트 크기 */
const DPAD_LABEL_TEXT = "text-xs";

/**
 * 모바일 전용 가상 게임패드. 좌측 2버튼(◀▶ 이동) + 우측 4버튼 십자형 D-pad
 * (위=하드드롭, 왼쪽=회전, 오른쪽=홀드, 아래=소프트드롭). 데스크톱에서는 렌더링되지
 * 않는다(호출부에서 useIsMobile로 조건부 렌더).
 */
export function TouchControls({ dispatch, triggerHardDrop, status, sounds }: TouchControlsProps) {
  const disabled = status !== "playing";
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
      vibrateTap();
      triggerHardDrop();
    },
    [triggerHardDrop],
  );

  // 회전은 시계 방향 한 종류만 제공한다 (버튼 개수를 줄이기 위해 반시계 회전 버튼은 제거).
  const handleRotate = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      vibrateTap();
      dispatch({ type: "ROTATE_CW" });
      sounds?.rotate();
    },
    [dispatch, sounds],
  );

  const handleHold = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      vibrateTap();
      dispatch({ type: "HOLD" });
      sounds?.hold();
    },
    [dispatch, sounds],
  );

  return (
    <div
      className={`flex w-full touch-none select-none items-center justify-between px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity ${
        disabled ? "pointer-events-none opacity-30" : ""
      }`}
      style={{ touchAction: "none" }}
      data-testid="touch-controls"
    >
      {/* 좌측: 화면 왼쪽 가장자리에 붙는다. ◀ ▶ (이동) */}
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label="왼쪽 이동"
          className={`${BUTTON_BASE} ${ACCENT_MOVE} ${MOVE_BUTTON} ${MOVE_TEXT}`}
          {...leftRepeat}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="오른쪽 이동"
          className={`${BUTTON_BASE} ${ACCENT_MOVE} ${MOVE_BUTTON} ${MOVE_TEXT}`}
          {...rightRepeat}
        >
          ▶
        </button>
      </div>

      {/* 우측: 닌텐도 게임패드 스타일 십자형(D-pad) 4버튼. 위=DROP, 왼쪽=회전, 오른쪽=HOLD, 아래=소프트드롭 */}
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(3, ${DPAD_CELL_REM}rem)`,
          gridTemplateRows: `repeat(3, ${DPAD_CELL_REM}rem)`,
          gridTemplateAreas: `". up ." "left . right" ". down ."`,
        }}
      >
        <button
          type="button"
          aria-label="하드드롭"
          onPointerDown={handleHardDrop}
          style={{ gridArea: "up" }}
          className={`${BUTTON_BASE} ${ACCENT_DROP} ${DPAD_LABEL_TEXT}`}
        >
          DROP
        </button>
        <button
          type="button"
          aria-label="회전"
          onPointerDown={handleRotate}
          style={{ gridArea: "left" }}
          className={`${BUTTON_BASE} ${ACCENT_ROTATE} ${DPAD_ICON_TEXT}`}
        >
          ↻
        </button>
        <button
          type="button"
          aria-label="홀드"
          onPointerDown={handleHold}
          style={{ gridArea: "right" }}
          className={`${BUTTON_BASE} ${ACCENT_HOLD} ${DPAD_LABEL_TEXT}`}
        >
          HOLD
        </button>
        <button
          type="button"
          aria-label="소프트드롭"
          style={{ gridArea: "down" }}
          className={`${BUTTON_BASE} ${ACCENT_SOFTDROP} ${DPAD_ICON_TEXT}`}
          {...softDropRepeat}
        >
          ▼
        </button>
      </div>
    </div>
  );
}
