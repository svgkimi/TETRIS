/**
 * NextQueue.tsx
 * -----------------------------------------------------------------------
 * 넥스트 큐(다음에 등장할 테트리미노) 미리보기 UI. 엔진의 previewNext(bag.ts)로
 * 파생된 배열을 그대로 렌더링만 하는 순수 프레젠테이션 컴포넌트.
 */

import { memo } from "react";
import type { TetrominoType } from "../engine";
import { MiniPiece } from "./MiniPiece";

/** NextQueue props */
export interface NextQueueProps {
  /** previewNext(state.pieceQueue, N)로 파생된 다음 피스 배열 */
  readonly upcoming: readonly TetrominoType[];
}

/**
 * 다음 피스 미리보기 목록을 렌더링한다.
 * 입력: upcoming(다음 피스 타입 배열) / 출력: JSX
 */
function NextQueueComponent({ upcoming }: NextQueueProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <span className="text-xs font-semibold tracking-widest text-white/50">NEXT</span>
      <div className="flex flex-col items-center gap-2">
        {upcoming.map((type, index) => (
          <div
            key={index}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-lg bg-black/30"
            style={{ opacity: 1 - index * 0.12 }}
          >
            <MiniPiece type={type} cellSize={index === 0 ? 14 : 12} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** upcoming 배열 참조가 바뀔 때만 재렌더링되는 메모이즈 컴포넌트 */
export const NextQueue = memo(NextQueueComponent);
