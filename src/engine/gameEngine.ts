/**
 * gameEngine.ts
 * -----------------------------------------------------------------------
 * 테트리스 코어 엔진의 진입점(Facade). board/rotation/movement/lineClear/scoring/hold/bag
 * 모듈을 조합해 하나의 일관된 순수 함수 API로 제공한다.
 *
 * 사용 패턴 (UI/게임 루프 개발자를 위한 가이드):
 *   let state = createInitialState();
 *   state = applyAction(state, { type: "START" });
 *   // requestAnimationFrame 루프에서 매 프레임:
 *   state = applyAction(state, { type: "TICK", deltaMs });
 *   // 키 입력 시:
 *   state = applyAction(state, { type: "MOVE_LEFT" });
 *
 * 모든 함수는 순수 함수이며 EngineState를 직접 mutate하지 않는다. 새 상태를 반환값으로만
 * 전달하므로, React 등 UI 레이어는 반환된 새 EngineState 참조로 리렌더링 여부를 판단하면 된다.
 */

import { checkCollision, createEmptyBoard, lockPieceToBoard } from "./board";
import { refillQueue, takeNextPiece } from "./bag";
import { calculateGhostPiece, hardDrop, moveDown, moveHorizontal } from "./movement";
import { processLineClear } from "./lineClear";
import { computeHoldSwap } from "./hold";
import { createSeededRandom } from "./rng";
import { detectTSpin, tryRotate } from "./rotation";
import { getSpawnX, getSpawnY } from "./tetrominoes";
import {
  calculateDropScore,
  calculateGravityIntervalMs,
  calculateLevel,
  calculateLockScore,
  calculateNextCombo,
  HARD_DROP_SCORE_PER_CELL,
  SOFT_DROP_SCORE_PER_CELL,
} from "./scoring";
import type {
  ActivePiece,
  Board,
  EngineAction,
  EngineState,
  HoldState,
  LockDelayState,
  RandomFn,
  RotationDirection,
  ScoreEvent,
  TetrominoType,
} from "./types";

/** 락 다운(Lock Delay) 기본 유예시간 (PRD 2.5: 기본 0.5초) */
export const LOCK_DELAY_MS = 500;
/** 무한 락 다운 회피를 막기 위한 최대 리셋 허용 횟수 (가이드라인 일반적 관례) */
export const MAX_LOCK_RESETS = 15;

/** 비어있는(리셋된) 락 다운 상태를 생성한다 */
function createEmptyLockDelay(): LockDelayState {
  return { isActive: false, elapsedMs: 0, resetCount: 0 };
}

/**
 * 지정된 타입의 피스를 스폰 위치(회전 0 상태)에 배치한 ActivePiece를 생성한다.
 * 입력: type / 출력: ActivePiece
 */
function createSpawnedPiece(type: TetrominoType): ActivePiece {
  return { type, rotation: 0, position: { x: getSpawnX(type), y: getSpawnY() } };
}

/**
 * 초기 EngineState를 생성한다. (status: "ready", 빈 보드, 활성 피스 없음)
 * 입력: options.seed(시드값, 있으면 결정론적 난수 사용) 또는 options.random(직접 주입할 RandomFn)
 * 출력: 새 EngineState
 */
export function createInitialState(options?: { seed?: number; random?: RandomFn }): EngineState {
  const random =
    options?.random ?? (options?.seed !== undefined ? createSeededRandom(options.seed) : Math.random);
  const pieceQueue = refillQueue([], random);

  return {
    status: "ready",
    board: createEmptyBoard(),
    active: null,
    hold: { type: null, canHold: true },
    pieceQueue,
    lockDelay: createEmptyLockDelay(),
    lastActionWasRotation: false,
    lastRotationKickIndex: -1,
    score: 0,
    level: 1,
    totalLinesCleared: 0,
    combo: 0,
    backToBack: false,
    gravityElapsedMs: 0,
    lastScoreEvent: null,
    random,
  };
}

