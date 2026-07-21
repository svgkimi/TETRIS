/**
 * SoundControl.tsx
 * -----------------------------------------------------------------------
 * 사운드 토글/배경음악 트랙/음악 볼륨을 하나로 묶은 컴팩트 설정 컨트롤.
 * 기본 상태에서는 아이콘 한 줄만 보여주고, 톱니 아이콘 클릭 시 트랙/볼륨 패널이 펼쳐진다.
 * SinglePlayerApp / BattleScreen 사이드바에서 공용으로 사용하는 순수 프레젠테이션 컴포넌트.
 */

import { memo, useState } from "react";
import { GearIcon, MusicNoteIcon, SpeakerOffIcon, SpeakerOnIcon } from "./icons";

/** SoundControl props */
export interface SoundControlProps {
  /** 효과음/사운드 전체 on/off 상태 */
  readonly soundEnabled: boolean;
  /** 사운드 토글 클릭 시 호출된다 */
  readonly onToggleSound: () => void;
  /** 선택 가능한 배경음악 트랙 목록 */
  readonly tracks: readonly { readonly id: string; readonly name: string }[];
  /** 현재 선택된 트랙 인덱스 */
  readonly trackIndex: number;
  /** 트랙 선택 시 호출된다 (index 전달) */
  readonly onSelectTrack: (index: number) => void;
  /** 음악 볼륨 (0~1) */
  readonly volume: number;
  /** 볼륨 변경 시 호출된다 (0~1 전달) */
  readonly onChangeVolume: (volume: number) => void;
}

/**
 * 컴팩트 사운드 컨트롤을 렌더링한다.
 * 입력: SoundControlProps / 출력: JSX
 */
function SoundControlComponent({
  soundEnabled,
  onToggleSound,
  tracks,
  trackIndex,
  onSelectTrack,
  volume,
  onChangeVolume,
}: SoundControlProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
      {/* ---- 기본 한 줄: 사운드 토글 + 설정 펼치기 ---- */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          title={soundEnabled ? "사운드 끄기" : "사운드 켜기"}
          aria-label={soundEnabled ? "사운드 끄기" : "사운드 켜기"}
          className={`rounded-md p-1.5 transition hover:bg-white/10 ${
            soundEnabled ? "text-cyan-300" : "text-white/30"
          }`}
        >
          {soundEnabled ? <SpeakerOnIcon className="h-4 w-4" /> : <SpeakerOffIcon className="h-4 w-4" />}
        </button>
        <span className="flex min-w-0 items-center gap-1 truncate text-[10px] tracking-wide text-white/30">
          <MusicNoteIcon className="h-3 w-3 shrink-0" />
          {tracks[trackIndex]?.name ?? ""}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          title="음악 설정"
          aria-label="음악 설정"
          aria-expanded={expanded}
          className={`rounded-md p-1.5 transition hover:bg-white/10 ${
            expanded ? "text-white/80" : "text-white/40"
          }`}
        >
          <GearIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ---- 펼침 패널: 트랙 선택 + 볼륨 ---- */}
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
          <div className="flex flex-wrap gap-1">
            {tracks.map((track, i) => (
              <button
                key={track.id}
                type="button"
                onClick={() => onSelectTrack(i)}
                className={`rounded-full px-2 py-0.5 text-[10px] transition ${
                  i === trackIndex
                    ? "bg-cyan-400/90 font-semibold text-black"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {track.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="sound-control-volume" className="shrink-0 text-[10px] text-white/40">
              볼륨 {Math.round(volume * 100)}%
            </label>
            <input
              id="sound-control-volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
              className="h-1 w-full cursor-pointer accent-cyan-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** props가 실제로 바뀔 때만 재렌더링되는 메모이즈 컴포넌트 */
export const SoundControl = memo(SoundControlComponent);
