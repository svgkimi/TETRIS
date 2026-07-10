/**
 * MiniPiece.tsx
 * -----------------------------------------------------------------------
 * Hold/Next 큐에서 테트리미노 모양을 작게 미리 보여주는 공용 프레젠테이션 컴포넌트.
 * 게임 로직 없이 순수하게 엔진의 getShapeCells(정적 모양 데이터)만 읽어 렌더링한다.
 */

import { memo, useMemo } from "react";
import { getShapeCells, PIECE_BOX_SIZE, type TetrominoType } from "../engine";
import { TETROMINO_COLORS } from "../lib/colors";

/** MiniPiece 컴포넌트 props */
export interface MiniPieceProps {
  /** 표시할 테트리미노 종류 (없으면 빈 슬롯) */
  readonly type: TetrominoType | null;
  /** 한 셀의 픽셀 크기 */
  readonly cellSize?: number;
  /** 흐리게(비활성) 표시할지 여부 - 홀드 불가 상태 등에 사용 */
  readonly dimmed?: boolean;
}

/**
 * 테트리미노 하나를 작은 그리드로 렌더링한다.
 * 입력: type(피스 종류), cellSize(셀 픽셀 크기), dimmed(흐리게 표시 여부) / 출력: JSX
 */
function MiniPieceComponent({ type, cellSize = 18, dimmed = false }: MiniPieceProps) {
  const boxSize = type ? PIECE_BOX_SIZE[type] : 4;
  const cells = useMemo(() => {
    if (!type) return [];
    return getShapeCells(type, 0);
  }, [type]);

  const size = boxSize * cellSize;

  return (
    <div
      className="relative"
      style={{ width: size, height: size, opacity: dimmed ? 0.35 : 1 }}
      aria-hidden={type === null}
    >
      {type &&
        cells.map((cell, index) => (
          <div
            key={index}
            className="absolute rounded-[3px]"
            style={{
              left: cell.x * cellSize,
              top: cell.y * cellSize,
              width: cellSize - 2,
              height: cellSize - 2,
              backgroundColor: TETROMINO_COLORS[type],
              boxShadow: `0 0 8px ${TETROMINO_COLORS[type]}80`,
            }}
          />
        ))}
    </div>
  );
}

/** React.memo로 감싼 최종 컴포넌트 (type/cellSize/dimmed가 바뀔 때만 재렌더링) */
export const MiniPiece = memo(MiniPieceComponent);
