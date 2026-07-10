/**
 * types.ts
 * -----------------------------------------------------------------------
 * 테트리스 코어 엔진에서 사용하는 모든 타입/인터페이스를 정의한다.
 * 이 파일은 React 등 프레임워크에 전혀 의존하지 않는 순수 타입 정의만 포함하며,
 * UI 개발자와 QA(테스트) 개발자가 함께 참조하는 "계약(Contract)" 역할을 한다.
 */

/** 7종 테트리미노(블록) 종류 */
export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** 보드에 존재 가능한 모든 테트리미노 종류 목록 (7-bag 셔플의 기준 데이터) */
export const ALL_TETROMINO_TYPES: readonly TetrominoType[] = [
  "I",
  "O",
  "T",
  "S",
  "Z",
  "J",
  "L",
];

/**
 * SRS 회전 상태.
 * 0 = spawn(기본 스폰 상태), 1 = R(시계 방향 90도), 2 = 2(180도), 3 = L(반시계 방향 90도)
 * PRD의 "0, R, 2, L" 표기와 매핑된다.
 */
export type RotationState = 0 | 1 | 2 | 3;

/** RotationState 값을 사람이 읽기 쉬운 이름으로 매핑한 상수 (문서/디버깅용) */
export const ROTATION_STATE_NAMES: Record<RotationState, "0" | "R" | "2" | "L"> = {
  0: "0",
  1: "R",
  2: "2",
  3: "L",
};

/** 회전 방향: 시계(CW) / 반시계(CCW) / 180도 */
export type RotationDirection = "CW" | "CCW" | "180";

/** 2차원 좌표(격자 단위). x: 열(column), y: 행(row, 아래로 갈수록 증가) */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** 보드의 한 칸(셀) 상태. 비어있으면 null, 채워져 있으면 해당 테트리미노 타입 */
export type BoardCell = TetrominoType | null;

/** 보드 전체: row-major 2차원 배열. board[y][x] 로 접근 */
export type Board = readonly BoardCell[][];

/** 필드(보드) 크기 상수 */
export const BOARD_WIDTH = 10;
export const BOARD_VISIBLE_HEIGHT = 20;
/** 스폰 및 회전 여유 공간으로 사용되는 상단 버퍼(화면에는 보이지 않음) */
export const BOARD_BUFFER_HEIGHT = 20;
/** 버퍼 + 가시 영역을 합친 보드 전체 높이 */
export const BOARD_TOTAL_HEIGHT = BOARD_VISIBLE_HEIGHT + BOARD_BUFFER_HEIGHT;

/** 필드에서 현재 조작 중인 테트리미노(활성 피스) */
export interface ActivePiece {
  readonly type: TetrominoType;
  readonly rotation: RotationState;
  /** 피스 바운딩 박스의 좌상단 좌표 (보드 좌표계) */
  readonly position: Position;
}

/** 게임 진행 상태 */
export type GameStatus = "ready" | "playing" | "paused" | "gameover";

/**
 * 0 이상 1 미만의 실수를 반환하는 난수 함수 시그니처 (Math.random 과 동일한 형태).
 * EngineState가 이 함수 참조를 직접 들고 있게 함으로써 "숨겨진 전역 가변 상태" 없이
 * 테스트 시 시드 기반 난수 함수(rng.ts의 createSeededRandom)로 손쉽게 교체할 수 있다.
 */
export type RandomFn = () => number;

/** T-Spin 판정 결과 */
export type TSpinType = "none" | "mini" | "normal";

/** 한 번의 라인 클리어 이벤트에서 지워진 줄 수에 따른 분류 */
export type LineClearCategory = "none" | "single" | "double" | "triple" | "tetris";

/** 라인 클리어 처리 결과 */
export interface LineClearResult {
  /** 클리어된 보드 (지워진 줄을 제거하고 위쪽 줄을 아래로 내린 상태) */
  readonly board: Board;
  /** 지워진 줄의 개수 */
  readonly clearedLineCount: number;
  /** 지워지기 전, 보드 기준으로 어떤 행(row index)들이 지워졌는지 */
  readonly clearedRows: readonly number[];
  /** 지워진 줄 수 분류 */
  readonly category: LineClearCategory;
}

