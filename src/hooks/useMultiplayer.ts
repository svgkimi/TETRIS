/**
 * useMultiplayer.ts
 * -----------------------------------------------------------------------
 * 1:1 대전 모드를 위한 순수 네트워킹 훅.
 *
 * server/index.js의 WebSocket 릴레이 서버와 통신하며 방 생성/입장, ready 신호,
 * 공격 라인/보드 요약 중계, 매치 시작 시드 수신, top-out 통지를 담당한다.
 * 게임 규칙(충돌 판정, 가비지 라인 계산 등)은 전혀 알지 못하며, 오직 "연결 상태"와
 * "메시지 송수신"만 다룬다 (관심사 분리 — 게임 엔진은 src/engine, 이 훅은 네트워킹만).
 *
 * 서버 프로토콜 명세는 server/index.js 상단 주석을 참고할 것.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 배틀 서버 WebSocket 주소.
 * VITE_BATTLE_SERVER_URL 환경변수로 override 가능하며, 기본값은 로컬 개발 서버(npm run server)다.
 */
const BATTLE_SERVER_URL: string =
  (import.meta.env.VITE_BATTLE_SERVER_URL as string | undefined) ?? "ws://localhost:8787";

/** 클라이언트가 겪을 수 있는 연결/매치 상태 */
export type ConnectionStatus =
  | "idle" // 아직 연결 안 함
  | "connecting" // 소켓 연결 및 방 생성/입장 요청 진행 중
  | "waiting_for_opponent" // 방 생성 완료, 상대 입장 대기 중 (host)
  | "joined" // 방에 들어감, 매치 시작(ready) 대기 중 (guest 초기 상태 또는 host가 상대 입장 직후)
  | "in_match" // match_start 수신, 실제 대전 진행 중
  | "opponent_left" // 상대가 연결을 끊음 (서버가 방을 정리함)
  | "error"; // 연결 실패 또는 서버 에러

/** 이 방에서 내가 맡은 역할 */
export type MultiplayerRole = "host" | "guest";

/** 서버가 보내는 메시지의 판별 유니온 (Server -> Client). server/index.js 프로토콜과 1:1 대응 */
type ServerMessage =
  | { type: "room_created"; roomCode: string }
  | { type: "join_ok"; roomCode: string }
  | { type: "join_error"; reason: string }
  | { type: "opponent_joined" }
  | { type: "match_start"; seed: number }
  | { type: "opponent_attack"; lines: number }
  | { type: "opponent_board_sync"; summary: unknown }
  | { type: "opponent_top_out" }
  | { type: "opponent_left" }
  | { type: "error"; message: string };

/**
 * 수신한 원시 JSON이 알려진 서버 메시지 형태(최소 type 필드를 가진 객체)인지 검사하는 타입 가드.
 * 입력: JSON.parse 결과(unknown) / 출력: ServerMessage 여부(boolean)
 */
function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string"
  );
}

/** useMultiplayer 훅의 반환 타입 */
export interface UseMultiplayerResult {
  /** 현재 연결/매치 상태 */
  readonly status: ConnectionStatus;
  /** 현재 참여 중인 방 코드 (아직 없으면 null) */
  readonly roomCode: string | null;
  /** 방에서 내 역할 (host/guest, 아직 미정이면 null) */
  readonly role: MultiplayerRole | null;
  /** match_start로 수신한 시드. 이 값이 갱신되는 것을 대전 시작 트리거로 사용할 수 있다 */
  readonly matchSeed: number | null;
  /** 최근 에러 메시지 (없으면 null) */
  readonly errorMessage: string | null;
  /** 상대방이 마지막으로 보낸 보드 요약 (opponent_board_sync). 형식은 호출부(엔진 연동 레이어)가 정의 */
  readonly opponentBoardSummary: unknown | null;
  /** 상대방이 게임오버(top_out) 되었는지 여부 */
  readonly opponentTopOut: boolean;
  /** 방을 새로 생성한다 (host). 소켓이 없으면 이때 지연 생성한다 */
  readonly createRoom: () => void;
  /** 주어진 코드의 방에 입장한다 (guest). 소켓이 없으면 이때 지연 생성한다 */
  readonly joinRoom: (roomCode: string) => void;
  /** 카운트다운 완료 등 "플레이 준비됨"을 서버에 알린다. 양쪽 모두 보내면 서버가 match_start를 내려준다 */
  readonly sendReady: () => void;
  /** 상대에게 보낼 공격(가비지) 라인 수를 전송한다 */
  readonly sendAttack: (lines: number) => void;
  /** 상대방 미리보기 렌더링용 가벼운 보드 요약을 전송한다 (형식 자유, opaque) */
  readonly sendBoardSync: (summary: unknown) => void;
  /** 내가 게임오버되었음을 서버(및 상대방)에 통지한다 */
  readonly sendTopOut: () => void;
  /** 소켓을 닫고 모든 상태를 초기화한다 */
  readonly disconnect: () => void;
  /**
   * 상대방의 공격(opponent_attack) 이벤트를 구독한다.
   * React state가 아닌 구독자 목록(ref)에 직접 통지하는 방식이라 렌더 배칭과 무관하게
   * 소켓 메시지가 도착하는 즉시 동기 호출되며, 연달아 여러 공격이 와도 유실 없이 각각 전달된다.
   * 입력: 공격 라인 수를 받는 콜백 / 출력: 구독 해제 함수 (cleanup)
   */
  readonly onOpponentAttack: (callback: (lines: number) => void) => () => void;
}

