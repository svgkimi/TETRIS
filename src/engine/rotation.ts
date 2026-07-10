/**
 * rotation.ts
 * -----------------------------------------------------------------------
 * SRS(Super Rotation System) 기반 회전 로직과 T-Spin 3-corner 판정을 담당한다.
 * 회전은 "기본 회전 시도 -> 실패 시 킥 테이블 순차 적용" 순서로 처리되며,
 * 충돌하지 않는 첫 번째 결과가 채택된다.
 */

import { checkCollision, isOccupiedOrOutside } from "./board";
import { getKickTests, I_KICK_TABLE, JLSTZ_KICK_TABLE, O_KICK_TABLE } from "./srsKickTables";
import { PIECE_BOX_SIZE } from "./tetrominoes";
import type {
  ActivePiece,
  Board,
  Position,
  RotationDirection,
  RotationState,
  TSpinType,
} from "./types";

/** 회전 시도 결과 */
export interface RotationResult {
  /** 회전 성공 여부 (모든 킥이 실패하면 false, piece는 입력과 동일하게 반환) */
  readonly success: boolean;
  readonly piece: ActivePiece;
  /**
   * 성공에 사용된 킥 테스트의 인덱스(0=킥 없는 기본 회전, 1~4=순차 킥).
   * T-Spin Triple 특례 판정(마지막 킥=index 4 사용 시 무조건 일반 T-Spin) 등에 사용된다.
   */
  readonly kickIndex: number;
}

/** 다음 회전 상태를 계산한다. (0,1,2,3 = 0,R,2,L 순환) */
function getNextRotationState(
  current: RotationState,
  direction: RotationDirection,
): RotationState {
  const delta = direction === "CW" ? 1 : direction === "CCW" ? -1 : 2;
  return (((current + delta) % 4) + 4) % 4 as RotationState;
}

/**
 * 피스 종류에 맞는 킥 테스트 좌표 목록을 회전 방향에 따라 조회한다.
 * 입력: type, from, to / 출력: 시도할 (dx,dy) 오프셋 목록
 */
function resolveKickTests(
  type: ActivePiece["type"],
  from: RotationState,
  to: RotationState,
): readonly Position[] {
  if (type === "O") return O_KICK_TABLE;
  if (type === "I") return getKickTests(I_KICK_TABLE, from, to);
  return getKickTests(JLSTZ_KICK_TABLE, from, to);
}

/**
 * SRS 규칙에 따라 피스를 회전시킨다. 기본 회전 후 충돌하면 킥 테이블을 순서대로 적용하고,
 * 처음으로 충돌하지 않는 배치를 채택한다. 모든 시도가 실패하면 원래 피스를 그대로 반환한다.
 * 입력: board, piece, direction(CW/CCW/180) / 출력: RotationResult
 */
export function tryRotate(
  board: Board,
  piece: ActivePiece,
  direction: RotationDirection,
): RotationResult {
  const toRotation = getNextRotationState(piece.rotation, direction);
  const kickTests =
    direction === "180"
      ? // 180도 회전은 공식 SRS 표준 킥 테이블이 없으므로, 제자리 시도 후 간단한 보조 킥만 시도한다.
        [{ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }]
      : resolveKickTests(piece.type, piece.rotation, toRotation);

  for (let i = 0; i < kickTests.length; i++) {
    const kick = kickTests[i];
    const candidate: ActivePiece = {
      type: piece.type,
      rotation: toRotation,
      position: { x: piece.position.x + kick.x, y: piece.position.y + kick.y },
    };
    if (!checkCollision(board, candidate)) {
      return { success: true, piece: candidate, kickIndex: i };
    }
  }

  return { success: false, piece, kickIndex: -1 };
}

/** T 피스 3x3 바운딩 박스의 네 모서리 로컬 좌표 */
const T_CORNERS = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 2, y: 0 },
  bottomLeft: { x: 0, y: 2 },
  bottomRight: { x: 2, y: 2 },
} as const;

/**
 * 회전 상태에 따라 "전방(front, T의 뾰족한 방향)" / "후방(back)" 코너 쌍을 결정한다.
 * 입력: rotation / 출력: front 2개, back 2개의 절대 위치 계산용 로컬 좌표
 */
function getFrontBackCorners(rotation: RotationState): {
  front: readonly Position[];
  back: readonly Position[];
} {
  switch (rotation) {
    case 0: // 위쪽을 향함 -> 전방은 위쪽 두 코너
      return {
        front: [T_CORNERS.topLeft, T_CORNERS.topRight],
        back: [T_CORNERS.bottomLeft, T_CORNERS.bottomRight],
      };
    case 1: // 오른쪽을 향함 -> 전방은 오른쪽 두 코너
      return {
        front: [T_CORNERS.topRight, T_CORNERS.bottomRight],
        back: [T_CORNERS.topLeft, T_CORNERS.bottomLeft],
      };
    case 2: // 아래쪽을 향함 -> 전방은 아래쪽 두 코너
      return {
        front: [T_CORNERS.bottomLeft, T_CORNERS.bottomRight],
        back: [T_CORNERS.topLeft, T_CORNERS.topRight],
      };
    case 3: // 왼쪽을 향함 -> 전방은 왼쪽 두 코너
    default:
      return {
        front: [T_CORNERS.topLeft, T_CORNERS.bottomLeft],
        back: [T_CORNERS.topRight, T_CORNERS.bottomRight],
      };
  }
}

/**
 * T-Spin 3-corner rule 판정.
 * 규칙: 마지막 조작이 회전이어야 하며, T 피스 3x3 박스의 네 코너 중 3개 이상이
 * 점유(고정 블록 또는 보드 밖)되어 있어야 T-Spin으로 인정된다.
 * - 전방 코너 2개 모두 점유 + 후방 코너 1개 이상 점유 => 일반(normal) T-Spin
 * - 후방 코너 2개 모두 점유 + 전방 코너 1개만 점유 => Mini T-Spin
 *   단, 이때 사용된 킥이 5번째 테스트(index 4)였다면 예외적으로 일반 T-Spin으로 승격한다
 *   (T-Spin Triple 셋업을 위한 공식 가이드라인 특례).
 * 입력: board, piece(회전 직후의 T 피스), lastActionWasRotation, lastKickIndex
 * 출력: TSpinType ("none" | "mini" | "normal")
 */
export function detectTSpin(
  board: Board,
  piece: ActivePiece,
  lastActionWasRotation: boolean,
  lastKickIndex: number,
): TSpinType {
  if (piece.type !== "T" || !lastActionWasRotation) return "none";

  const occupied = (corner: Position): boolean =>
    isOccupiedOrOutside(board, piece.position.x + corner.x, piece.position.y + corner.y);

  const { front, back } = getFrontBackCorners(piece.rotation);
  const frontOccupiedCount = front.filter(occupied).length;
  const backOccupiedCount = back.filter(occupied).length;
  const totalOccupied = frontOccupiedCount + backOccupiedCount;

  if (totalOccupied < 3) return "none";

  if (frontOccupiedCount === 2) return "normal";

  // frontOccupiedCount === 1 이고 backOccupiedCount === 2 인 경우 -> 기본은 Mini
  // 단, 마지막 킥이 5번째 테스트(index 4)를 사용했다면 일반 T-Spin으로 승격 (TST 특례)
  if (lastKickIndex === 4) return "normal";
  return "mini";
}

/** 사용하지 않는 로컬 박스 크기 상수 재노출 (일부 UI 렌더링에서 T 박스 크기 참조용) */
export const T_BOX_SIZE = PIECE_BOX_SIZE.T;
