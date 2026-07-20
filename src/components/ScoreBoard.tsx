/**
 * ScoreBoard.tsx
 * -----------------------------------------------------------------------
 * 점수/레벨/총 라인 수/콤보를 실시간으로 표시하는 순수 프레젠테이션 컴포넌트.
 * 값이 바뀔 때마다 key remount 트릭으로 짧은 pop 애니메이션을 재생해 "쾌감(Juice)"을 더한다.
 */

import { memo } from "react";
import { calculateSpeedMultiplier } from "../engine";

/** ScoreBoard props */
export interface ScoreBoardProps {
  readonly score: number;
  readonly level: number;
  readonly totalLinesCleared: number;
  readonly combo: number;
  readonly backToBack: boolean;
}

/** 배속을 "x1.25" 형태의 표시 문자열로 포맷팅한다. 입력: level / 출력: 배속 문자열 */
function formatSpeed(level: number): string {
  const multiplier = calculateSpeedMultiplier(level);
  return `x${(Math.round(multiplier * 100) / 100).toString()}`;
}

/** 숫자를 천 단위 콤마로 포맷팅한다. 입력: value / 출력: 콤마 포맷 문자열 */
function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** 한 줄짜리 라벨+값 통계 행 */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs font-semibold tracking-widest text-white/40">{label}</span>
      <span key={value} className="animate-pop font-mono text-lg font-bold text-white">
        {value}
      </span>
    </div>
  );
}

/**
 * 점수판을 렌더링한다.
 * 입력: score, level, totalLinesCleared, combo, backToBack / 출력: JSX
 */
function ScoreBoardComponent({ score, level, totalLinesCleared, combo, backToBack }: ScoreBoardProps) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <StatRow label="SCORE" value={formatNumber(score)} />
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs font-semibold tracking-widest text-white/40">LEVEL</span>
        <span key={level} className="animate-pop font-mono text-lg font-bold text-white">
          {level}
          <span className="ml-1.5 text-xs font-semibold text-cyan-300">{formatSpeed(level)}</span>
        </span>
      </div>
      <StatRow label="LINES" value={String(totalLinesCleared)} />
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold tracking-widest text-white/40">COMBO</span>
        <span
          key={combo}
          className={
            combo > 0
              ? "animate-pop font-mono text-lg font-bold text-amber-300"
              : "font-mono text-lg font-bold text-white/30"
          }
        >
          {combo > 0 ? `x${combo}` : "-"}
        </span>
      </div>
      {backToBack && (
        <div className="animate-pop self-end rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-fuchsia-300">
          BACK-TO-BACK
        </div>
      )}
    </div>
  );
}

/** props가 실제로 바뀔 때만 재렌더링되는 메모이즈 컴포넌트 */
export const ScoreBoard = memo(ScoreBoardComponent);
