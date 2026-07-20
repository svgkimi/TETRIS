/**
 * TitleScreen.tsx
 * -----------------------------------------------------------------------
 * 접속 시 최초로 보여지는 타이틀 화면 (PRD 4.1의 1단계).
 * 핵심 요소(로고/시작하기/대전 모드/최고 점수)만 크게 노출하고,
 * 조작법은 "조작법 보기" 토글로, 사운드/배경음악 설정은 우하단 스피커 팝오버로 접어
 * 정보 위계를 정리한 프레젠테이션 컴포넌트 (게임 로직 없음).
 */

import { useState } from "react";

/** TitleScreen props */
export interface TitleScreenProps {
  readonly highScore: number;
  readonly soundEnabled: boolean;
  readonly onStart: () => void;
  readonly onToggleSound: () => void;
  /** 선택 가능한 배경음악 트랙 목록 */
  readonly musicTracks: readonly { readonly id: string; readonly name: string }[];
  /** 현재 선택된 트랙 인덱스 */
  readonly musicTrackIndex: number;
  /** 배경음악 트랙을 선택했을 때 호출된다 */
  readonly onSelectMusicTrack: (index: number) => void;
  /** "대전 모드" 버튼 클릭 시 호출된다. 전달되지 않으면 버튼 자체를 숨긴다 */
  readonly onOpenMultiplayer?: () => void;
}

/** 조작법 안내 한 줄 항목 */
function ControlRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span className="rounded bg-white/10 px-2 py-1 font-mono text-xs text-white/70">{keys}</span>
      <span className="text-white/50">{action}</span>
    </div>
  );
}

/**
 * 타이틀 화면을 렌더링한다.
 * 입력: TitleScreenProps / 출력: JSX
 */
export function TitleScreen({
  highScore,
  soundEnabled,
  onStart,
  onToggleSound,
  musicTracks,
  musicTrackIndex,
  onSelectMusicTrack,
  onOpenMultiplayer,
}: TitleScreenProps) {
  // 순수 UI 레이어의 로컬 상태: 조작법 펼침 여부 / 설정 팝오버 열림 여부
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-10 text-white">
      {/* ---- 1차 정보: 로고 ---- */}
      <div className="flex flex-col items-center gap-3">
        <h1 className="bg-gradient-to-b from-cyan-300 via-fuchsia-300 to-amber-300 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(168,85,247,0.35)] sm:text-6xl">
          MODERN TETRIS
        </h1>
        <p className="text-sm tracking-[0.3em] text-white/40">SRS · HOLD · GHOST PIECE</p>
      </div>

      {/* ---- 1차 정보: 시작 / 대전 / 최고 점수 ---- */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-12 py-3.5 text-lg font-bold text-black shadow-[0_0_30px_rgba(56,189,248,0.5)] transition hover:scale-105 hover:shadow-[0_0_45px_rgba(232,121,249,0.6)] active:scale-95"
        >
          시작하기
        </button>

        {onOpenMultiplayer && (
          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="rounded-full border border-white/20 bg-white/5 px-8 py-2 text-sm font-bold text-white/80 transition hover:scale-105 hover:border-white/40 hover:text-white active:scale-95"
          >
            대전 모드 (1:1)
          </button>
        )}

        <div className="text-sm text-white/50">
          최고 점수{" "}
          <span className="font-mono font-bold text-amber-300">{highScore.toLocaleString("en-US")}</span>
        </div>
      </div>

      {/* ---- 2차 정보: 조작법 (기본 접힘) ---- */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => setShowControls((prev) => !prev)}
          aria-expanded={showControls}
          className="text-xs tracking-widest text-white/35 transition hover:text-white/70"
        >
          {showControls ? "조작법 접기 ▲" : "조작법 보기 ▼"}
        </button>
        {showControls && (
          <div className="grid w-72 grid-cols-1 gap-1.5 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <ControlRow keys="← →" action="이동" />
            <ControlRow keys="↓" action="소프트 드롭" />
            <ControlRow keys="Space" action="하드 드롭" />
            <ControlRow keys="↑ / X" action="시계 방향 회전" />
            <ControlRow keys="Z" action="반시계 방향 회전" />
            <ControlRow keys="A" action="180도 회전" />
            <ControlRow keys="C / Shift" action="홀드" />
            <ControlRow keys="Esc / P" action="일시정지" />
          </div>
        )}
      </div>

      {/* ---- 3차 정보: 우하단 사운드/음악 설정 팝오버 ---- */}
      <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
        {showSettings && (
          <div className="flex w-56 flex-col gap-3 rounded-xl border border-white/10 bg-black/60 p-4 backdrop-blur-md">
            <button
              type="button"
              onClick={onToggleSound}
              className="flex items-center justify-between text-xs text-white/60 transition hover:text-white"
            >
              <span>사운드</span>
              <span className={soundEnabled ? "font-semibold text-cyan-300" : "text-white/40"}>
                {soundEnabled ? "켜짐" : "꺼짐"}
              </span>
            </button>
            <div className="flex flex-col gap-1.5 border-t border-white/10 pt-3">
              <span className="text-[10px] tracking-wide text-white/40">배경음악</span>
              <div className="flex flex-wrap gap-1.5">
                {musicTracks.map((track, i) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelectMusicTrack(i)}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      i === musicTrackIndex
                        ? "bg-cyan-400/90 font-semibold text-black"
                        : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                    }`}
                  >
                    {track.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowSettings((prev) => !prev)}
          title="사운드 설정"
          aria-label="사운드 설정"
          aria-expanded={showSettings}
          className={`flex h-10 w-10 items-center justify-center rounded-full border text-base transition ${
            showSettings
              ? "border-white/30 bg-white/10 text-white"
              : "border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80"
          }`}
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>
      </div>
    </div>
  );
}
