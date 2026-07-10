/**
 * gameEngine.test.ts
 * -----------------------------------------------------------------------
 * gameEngine.ts 진입점(Facade)의 통합 동작을 검증한다:
 * - 게임 흐름(START/PAUSE/RESUME) 상태 전이
 * - Lock Delay(리셋/상한 MAX_LOCK_RESETS) 동작
 * - Block Out(게임 오버) 판정
 * - 홀드 1회 제한 및 스왑 동작
 * - 라인 클리어 시 ScoreEvent.clearedRows 정확성(신규 추가 필드)
 * - 중력(gravity) TICK 동작
 */

import { describe, expect, it } from "vitest";
import { getPieceCells } from "../board";
import {
  applyAction,
  createInitialState,
  getGhostPiece,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
} from "../gameEngine";
import { calculateGravityIntervalMs } from "../scoring";
import { getSpawnX, getSpawnY } from "../tetrominoes";
import { BOARD_WIDTH, type Board, type BoardCell, type EngineState } from "../types";

/** 지정된 행들을 채운 것 외에는 빈 보드를 만든다 (createInitialState의 board를 재사용해 형태만 변경) */
function withFilledBottomGap(base: Board, rows: readonly number[], gapWidth: number): Board {
  const board = base.map((row) => row.slice()) as BoardCell[][];
  for (const y of rows) {
    for (let x = gapWidth; x < BOARD_WIDTH; x++) board[y][x] = "I";
  }
  return board;
}

describe("게임 흐름 상태 전이", () => {
  it("START 시 playing 상태로 전환되고 첫 피스가 스폰된다", () => {
    const state = applyAction(createInitialState({ seed: 1 }), { type: "START" });
    expect(state.status).toBe("playing");
    expect(state.active).not.toBeNull();
  });

  it("PAUSE는 playing 상태에서만 적용되고, RESUME은 paused 상태에서만 적용된다", () => {
    let state = applyAction(createInitialState({ seed: 1 }), { type: "START" });
    // ready 상태에서는 PAUSE가 의미 없음 (이미 playing이므로 이 케이스는 생략하고 직접 확인)
    state = applyAction(state, { type: "PAUSE" });
    expect(state.status).toBe("paused");

    // paused 상태에서 다시 PAUSE를 눌러도 변화 없음
    const stillPaused = applyAction(state, { type: "PAUSE" });
    expect(stillPaused.status).toBe("paused");

    const resumed = applyAction(state, { type: "RESUME" });
    expect(resumed.status).toBe("playing");

    // playing 상태에서 RESUME은 의미 없음
    const stillPlaying = applyAction(resumed, { type: "RESUME" });
    expect(stillPlaying.status).toBe("playing");
  });

  it("ready/gameover 상태에서는 이동/회전/드롭 입력이 무시된다", () => {
    const ready = createInitialState({ seed: 1 });
    expect(applyAction(ready, { type: "MOVE_LEFT" })).toEqual(ready);
    expect(applyAction(ready, { type: "ROTATE_CW" })).toEqual(ready);
    expect(applyAction(ready, { type: "HARD_DROP" })).toEqual(ready);
  });

  it("일시정지 중에는 TICK(중력)도 무시된다", () => {
    let state = applyAction(createInitialState({ seed: 1 }), { type: "START" });
    state = applyAction(state, { type: "PAUSE" });
    const before = state;
    const after = applyAction(state, { type: "TICK", deltaMs: 5000 });
    expect(after).toEqual(before);
  });
});

