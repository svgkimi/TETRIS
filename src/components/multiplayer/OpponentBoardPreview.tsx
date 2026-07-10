/**
 * OpponentBoardPreview.tsx
 * -----------------------------------------------------------------------
 * 대전 상대방의 보드를 작게 미리 보여주는 프레젠테이션 컴포넌트.
 * 상대방 보드는 네트워크로 전달받은 정적 스냅샷(BoardSyncSummary)일 뿐이므로
 * GameBoard.tsx처럼 자체 애니메이션 루프를 돌릴 필요가 없어, 가벼운 CSS Grid로 그린다.
 * (관심사 분리: 이 컴포넌트는 렌더링만 담당하고 네트워킹/엔진 로직을 전혀 알지 못한다)
 */

import { memo } from "react";
import { BOARD_BUFFER_HEIGHT, BOARD_WIDTH, type Board } from "../../engine";
import { getCellColors } from "../../lib/colors";

/** OpponentBoardPreview props */
export interface OpponentBoardPreviewProps {
  /** 상대방 보드 전체 (버퍼 영역 포함). null이면 아직 스냅샷을 받지 못한 상태 */
  readonly board: Board | null;
  /** 상대방 닉네임/라벨 (예: "상대방") */
  readonly label: string;
}

/** 미리보기 한 셀의 픽셀 크기 */
const PREVIEW_CELL_SIZE = 8;

function OpponentBoardPreviewComponent({ board, label }: OpponentBoardPreviewProps) {
  const visibleRows = board ? board.slice(BOARD_BUFFER_HEIGHT) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-semibold tracking-widest text-white/40">{label}</span>
      <div
        className="grid gap-px rounded-lg border border-white/10 bg-black/40 p-1"
        style={{
          gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${PREVIEW_CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${visibleRows?.length ?? 20}, ${PREVIEW_CELL_SIZE}px)`,
        }}
      >
        {visibleRows ? (
          visibleRows.map((row, y) =>
            row.map((cell, x) => {
              const colors = cell ? getCellColors(cell) : null;
              return (
                <div
                  key={`${y}-${x}`}
                  style={{
                    width: PREVIEW_CELL_SIZE,
                    height: PREVIEW_CELL_SIZE,
                    backgroundColor: colors ? colors.color : "rgba(255,255,255,0.03)",
                  }}
                />
              );
            }),
          )
        ) : (
          <div
            className="col-span-full row-span-full flex items-center justify-center text-[10px] text-white/30"
            style={{ gridColumn: `span ${BOARD_WIDTH}` }}
          >
            대기 중...
          </div>
        )}
      </div>
    </div>
  );
}

/** board 참조/label이 실제로 바뀔 때만 재렌더링 */
export const OpponentBoardPreview = memo(OpponentBoardPreviewComponent);
