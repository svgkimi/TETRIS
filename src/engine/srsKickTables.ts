/**
 * srsKickTables.ts
 * -----------------------------------------------------------------------
 * 공식 SRS(Super Rotation System) 가이드라인의 벽킥(Wall Kick) 테이블을 정의한다.
 * 표준 테이블은 y축이 위로 갈수록 증가하는 좌표계를 사용하지만, 본 엔진의 보드는
 * y가 아래로 갈수록 증가하므로, 모든 dy 값은 표준 문서 대비 부호를 반전하여 저장했다.
 * O 피스는 회전 시 위치 변화가 없으므로 별도 테이블이 필요 없다(항상 (0,0) 1종).
 */

import type { Position, RotationState } from "./types";

/** 회전 전이(from -> to)를 문자열 키로 표현 (예: "0-1" = 0에서 R로) */
type TransitionKey = `${RotationState}-${RotationState}`;

const t = (x: number, y: number): Position => ({ x, y });

/** J/L/S/T/Z 공용 5-포인트 킥 테이블 (보드 y-down 좌표계로 변환됨) */
export const JLSTZ_KICK_TABLE: Readonly<Partial<Record<TransitionKey, readonly Position[]>>> = {
  "0-1": [t(0, 0), t(-1, 0), t(-1, -1), t(0, 2), t(-1, 2)],
  "1-0": [t(0, 0), t(1, 0), t(1, 1), t(0, -2), t(1, -2)],
  "1-2": [t(0, 0), t(1, 0), t(1, 1), t(0, -2), t(1, -2)],
  "2-1": [t(0, 0), t(-1, 0), t(-1, -1), t(0, 2), t(-1, 2)],
  "2-3": [t(0, 0), t(1, 0), t(1, -1), t(0, 2), t(1, 2)],
  "3-2": [t(0, 0), t(-1, 0), t(-1, 1), t(0, -2), t(-1, -2)],
  "3-0": [t(0, 0), t(-1, 0), t(-1, 1), t(0, -2), t(-1, -2)],
  "0-3": [t(0, 0), t(1, 0), t(1, -1), t(0, 2), t(1, 2)],
};

/** I 피스 전용 5-포인트 킥 테이블 (보드 y-down 좌표계로 변환됨) */
export const I_KICK_TABLE: Readonly<Partial<Record<TransitionKey, readonly Position[]>>> = {
  "0-1": [t(0, 0), t(-2, 0), t(1, 0), t(-2, 1), t(1, -2)],
  "1-0": [t(0, 0), t(2, 0), t(-1, 0), t(2, -1), t(-1, 2)],
  "1-2": [t(0, 0), t(-1, 0), t(2, 0), t(-1, -2), t(2, 1)],
  "2-1": [t(0, 0), t(1, 0), t(-2, 0), t(1, 2), t(-2, -1)],
  "2-3": [t(0, 0), t(2, 0), t(-1, 0), t(2, -1), t(-1, 2)],
  "3-2": [t(0, 0), t(-2, 0), t(1, 0), t(-2, 1), t(1, -2)],
  "3-0": [t(0, 0), t(1, 0), t(-2, 0), t(1, 2), t(-2, -1)],
  "0-3": [t(0, 0), t(-1, 0), t(2, 0), t(-1, -2), t(2, 1)],
};

/** O 피스는 회전해도 위치가 고정되므로 항상 (0,0) 한 종류만 시도한다 */
export const O_KICK_TABLE: readonly Position[] = [t(0, 0)];

/**
 * 회전 전이에 해당하는 킥 테스트 좌표 목록을 조회한다.
 * 입력: table(피스 종류별 킥 테이블), from/to(회전 상태) / 출력: 시도할 (dx,dy) 목록
 */
export function getKickTests(
  table: Readonly<Partial<Record<TransitionKey, readonly Position[]>>>,
  from: RotationState,
  to: RotationState,
): readonly Position[] {
  const key = `${from}-${to}` as TransitionKey;
  return table[key] ?? [t(0, 0)];
}
