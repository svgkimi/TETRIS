/**
 * battle.test.ts
 * -----------------------------------------------------------------------
 * 1:1 대전(versus) 모드 코어 로직 검증:
 * - calculateAttackLines: 라인클리어/T-Spin/콤보/Back-to-Back 조합별 공격 라인 계산
 * - addGarbageLines: 가비지 라인 삽입(순수 함수) 동작
 * - RECEIVE_GARBAGE 액션: gameEngine.ts의 applyAction을 통한 통합 동작
 *   (활성 피스 위치 이동, 충돌 시 게임오버, 상태 가드 등)
 */

import { describe, expect, it } from "vitest";
import { addGarbageLines, calculateAttackLines } from "../battle";
import { applyAction, createInitialState } from "../gameEngine";
import {
  BOARD_TOTAL_HEIGHT,
  BOARD_VISIBLE_HEIGHT,
  BOARD_WIDTH,
  type Board,
  type BoardCell,
  type EngineState,
  type ScoreEvent,
} from "../types";

/** 테스트에서 자주 사용하는 기본 ScoreEvent를 생성하는 헬퍼. 필요한 필드만 override한다. */
function makeEvent(overrides: Partial<ScoreEvent> = {}): ScoreEvent {
  return {
    points: 0,
    category: "none",
    tSpin: "none",
    combo: 0,
    backToBack: false,
    isLevelUp: false,
    clearedRows: [],
    ...overrides,
  };
}

describe("calculateAttackLines: 카테고리별 기본 공격 라인 수", () => {
  it.each([
    ["none", 0],
    ["single", 0],
    ["double", 1],
    ["triple", 2],
    ["tetris", 4],
  ] as const)("category=%s 이면 기본 공격 라인은 %i", (category, expected) => {
    const event = makeEvent({ category, tSpin: "none", combo: 0 });
    expect(calculateAttackLines(event)).toBe(expected);
  });
});

describe("calculateAttackLines: T-Spin 조합별 공격 라인 수", () => {
  it.each([
    ["mini", "none", 0],
    ["mini", "single", 1],
    ["mini", "double", 1],
    ["mini", "triple", 1],
    ["normal", "none", 0],
    ["normal", "single", 2],
    ["normal", "double", 4],
    ["normal", "triple", 6],
  ] as const)("tSpin=%s, category=%s 이면 공격 라인은 %i", (tSpin, category, expected) => {
    const event = makeEvent({ category, tSpin, combo: 0 });
    expect(calculateAttackLines(event)).toBe(expected);
  });
});

describe("calculateAttackLines: category가 none이면 T-Spin이어도 항상 0", () => {
  it.each(["mini", "normal"] as const)("tSpin=%s 이지만 라인을 지우지 못했다면(category=none) 0", (tSpin) => {
    const event = makeEvent({ category: "none", tSpin, combo: 3, backToBack: true });
    expect(calculateAttackLines(event)).toBe(0);
  });
});

describe("calculateAttackLines: Back-to-Back 보너스", () => {
  it("테트리스 + backToBack이면 기본 공격에 보너스 1이 추가된다", () => {
    const withoutB2B = calculateAttackLines(makeEvent({ category: "tetris", backToBack: false }));
    const withB2B = calculateAttackLines(makeEvent({ category: "tetris", backToBack: true }));
    expect(withoutB2B).toBe(4);
    expect(withB2B).toBe(5);
  });

  it("T-Spin(normal) + backToBack이면 보너스 1이 추가된다", () => {
    const withoutB2B = calculateAttackLines(
      makeEvent({ category: "double", tSpin: "normal", backToBack: false }),
    );
    const withB2B = calculateAttackLines(
      makeEvent({ category: "double", tSpin: "normal", backToBack: true }),
    );
    expect(withoutB2B).toBe(4);
    expect(withB2B).toBe(5);
  });

  it("일반 라인 클리어(T-Spin 아님, 테트리스 아님)는 backToBack이어도 보너스가 붙지 않는다", () => {
    const withoutB2B = calculateAttackLines(makeEvent({ category: "double", backToBack: false }));
    const withB2B = calculateAttackLines(makeEvent({ category: "double", backToBack: true }));
    expect(withoutB2B).toBe(1);
    expect(withB2B).toBe(1); // double은 difficult clear가 아니므로 B2B 보너스 미적용
  });

  it("single 클리어는 backToBack이어도 보너스가 붙지 않는다", () => {
    expect(calculateAttackLines(makeEvent({ category: "single", backToBack: true }))).toBe(0);
  });
});

