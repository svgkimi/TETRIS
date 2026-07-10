/**
 * HoldPanel.tsx
 * -----------------------------------------------------------------------
 * 홀드 슬롯 UI. 비어있으면 빈 슬롯을, 홀드 불가 상태(이번 피스에서 이미 사용)면
 * 흐리게 표시한다. 순수 프레젠테이션 컴포넌트이며 엔진 상태는 props로만 전달받는다.
 */

import { memo } from "react";
import type { HoldState } from "../engine";
import { MiniPiece } from "./MiniPiece";

/** HoldPanel props */
export interface HoldPanelProps {
  readonly hold: HoldState;
}

/**
 * 홀드 슬롯을 렌더링한다.
 * 입력: hold(현재 홀드 상태) / 출력: JSX
 */
function HoldPanelComponent({ hold }: HoldPanelProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <span className="text-xs font-semibold tracking-widest text-white/50">HOLD</span>
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-black/30">
        {hold.type ? (
          <MiniPiece type={hold.type} cellSize={18} dimmed={!hold.canHold} />
        ) : (
          <span className="text-[10px] text-white/25">EMPTY</span>
        )}
      </div>
    </div>
  );
}

/** props(hold 참조)가 실제로 바뀔 때만 재렌더링되는 메모이즈 컴포넌트 */
export const HoldPanel = memo(HoldPanelComponent);
