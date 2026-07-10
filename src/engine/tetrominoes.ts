/**
 * tetrominoes.ts
 * -----------------------------------------------------------------------
 * 7종 테트리미노의 회전 상태별 모양(셀 좌표) 데이터를 정의한다.
 * 좌표계는 보드와 동일하게 y가 아래로 갈수록 증가하며, 각 피스는 로컬 바운딩 박스
 * (I/O는 4x4 또는 2x2, 나머지는 3x3) 내부에서의 상대 좌표로 표현된다.
 * 공식 SRS(Super Rotation System) 가이드라인 데이터를 기준으로 한다.
 */

import { BOARD_BUFFER_HEIGHT } from "./types";
import type { Position, RotationState, TetrominoType } from "./types";

/** 피스별 바운딩 박스 크기 (정사각형 한 변의 길이) */
export const PIECE_BOX_SIZE: Record<TetrominoType, number> = {
  I: 4,
  O: 2,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
};

const p = (x: number, y: number): Position => ({ x, y });

/**
 * 회전 상태(0/R/2/L)별 셀 좌표 테이블.
 * 인덱스: 0=spawn, 1=R, 2=2, 3=L
 */
type ShapeTable = Readonly<Record<RotationState, readonly Position[]>>;

const I_SHAPE: ShapeTable = {
  0: [p(0, 1), p(1, 1), p(2, 1), p(3, 1)],
  1: [p(2, 0), p(2, 1), p(2, 2), p(2, 3)],
  2: [p(0, 2), p(1, 2), p(2, 2), p(3, 2)],
  3: [p(1, 0), p(1, 1), p(1, 2), p(1, 3)],
};

const O_SHAPE: ShapeTable = {
  0: [p(0, 0), p(1, 0), p(0, 1), p(1, 1)],
  1: [p(0, 0), p(1, 0), p(0, 1), p(1, 1)],
  2: [p(0, 0), p(1, 0), p(0, 1), p(1, 1)],
  3: [p(0, 0), p(1, 0), p(0, 1), p(1, 1)],
};

const T_SHAPE: ShapeTable = {
  0: [p(1, 0), p(0, 1), p(1, 1), p(2, 1)],
  1: [p(1, 0), p(1, 1), p(2, 1), p(1, 2)],
  2: [p(0, 1), p(1, 1), p(2, 1), p(1, 2)],
  3: [p(1, 0), p(0, 1), p(1, 1), p(1, 2)],
};

const S_SHAPE: ShapeTable = {
  0: [p(1, 0), p(2, 0), p(0, 1), p(1, 1)],
  1: [p(1, 0), p(1, 1), p(2, 1), p(2, 2)],
  2: [p(1, 1), p(2, 1), p(0, 2), p(1, 2)],
  3: [p(0, 0), p(0, 1), p(1, 1), p(1, 2)],
};

const Z_SHAPE: ShapeTable = {
  0: [p(0, 0), p(1, 0), p(1, 1), p(2, 1)],
  1: [p(2, 0), p(1, 1), p(2, 1), p(1, 2)],
  2: [p(0, 1), p(1, 1), p(1, 2), p(2, 2)],
  3: [p(1, 0), p(0, 1), p(1, 1), p(0, 2)],
};

const J_SHAPE: ShapeTable = {
  0: [p(0, 0), p(0, 1), p(1, 1), p(2, 1)],
  1: [p(1, 0), p(2, 0), p(1, 1), p(1, 2)],
  2: [p(0, 1), p(1, 1), p(2, 1), p(2, 2)],
  3: [p(1, 0), p(1, 1), p(0, 2), p(1, 2)],
};

const L_SHAPE: ShapeTable = {
  0: [p(2, 0), p(0, 1), p(1, 1), p(2, 1)],
  1: [p(1, 0), p(1, 1), p(1, 2), p(2, 2)],
  2: [p(0, 1), p(1, 1), p(2, 1), p(0, 2)],
  3: [p(0, 0), p(1, 0), p(1, 1), p(1, 2)],
};

const SHAPES: Record<TetrominoType, ShapeTable> = {
  I: I_SHAPE,
  O: O_SHAPE,
  T: T_SHAPE,
  S: S_SHAPE,
  Z: Z_SHAPE,
  J: J_SHAPE,
  L: L_SHAPE,
};

/**
 * 특정 테트리미노의 특정 회전 상태에서의 로컬 셀 좌표 4개를 반환한다.
 * 입력: type(피스 종류), rotation(회전 상태) / 출력: 로컬 좌표 배열(길이 4)
 */
export function getShapeCells(
  type: TetrominoType,
  rotation: RotationState,
): readonly Position[] {
  return SHAPES[type][rotation];
}

/**
 * 스폰 시 사용할 바운딩 박스 좌상단 x좌표(열)를 반환한다.
 * 보드 폭(10) 기준으로 피스가 가로 중앙에 위치하도록 계산된 고정값이다.
 * 입력: type / 출력: 보드 좌표계 x
 */
export function getSpawnX(type: TetrominoType): number {
  // I, O는 박스가 짝수 폭이라 표준 스폰 위치가 살짝 다르다.
  if (type === "I") return 3;
  if (type === "O") return 4;
  return 3;
}

/**
 * 스폰 시 사용할 바운딩 박스 좌상단 y좌표(행)를 반환한다.
 * 버퍼 영역(가시 영역 위) 상단부에 스폰되도록 고정값을 사용한다.
 * 입력: 없음 / 출력: 보드 좌표계 y
 */
export function getSpawnY(): number {
  // 버퍼 영역 하단부 근처(가시 영역 바로 위)에 스폰시킨다.
  return BOARD_BUFFER_HEIGHT - 3;
}