/**
 * 보드 위 특정 위치의 피스가 더 이상 아래로 내려갈 수 없는(바닥/스택에 닿은) 상태인지 검사한다.
 * 입력: board, piece / 출력: 접지 여부
 */
function isGrounded(board: Board, piece: ActivePiece): boolean {
  return !moveDown(board, piece).moved;
}

/**
 * 이동/회전 액션 이후 락 다운 상태를 갱신한다.
 * 접지 상태가 아니면 락 다운을 비활성화하고, 접지 상태이면 리셋 횟수 상한(MAX_LOCK_RESETS) 내에서
 * 유예시간을 0으로 리셋한다. 상한을 초과하면 더 이상 리셋하지 않고 타이머가 계속 진행되게 둔다.
 * 입력: board, piece(이동/회전 후 위치), current(이전 락 다운 상태) / 출력: 새 LockDelayState
 */
function updateLockDelayOnAction(
  board: Board,
  piece: ActivePiece,
  current: LockDelayState,
): LockDelayState {
  const grounded = isGrounded(board, piece);
  if (!grounded) {
    return { isActive: false, elapsedMs: 0, resetCount: current.resetCount };
  }
  if (current.resetCount >= MAX_LOCK_RESETS) {
    return { isActive: true, elapsedMs: current.elapsedMs, resetCount: current.resetCount };
  }
  return { isActive: true, elapsedMs: 0, resetCount: current.resetCount + 1 };
}

/**
 * 새 피스를 스폰하여 상태에 반영한다. 스폰 위치가 이미 점유되어 있다면(Top Out) GameOver로 전환한다.
 * 입력: state, type(스폰할 피스), holdOverride(갱신할 홀드 상태), queueOverride(갱신할 대기열)
 * 출력: 새 EngineState
 */
function withSpawnedPiece(
  state: EngineState,
  type: TetrominoType,
  holdOverride: HoldState,
  queueOverride: readonly TetrominoType[],
): EngineState {
  const spawned = createSpawnedPiece(type);
  const gameOver = checkCollision(state.board, spawned);
  return {
    ...state,
    active: spawned,
    pieceQueue: queueOverride,
    hold: holdOverride,
    status: gameOver ? "gameover" : "playing",
    lockDelay: createEmptyLockDelay(),
    lastActionWasRotation: false,
    lastRotationKickIndex: -1,
    gravityElapsedMs: 0,
  };
}

/**
 * 대기열(pieceQueue) 맨 앞에서 다음 피스를 꺼내 스폰한다. (자동 낙하로 새 피스가 필요할 때 호출)
 * 입력: state / 출력: 새 EngineState (게임 오버 시 status: "gameover")
 */
function spawnNext(state: EngineState): EngineState {
  const { piece, queue } = takeNextPiece(state.pieceQueue, state.random);
  return withSpawnedPiece(state, piece, { ...state.hold, canHold: true }, queue);
}

/**
 * 현재 활성 피스를 보드에 고정(Lock)하고, T-Spin 판정 -> 라인 클리어 -> 점수/콤보/레벨 갱신 ->
 * 다음 피스 스폰까지 한 번에 처리하는 락 파이프라인.
 * 입력: state(active가 존재해야 함) / 출력: 락 처리 및 다음 피스 스폰까지 반영된 새 EngineState
 */
