/**
 * useSound.ts
 * -----------------------------------------------------------------------
 * Web Audio API(OscillatorNode)만으로 효과음/배경음악을 직접 합성해 재생하는 훅.
 * 오디오 파일을 전혀 사용하지 않으며, On/Off 토글과 배경음악 트랙 선택을 지원한다.
 * 게임 엔진과는 완전히 무관한 "표현(presentation)" 레이어 훅이다.
 *
 * 오디오 그래프: 각 톤(oscillator) -> (sfxGain | musicGain) -> masterGain -> compressor -> destination
 * 여러 소리가 동시에 겹쳐도 destination에서 그대로 합산되어 찢어지는(clipping) 현상이 없도록
 * DynamicsCompressorNode로 최종 출력을 리미팅한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 한 번의 톤(beep) 재생 옵션 */
interface ToneOptions {
  /** 시작 주파수(Hz) */
  readonly frequency: number;
  /** 재생 길이(초) */
  readonly duration: number;
  /** 오실레이터 파형 */
  readonly type?: OscillatorType;
  /** 최대 게인(음량, 0~1) */
  readonly gain?: number;
  /** 목표 주파수로 슬라이드(글리산도) 시킬 경우 지정 */
  readonly slideTo?: number;
  /** 재생 시작을 지연시킬 시간(초) */
  readonly delay?: number;
  /** 연결할 오디오 버스. 효과음은 "sfx"(기본값), 배경음악 노트는 "music" */
  readonly bus?: "sfx" | "music";
}

/** useSound 훅이 반환하는 효과음 재생 함수 모음 */
export interface SoundEffects {
  readonly move: () => void;
  readonly rotate: () => void;
  readonly softDrop: () => void;
  readonly hardDrop: () => void;
  readonly hold: () => void;
  readonly lock: () => void;
  /** 라인 클리어 효과음. 지워진 줄 수(1~4)가 많을수록 더 크고 화려하게 재생된다 */
  readonly lineClear: (lines: number) => void;
  readonly tetris: () => void;
  /** T-Spin 효과음. 지워진 줄 수(1~3)가 많을수록 더 강조된다 */
  readonly tSpin: (lines: number) => void;
  readonly levelUp: () => void;
  readonly gameOver: () => void;
  readonly countdownTick: () => void;
  readonly uiSelect: () => void;
}

/** 배경음악 한 트랙의 정의 (16스텝 루프) */
interface MusicTrack {
  readonly id: string;
  readonly name: string;
  /** 한 스텝의 길이(ms) — 트랙마다 템포가 다르다 */
  readonly stepMs: number;
  readonly leadType: OscillatorType;
  readonly bassType: OscillatorType;
  /** 리드 멜로디 16스텝. null은 쉼표 */
  readonly lead: readonly (number | null)[];
  /** 베이스 라인 16스텝. null은 쉼표 */
  readonly bass: readonly (number | null)[];
}

/**
 * 선택 가능한 배경음악 3종 (전부 오리지널 8비트풍 루프이며 기존 곡을 재현하지 않는다).
 * - 레트로 드라이브: D 자연단조, 중간 템포의 아케이드풍 루프
 * - 네온 펄스: A 마이너, 빠른 템포의 신스웨이브풍 아르페지오
 * - 칠 바이트: C 메이저 펜타토닉, 느린 템포의 여백 있는 로파이풍 루프
 */
const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: "retro-drive",
    name: "레트로 드라이브",
    stepMs: 180,
    leadType: "square",
    bassType: "triangle",
    lead: [440, null, 523.25, 587.33, null, 523.25, 440, null, 392, null, 440, 466.16, 440, null, 392, null],
    bass: [146.83, null, 146.83, null, 220, null, 220, null, 196, null, 196, null, 220, null, 220, null],
  },
  {
    id: "neon-pulse",
    name: "네온 펄스",
    stepMs: 150,
    leadType: "sawtooth",
    bassType: "square",
    lead: [440, 523.25, null, 440, 659.25, null, 587.33, null, 493.88, 587.33, null, 493.88, 440, null, null, 392],
    bass: [110, null, 110, null, 164.81, null, 164.81, null, 130.81, null, 130.81, null, 110, null, 110, null],
  },
  {
    id: "chill-byte",
    name: "칠 바이트",
    stepMs: 260,
    leadType: "triangle",
    bassType: "sine",
    lead: [
      523.25, null, null, 659.25, null, null, 587.33, null, null, 783.99, null, null, 659.25, null, null, null,
    ],
    bass: [130.81, null, null, null, null, null, null, null, 174.61, null, null, null, null, null, null, null],
  },
];