/**
 * 대전 모드 네트워킹 훅.
 * 순수 연결 상태 레이어로, 게임 엔진(src/engine)을 전혀 참조하지 않는다.
 * 입력: 없음 / 출력: UseMultiplayerResult
 */
export function useMultiplayer(): UseMultiplayerResult {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [role, setRole] = useState<MultiplayerRole | null>(null);
  const [matchSeed, setMatchSeed] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [opponentBoardSummary, setOpponentBoardSummary] = useState<unknown | null>(null);
  const [opponentTopOut, setOpponentTopOut] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  // disconnect()/언마운트로 인한 의도된 종료인지 구분하는 플래그. 이게 없으면 정상 종료도 "error"로 오인된다
  const manualCloseRef = useRef<boolean>(false);
  // 공격 수신 구독자 목록. React state가 아닌 ref로 관리해 렌더 배칭과 무관하게 즉시(동기) 통지한다
  const attackListenersRef = useRef<Set<(lines: number) => void>>(new Set());

  /** 서버로부터 받은 메시지 한 건을 해석해 상태를 갱신한다. 입력: ServerMessage / 출력: 없음 */
  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "room_created":
        setRoomCode(message.roomCode);
        setRole("host");
        setStatus("waiting_for_opponent");
        break;
      case "join_ok":
        setRoomCode(message.roomCode);
        setRole("guest");
        setStatus("joined");
        break;
      case "join_error":
        setErrorMessage(message.reason);
        setStatus("error");
        break;
      case "opponent_joined":
        // host 입장에서 상대가 들어와 매치 준비가 가능해짐
        setStatus("joined");
        break;
      case "match_start":
        setMatchSeed(message.seed);
        setOpponentTopOut(false);
        setStatus("in_match");
        break;
      case "opponent_attack":
        // setState 없이 구독자에게 즉시 동기 통지 -> 렌더 배칭으로 인한 공격 유실을 원천 차단
        attackListenersRef.current.forEach((listener) => listener(message.lines));
        break;
      case "opponent_board_sync":
        setOpponentBoardSummary(message.summary);
        break;
      case "opponent_top_out":
        setOpponentTopOut(true);
        break;
      case "opponent_left":
        setStatus("opponent_left");
        break;
      case "error":
        setErrorMessage(message.message);
        setStatus("error");
        break;
      default:
        break;
    }
  }, []);

  /** 현재 소켓의 이벤트 리스너를 해제하고 연결을 닫는다. 입력: 없음 / 출력: 없음 */
  const teardownSocket = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    socketRef.current = null;
  }, []);

  /**
   * 소켓이 없거나 닫혀있으면 새로 생성해 이벤트 핸들러를 연결한다 (지연 연결).
   * 이미 열려있거나 연결 중인 소켓이 있으면 그대로 재사용한다.
   * 입력: 없음 / 출력: 사용할 WebSocket 인스턴스
   */
  const ensureSocket = useCallback((): WebSocket => {
    const existing = socketRef.current;
    if (existing && existing.readyState !== WebSocket.CLOSED && existing.readyState !== WebSocket.CLOSING) {
      return existing;
    }
    manualCloseRef.current = false;
    const socket = new WebSocket(BATTLE_SERVER_URL);
    socketRef.current = socket;

    socket.onmessage = (event: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return; // 잘못된 형식의 메시지는 조용히 무시
      }
      if (isServerMessage(parsed)) {
        handleServerMessage(parsed);
      }
    };

    socket.onclose = () => {
      if (manualCloseRef.current) return; // 의도된 종료면 별도 처리 없음 (disconnect가 이미 상태 초기화)
      setStatus((prev) => (prev === "opponent_left" ? prev : "error"));
      setErrorMessage((prev) => prev ?? "서버와의 연결이 끊어졌습니다");
    };

    socket.onerror = () => {
      setErrorMessage((prev) => prev ?? "서버 연결 중 오류가 발생했습니다");
    };

    return socket;
  }, [handleServerMessage]);

  /** 소켓이 열려있으면 즉시, 아니면 open 이벤트 이후에 JSON 메시지를 전송한다. 입력: socket, payload 객체 / 출력: 없음 */
  const sendWhenOpen = useCallback((socket: WebSocket, payload: Record<string, unknown>) => {
    const doSend = () => socket.send(JSON.stringify(payload));
    if (socket.readyState === WebSocket.OPEN) {
      doSend();
    } else {
      socket.addEventListener("open", doSend, { once: true });
    }
  }, []);

  /** 방을 새로 생성한다 (host). 입력: 없음 / 출력: 없음 */
  const createRoom = useCallback(() => {
    setErrorMessage(null);
    setStatus("connecting");
    const socket = ensureSocket();
    sendWhenOpen(socket, { type: "create_room" });
  }, [ensureSocket, sendWhenOpen]);

  /** 주어진 코드의 방에 입장한다 (guest). 입력: 방 코드 문자열 / 출력: 없음 */
  const joinRoom = useCallback(
    (code: string) => {
      setErrorMessage(null);
      setStatus("connecting");
      const socket = ensureSocket();
      sendWhenOpen(socket, { type: "join_room", roomCode: code });
    },
    [ensureSocket, sendWhenOpen],
  );

  /** "플레이 준비됨"을 서버에 알린다. 입력: 없음 / 출력: 없음 */
  const sendReady = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    sendWhenOpen(socket, { type: "ready" });
  }, [sendWhenOpen]);

  /** 상대에게 보낼 공격 라인 수를 전송한다. 입력: 라인 수(number) / 출력: 없음 */
  const sendAttack = useCallback(
    (lines: number) => {
      const socket = socketRef.current;
      if (!socket) return;
      sendWhenOpen(socket, { type: "attack", lines });
    },
    [sendWhenOpen],
  );

  /** 상대방 미리보기용 보드 요약을 전송한다. 입력: 임의의 JSON 직렬화 가능한 값 / 출력: 없음 */
  const sendBoardSync = useCallback(
    (summary: unknown) => {
      const socket = socketRef.current;
      if (!socket) return;
      sendWhenOpen(socket, { type: "board_sync", summary });
    },
    [sendWhenOpen],
  );

  /** 내가 게임오버되었음을 서버에 통지한다. 입력: 없음 / 출력: 없음 */
  const sendTopOut = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    sendWhenOpen(socket, { type: "top_out" });
  }, [sendWhenOpen]);

  /** 소켓을 닫고 모든 네트워킹 상태를 초기값으로 되돌린다. 입력: 없음 / 출력: 없음 */
  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    teardownSocket();
    setStatus("idle");
    setRoomCode(null);
    setRole(null);
    setMatchSeed(null);
    setErrorMessage(null);
    setOpponentBoardSummary(null);
    setOpponentTopOut(false);
  }, [teardownSocket]);

  /** 상대 공격 이벤트 구독. 입력: 콜백 / 출력: 구독 해제 함수 */
  const onOpponentAttack = useCallback((callback: (lines: number) => void) => {
    attackListenersRef.current.add(callback);
    return () => {
      attackListenersRef.current.delete(callback);
    };
  }, []);

  // 컴포넌트 언마운트 시 소켓을 정리한다 (cleanup)
  useEffect(() => {
    return () => {
      manualCloseRef.current = true;
      teardownSocket();
    };
  }, [teardownSocket]);

  return {
    status,
    roomCode,
    role,
    matchSeed,
    errorMessage,
    opponentBoardSummary,
    opponentTopOut,
    createRoom,
    joinRoom,
    sendReady,
    sendAttack,
    sendBoardSync,
    sendTopOut,
    disconnect,
    onOpponentAttack,
  };
}