function lockActivePiece(state: EngineState): EngineState {
  if (!state.active) return state;
  const active = state.active;

  const tSpin = detectTSpin(state.board, active, state.lastActionWasRotation, state.lastRotationKickIndex);
  const lockedBoard = lockPieceToBoard(state.board, active);
  const clearResult = processLineClear(lockedBoard);

  const scoreResult = calculateLockScore({
    category: clearResult.category,
    tSpin,
    level: state.level,
    comboCountBeforeThisClear: state.combo,
    wasBackToBackBefore: state.backToBack,
  });

  const totalLinesCleared = state.totalLinesCleared + clearResult.clearedLineCount;
  const nextLevel = calculateLevel(totalLinesCleared);
  const isLevelUp = nextLevel > state.level;
  const nextCombo = calculateNextCombo(state.combo, clearResult.category);

  const scoreEvent: ScoreEvent = {
    points: scoreResult.points,
    category: clearResult.category,
    tSpin,
    combo: nextCombo,
    backToBack: scoreResult.nextBackToBack,
    isLevelUp,
    clearedRows: clearResult.clearedRows,
  };

  const stateAfterLock: EngineState = {
    ...state,
    board: clearResult.board,
    active: null,
    score: state.score + scoreResult.points,
    level: nextLevel,
    totalLinesCleared,
    combo: nextCombo,
    backToBack: scoreResult.nextBackToBack,
    lastScoreEvent: scoreEvent,
  };

  return spawnNext(stateAfterLock);
}

/** 좌/우 이동 액션 처리. 입력: state, dx(-1 또는 1) / 출력: 새 EngineState */
function applyMoveHorizontal(state: EngineState, dx: number): EngineState {
  if (state.status !== "playing" || !state.active) return state;
  const result = moveHorizontal(state.board, state.active, dx);
  if (!result.moved) return state;
  return {
    ...state,
    active: result.piece,
    lastActionWasRotation: false,
    lockDelay: updateLockDelayOnAction(state.board, result.piece, state.lockDelay),
  };
}

/** 소프트 드롭(한 칸) 액션 처리. 성공적으로 이동한 칸 수만큼 점수를 가산한다. */
function applySoftDrop(state: EngineState): EngineState {
  if (state.status !== "playing" || !state.active) return state;
  const result = moveDown(state.board, state.active);
  if (!result.moved) {
    return { ...state, lockDelay: updateLockDelayOnAction(state.board, state.active, state.lockDelay) };
  }
  return {
    ...state,
    active: result.piece,
    score: state.score + calculateDropScore(1, SOFT_DROP_SCORE_PER_CELL),
    lastActionWasRotation: false,
    gravityElapsedMs: 0,
    lockDelay: updateLockDelayOnAction(state.board, result.piece, state.lockDelay),
  };
}

/** 하드 드롭 액션 처리: 즉시 낙하 + 점수 가산 + 즉시 락(Lock)까지 한 번에 수행한다. */
function applyHardDrop(state: EngineState): EngineState {
  if (state.status !== "playing" || !state.active) return state;
  const { piece, droppedRows } = hardDrop(state.board, state.active);
  const stateAfterDrop: EngineState = {
    ...state,
    active: piece,
    score: state.score + calculateDropScore(droppedRows, HARD_DROP_SCORE_PER_CELL),
    lastActionWasRotation: false,
  };
  return lockActivePiece(stateAfterDrop);
}

/** 회전 액션 처리 (CW/CCW/180). SRS 킥 테이블 적용 후 실패 시 상태를 그대로 반환한다. */
function applyRotate(state: EngineState, direction: RotationDirection): EngineState {
  if (state.status !== "playing" || !state.active) return state;
  const result = tryRotate(state.board, state.active, direction);
  if (!result.success) return state;
  return {
    ...state,
    active: result.piece,
    lastActionWasRotation: true,
    lastRotationKickIndex: result.kickIndex,
    lockDelay: updateLockDelayOnAction(state.board, result.piece, state.lockDelay),
  };
}

/** 홀드 액션 처리: 홀드 슬롯이 비었으면 큐에서, 있으면 슬롯의 피스와 교체하여 스폰한다. */
function applyHold(state: EngineState): EngineState {
  if (state.status !== "playing" || !state.active || !state.hold.canHold) return state;
  const swap = computeHoldSwap(state.active.type, state.hold.type);

  if (swap.shouldConsumeFromQueue) {
    const { piece, queue } = takeNextPiece(state.pieceQueue, state.random);
    return withSpawnedPiece(state, piece, { type: swap.newHoldType, canHold: false }, queue);
  }

  return withSpawnedPiece(
    state,
    swap.nextActiveType,
    { type: swap.newHoldType, canHold: false },
    state.pieceQueue,
  );
}

