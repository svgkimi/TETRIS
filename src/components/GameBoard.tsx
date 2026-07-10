/**
 * GameBoard.tsx
 * -----------------------------------------------------------------------
 * 10x20 필드를 Canvas로 렌더링하는 컴포넌트.
 *
 * 성능 설계(CLAUDE.md 60FPS 방어): 이 컴포넌트는 React.memo로 감싸여 board/active/ghost 등
 * "실제로 값이 바뀐 props"에 대해서만 함수 바디가 재실행된다. 화면에 실제로 그려지는 애니메이션
 * (파티클, 화면 흔들림, 하드 드롭 잔상의 페이드아웃)은 React 상태가 아니라 컴포넌트 내부의
 * ref + 자체 requestAnimationFrame 루프에서 처리되므로, React 리렌더 빈도와 무관하게
 * 항상 60FPS로 애니메이션이 진행된다.
 *
 * Canvas를 선택한 이유: CSS Grid로 200칸 + 파티클 DOM 노드를 매 프레임 갱신하면 레이아웃/스타일
 * 재계산 비용이 커 60FPS를 방어하기 어렵다. Canvas는 픽셀 버퍼에 직접 그리므로 파티클 수십~수백 개,
 * 화면 흔들림, 글로우 효과를 매 프레임 갱신해도 리플로우 비용이 없다.
 */

import { memo, useEffect, useRef } from "react";
import {
  BOARD_BUFFER_HEIGHT,
  BOARD_VISIBLE_HEIGHT,
  BOARD_WIDTH,
  getShapeCells,
  type ActivePiece,
  type Board,
  type GameStatus,
  type LineClearCategory,
  type Position,
  type ScoreEvent,
} from "../engine";
import { getCellColors, hexToRgba, TETROMINO_COLORS, TETROMINO_GLOW_COLORS } from "../lib/colors";
import type { HardDropTrailInfo } from "../hooks/useGameEngine";
import type { ShakeTrigger } from "../hooks/useEffects";

/** 셀 한 칸의 렌더링 픽셀 크기 (기준 해상도, CSS에서 비율 유지하며 축소됨) */
const CELL_SIZE = 30;
const BOARD_PIXEL_WIDTH = BOARD_WIDTH * CELL_SIZE;
const BOARD_PIXEL_HEIGHT = BOARD_VISIBLE_HEIGHT * CELL_SIZE;

/** 내부 파티클 하나의 물리 상태 (React 상태가 아닌 ref 배열로만 관리) */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/** GameBoard 컴포넌트 props */
export interface GameBoardProps {
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly ghost: ActivePiece | null;
  readonly status: GameStatus;
  readonly lastScoreEvent: ScoreEvent | null;
  readonly hardDropTrail: HardDropTrailInfo | null;
  readonly shake: ShakeTrigger | null;
}

/** 라인 클리어 카테고리별 플래시/파티클 색상 */
function colorForCategory(category: LineClearCategory, tSpin: boolean): string {
  if (tSpin) return "#e9d5ff";
  switch (category) {
    case "tetris":
      return "#fde047";
    case "triple":
      return "#fca5a5";
    case "double":
      return "#93c5fd";
    default:
      return "#f8fafc";
  }
}

/** 라인 클리어 카테고리별 파티클 개수 (테트리스일수록 화려하게) */
function particleCountForCategory(category: LineClearCategory): number {
  switch (category) {
    case "tetris":
      return 70;
    case "triple":
      return 40;
    case "double":
      return 26;
    case "single":
      return 14;
    default:
      return 0;
  }
}

/** 활성/고스트 피스가 차지하는 보드 좌표 셀 목록을 계산한다 (렌더링 전용 파생 계산) */
function pieceCells(piece: ActivePiece): readonly Position[] {
  return getShapeCells(piece.type, piece.rotation).map((cell) => ({
    x: piece.position.x + cell.x,
    y: piece.position.y + cell.y,
  }));
}

