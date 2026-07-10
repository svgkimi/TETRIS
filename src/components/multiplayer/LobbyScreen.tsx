/**
 * LobbyScreen.tsx
 * -----------------------------------------------------------------------
 * 대전 모드 진입 후 매치가 시작되기 전까지의 화면(방 만들기 / 코드로 참가하기 / 대기 상태 안내).
 * 네트워킹은 useMultiplayer 훅의 결과를 props로만 전달받아 사용하며, 이 컴포넌트는
 * 순수하게 그 상태(status)에 따라 무엇을 보여줄지만 결정한다 (관심사 분리).
 */

import { useState } from "react";
import type { ConnectionStatus } from "../../hooks/useMultiplayer";

/** LobbyScreen props */
export interface LobbyScreenProps {
  readonly status: ConnectionStatus;
  readonly roomCode: string | null;
  readonly errorMessage: string | null;
  readonly createRoom: () => void;
  readonly joinRoom: (roomCode: string) => void;
  /** 로비/타이틀로 완전히 나가기 (연결 종료 포함) */
  readonly onExit: () => void;
}

/** 상태별 안내 문구 */
function statusMessage(status: ConnectionStatus): string | null {
  switch (status) {
    case "connecting":
      return "서버에 연결하는 중...";
    case "waiting_for_opponent":
      return "상대방을 기다리는 중... 아래 코드를 상대에게 공유하세요.";
    case "joined":
      return "상대와 연결되었습니다! 잠시 후 대전이 시작됩니다...";
    case "opponent_left":
      return "상대방이 나갔습니다.";
    default:
      return null;
  }
}

/**
 * 대전 로비 화면을 렌더링한다.
 * 입력: LobbyScreenProps / 출력: JSX
 */
export function LobbyScreen({ status, roomCode, errorMessage, createRoom, joinRoom, onExit }: LobbyScreenProps) {
  const [joinCodeInput, setJoinCodeInput] = useState("");

  const isBusy = status === "connecting" || status === "waiting_for_opponent" || status === "joined";
  const message = statusMessage(status);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 text-white">
      <div className="flex flex-col items-center gap-2">
        <h1 className="bg-gradient-to-b from-cyan-300 via-fuchsia-300 to-amber-300 bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(168,85,247,0.35)]">
          대전 모드
        </h1>
        <p className="text-sm tracking-[0.3em] text-white/40">1:1 REAL-TIME BATTLE</p>
      </div>

      {status === "waiting_for_opponent" && roomCode && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-10 py-6">
          <span className="text-xs tracking-widest text-white/40">방 코드</span>
          <span className="font-mono text-6xl font-black tracking-[0.3em] text-amber-300">{roomCode}</span>
          <span className="mt-2 animate-pulse text-xs text-white/50">상대 기다리는 중...</span>
        </div>
      )}

      {message && status !== "waiting_for_opponent" && (
        <p
          className={
            status === "error" || status === "opponent_left"
              ? "text-center text-sm text-rose-300"
              : "text-center text-sm text-white/60"
          }
        >
          {message}
        </p>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-1 text-center">
          {errorMessage && <p className="text-sm text-rose-300">{errorMessage}</p>}
          <p className="text-xs text-white/40">서버가 실행 중인지 확인하세요 (npm run server, ws://localhost:8787).</p>
        </div>
      )}

      {!isBusy && status !== "error" && (
        <div className="flex flex-col items-center gap-6">
          <button
            type="button"
            onClick={createRoom}
            className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-10 py-3 text-lg font-bold text-black shadow-[0_0_30px_rgba(56,189,248,0.5)] transition hover:scale-105 active:scale-95"
          >
            방 만들기
          </button>

          <div className="flex flex-col items-center gap-3">
            <span className="text-xs tracking-widest text-white/40">또는 코드로 참가하기</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="방 코드 입력"
                maxLength={4}
                className="w-36 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-center font-mono text-lg tracking-[0.3em] text-white placeholder:text-white/20 focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="button"
                disabled={joinCodeInput.trim().length === 0}
                onClick={() => joinRoom(joinCodeInput.trim())}
                className="rounded-full border border-white/20 bg-white/10 px-6 py-2 font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
              >
                참가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {(status === "error" || status === "opponent_left") && (
        <button
          type="button"
          onClick={onExit}
          className="rounded-full border border-white/20 bg-white/5 px-8 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
        >
          다시 시도 / 메인으로
        </button>
      )}

      {status === "idle" && (
        <button
          type="button"
          onClick={onExit}
          className="text-xs text-white/40 underline decoration-dotted underline-offset-4 hover:text-white/70"
        >
          메인 화면으로 돌아가기
        </button>
      )}
    </div>
  );
}