/**
 * 게임 시작/재시작 처리: 완전히 새로운 상태를 만들고 첫 피스를 스폰한다.
 * 입력: seed(선택, 결정론적 테스트용) / 출력: 새 EngineState (status: "playing" 또는 즉시 "gameover")
 */
function startGame(seed?: number): EngineState {
  const fresh = createInitialState(seed !== undefined ? { seed } : undefined);
  return spawnNext(fresh);
}

/**
 * 매 프레임(또는 고정 타임스텝) 호출되는 시간 진행 함수. 자동 낙하(중력)와 락 다운 타이머를 처리한다.
 * 입력: state, deltaMs(이전 tick 이후 경과 시간) / 출력: 새 EngineState
 */
export function tick(state: EngineState, deltaMs: number): EngineState {
  if (state.status !== "playing" || !state.active) return state;
  const grounded = isGrounded(state.board, state.active);

  if (!grounded) {
    const gravityElapsedMs = state.gravityElapsedMs + deltaMs;
    const interval = calculateGravityIntervalMs(state.level);
    if (gravityElapsedMs < interval) {
      return { ...state, gravityElapsedMs };
    }
    const result = moveDown(state.board, state.active);
    const movedPiece = result.piece;
    const nowGrounded = isGrounded(state.board, movedPiece);
    return {
      ...state,
      active: movedPiece,
      gravityElapsedMs: 0,
      lastActionWasRotation: false,
      lockDelay: nowGrounded
        ? { isActive: true, elapsedMs: 0, resetCount: state.lockDelay.resetCount }
        : createEmptyLockDelay(),
    };
  }

  const elapsedMs = state.lockDelay.elapsedMs + deltaMs;
  if (elapsedMs >= LOCK_DELAY_MS) {
    return lockActivePiece(state);
  }
  return { ...state, lockDelay: { ...state.lockDelay, isActive: true, elapsedMs } };
}

/**
 * 단일 액션을 상태에 적용하는 메인 리듀서. `(state, action) => newState` 형태의 순수 함수이며,
 * UI/게임 루프는 이 함수 하나만으로 엔진과 상호작용할 수 있다.
 * 입력: state, action / 출력: 새 EngineState
 */
export function applyAction(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "START":
    case "RESTART":
      return startGame(action.seed);
    case "PAUSE":
      return state.status === "playing" ? { ...state, status: "paused" } : state;
    case "RESUME":
      return state.status === "paused" ? { ...state, status: "playing" } : state;
    case "MOVE_LEFT":
      return applyMoveHorizontal(state, -1);
    case "MOVE_RIGHT":
      return applyMoveHorizontal(state, 1);
    case "SOFT_DROP":
      return applySoftDrop(state);
    case "HARD_DROP":
      return applyHardDrop(state);
    case "ROTATE_CW":
      return applyRotate(state, "CW");
    case "ROTATE_CCW":
      return applyRotate(state, "CCW");
    case "ROTATE_180":
      return applyRotate(state, "180");
    case "HOLD":
      return applyHold(state);
    case "TICK":
      return tick(state, action.deltaMs);
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}

/**
 * 현재 활성 피스가 하드 드롭될 경우 도달할 고스트 피스 위치를 계산한다. (UI 렌더링용 파생 데이터)
 * 입력: state / 출력: ActivePiece | null (활성 피스가 없으면 null)
 */
export function getGhostPiece(state: EngineState): ActivePiece | null {
  if (!state.active) return null;
  return calculateGhostPiece(state.board, state.active);
}