/** 둥근 사각형 경로를 그린다 (Canvas 기본 API에는 없어 직접 구현) */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function GameBoardComponent({ board, active, ghost, status, lastScoreEvent, hardDropTrail, shake }: GameBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 최신 props를 내부 rAF 루프에서 참조하기 위한 ref (React state로 관리하면 매 프레임 재렌더링 필요)
  const propsRef = useRef({ board, active, ghost, status });
  propsRef.current = { board, active, ghost, status };

  const particlesRef = useRef<Particle[]>([]);
  const flashRef = useRef<{ color: string; startedAt: number; durationMs: number } | null>(null);
  const shakeStateRef = useRef<{ startedAt: number; intensity: number; durationMs: number } | null>(null);
  const trailRef = useRef<(HardDropTrailInfo & { startedAt: number }) | null>(null);

  const lastSeenScoreEventRef = useRef<ScoreEvent | null>(null);
  const lastSeenShakeTokenRef = useRef<number>(-1);
  const lastSeenTrailTokenRef = useRef<number>(-1);

  // ---- 새 점수 이벤트 감지 -> 파티클/플래시 스폰 ----
  useEffect(() => {
    if (!lastScoreEvent || lastScoreEvent === lastSeenScoreEventRef.current) return;
    lastSeenScoreEventRef.current = lastScoreEvent;
    const hasTSpin = lastScoreEvent.tSpin !== "none";
    const count = hasTSpin
      ? Math.max(20, particleCountForCategory(lastScoreEvent.category))
      : particleCountForCategory(lastScoreEvent.category);
    if (count === 0) return;

    const color = colorForCategory(lastScoreEvent.category, hasTSpin);
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x: Math.random() * BOARD_PIXEL_WIDTH,
        y: BOARD_PIXEL_HEIGHT * (0.35 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 5,
        vy: -(Math.random() * 4 + 1.5),
        life: 0,
        maxLife: 40 + Math.random() * 30,
        color,
        size: 2 + Math.random() * 3,
      });
    }
    flashRef.current = { color, startedAt: performance.now(), durationMs: 260 };
  }, [lastScoreEvent]);

  // ---- 화면 흔들림 트리거 감지 ----
  useEffect(() => {
    if (!shake || shake.token === lastSeenShakeTokenRef.current) return;
    lastSeenShakeTokenRef.current = shake.token;
    shakeStateRef.current = { startedAt: performance.now(), intensity: shake.intensity, durationMs: shake.durationMs };
  }, [shake]);

  // ---- 하드 드롭 잔상 트리거 감지 ----
  useEffect(() => {
    if (!hardDropTrail || hardDropTrail.token === lastSeenTrailTokenRef.current) return;
    lastSeenTrailTokenRef.current = hardDropTrail.token;
    trailRef.current = { ...hardDropTrail, startedAt: performance.now() };
  }, [hardDropTrail]);

  // ---- 캔버스 해상도 설정 (devicePixelRatio 대응, 마운트 시 1회) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_PIXEL_WIDTH * dpr;
    canvas.height = BOARD_PIXEL_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    ctx?.scale(dpr, dpr);
  }, []);

  // ---- 메인 렌더 루프 (마운트 동안 계속 실행되는 자체 rAF, React 리렌더와 무관) ----
  useEffect(() => {
    let rafId = 0;

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const { board: currentBoard, active: currentActive, ghost: currentGhost } = propsRef.current;

      ctx.clearRect(0, 0, BOARD_PIXEL_WIDTH, BOARD_PIXEL_HEIGHT);

      // 화면 흔들림 오프셋 계산
      let shakeX = 0;
      let shakeY = 0;
      const shakeState = shakeStateRef.current;
      if (shakeState) {
        const elapsed = now - shakeState.startedAt;
        if (elapsed < shakeState.durationMs) {
          const decay = 1 - elapsed / shakeState.durationMs;
          shakeX = (Math.random() - 0.5) * 2 * shakeState.intensity * decay;
          shakeY = (Math.random() - 0.5) * 2 * shakeState.intensity * decay;
        } else {
          shakeStateRef.current = null;
        }
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // 배경
      ctx.fillStyle = "#0b0b12";
      ctx.fillRect(-20, -20, BOARD_PIXEL_WIDTH + 40, BOARD_PIXEL_HEIGHT + 40);

      // 그리드 라인
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= BOARD_WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL_SIZE, 0);
        ctx.lineTo(x * CELL_SIZE, BOARD_PIXEL_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= BOARD_VISIBLE_HEIGHT; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL_SIZE);
        ctx.lineTo(BOARD_PIXEL_WIDTH, y * CELL_SIZE);
        ctx.stroke();
      }

      // 고정된 블록 (버퍼 영역을 제외한 하위 20행만 렌더링)
      for (let y = BOARD_BUFFER_HEIGHT; y < currentBoard.length; y++) {
        const visibleY = y - BOARD_BUFFER_HEIGHT;
        const row = currentBoard[y];
        for (let x = 0; x < row.length; x++) {
          const cell = row[x];
          if (!cell) continue;
          const { color, glow } = getCellColors(cell);
          drawBlock(ctx, x, visibleY, color, glow, 1);
        }
      }

      // 하드 드롭 잔상 (페이드아웃되는 낙하 궤적)
      const trail = trailRef.current;
      if (trail) {
        const elapsed = now - trail.startedAt;
        const trailDuration = 260;
        if (elapsed < trailDuration) {
          const alpha = 1 - elapsed / trailDuration;
          const localCells = getShapeCells(trail.type, trail.rotation);
          ctx.fillStyle = hexToRgba(TETROMINO_COLORS[trail.type], alpha * 0.35);
          for (const cell of localCells) {
            const boardX = trail.x + cell.x;
            const colFromY = trail.fromY + cell.y - BOARD_BUFFER_HEIGHT;
            const colToY = trail.toY + cell.y - BOARD_BUFFER_HEIGHT;
            const top = Math.min(colFromY, colToY);
            const height = Math.max(1, Math.abs(colToY - colFromY));
            ctx.fillRect(boardX * CELL_SIZE + 3, top * CELL_SIZE, CELL_SIZE - 6, height * CELL_SIZE);
          }
        } else {
          trailRef.current = null;
        }
      }

      // 고스트 피스 (윤곽선 + 낮은 투명도)
      if (currentGhost) {
        const color = TETROMINO_COLORS[currentGhost.type];
        for (const cell of pieceCells(currentGhost)) {
          const visibleY = cell.y - BOARD_BUFFER_HEIGHT;
          if (visibleY < 0) continue;
          ctx.strokeStyle = hexToRgba(color, 0.85);
          ctx.lineWidth = 2;
          ctx.strokeRect(cell.x * CELL_SIZE + 2, visibleY * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          ctx.fillStyle = hexToRgba(color, 0.08);
          ctx.fillRect(cell.x * CELL_SIZE + 2, visibleY * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
        }
      }

      // 활성 피스 (글로우가 있는 실체 블록)
      if (currentActive) {
        for (const cell of pieceCells(currentActive)) {
          const visibleY = cell.y - BOARD_BUFFER_HEIGHT;
          if (visibleY < 0) continue;
          drawBlock(
            ctx,
            cell.x,
            visibleY,
            TETROMINO_COLORS[currentActive.type],
            TETROMINO_GLOW_COLORS[currentActive.type],
            1,
          );
        }
      }

      // 라인 클리어 플래시
      const flash = flashRef.current;
      if (flash) {
        const elapsed = now - flash.startedAt;
        if (elapsed < flash.durationMs) {
          const alpha = 0.5 * (1 - elapsed / flash.durationMs);
          ctx.fillStyle = hexToRgba(flash.color, alpha);
          ctx.fillRect(0, 0, BOARD_PIXEL_WIDTH, BOARD_PIXEL_HEIGHT);
        } else {
          flashRef.current = null;
        }
      }

      // 파티클 갱신 및 렌더링
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.life += 1;
        if (particle.life >= particle.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.12; // 중력
        const alpha = 1 - particle.life / particle.maxLife;
        ctx.fillStyle = hexToRgba(particle.color, alpha);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ width: BOARD_PIXEL_WIDTH, height: BOARD_PIXEL_HEIGHT }}
        className="rounded-xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
      />
      {status === "paused" && (
        // PRD 3.1: 일시정지 중 필드는 블러 처리되어 노출되지 않는다. 실제 텍스트/버튼은
        // App.tsx의 PauseOverlay가 화면 전체 레이어로 그 위에 별도 표시한다.
        <div className="absolute inset-0 rounded-xl bg-black/60 backdrop-blur-md" />
      )}
    </div>
  );
}

/** 한 셀을 입체감 있게(그라디언트 + 글로우) 그린다 */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  visibleY: number,
  color: string,
  glowColor: string,
  alpha: number,
) {
  const x = cellX * CELL_SIZE;
  const y = visibleY * CELL_SIZE;
  const pad = 1.5;

  ctx.save();
  ctx.shadowColor = hexToRgba(glowColor, 0.6 * alpha);
  ctx.shadowBlur = 8;

  const gradient = ctx.createLinearGradient(x, y, x, y + CELL_SIZE);
  gradient.addColorStop(0, hexToRgba(glowColor, alpha));
  gradient.addColorStop(1, hexToRgba(color, alpha));
  ctx.fillStyle = gradient;

  roundedRectPath(ctx, x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 4);
  ctx.fill();
  ctx.restore();
}

/** props(board/active/ghost/status/lastScoreEvent/hardDropTrail/shake)가 바뀔 때만 재렌더링 */
export const GameBoard = memo(GameBoardComponent);