describe("calculateAttackLines: 콤보 보너스 계단 구간 경계값", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1], // 1 -> 2 경계에서 값이 바뀜
    [3, 1],
    [4, 2], // 3 -> 4 경계에서 값이 바뀜
    [5, 2],
    [6, 3], // 5 -> 6 경계에서 값이 바뀜
    [7, 3],
  ])("combo=%i 이면 콤보 보너스는 %i (single 클리어 기준 총합으로 검증)", (combo, comboBonus) => {
    // single의 기본 공격은 0이므로, 총 공격 라인이 곧 콤보 보너스와 일치한다.
    const event = makeEvent({ category: "single", combo });
    expect(calculateAttackLines(event)).toBe(comboBonus);
  });

  it("콤보 보너스는 다른 보너스(B2B, T-Spin)와 함께 누적된다", () => {
    // tetris(4) + B2B(1) + combo=6 보너스(3) = 8
    const event = makeEvent({ category: "tetris", backToBack: true, combo: 6 });
    expect(calculateAttackLines(event)).toBe(8);
  });
});

describe("addGarbageLines: 삽입 위치/모양", () => {
  /** count개의 가비지 행 + 나머지가 모두 비어있는 기준 보드를 만든다 */
  function emptyBoard(): Board {
    return Array.from({ length: BOARD_TOTAL_HEIGHT }, () =>
      Array.from({ length: BOARD_WIDTH }, (): BoardCell => null),
    );
  }

  it("count개의 가비지 행이 보드 맨 아래(마지막 count개 행)에 정확히 삽입된다", () => {
    const board = emptyBoard();
    const result = addGarbageLines(board, 3, 5);
    const bottomRows = result.slice(BOARD_TOTAL_HEIGHT - 3);
    for (const row of bottomRows) {
      expect(row.some((cell) => cell === "GARBAGE")).toBe(true);
    }
    // 그 위쪽 행들은 원래대로 비어있어야 한다
    const upperRows = result.slice(0, BOARD_TOTAL_HEIGHT - 3);
    for (const row of upperRows) {
      expect(row.every((cell) => cell === null)).toBe(true);
    }
  });

  it("삽입된 가비지 행에서는 gapColumn만 null이고 나머지는 전부 GARBAGE", () => {
    const board = emptyBoard();
    const gapColumn = 4;
    const result = addGarbageLines(board, 2, gapColumn);
    const garbageRows = result.slice(BOARD_TOTAL_HEIGHT - 2);
    for (const row of garbageRows) {
      expect(row.length).toBe(BOARD_WIDTH);
      row.forEach((cell, x) => {
        if (x === gapColumn) {
          expect(cell).toBeNull();
        } else {
          expect(cell).toBe("GARBAGE");
        }
      });
    }
  });

  it("가비지 삽입 후에도 보드 전체 높이(BOARD_TOTAL_HEIGHT)는 유지된다", () => {
    const board = emptyBoard();
    const result = addGarbageLines(board, 5, 0);
    expect(result.length).toBe(BOARD_TOTAL_HEIGHT);
    result.forEach((row) => expect(row.length).toBe(BOARD_WIDTH));
  });

  it("기존 스택이 정확히 count칸만큼 위로 밀려 올라간다", () => {
    // 맨 아래 한 줄(마지막 행)에 표식을 채워둔다
    const board = emptyBoard().map((row) => row.slice()) as BoardCell[][];
    const markerRowIndex = BOARD_TOTAL_HEIGHT - 1;
    board[markerRowIndex] = Array.from({ length: BOARD_WIDTH }, (): BoardCell => "T");

    const count = 3;
    const result = addGarbageLines(board, count, 0);

    // 표식 행은 count칸만큼 위로 이동했어야 한다
    expect(result[markerRowIndex - count].every((cell) => cell === "T")).toBe(true);
    // 원래 표식 위치는 이제 가비지 행이어야 한다 (덮어씌워짐)
    expect(result[markerRowIndex].some((cell) => cell === "GARBAGE")).toBe(true);
  });

  it("count가 0 이하이면 원본 board를 그대로(참조 동일성 포함) 반환한다", () => {
    const board = emptyBoard();
    expect(addGarbageLines(board, 0, 0)).toBe(board);
    expect(addGarbageLines(board, -1, 0)).toBe(board);
  });

  it("gapColumn이 보드 범위를 벗어나면 원본 board를 그대로(참조 동일성 포함) 반환한다", () => {
    const board = emptyBoard();
    expect(addGarbageLines(board, 2, -1)).toBe(board);
    expect(addGarbageLines(board, 2, BOARD_WIDTH)).toBe(board);
  });

  it("원본 board를 변경하지 않는다 (일반 케이스에서도 순수성 유지)", () => {
    const board = emptyBoard().map((row) => row.slice()) as BoardCell[][];
    board[BOARD_TOTAL_HEIGHT - 1][0] = "I";
    // deep copy로 스냅샷을 떠서 이후 원본과 비교한다
    const snapshot = board.map((row) => row.slice());

    addGarbageLines(board, 4, 2);

    expect(board).toEqual(snapshot);
  });

  it("count가 보드 전체 높이보다 커도 에러 없이 처리되고 높이가 유지된다 (내부 clamp)", () => {
    const board = emptyBoard();
    const result = addGarbageLines(board, BOARD_TOTAL_HEIGHT + 10, 0);
    expect(result.length).toBe(BOARD_TOTAL_HEIGHT);
    // 전체가 가비지 행으로 채워져야 한다 (원래 스택은 모두 밀려 사라짐)
    result.forEach((row) => {
      expect(row.some((cell) => cell === "GARBAGE")).toBe(true);
    });
  });
});

