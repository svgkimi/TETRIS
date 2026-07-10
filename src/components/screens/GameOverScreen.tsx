/**
 * GameOverScreen.tsx
 * -----------------------------------------------------------------------
 * 게임 오버 시 화면 전체 위에 표시되는 오버레이 (PRD 4.1 4~5단계).
 * 필드가 어두워지고 "GAME OVER" 텍스트, 최종 점수, 최고 기록 갱신 여부, 재시작/메인 버튼을 보여준다.
 */

/** GameOverScreen props */
export interface GameOverScreenProps {
  readonly score: number;
  readonly highScore: number;
  readonly isNewHighScore: boolean;
  readonly onRestart: () => void;
  readonly onMainMenu: () => void;
}

/**
 * 게임 오버 화면을 렌더링한다.
 * 입력: score, highScore, isNewHighScore, onRestart, onMainMenu / 출력: JSX
 */
export function GameOverScreen({ score, highScore, isNewHighScore, onRestart, onMainMenu }: GameOverScreenProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-10 py-8">
        <h2 className="text-4xl font-black tracking-widest text-rose-400 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]">
          GAME OVER
        </h2>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs tracking-widest text-white/40">FINAL SCORE</span>
          <span className="font-mono text-3xl font-bold text-white">{score.toLocaleString("en-US")}</span>
        </div>
        {isNewHighScore ? (
          <span className="animate-pop rounded-full bg-amber-400/20 px-3 py-1 text-sm font-bold text-amber-300">
            NEW HIGH SCORE!
          </span>
        ) : (
          <span className="text-xs text-white/40">
            최고 점수 {highScore.toLocaleString("en-US")}
          </span>
        )}
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full bg-cyan-400 px-8 py-2 font-bold text-black transition hover:scale-105 active:scale-95"
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