/** 한 번의 락(고정) 이벤트에서 발생한 점수 계산 결과 (UI 이펙트 트리거에 활용) */
export interface ScoreEvent {
  readonly points: number;
  readonly category: LineClearCategory;
  readonly tSpin: TSpinType;
  readonly combo: number;
  readonly backToBack: boolean;
  readonly isLevelUp: boolean;
  /**
   * 이번 락에서 실제로 지워진 보드 행(row index) 목록 (지워지기 전 보드 기준).
   * 라인 클리어가 없었다면 빈 배열. UI가 파티클/플래시 이펙트를 정확한 행 위치에
   * 배치할 수 있도록 LineClearResult.clearedRows 값을 그대로 전달한다.
   */
  readonly clearedRows: readonly number[];
}

/** 홀드 슬롯 상태 */
export interface HoldState {
  readonly type: TetrominoType | null;
  /** 현재 활성 피스가 스폰된 이후 홀드를 아직 사용하지 않았다면 true */
  readonly canHold: boolean;
}

/** 락 다운(Lock Delay) 관련 상태 */
export interface LockDelayState {
  readonly isActive: boolean;
  /** 유예시간 시작 이후 경과 시간(ms) */
  readonly elapsedMs: number;
  /** 이동/회전으로 인해 유예시간이 리셋된 횟수 (무한 리셋 방지용 상한 존재) */
  readonly resetCount: number;
}

/**
 * 엔진 전체 상태(State).
 * 이 인터페이스는 UI 레이어와 QA 테스트가 함께 의존하는 핵심 계약이다.
 * 절대 이 구조를 임의로 mutate 하지 말고, gameEngine.ts 의 함수들을 통해서만 갱신할 것.
 */
export interface EngineState {
  readonly status: GameStatus;
  readonly board: Board;
  /** 현재 조작 중인 피스. Ready/GameOver 상태 등에서는 null 일 수 있다 */
  readonly active: ActivePiece | null;
  readonly hold: HoldState;
  /**
   * 7-bag으로 생성된, 아직 소비되지 않은 향후 피스 전체 시퀀스.
   * 항상 미리보기 요구 개수보다 넉넉히 채워져 있다(bag.ts의 refillQueue가 보장).
   * UI의 next-queue 미리보기는 `previewNext(state.pieceQueue, N)` (bag.ts)로 파생해서 사용한다.
   */
  readonly pieceQueue: readonly TetrominoType[];
  readonly lockDelay: LockDelayState;
  /** 마지막으로 적용된 이동/회전이 회전이었는지 여부 (T-Spin 판정에 사용) */
  readonly lastActionWasRotation: boolean;
  /** 회전 성공 시 사용된 킥 테이블 인덱스 (0=킥 없음). T-Spin Triple 특례 판정에 사용 */
  readonly lastRotationKickIndex: number;
  readonly score: number;
  readonly level: number;
  readonly totalLinesCleared: number;
  /** 현재 콤보 카운트. 콤보가 끊긴 상태(직전 락에서 클리어가 없었음)이면 0 */
  readonly combo: number;
  /** Back-to-Back 체인이 활성화되어 있는지 여부 (테트리스/T-Spin 연속 시 유지) */
  readonly backToBack: boolean;
  /** 자동 낙하 타이머 누적 시간(ms) */
  readonly gravityElapsedMs: number;
  /** 가장 최근 락에서 발생한 점수 이벤트 (UI 연출 트리거용, 없으면 null) */
  readonly lastScoreEvent: ScoreEvent | null;
  /** 7-bag 셔플 등에 사용되는 난수 함수. 기본은 Math.random, 테스트 시 시드 함수로 교체 가능 */
  readonly random: RandomFn;
}

/** gameEngine.ts 의 applyAction 이 받는 액션(디스패치) 타입 */
export type EngineAction =
  | { readonly type: "START"; readonly seed?: number }
  | { readonly type: "RESTART"; readonly seed?: number }
  | { readonly type: "PAUSE" }
  | { readonly type: "RESUME" }
  | { readonly type: "MOVE_LEFT" }
  | { readonly type: "MOVE_RIGHT" }
  | { readonly type: "SOFT_DROP" }
  | { readonly type: "HARD_DROP" }
  | { readonly type: "ROTATE_CW" }
  | { readonly type: "ROTATE_CCW" }
  | { readonly type: "ROTATE_180" }
  | { readonly type: "HOLD" }
  | { readonly type: "TICK"; readonly deltaMs: number };
