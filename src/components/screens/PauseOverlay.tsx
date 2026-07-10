/**
 * PauseOverlay.tsx
 * -----------------------------------------------------------------------
 * 일시정지 상태에서 화면 전체 위에 표시되는 오버레이. 재개/다시하기/메인으로 버튼을 제공한다.
 * 실제 필드 블러 처리는 GameBoard 내부에서 담당하고, 이 컴포넌트는 그 위의 UI(텍스트/버튼)만 그린다.
 */

/** PauseOverlay props */
export interface PauseOverlayProps {
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onMainMenu: () => void;
}

/**
 * 일시정지 오버레이를 렌더링한다.
 * 입력: onResume, onRestart, onMainMenu / 출력: JSX
 */
export function PauseOverlay({ onResume, onRestart, onMainMenu }: PauseOverlayProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-white/10 bg-black/60 px-10 py-8 backdrop-blur-md">
        <h2 className="text-3xl font-black tracking-widest text-white">PAUSED</h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="rounded-full bg-cyan-400 px-8 py-2 font-bold text-black transition hover:scale-105 active:scale-95"
          >
            계속하기
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full bg-white/10 px-8 py-2 font-semibold text-white transition hover:bg-white/20"
          >
            다시하기
          </button>
          <button
            type="button"
            onClick={onMainMenu}
            className="rounded-full bg-white/10 px-8 py-2 font-semibold text-white transition hover:bg-white/20"
          >
            메인으로
          </button>
        </div>
      </div>
    </div>
  );
}