describe("RECEIVE_GARBAGE 액션: gameEngine.applyAction 통합 동작", () => {
  /** playing 상태 + 지정된 활성 피스를 가진 EngineState를 만드는 헬퍼 */
  function playingStateWithActive(overrides: Partial<EngineState> = {}): EngineState {
    const base = createInitialState({ seed: 42 });
    return {
      ...base,
      status: "playing",
      active: { type: "T", rotation: 0, position: { x: 4, y: 25 } },
      ...overrides,
    };
  }

  it("활성 피스가 있을 때, 가비지 삽입 후 활성 피스의 y좌표가 정확히 lines만큼 감소한다", () => {
    const state = playingStateWithActive();
    const originalY = state.active!.position.y;
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 3 });

    expect(result.active).not.toBeNull();
    expect(result.active!.position.y).toBe(originalY - 3);
    expect(result.active!.position.x).toBe(state.active!.position.x);
  });

  it("밀어올린 위치에서 충돌이 없으면 status는 playing으로 유지된다", () => {
    const state = playingStateWithActive();
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 2 });
    expect(result.status).toBe("playing");
  });

  it("밀어올린 위치에서 다른 블록/경계와 충돌하면 status가 gameover로 바뀐다", () => {
    // 활성 피스를 버퍼 최상단 부근에 두어, 조금만 밀어올려도 보드 밖(y<0)으로 나가게 만든다
    const state = playingStateWithActive({
      active: { type: "T", rotation: 0, position: { x: 4, y: 1 } },
    });
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 5 });
    expect(result.status).toBe("gameover");
  });

  it("lines <= 0이면 아무 변화가 없다 (board 참조 동일성 포함)", () => {
    const state = playingStateWithActive();
    const resultZero = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 0 });
    const resultNegative = applyAction(state, { type: "RECEIVE_GARBAGE", lines: -2 });

    expect(resultZero).toBe(state);
    expect(resultNegative).toBe(state);
    expect(resultZero.board).toBe(state.board);
  });

  it.each(["paused", "gameover", "ready"] as const)(
    "status가 %s이면 RECEIVE_GARBAGE 액션이 무시된다",
    (status) => {
      const state = playingStateWithActive({ status });
      const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 4 });
      expect(result).toBe(state);
    },
  );

  it("여러 번 연속으로 RECEIVE_GARBAGE를 적용하면 정확히 누적된다", () => {
    const state = playingStateWithActive({
      active: { type: "T", rotation: 0, position: { x: 4, y: 30 } },
    });
    const originalY = state.active!.position.y;

    const afterFirst = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 2 });
    expect(afterFirst.status).toBe("playing");
    expect(afterFirst.active!.position.y).toBe(originalY - 2);

    const afterSecond = applyAction(afterFirst, { type: "RECEIVE_GARBAGE", lines: 3 });
    expect(afterSecond.status).toBe("playing");
    expect(afterSecond.active!.position.y).toBe(originalY - 5);

    // 보드 맨 아래 5개 행은 가비지여야 한다 (2 + 3 누적)
    const bottomRows = afterSecond.board.slice(BOARD_TOTAL_HEIGHT - 5);
    for (const row of bottomRows) {
      expect(row.some((cell) => cell === "GARBAGE")).toBe(true);
    }
  });

  it("보드 전체 높이보다 큰 lines 값을 받아도 에러 없이 게임오버로 처리된다", () => {
    const state = playingStateWithActive();
    expect(() =>
      applyAction(state, { type: "RECEIVE_GARBAGE", lines: BOARD_TOTAL_HEIGHT + 100 }),
    ).not.toThrow();
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: BOARD_TOTAL_HEIGHT + 100 });
    expect(result.status).toBe("gameover");
    expect(result.board.length).toBe(BOARD_TOTAL_HEIGHT);
  });

  it("lines가 BOARD_TOTAL_HEIGHT를 초과해도 활성 피스 이동량은 실제로 보드가 밀린 양(clamp된 값)과 일치한다", () => {
    // addGarbageLines는 count를 BOARD_TOTAL_HEIGHT로 clamp하므로, 활성 피스 위치도
    // 원본 lines가 아니라 clamp된 값만큼만 이동해야 board와 piece 좌표계가 일관된다.
    const state = playingStateWithActive({
      active: { type: "T", rotation: 0, position: { x: 4, y: BOARD_TOTAL_HEIGHT * 3 } },
    });
    const excessiveLines = BOARD_TOTAL_HEIGHT + 100;
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: excessiveLines });

    expect(result.active!.position.y).toBe(BOARD_TOTAL_HEIGHT * 3 - BOARD_TOTAL_HEIGHT);
  });

  it("활성 피스가 없을 때는 board만 갱신되고 게임오버 판정을 시도하지 않는다", () => {
    const state = playingStateWithActive({ active: null });
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 3 });
    expect(result.active).toBeNull();
    expect(result.status).toBe("playing");
    const bottomRows = result.board.slice(BOARD_TOTAL_HEIGHT - 3);
    for (const row of bottomRows) {
      expect(row.some((cell) => cell === "GARBAGE")).toBe(true);
    }
  });

  it("가시 영역 기준으로도 가비지가 맨 아래에 쌓인다 (BOARD_VISIBLE_HEIGHT 참고)", () => {
    const state = playingStateWithActive();
    const result = applyAction(state, { type: "RECEIVE_GARBAGE", lines: 2 });
    const lastVisibleRows = result.board.slice(BOARD_TOTAL_HEIGHT - 2, BOARD_TOTAL_HEIGHT);
    expect(lastVisibleRows.length).toBe(2);
    for (const row of lastVisibleRows) {
      expect(row.some((cell) => cell === "GARBAGE")).toBe(true);
    }
    // 가비지 행은 가시 영역(BOARD_VISIBLE_HEIGHT) 안에 위치해야 한다
    expect(BOARD_TOTAL_HEIGHT - 2).toBeGreaterThanOrEqual(BOARD_TOTAL_HEIGHT - BOARD_VISIBLE_HEIGHT);
  });
});