describe("Lock Delay: 리셋 및 상한(MAX_LOCK_RESETS)", () => {
  /** 바닥에 닿은(접지) O 피스를 가진 playing 상태를 만든다 */
  function groundedState(): EngineState {
    const base = createInitialState({ seed: 2 });
    return {
      ...base,
      status: "playing",
      active: { type: "O", rotation: 0, position: { x: 4, y: 38 } }, // 바닥에 닿은 상태(y=38이 최대)
      lockDelay: { isActive: false, elapsedMs: 0, resetCount: 0 },
    };
  }

  it("바닥 접지 후 유예시간이 지나면 자동으로 락(고정)된다", () => {
    const state = groundedState();
    const beforeLock = applyAction(state, { type: "TICK", deltaMs: LOCK_DELAY_MS - 10 });
    expect(beforeLock.active).not.toBeNull(); // 아직 락 안 됨
    expect(beforeLock.lockDelay.elapsedMs).toBe(LOCK_DELAY_MS - 10);

    const afterLock = applyAction(beforeLock, { type: "TICK", deltaMs: 20 });
    // 유예시간 초과 -> 락 처리되어 새 피스가 스폰됨(활성 피스가 교체됨)
    expect(afterLock.board.some((row) => row.some((cell) => cell === "O"))).toBe(true);
  });

  it("접지 상태에서 이동/회전하면 유예시간이 0으로 리셋된다", () => {
    let state = groundedState();
    state = applyAction(state, { type: "TICK", deltaMs: LOCK_DELAY_MS - 10 });
    expect(state.lockDelay.elapsedMs).toBe(LOCK_DELAY_MS - 10);

    const movedLeft = applyAction(state, { type: "MOVE_LEFT" });
    expect(movedLeft.lockDelay.elapsedMs).toBe(0);
    expect(movedLeft.lockDelay.resetCount).toBe(1);
    // 리셋되었으므로 아직 락 되지 않음(활성 피스 유지)
    expect(movedLeft.active?.type).toBe("O");
  });

  it("MAX_LOCK_RESETS를 초과하면 더 이상 리셋되지 않는다", () => {
    let state = groundedState();
    // 좌우로 왕복하며 리셋을 MAX_LOCK_RESETS만큼 소진시킨다
    for (let i = 0; i < MAX_LOCK_RESETS; i++) {
      const action = i % 2 === 0 ? "MOVE_RIGHT" : "MOVE_LEFT";
      state = applyAction(state, { type: action });
    }
    expect(state.lockDelay.resetCount).toBe(MAX_LOCK_RESETS);
    expect(state.lockDelay.elapsedMs).toBe(0);

    // 유예시간을 어느 정도 진행시킨다 (아직 락 임계치 미만)
    state = applyAction(state, { type: "TICK", deltaMs: 300 });
    expect(state.lockDelay.elapsedMs).toBe(300);

    // 상한을 초과했으므로 추가 이동은 더 이상 elapsedMs를 리셋하지 못한다
    const capped = applyAction(state, { type: "MOVE_LEFT" });
    expect(capped.lockDelay.resetCount).toBe(MAX_LOCK_RESETS);
    expect(capped.lockDelay.elapsedMs).toBe(300); // 리셋되지 않고 유지됨
    expect(capped.active).not.toBeNull(); // 아직 락 되지는 않음(타이머만 진행)
  });
});

describe("Block Out (게임 오버) 판정", () => {
  it("다음 피스의 스폰 위치가 이미 점유되어 있으면 게임 오버로 전환된다", () => {
    const state = applyAction(createInitialState({ seed: 5 }), { type: "START" });
    const nextType = state.pieceQueue[0];
    const blockerCells = getPieceCells({
      type: nextType,
      rotation: 0,
      position: { x: getSpawnX(nextType), y: getSpawnY() },
    });

    const board = state.board.map((row) => row.slice()) as BoardCell[][];
    for (const cell of blockerCells) board[cell.y][cell.x] = "I";

    const blockedState: EngineState = { ...state, board };
    const afterDrop = applyAction(blockedState, { type: "HARD_DROP" });

    expect(afterDrop.status).toBe("gameover");
    expect(afterDrop.active).not.toBeNull(); // 충돌한 스폰 피스 자체는 active로 설정됨(단, gameover)
  });

  it("정상적으로 빈 스폰 위치라면 게임 오버가 되지 않는다", () => {
    const state = applyAction(createInitialState({ seed: 5 }), { type: "START" });
    const afterDrop = applyAction(state, { type: "HARD_DROP" });
    expect(afterDrop.status).toBe("playing");
  });
});

describe("홀드(Hold): 피스당 1회 제한 및 스왑 동작", () => {
  it("스폰 직후에는 홀드가 가능하다", () => {
    const state = applyAction(createInitialState({ seed: 3 }), { type: "START" });
    expect(state.hold.canHold).toBe(true);
  });

  it("홀드가 비어있을 때: 현재 피스를 홀드에 넣고 큐에서 다음 피스를 활성화한다", () => {
    const state = applyAction(createInitialState({ seed: 3 }), { type: "START" });
    const originalActiveType = state.active?.type;
    const afterHold = applyAction(state, { type: "HOLD" });

    expect(afterHold.hold.type).toBe(originalActiveType);
    expect(afterHold.hold.canHold).toBe(false);
    expect(afterHold.active).not.toBeNull();
  });

  it("한 피스당 홀드는 1회만 가능하다 (락 전까지 재사용 불가)", () => {
    const state = applyAction(createInitialState({ seed: 3 }), { type: "START" });
    const afterHold1 = applyAction(state, { type: "HOLD" });
    const afterHold2 = applyAction(afterHold1, { type: "HOLD" });
    // 두 번째 홀드 시도는 완전히 무시되어 상태가 그대로여야 한다
    expect(afterHold2).toEqual(afterHold1);
  });

  it("피스가 락(고정)되면 다시 홀드가 가능해진다", () => {
    const state = applyAction(createInitialState({ seed: 3 }), { type: "START" });
    const afterHold = applyAction(state, { type: "HOLD" });
    const afterLock = applyAction(afterHold, { type: "HARD_DROP" });
    expect(afterLock.hold.canHold).toBe(true);
  });

  it("홀드가 차있을 때: 현재 피스와 홀드 피스를 교체하고 큐를 소비하지 않는다", () => {
    const state = applyAction(createInitialState({ seed: 3 }), { type: "START" });
    const heldType = state.active?.type;
    const afterHold1 = applyAction(state, { type: "HOLD" }); // hold: heldType, active: 큐 맨앞 피스
    const afterLock = applyAction(afterHold1, { type: "HARD_DROP" }); // 락 -> canHold true, 새 피스 스폰

    const queueLengthBeforeSwap = afterLock.pieceQueue.length;
    const activeBeforeSwap = afterLock.active?.type;
    const afterSwap = applyAction(afterLock, { type: "HOLD" });

    expect(afterSwap.active?.type).toBe(heldType); // 원래 홀드에 있던 피스가 나옴
    expect(afterSwap.hold.type).toBe(activeBeforeSwap); // 방금 활성 피스가 홀드로 들어감
    expect(afterSwap.pieceQueue.length).toBe(queueLengthBeforeSwap); // 큐 소비 없음
    expect(afterSwap.hold.canHold).toBe(false);
  });
});

