/**
 * CountdownOverlay.tsx
 * -----------------------------------------------------------------------
 * "시작하기" 클릭 후 첫 테트리미노 등장 전에 표시되는 3-2-1 카운트다운 오버레이 (PRD 4.1 2단계).
 */

/** CountdownOverlay props */
export interface CountdownOverlayProps {
  /** 3, 2, 1 또는 "GO" 표시용 0 */
  readonly value: number;
}

/**
 * 카운트다운 숫자를 화면 중앙에 크게 표시한다. 숫자가 바뀔 때마다 key remount로
 * pop 애니메이션이 재생된다.
 * 입력: value / 출력: JSX
 */
export function CountdownOverlay({ value }: CountdownOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <span
        key={value}
        className="animate-countdown-pulse font-mono text-9xl font-black text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.6)]"
      >
        {value > 0 ? value : "GO!"}
      </span>
    </div>
  );
}
