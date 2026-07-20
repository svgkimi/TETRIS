/**
 * LobbyScreen.tsx
 * -----------------------------------------------------------------------
 * 대전 모드 로비 화면 (v2): 공개 방 목록(새로고침/입장/코드 입력) + 방 만들기 폼
 * (이름/입장 코드/모드 선택) + 상태별 안내(연결 중/대기 중/에러/상대 나감).
 * 네트워킹은 useMultiplayer 훅의 결과를 props로만 전달받아 사용하며, 이 컴포넌트는
 * 순수하게 그 상태(status)에 따라 무엇을 보여줄지만 결정한다 (관심사 분리).
 */

import { useEffect, useState } from "react";
import type { BattleMode, ConnectionStatus, CreateRoomOptions, RoomInfo } from "../../hooks/useMultiplayer";

/** LobbyScreen props */
export interface LobbyScreenProps {
  readonly status: ConnectionStatus;
  /** 마지막으로 받은 공개 방 목록 */
  readonly rooms: readonly RoomInfo[];
  /** 내가 만든/속한 방 이름 (대기 중 표시용) */
  readonly roomName: string | null;
  /** 내가 속한 방의 모드 (대기 중 표시용) */
  readonly mode: BattleMode | null;
  readonly errorMessage: string | null;
  /** 방 목록 새로고침 요청 */
  readonly listRooms: () => void;
  /** 방 생성 (이름/코드/모드 옵션) */
  readonly createRoom: (options?: CreateRoomOptions) => void;
  /** 방 입장 (코드 방이면 code 필요) */
  readonly joinRoom: (roomId: string, code?: string) => void;
  /** 대기 중 방에서 나가 로비로 복귀 */
  readonly leaveRoom: () => void;
  /** 로비/타이틀로 완전히 나가기 (연결 종료 포함) */
  readonly onExit: () => void;
}

/** 모드 뱃지 렌더링용 라벨. 입력: BattleMode / 출력: 이모지 포함 문자열 */
function modeLabel(mode: BattleMode): string {
  return mode === "score" ? "🏆 스코어전" : "⚔️ 공격전";
}

/**
 * 대전 로비 화면을 렌더링한다.
 * 입력: LobbyScreenProps / 출력: JSX
 */