describe("고스트 피스 / 하드 드롭 일치", () => {
  it("고스트 피스는 활성 피스가 없으면 null이다", () => {
    expect(getGhostPiece(createInitialState({ seed: 1 }))).toBeNull();
  });

  it("하드 드롭 후 고정된 위치는 하드 드롭 이전에 계산된 고스트 위치와 일치한다", () => {
    const state = applyAction(createInitialState({ seed: 4 }), { type: "START" });
    const ghostBefore = getGhostPiece(state);
    expect(ghostBefore).not.toBeNull();

    const afterDrop = applyAction(state, { type: "HARD_DROP" });
    // 낙하한 피스가 고스트 위치에 정확히 고정되었는지 보드 셀로 확인
    if (ghostBefore) {
      const cells = getPieceCells(ghostBefore);
      for (const cell of cells) {
        expect(afterDrop.board[cell.y][cell.x]).toBe(ghostBefore.type);
      }
    }
  });
});

describe("라인 클리어 통합: ScoreEvent.clearedRows 정확성", () => {
  it("하드 드롭으로 완성된 2줄의 clearedRows가 정확히 기록된다", () => {
    const base = createInitialState({ seed: 6 });
    const board = withFilledBottomGap(base.board, [38, 39], 2); // 0,1열만 비어있는 두 줄
    const state: EngineState = {
      ...base,
      status: "playing",
      board,
      active: { type: "O", rotation: 0, position: { x: 0, y: 20 } },
    };

    const result = applyAction(state, { type: "HARD_DROP" });

    expect(result.lastScoreEvent).not.toBeNull();
    expect(result.lastScoreEvent?.category).toBe("double");
    expect(result.lastScoreEvent?.clearedRows).toEqual([38, 39]);
    expect(result.totalLinesCleared).toBe(2);
    // 지워진 두 줄 외에는 내용이 없었으므로 클리어 후 보드는 완전히 비어야 한다
    expect(result.board.every((row) => row.every((cell) => cell === null))).toBe(true);
  });

  it("클리어가 없는 락에서는 clearedRows가 빈 배열이다", () => {
    const state = applyAction(createInitialState({ seed: 6 }), { type: "START" });
    const result = applyAction(state, { type: "HARD_DROP" });
    expect(result.lastScoreEvent?.clearedRows).toEqual([]);
  });

  it("4줄 동시 클리어(테트리스)의 clearedRows가 정확히 4개 행을 담는다", () => {
    const base = createInitialState({ seed: 6 });
    // 세로로 세운 I 피스로 4줄을 한 번에 완성한다 (0열만 비워두고, 나머지 열은 미리 채움)
    const board = withFilledBottomGap(base.board, [36, 37, 38, 39], 1);
    const verticalIState: EngineState = {
      ...base,
      status: "playing",
      board,
      active: { type: "I", rotation: 1, position: { x: -2, y: 36 } }, // 로컬 x=2 -> 절대 x=0, 로컬 y0~3 -> 절대 36~39
    };

    const result = applyAction(verticalIState, { type: "HARD_DROP" });
    expect(result.lastScoreEvent?.category).toBe("tetris");
    expect(result.lastScoreEvent?.clearedRows).toEqual([36, 37, 38, 39]);
  });
});

describe("중력(TICK) 낙하", () => {
  it("낙하 간격(레벨1=1000ms)이 지나기 전에는 피스가 이동하지 않는다", () => {
    const base = createInitialState({ seed: 8 });
    const state: EngineState = {
      ...base,
      status: "playing",
      active: { type: "T", rotation: 0, position: { x: 3, y: 5 } }, // 위쪽 버퍼(접지 아님)
    };
    const interval = calculateGravityIntervalMs(state.level);
    const after = applyAction(state, { type: "TICK", deltaMs: interval - 100 });
    expect(after.active?.position).toEqual({ x: 3, y: 5 });
    expect(after.gravityElapsedMs).toBe(interval - 100);
  });

  it("낙하 간격이 지나면 피스가 한 칸 아래로 이동하고 타이머가 리셋된다", () => {
    const base = createInitialState({ seed: 8 });
    const state: EngineState = {
      ...base,
      status: "playing",
      active: { type: "T", rotation: 0, position: { x: 3, y: 5 } },
    };
    const interval = calculateGravityIntervalMs(state.level);
    const after = applyAction(state, { type: "TICK", deltaMs: interval });
    expect(after.active?.position).toEqual({ x: 3, y: 6 });
    expect(after.gravityElapsedMs).toBe(0);
  });
});
