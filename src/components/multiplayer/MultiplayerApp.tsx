/**
 * MultiplayerApp.tsx
 * -----------------------------------------------------------------------
 * 대전 모드의 최상위 컨테이너 (v2). useMultiplayer(네트워킹 훅) 인스턴스를 하나만 소유하고,
 * 상태에 따라 로비(방 목록/만들기/대기) 또는 대전 화면(BattleScreen)을 보여준다.
 * 흐름: 로비 <-> 대기실(상대 기다림) -> 매치 -> 결과(재대결 / leaveRoom으로 로비 복귀 / 완전 종료).
 * - matchStart가 있으면 BattleScreen (재대결 시 token 갱신으로 새 매치 재시작은 BattleScreen이 처리)
 * - leaveRoom()은 연결을 유지한 채 방만 나가 로비로 돌아온다 (matchStart도 초기화됨)
 * 이 컴포넌트는 화면 전환/네트워킹 배선만 담당하며, 실제 게임 로직은 BattleScreen -> useGameEngine
 * (src/engine)에, 네트워킹은 useMultiplayer에 위임한다 (관심사 분리).
 */

import { useEffect, useRef } from "react";
import { useMultiplayer } from "../../hooks/useMultiplayer";
import { LobbyScreen } from "./LobbyScreen";
import { BattleScreen } from "./BattleScreen";

/** MultiplayerApp props */
export interface MultiplayerAppProps {
  /** 대전 모드를 완전히 벗어나 싱글플레이 타이틀로 돌아가기 */
  readonly onExit: () => void;
}

/**
 * 대전 모드 전체 흐름(로비 -> 대기실 -> 매치 -> 결과)을 조립한다.
 * 입력: onExit(메인으로 돌아가기 콜백) / 출력: JSX
 */
export function MultiplayerApp({ onExit }: MultiplayerAppProps) {
  const network = useMultiplayer();
  const {
    status,
    rooms,
    roomName,
    mode,
    errorMessage,
    matchStart,
    listRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    sendReady,
    disconnect,
  } = network;

  // 첫 매치: 상대가 방에 들어와 status가 "joined"가 되면(호스트/게스트 공통) 자동으로 준비 완료를 알린다.
  // 재대결의 ready는 BattleScreen의 "재대결" 버튼이 명시적으로 보낸다.
  const sentReadyRef = useRef(false);
  useEffect(() => {
    if (status === "joined" && !sentReadyRef.current) {
      sentReadyRef.current = true;
      sendReady();
    }
    if (status === "waiting_for_opponent" || status === "idle" || status === "connecting") {
      sentReadyRef.current = false;
    }
  }, [status, sendReady]);

  /** 대전 모드를 완전히 나간다: 소켓 연결을 끊고 상위(싱글플레이 타이틀)로 복귀한다 */
  const handleExit = () => {
    disconnect();
    onExit();
  };

  // 매치 시작 정보가 있으면 대전 화면. 상대 이탈/재대결 대기 등은 BattleScreen이 오버레이로 안내하고,
  // leaveRoom()이 matchStart를 초기화하면 자연스럽게 로비로 돌아온다.
  if (matchStart !== null) {
    return (
      <BattleScreen
        matchStart={matchStart}
        roomName={roomName}
        network={network}
        onLeaveRoom={leaveRoom}
        onExit={handleExit}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#0a0a0f] p-4">
      <LobbyScreen
        status={status}
        rooms={rooms}
        roomName={roomName}
        mode={mode}
        errorMessage={errorMessage}
        listRooms={listRooms}
        createRoom={createRoom}
        joinRoom={joinRoom}
        leaveRoom={leaveRoom}
        onExit={handleExit}
      />
    </div>
  );
}
