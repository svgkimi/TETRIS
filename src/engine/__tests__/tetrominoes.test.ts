/**
 * tetrominoes.test.ts
 * -----------------------------------------------------------------------
 * 7종 테트리미노의 4방향 회전 상태 좌표, 스폰 위치, 바운딩 박스 크기가
 * 공식 SRS 가이드라인 스펙과 일치하는지 검증한다.
 */

import { describe, expect, it } from "vitest";
import { getShapeCells, getSpawnX, getSpawnY, PIECE_BOX_SIZE } from "../tetrominoes";
import { BOARD_BUFFER_HEIGHT } from "../types";
import type { Position, TetrominoType } from "../types";

/** Position 배열을 순서 무관하게 비교하기 위한 정규화(정렬) 헬퍼 */
function sortPositions(cells: readonly Position[]): Position[] {
  return [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
}

function expectShape(
  type: TetrominoType,
  rotation: 0 | 1 | 2 | 3,
  expected: readonly Position[],
) {
  const cells = getShapeCells(type, rotation);
  expect(sortPositions(cells)).toEqual(sortPositions(expected));
  expect(cells).toHaveLength(4);
}

describe("tetrominoes: 회전 상태별 좌표 (SRS 스펙)", () => {
  it("I 피스: 0/R/2/L 좌표", () => {
    expectShape("I", 0, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    expectShape("I", 1, [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }]);
    expectShape("I", 2, [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]);
    expectShape("I", 3, [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]);
  });

  it("O 피스: 모든 회전 상태에서 동일한 좌표 (위치 변화 없음)", () => {
    const expected: Position[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    expectShape("O", 0, expected);
    expectShape("O", 1, expected);
    expectShape("O", 2, expected);
    expectShape("O", 3, expected);
  });

  it("T 피스: 0(위)/R(오른쪽)/2(아래)/L(왼쪽) 방향 좌표", () => {
    expectShape("T", 0, [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    expectShape("T", 1, [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }]);
    expectShape("T", 2, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }]);
    expectShape("T", 3, [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]);
  });

  it("S 피스 좌표", () => {
    expectShape("S", 0, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
    expectShape("S", 1, [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);
    expectShape("S", 2, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]);
    expectShape("S", 3, [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]);
  });

  it("Z 피스 좌표", () => {
    expectShape("Z", 0, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    expectShape("Z", 1, [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }]);
    expectShape("Z", 2, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }]);
    expectShape("Z", 3, [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }]);
  });

  it("J 피스 좌표", () => {
    expectShape("J", 0, [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    expectShape("J", 1, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]);
    expectShape("J", 2, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);
    expectShape("J", 3, [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]);
  });

  it("L 피스 좌표", () => {
    expectShape("L", 0, [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    expectShape("L", 1, [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }]);
    expectShape("L", 2, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }]);
    expectShape("L", 3, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]);
  });

  it("모든 피스는 4개의 셀을 갖는다 (7종 x 4방향)", () => {
    const types: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];
    for (const type of types) {
      for (const rotation of [0, 1, 2, 3] as const) {
        expect(getShapeCells(type, rotation)).toHaveLength(4);
      }
    }
  });
});

describe("tetrominoes: 바운딩 박스 크기", () => {
  it("I/O는 각각 4/2, 나머지는 3", () => {
    expect(PIECE_BOX_SIZE.I).toBe(4);
    expect(PIECE_BOX_SIZE.O).toBe(2);
    expect(PIECE_BOX_SIZE.T).toBe(3);
    expect(PIECE_BOX_SIZE.S).toBe(3);
    expect(PIECE_BOX_SIZE.Z).toBe(3);
    expect(PIECE_BOX_SIZE.J).toBe(3);
    expect(PIECE_BOX_SIZE.L).toBe(3);
  });
});

describe("tetrominoes: 스폰 위치", () => {
  it("I/O는 각각 x=3/4, 나머지는 x=3", () => {
    expect(getSpawnX("I")).toBe(3);
    expect(getSpawnX("O")).toBe(4);
    for (const type of ["T", "S", "Z", "J", "L"] as TetrominoType[]) {
      expect(getSpawnX(type)).toBe(3);
    }
  });

  it("스폰 Y는 버퍼 영역 하단부(가시 영역 바로 위)이다", () => {
    expect(getSpawnY()).toBe(BOARD_BUFFER_HEIGHT - 3);
  });
});