/** 선택된 배경음악 트랙 인덱스를 저장하는 LocalStorage 키 */
const TRACK_STORAGE_KEY = "modern-tetris:music-track";
/** 배경음악 볼륨(0~1)을 저장하는 LocalStorage 키 */
const MUSIC_VOLUME_KEY = "modern-tetris:music-volume";
/** 배경음악 기본 볼륨 (사용자가 따로 설정하지 않았을 때) */
const DEFAULT_MUSIC_VOLUME = 0.6;

/** LocalStorage에서 저장된 트랙 인덱스를 읽어온다. 없거나 범위를 벗어나면 0(첫 트랙)을 반환한다 */
function readStoredTrackIndex(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(TRACK_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(MUSIC_TRACKS.length - 1, Math.max(0, parsed));
  } catch {
    return 0;
  }
}

/** LocalStorage에서 저장된 배경음악 볼륨(0~1)을 읽어온다. 없거나 잘못된 값이면 기본값을 반환한다 */
function readStoredMusicVolume(): number {
  if (typeof window === "undefined") return DEFAULT_MUSIC_VOLUME;
  try {
    const raw = window.localStorage.getItem(MUSIC_VOLUME_KEY);
    const parsed = raw !== null ? Number.parseFloat(raw) : DEFAULT_MUSIC_VOLUME;
    if (!Number.isFinite(parsed)) return DEFAULT_MUSIC_VOLUME;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return DEFAULT_MUSIC_VOLUME;
  }
}

/** 배경음악(BGM) 재생/정지/트랙 선택 제어 함수 모음 */
export interface MusicControls {
  /** 배경음악 루프 재생을 시작한다 (이미 재생 중이면 아무 동작 안 함) */
  readonly start: () => void;
  /** 배경음악 재생을 멈춘다 */
  readonly stop: () => void;
  /** 현재 선택된 트랙의 인덱스 */
  readonly trackIndex: number;
  /** 트랙을 변경한다. 재생 중이면 즉시 새 트랙으로 전환되고, 선택값은 LocalStorage에 저장된다 */
  readonly setTrackIndex: (index: number) => void;
  /** 선택 가능한 트랙 목록 (설정 UI 렌더링용) */
  readonly tracks: readonly { readonly id: string; readonly name: string }[];
  /** 현재 배경음악 볼륨 (0~1) */
  readonly volume: number;
  /** 배경음악 볼륨을 변경한다 (0~1). 재생 중이면 즉시 반영되고 LocalStorage에 저장된다 */
  readonly setVolume: (volume: number) => void;
}

/** useSound 훅의 반환 타입 */
export interface UseSoundResult {
  readonly enabled: boolean;
  readonly toggle: () => void;
  readonly sounds: SoundEffects;
  readonly music: MusicControls;
}

/**
 * Web Audio API 기반 효과음/배경음악 훅.
 * 입력: 없음 / 출력: { enabled, toggle, sounds(효과음 재생 함수 모음), music(배경음악 제어) }
 */