export function LobbyScreen({
  status,
  rooms,
  roomName,
  mode,
  errorMessage,
  listRooms,
  createRoom,
  joinRoom,
  leaveRoom,
  onExit,
}: LobbyScreenProps) {
  // ---- 방 만들기 폼 입력 상태 ----
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [modeInput, setModeInput] = useState<BattleMode>("attack");
  // 코드 방 입장 시 인라인 코드 입력을 펼칠 대상 방 id
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");

  const isBusy = status === "connecting" || status === "waiting_for_opponent" || status === "joined";

  // 로비(idle) 진입/복귀 시 방 목록을 자동 조회한다
  useEffect(() => {
    if (status === "idle" || status === "opponent_left" || status === "error") {
      listRooms();
    }
  }, [status, listRooms]);

  /** 방 목록의 방 하나를 클릭했을 때: 공개방이면 즉시 입장, 코드 방이면 인라인 입력을 연다 */
  const handleRoomClick = (room: RoomInfo) => {
    if (room.playerCount >= 2) return;
    if (room.hasCode) {
      setPendingRoomId((prev) => (prev === room.roomId ? null : room.roomId));
      setJoinCodeInput("");
    } else {
      joinRoom(room.roomId);
    }
  };

  /** 방 만들기 폼 제출: 입력값을 옵션으로 정리해 createRoom을 호출한다 */
  const handleCreate = () => {
    createRoom({
      name: nameInput.trim() || undefined,
      code: codeInput.trim() || undefined,
      mode: modeInput,
    });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 overflow-y-auto text-white">
      <div className="flex flex-col items-center gap-2">
        <h1 className="bg-gradient-to-b from-cyan-300 via-fuchsia-300 to-amber-300 bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-[0_0_30px_rgba(168,85,247,0.35)]">
          대전 모드
        </h1>
        <p className="text-sm tracking-[0.3em] text-white/40">1:1 REAL-TIME BATTLE</p>
      </div>

      {/* ---- 상태별 안내: 대기 중 / 연결 중 / 에러 / 상대 나감 ---- */}
      {status === "connecting" && <p className="animate-pulse text-sm text-white/60">서버에 연결하는 중...</p>}

      {status === "waiting_for_opponent" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-10 py-6">
          <span className="text-xs tracking-widest text-white/40">내 방</span>
          <span className="text-3xl font-black text-amber-300">{roomName ?? "..."}</span>
          {mode && <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{modeLabel(mode)}</span>}
          <span className="mt-1 animate-pulse text-xs text-white/50">상대방을 기다리는 중...</span>
          <button
            type="button"
            onClick={leaveRoom}
            className="mt-2 rounded-full border border-white/20 bg-white/5 px-6 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10"
          >
            방 나가기
          </button>
        </div>
      )}

      {status === "joined" && (
        <p className="animate-pulse text-sm text-white/60">상대와 연결되었습니다! 잠시 후 대전이 시작됩니다...</p>
      )}

      {status === "opponent_left" && <p className="text-sm text-rose-300">상대방이 나갔습니다.</p>}

      {status === "error" && (
        <div className="flex flex-col items-center gap-1 text-center">
          {errorMessage && <p className="text-sm text-rose-300">{errorMessage}</p>}
          <p className="text-xs text-white/40">서버가 실행 중인지 확인하세요 (npm run server, ws://localhost:8787).</p>
        </div>
      )}

      {/* ---- 로비 본문: 방 목록 + 방 만들기 (대기/연결 중이 아닐 때) ---- */}
      {!isBusy && (
        <div className="flex w-full max-w-3xl flex-col gap-6 md:flex-row md:items-start">
          {/* 방 목록 */}
          <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-widest text-white/70">방 목록</h2>
              <button
                type="button"
                onClick={listRooms}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/15"
              >
                새로고침
              </button>
            </div>

            {rooms.length === 0 && (
              <p className="py-6 text-center text-xs text-white/30">아직 열린 방이 없습니다. 새 방을 만들어 보세요!</p>
            )}

            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {rooms.map((room) => {
                const full = room.playerCount >= 2;
                return (
                  <li key={room.roomId}>
                    <button
                      type="button"
                      disabled={full}
                      onClick={() => handleRoomClick(room)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 px-4 py-3 text-left transition ${
                        full ? "cursor-not-allowed opacity-40" : "bg-white/5 hover:border-cyan-400/50 hover:bg-white/10"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {room.hasCode && <span title="입장 코드 필요">🔒</span>}
                        <span className="truncate font-bold">{room.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        <span className="rounded-full bg-white/10 px-2 py-0.5">{modeLabel(room.mode)}</span>
                        <span className={`font-mono ${full ? "text-rose-300" : "text-emerald-300"}`}>
                          {room.playerCount}/2
                        </span>
                      </span>
                    </button>

                    {/* 코드 방: 인라인 코드 입력 */}
                    {pendingRoomId === room.roomId && room.hasCode && !full && (
                      <div className="mt-2 flex gap-2 px-1">
                        <input
                          type="text"
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="입장 코드"
                          maxLength={8}
                          className="w-32 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-center font-mono text-sm tracking-widest text-white placeholder:text-white/20 focus:border-cyan-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={joinCodeInput.trim().length === 0}
                          onClick={() => joinRoom(room.roomId, joinCodeInput.trim())}
                          className="rounded-full bg-cyan-400 px-5 py-1.5 text-sm font-bold text-black transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          입장
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 방 만들기 폼 */}
          <section className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:w-64">
            <h2 className="text-sm font-bold tracking-widest text-white/70">방 만들기</h2>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="방 이름 (비워두면 자동 이름)"
              maxLength={24}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/20 focus:border-cyan-400 focus:outline-none"
            />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="입장 코드 (선택)"
              maxLength={8}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-center font-mono text-sm tracking-widest text-white placeholder:text-white/20 focus:border-cyan-400 focus:outline-none"
            />
            {/* 모드 선택 토글: 공격전 / 스코어전 */}
            <div className="flex gap-2">
              {(["attack", "score"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModeInput(m)}
                  className={`flex-1 rounded-full border px-3 py-2 text-xs font-bold transition ${
                    modeInput === m
                      ? "border-cyan-400 bg-cyan-400/20 text-cyan-200"
                      : "border-white/15 bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {modeLabel(m)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-1 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 py-2.5 font-bold text-black shadow-[0_0_30px_rgba(56,189,248,0.4)] transition hover:scale-105 active:scale-95"
            >
              방 만들기
            </button>
          </section>
        </div>
      )}

      {!isBusy && (
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