export function useSound(): UseSoundResult {
  const [enabled, setEnabled] = useState<boolean>(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const sfxGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  // 배경음악 볼륨(0~1). ensureContext가 musicGain 초기값을 정할 때 참조해야 하므로
  // ensureContext보다 먼저 선언한다.
  const [musicVolume, setMusicVolumeState] = useState<number>(readStoredMusicVolume);
  const musicVolumeRef = useRef(musicVolume);
  musicVolumeRef.current = musicVolume;

  /**
   * 지연 생성된 AudioContext와 오디오 그래프를 반환한다 (사용자 제스처 이후 최초 호출 시 생성/resume).
   * 그래프: (sfxGain | musicGain) -> masterGain -> lowpass(저역통과 필터) -> compressor -> destination.
   * - lowpass: square/sawtooth 파형이 여러 개 겹칠 때 생기는 날카로운 고주파 성분을 눌러
   *   소리가 "깨지는"(harsh/찢어짐) 느낌을 줄인다.
   * - compressor: 리미터에 가깝게 설정해(threshold 낮음, ratio 높음, attack 빠름) 여러 소리가
   *   동시에 겹쳐 destination에서 그대로 합산되며 clipping되는 것을 막는다.
   * - masterGain을 1보다 낮게 잡아 애초에 클리핑 여유(헤드룸)를 확보한다.
   */
  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;

    if (!ctxRef.current) {
      const ctx = new AudioCtor();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(6, ctx.currentTime);
      compressor.ratio.setValueAtTime(14, ctx.currentTime);
      compressor.attack.setValueAtTime(0.001, ctx.currentTime);
      compressor.release.setValueAtTime(0.12, ctx.currentTime);
      compressor.connect(ctx.destination);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(5200, ctx.currentTime);
      lowpass.Q.setValueAtTime(0.6, ctx.currentTime);
      lowpass.connect(compressor);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.8, ctx.currentTime);
      masterGain.connect(lowpass);

      const sfxGain = ctx.createGain();
      sfxGain.gain.setValueAtTime(1, ctx.currentTime);
      sfxGain.connect(masterGain);

      const musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(musicVolumeRef.current, ctx.currentTime);
      musicGain.connect(masterGain);

      ctxRef.current = ctx;
      compressorRef.current = compressor;
      lowpassRef.current = lowpass;
      masterGainRef.current = masterGain;
      sfxGainRef.current = sfxGain;
      musicGainRef.current = musicGain;
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  // 브라우저(특히 Safari)의 오디오 자동재생 정책은 AudioContext 생성/resume이
  // 실제 사용자 제스처 이벤트 핸들러 안에서 "동기적으로" 호출되지 않으면 계속 suspended 상태로
  // 묶어둔다. 우리 사운드 재생 호출은 대부분 useEffect/타이머 안에서 이루어지므로,
  // 페이지 전체에 대한 최초 사용자 입력을 한 번 감지해 그 안에서 직접 AudioContext를
  // 생성/resume 시켜 소리가 전혀 들리지 않는 문제를 방지한다.
  // click/touchend/keydown만 사용한다: pointerdown은 Safari(WebKit)가 오디오 언락을 위한
  // "사용자 제스처"로 항상 인정해주지는 않아, 크로미움에서는 통하고 Safari에서는 계속
  // suspended로 묶이는(=소리가 안 들리는) 문제가 있었다.
  useEffect(() => {
    const unlockAudio = () => {
      ensureContext();
    };
    const unlockEvents: (keyof WindowEventMap)[] = ["click", "touchend", "keydown"];
    unlockEvents.forEach((eventName) => window.addEventListener(eventName, unlockAudio, { once: true }));
    return () => {
      unlockEvents.forEach((eventName) => window.removeEventListener(eventName, unlockAudio));
    };
  }, [ensureContext]);

  /** 단일 톤을 합성해 지정된 버스(sfx/music)로 재생한다 */
  const playTone = useCallback(
    (options: ToneOptions) => {
      if (!enabledRef.current) return;
      const ctx = ensureContext();
      if (!ctx) return;
      const bus = options.bus === "music" ? musicGainRef.current : sfxGainRef.current;
      if (!bus) return;

      /** 실제로 오실레이터를 만들어 스케줄링한다 (ctx가 running 상태일 때만 호출되어야 소리가 씹히지 않는다) */
      const schedule = () => {
        const startTime = ctx.currentTime + (options.delay ?? 0);
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = options.type ?? "square";
        oscillator.frequency.setValueAtTime(options.frequency, startTime);
        if (options.slideTo !== undefined) {
          oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(1, options.slideTo),
            startTime + options.duration,
          );
        }

        const peakGain = options.gain ?? 0.08;
        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + options.duration);

        oscillator.connect(gainNode);
        gainNode.connect(bus);
        oscillator.start(startTime);
        oscillator.stop(startTime + options.duration + 0.02);
      };

      if (ctx.state === "running") {
        schedule();
        return;
      }

      // Safari(WebKit)는 AudioContext를 "suspended"로 생성하고 resume()도 비동기로 처리되는데,
      // 이 완료를 기다리지 않고 바로 오실레이터를 스케줄링하면 그 소리는 조용히 씹혀서
      // (재생되지 않고) 사라진다. resume이 실제로 끝난 뒤에 스케줄링해야 첫 소리가 들린다.
      void ctx.resume().then(() => {
        if (enabledRef.current) schedule();
      });
    },
    [ensureContext],
  );

  /**
   * 효과음이 강하게 울릴 때 배경음악 버스 게인을 잠깐 낮췄다가(덕킹) 원래대로 복귀시킨다.
   * 하드 드롭/락/라인클리어처럼 저음 위주의 효과음이 배경음악과 겹쳐 소리가 뭉개지는 것을 방지한다.
   * 입력: amount(0~1, 낮출 비율), durationSec(원래 음량으로 복귀하기까지 걸리는 시간)
   */
  const duckMusic = useCallback((amount: number, durationSec: number) => {
    const ctx = ctxRef.current;
    const musicGain = musicGainRef.current;
    if (!ctx || !musicGain) return;
    const now = ctx.currentTime;
    const baseLevel = musicVolumeRef.current;
    const duckedLevel = Math.max(0, baseLevel * (1 - amount));
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(duckedLevel, now + 0.03);
    musicGain.gain.linearRampToValueAtTime(baseLevel, now + durationSec);
  }, []);

  const sounds = useMemo<SoundEffects>(() => {
    /**
     * 지워진 줄 수(1~4)에 비례해 점점 커지고 화려해지는 라인 클리어 임팩트음을 재생한다.
     * 입력: lines(지워진 줄 수), extraFlourish(테트리스 전용 추가 아르페지오 여부) / 출력: 없음(사이드이펙트로 재생)
     */
    const playClearImpact = (lines: number, extraFlourish: boolean) => {
      const n = Math.min(4, Math.max(1, lines));
      const base = 440;
      const gain = 0.07 + n * 0.02; // 1줄 0.09 ~ 4줄 0.15: 많이 지울수록 더 크게
      const noteDuration = 0.1 + n * 0.015;
      duckMusic(0.2 + n * 0.09, 0.35 + n * 0.12);
      for (let i = 0; i < n; i++) {
        playTone({
          frequency: base + i * 110,
          duration: noteDuration,
          type: n >= 4 ? "sawtooth" : "sine",
          gain,
          delay: i * 0.045,
        });
      }
      if (n >= 3) {
        // 3줄 이상은 저음 임팩트를 더해 타격감을 강조한다
        playTone({ frequency: 90, duration: 0.22, type: "sine", gain: 0.1 + n * 0.02, delay: 0.02 });
      }
      if (extraFlourish) {
        [1047, 1319].forEach((freq, i) => {
          playTone({
            frequency: freq,
            duration: 0.16,
            type: "sawtooth",
            gain: 0.09,
            delay: n * 0.045 + 0.08 + i * 0.07,
          });
        });
      }
    };

    return {
      // square/sawtooth는 배음이 많아 거칠고 "깨지는" 느낌이 나기 쉬워, 자주 재생되는
      // 이동/하드드롭/락 효과음은 훨씬 부드러운 triangle/sine 파형으로 바꿨다.
      move: () => playTone({ frequency: 300, duration: 0.025, type: "triangle", gain: 0.035 }),
      rotate: () => playTone({ frequency: 340, duration: 0.05, type: "triangle", gain: 0.06 }),
      softDrop: () => playTone({ frequency: 260, duration: 0.02, type: "triangle", gain: 0.025 }),
      hardDrop: () => {
        // 저음 스윕이 배경음악 베이스와 겹치지 않도록 잠깐 배경음악을 덕킹한다
        duckMusic(0.35, 0.28);
        playTone({ frequency: 150, duration: 0.14, type: "sine", slideTo: 50, gain: 0.14 });
      },
      hold: () => playTone({ frequency: 400, duration: 0.08, type: "triangle", gain: 0.06 }),
      // 락(고정) 효과음은 아주 짧고 부드러운 사인파 클릭음으로, 하드드롭/배경음악 베이스와 겹쳐도 거슬리지 않게 한다
      lock: () => playTone({ frequency: 760, duration: 0.02, type: "sine", gain: 0.03 }),
      lineClear: (lines: number) => playClearImpact(lines, false),
      tetris: () => playClearImpact(4, true),
      tSpin: (lines: number) => {
        const n = Math.max(1, lines);
        duckMusic(0.3 + n * 0.05, 0.5);
        playTone({ frequency: 300, duration: 0.1, type: "sawtooth", gain: 0.07 + n * 0.015 });
        playTone({ frequency: 600, duration: 0.15, type: "sine", gain: 0.07 + n * 0.015, delay: 0.08 });
      },
      levelUp: () => {
        duckMusic(0.3, 0.6);
        [392, 523, 659, 784].forEach((freq, i) => {
          playTone({ frequency: freq, duration: 0.14, type: "triangle", gain: 0.09, delay: i * 0.06 });
        });
      },
      gameOver: () => {
        duckMusic(0.6, 1.4);
        [392, 330, 262, 196].forEach((freq, i) => {
          playTone({ frequency: freq, duration: 0.3, type: "sawtooth", gain: 0.1, delay: i * 0.18 });
        });
      },
      countdownTick: () => playTone({ frequency: 523, duration: 0.08, type: "sine", gain: 0.08 }),
      uiSelect: () => playTone({ frequency: 660, duration: 0.05, type: "triangle", gain: 0.06 }),
    };
  }, [playTone, duckMusic]);

  const toggle = useCallback(() => setEnabled((prev) => !prev), []);

  // ---- 배경음악 재생 스케줄러 ----
  const [trackIndex, setTrackIndexState] = useState<number>(readStoredTrackIndex);
  const trackIndexRef = useRef(trackIndex);
  trackIndexRef.current = trackIndex;

  /** 실행 중인 배경음악 루프의 interval id (재생 중이 아니면 null) */
  const musicTimerRef = useRef<number | null>(null);
  /** 다음에 재생할 스텝 인덱스 */
  const musicStepRef = useRef(0);

  /** 현재 선택된 트랙의 한 스텝(리드+베이스 음)을 재생한다 */
  const playMusicStep = useCallback(() => {
    const track = MUSIC_TRACKS[trackIndexRef.current] ?? MUSIC_TRACKS[0];
    const step = musicStepRef.current;
    const stepSec = track.stepMs / 1000;
    const leadFreq = track.lead[step % track.lead.length];
    const bassFreq = track.bass[step % track.bass.length];
    if (leadFreq !== null) {
      playTone({ frequency: leadFreq, duration: stepSec * 0.85, type: track.leadType, gain: 0.045, bus: "music" });
    }
    if (bassFreq !== null) {
      playTone({ frequency: bassFreq, duration: stepSec * 0.9, type: track.bassType, gain: 0.055, bus: "music" });
    }
    musicStepRef.current = (step + 1) % Math.max(track.lead.length, track.bass.length);
  }, [playTone]);

  /** 기존 타이머를 정리하고, 현재 선택된 트랙의 템포로 처음부터 다시 재생을 시작한다 */
  const restartMusicTimer = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    const track = MUSIC_TRACKS[trackIndexRef.current] ?? MUSIC_TRACKS[0];
    musicStepRef.current = 0;
    playMusicStep();
    musicTimerRef.current = window.setInterval(playMusicStep, track.stepMs);
  }, [playMusicStep]);

  /** 배경음악 루프 재생 시작 (이미 재생 중이면 아무 동작 안 함) */
  const startMusic = useCallback(() => {
    if (musicTimerRef.current !== null) return;
    ensureContext();
    restartMusicTimer();
  }, [ensureContext, restartMusicTimer]);

  /** 배경음악 재생을 멈춘다 */
  const stopMusic = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
  }, []);

  /** 배경음악 트랙을 변경한다. 재생 중이면 즉시 전환하고, 선택값은 LocalStorage에 저장한다 */
  const setTrackIndex = useCallback(
    (index: number) => {
      const clamped = Math.min(MUSIC_TRACKS.length - 1, Math.max(0, index));
      trackIndexRef.current = clamped;
      setTrackIndexState(clamped);
      try {
        window.localStorage.setItem(TRACK_STORAGE_KEY, String(clamped));
      } catch {
        // LocalStorage 접근 불가 환경(프라이빗 모드 등)에서는 조용히 무시한다
      }
      if (musicTimerRef.current !== null) {
        restartMusicTimer();
      }
    },
    [restartMusicTimer],
  );

  /** 배경음악 볼륨을 변경한다 (0~1). 재생 중이든 아니든 즉시 다음 노트부터 반영되고 LocalStorage에 저장된다 */
  const setVolume = useCallback((volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    musicVolumeRef.current = clamped;
    setMusicVolumeState(clamped);
    try {
      window.localStorage.setItem(MUSIC_VOLUME_KEY, String(clamped));
    } catch {
      // LocalStorage 접근 불가 환경(프라이빗 모드 등)에서는 조용히 무시한다
    }
    const ctx = ctxRef.current;
    const musicGain = musicGainRef.current;
    if (ctx && musicGain) {
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(clamped, now);
    }
  }, []);

  const musicTrackList = useMemo(() => MUSIC_TRACKS.map((t) => ({ id: t.id, name: t.name })), []);

  const music = useMemo<MusicControls>(
    () => ({
      start: startMusic,
      stop: stopMusic,
      trackIndex,
      setTrackIndex,
      tracks: musicTrackList,
      volume: musicVolume,
      setVolume,
    }),
    [startMusic, stopMusic, trackIndex, setTrackIndex, musicTrackList, musicVolume, setVolume],
  );

  return { enabled, toggle, sounds, music };
}
