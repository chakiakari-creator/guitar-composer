"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Square, Music, Sliders, Repeat, Sparkles, Shuffle, ShieldCheck, Disc, Download } from "lucide-react";

// ============================================================
// 音楽理論 & 定義
// ============================================================
const OPEN_STRINGS_FREQ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
const C_MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

interface ChordVoicing {
  name: string;
  frets: number[];
  chordTones: number[];
}

const DIATONIC_CHORDS: ChordVoicing[] = [
  { name: "C", frets: [-1, 3, 2, 0, 1, 0], chordTones: [0, 4, 7, 11] },
  { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], chordTones: [2, 5, 9, 0] },
  { name: "Em", frets: [0, 2, 2, 0, 0, 0], chordTones: [4, 7, 11, 2] },
  { name: "F", frets: [1, 3, 3, 2, 1, 1], chordTones: [5, 9, 0, 4] },
  { name: "G", frets: [3, 2, 0, 0, 0, 3], chordTones: [7, 11, 2, 5] },
  { name: "Am", frets: [-1, 0, 2, 2, 1, 0], chordTones: [9, 0, 4, 7] },
  { name: "Bdim", frets: [-1, 2, 3, 2, 3, -1], chordTones: [11, 2, 5, 9] },
];

interface StrokeAction {
  dir: "down" | "up" | "none";
  accent?: boolean;
}

interface StrokePattern {
  id: string;
  name: string;
  actions: StrokeAction[];
}

const STROKE_PATTERNS: StrokePattern[] = [
  {
    id: "pattern_6",
    name: "1. 8ビート定番 (タン-タタ-タン-タタ)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
    ],
  },
  {
    id: "pattern_7",
    name: "2. 8ビート定番 (タン-タタ-ンタ-タタ)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
      { dir: "none" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
      { dir: "down", accent: true }, { dir: "none" }, { dir: "up" }, { dir: "none" },
    ],
  },
  {
    id: "pattern_8",
    name: "3. 16ビート定番 (タン-タン-タン-タタ...)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
    ],
  },
  {
    id: "pattern_9",
    name: "4. 16ビート定番 (タン-タン-タタ-タン...)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
      { dir: "down" }, { dir: "up" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
    ],
  },
  {
    id: "pattern_10",
    name: "5. 16ビート定番 (タイ接続・空振りあり)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
      { dir: "none" }, { dir: "up" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
    ],
  },
];

interface MelodyPattern {
  id: string;
  name: string;
  mask: boolean[];
}

const DEFAULT_MELODY_PATTERNS: MelodyPattern[] = [
  { id: "m1", name: "1. 表8分主体", mask: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false] },
  { id: "m2", name: "2. 裏8分シンコペ", mask: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false] },
  { id: "m3", name: "3. 16分駆け上がり", mask: [true, true, true, false, true, true, true, false, true, true, true, false, true, true, true, false] },
  { id: "m4", name: "4. ロングノート主体", mask: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false] },
  { id: "m5", name: "5. シンコペ（食い）", mask: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false] },
  { id: "m6", name: "6. ダンス/4つ打ち乗せ", mask: [true, false, false, false, true, false, true, false, true, false, false, false, true, false, true, false] },
  { id: "m7", name: "7. 跳ね系（スウィング風）", mask: [true, false, false, true, true, false, false, true, true, false, false, true, true, false, false, true] },
  { id: "m8", name: "8. 休符多め（ブレス重視）", mask: [true, false, false, false, true, false, false, false, false, false, true, false, false, false, false, false] },
  { id: "m9", name: "9. ビルドアップ", mask: [true, false, false, false, true, false, true, false, true, true, true, false, true, true, true, true] },
  { id: "m10", name: "10. ランダム・変則ノリ", mask: [true, true, false, true, false, true, true, false, true, false, true, true, false, true, false, true] },
];

const KEY_OFFSET_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface MidiEvent {
  ticks: number;
  type: "noteOn" | "noteOff";
  channel: number;
  note: number;
  velocity: number;
}

// 可変長バイト (VLQ)
function encodeVLQ(value: number): number[] {
  let v = Math.max(0, Math.floor(value));
  const buffer = [v & 0x7f];
  while ((v >>= 7) > 0) {
    buffer.unshift((v & 0x7f) | 0x80);
  }
  return buffer;
}

// テキストメタイベント文字列エンコード
function encodeTextMeta(type: number, text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  return [0x00, 0xff, type, bytes.length, ...bytes];
}

// Logic Pro 完全対応 SMF Type 1 (マルチトラック＆テンポ読み込み保証) 生成関数
function buildLogicProPerfectSMF(events: MidiEvent[], bpm: number): Uint8Array {
  const ticksPerBeat = 96;
  const mpqn = Math.round(60000000 / bpm);

  // --------------------------------------------------
  // Track 0: Global Meta (Tempo, Time Sig, Title)
  // --------------------------------------------------
  const t0Data: number[] = [];
  t0Data.push(...encodeTextMeta(0x03, "Tempo Track")); // Track Name
  t0Data.push(0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08); // 4/4
  t0Data.push(
    0x00, 0xff, 0x51, 0x03,
    (mpqn >> 16) & 0xff,
    (mpqn >> 8) & 0xff,
    mpqn & 0xff
  ); // Tempo
  t0Data.push(0x00, 0xff, 0x2f, 0x00); // End of Track

  // --------------------------------------------------
  // Track 1: Guitar Chords (Channel 0)
  // --------------------------------------------------
  const guitarEvents = events.filter((e) => e.channel === 0).sort((a, b) => a.ticks - b.ticks);
  const t1Data: number[] = [];
  t1Data.push(...encodeTextMeta(0x03, "Guitar Chords"));

  let lastTick1 = 0;
  guitarEvents.forEach((ev) => {
    const delta = Math.max(0, ev.ticks - lastTick1);
    lastTick1 = ev.ticks;
    t1Data.push(...encodeVLQ(delta));
    const status = (ev.type === "noteOn" ? 0x90 : 0x80) | 0x00;
    t1Data.push(status, ev.note & 0x7f, ev.velocity & 0x7f);
  });
  t1Data.push(0x00, 0xff, 0x2f, 0x00);

  // --------------------------------------------------
  // Track 2: Melody (Channel 1)
  // --------------------------------------------------
  const melodyEvents = events.filter((e) => e.channel === 1).sort((a, b) => a.ticks - b.ticks);
  const t2Data: number[] = [];
  t2Data.push(...encodeTextMeta(0x03, "Melody Line"));

  let lastTick2 = 0;
  melodyEvents.forEach((ev) => {
    const delta = Math.max(0, ev.ticks - lastTick2);
    lastTick2 = ev.ticks;
    t2Data.push(...encodeVLQ(delta));
    const status = (ev.type === "noteOn" ? 0x90 : 0x80) | 0x01;
    t2Data.push(status, ev.note & 0x7f, ev.velocity & 0x7f);
  });
  t2Data.push(0x00, 0xff, 0x2f, 0x00);

  // --------------------------------------------------
  // Chunks Assembly
  // --------------------------------------------------
  const createChunk = (type: string, data: number[]) => {
    const len = data.length;
    const header = [
      type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3),
      (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff
    ];
    return [...header, ...data];
  };

  const headerChunk = [
    0x4d, 0x54, 0x68, 0x64, // "MThd" (chunk type is case-sensitive; a stray 0x74 here breaks every strict parser)
    0x00, 0x00, 0x00, 0x06, // Length 6
    0x00, 0x01,             // Format 1
    0x00, 0x03,             // 3 Tracks (Meta, Guitar, Melody)
    (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff
  ];

  const t0Chunk = createChunk("MTrk", t0Data);
  const t1Chunk = createChunk("MTrk", t1Data);
  const t2Chunk = createChunk("MTrk", t2Data);

  return new Uint8Array([...headerChunk, ...t0Chunk, ...t1Chunk, ...t2Chunk]);
}

export default function GuitarComposer() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeMelodyGainRef = useRef<GainNode | null>(null);

  // 設定
  const [bpm, setBpm] = useState(110);
  const [keyOffset, setKeyOffset] = useState(0);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("pattern_6");
  const [progression, setProgression] = useState<string[]>(["C", "G", "Am", "F"]);
  const [strokeQuantizeMode, setStrokeQuantizeMode] = useState<boolean>(false);

  const [melodyPatterns, setMelodyPatterns] = useState<MelodyPattern[]>(DEFAULT_MELODY_PATTERNS);
  const [selectedMelodyPatternId, setSelectedMelodyPatternId] = useState<string>("m1");

  const [noteDensity, setNoteDensity] = useState<number>(50);

  const [allowPassingTones, setAllowPassingTones] = useState<boolean>(false);
  const [allowOnlyShortNotes, setAllowOnlyShortNotes] = useState<boolean>(false);
  const [forceChordToneOnChordChange, setForceChordToneOnChordChange] = useState<boolean>(true);

  // 録音 & MIDI状態
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isCountingIn, setIsCountingIn] = useState<boolean>(false);
  const [countInBeatsLeft, setCountInBeatsLeft] = useState<number>(4);
  const [recordedEvents, setRecordedEvents] = useState<MidiEvent[]>([]);
  const totalTickCounterRef = useRef<number>(0);

  // パレット縦位置
  const [paletteY, setPaletteY] = useState<number>(0.5);
  const paletteYRef = useRef<number>(0.5);

  // 再生状態
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [currentBar, setCurrentBar] = useState(0);

  // スケジューラー参照
  const isPlayingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isCountingInRef = useRef(false);
  const countInRemainingStepsRef = useRef(0);
  const bpmRef = useRef(bpm);
  const keyOffsetRef = useRef(keyOffset);
  const selectedPatternIdRef = useRef(selectedPatternId);
  const selectedMelodyPatternIdRef = useRef(selectedMelodyPatternId);
  const melodyPatternsRef = useRef(melodyPatterns);
  const progressionRef = useRef(progression);
  const strokeQuantizeModeRef = useRef(strokeQuantizeMode);

  const allowPassingTonesRef = useRef(allowPassingTones);
  const allowOnlyShortNotesRef = useRef(allowOnlyShortNotes);
  const forceChordToneOnChordChangeRef = useRef(forceChordToneOnChordChange);

  const nextNoteTimeRef = useRef(0);
  const currentStepRef = useRef(0);
  const currentBarRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { keyOffsetRef.current = keyOffset; }, [keyOffset]);
  useEffect(() => { selectedPatternIdRef.current = selectedPatternId; }, [selectedPatternId]);
  useEffect(() => { selectedMelodyPatternIdRef.current = selectedMelodyPatternId; }, [selectedMelodyPatternId]);
  useEffect(() => { melodyPatternsRef.current = melodyPatterns; }, [melodyPatterns]);
  useEffect(() => { progressionRef.current = progression; }, [progression]);
  useEffect(() => { strokeQuantizeModeRef.current = strokeQuantizeMode; }, [strokeQuantizeMode]);

  useEffect(() => { allowPassingTonesRef.current = allowPassingTones; }, [allowPassingTones]);
  useEffect(() => { allowOnlyShortNotesRef.current = allowOnlyShortNotes; }, [allowOnlyShortNotes]);
  useEffect(() => { forceChordToneOnChordChangeRef.current = forceChordToneOnChordChange; }, [forceChordToneOnChordChange]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => { paletteYRef.current = paletteY; }, [paletteY]);

  // 矢印キー操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPaletteY((prev) => Math.min(1.0, prev + 0.06));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setPaletteY((prev) => Math.max(0.0, prev - 0.06));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      // fire-and-forget: iOS/Safari 経由のスケジューラー等、同期呼び出しでも
      // 呼んでおけば resume が進み始める。確実性が要る箇所は resumeAudioContext を使う。
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // ユーザー操作（クリック等）のハンドラ内から呼び、resume完了を確実に待つ。
  // Safari/iOS はジェスチャーから離れたタイミングの resume() を無視することがあるため、
  // ジェスチャーハンドラ内で同期的に呼び出した上で await する。
  const resumeAudioContext = useCallback(async () => {
    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // resume が失敗しても後続の再生試行に委ねる
      }
    }
    return ctx;
  }, [ensureAudioContext]);

  const playSingleStringScheduled = useCallback(
    (freq: number, time: number, isAccent: boolean, midiNote: number, delayTicks: number = 0) => {
      const ctx = ensureAudioContext();
      const duration = 2.0;

      const master = ctx.createGain();
      const volume = isAccent ? 0.35 : 0.22;

      master.gain.setValueAtTime(0.0001, time);
      master.gain.linearRampToValueAtTime(volume, time + 0.005);
      master.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      master.connect(ctx.destination);

      const partials = [
        { mult: 1, gain: 1.0, type: "sine" as OscillatorType },
        { mult: 2, gain: 0.3, type: "sine" as OscillatorType },
        { mult: 3, gain: 0.15, type: "triangle" as OscillatorType },
      ];

      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        osc.type = p.type;
        osc.frequency.setValueAtTime(freq * p.mult, time);

        const g = ctx.createGain();
        g.gain.setValueAtTime(p.gain, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(g);
        g.connect(master);
        osc.start(time);
        osc.stop(time + duration + 0.05);
      });

      if (isRecordingRef.current) {
        const tick = totalTickCounterRef.current + (strokeQuantizeModeRef.current ? 0 : delayTicks);
        setRecordedEvents((prev) => [
          ...prev,
          { ticks: tick, type: "noteOn", channel: 0, note: midiNote, velocity: isAccent ? 95 : 75 },
          { ticks: tick + 20, type: "noteOff", channel: 0, note: midiNote, velocity: 0 },
        ]);
      }
    },
    [ensureAudioContext]
  );

  const playMelodyScheduled = useCallback(
    (freq: number, time: number, midiNote: number) => {
      const ctx = ensureAudioContext();
      const MAX_SUSTAIN_TIME = 3.0;

      if (activeMelodyGainRef.current) {
        const prevGain = activeMelodyGainRef.current;
        prevGain.gain.cancelScheduledValues(time);
        prevGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);
      }

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, time);
      master.gain.linearRampToValueAtTime(0.38, time + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, time + MAX_SUSTAIN_TIME);
      master.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, time);

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.15, time);

      osc.connect(master);
      osc2.connect(g2);
      g2.connect(master);

      osc.start(time);
      osc2.start(time);
      osc.stop(time + MAX_SUSTAIN_TIME + 0.05);
      osc2.stop(time + MAX_SUSTAIN_TIME + 0.05);

      activeMelodyGainRef.current = master;

      if (isRecordingRef.current) {
        const tick = totalTickCounterRef.current;
        setRecordedEvents((prev) => [
          ...prev,
          { ticks: tick, type: "noteOn", channel: 1, note: midiNote, velocity: 100 },
          { ticks: tick + 22, type: "noteOff", channel: 1, note: midiNote, velocity: 0 },
        ]);
      }
    },
    [ensureAudioContext]
  );

  // 4カウントの「カチ」音。MIDIには記録しない（あくまでプレイヤー向けのガイド音）。
  const playCountInClick = useCallback(
    (time: number, isFirstBeat: boolean) => {
      const ctx = ensureAudioContext();
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(isFirstBeat ? 1760 : 1320, time);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(isFirstBeat ? 0.28 : 0.18, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.08);
    },
    [ensureAudioContext]
  );

  const generateRandomMelodyPattern = () => {
    const mask: boolean[] = [];
    const probability = noteDensity / 100;

    for (let i = 0; i < 16; i++) {
      const bonus = i % 4 === 0 ? 0.2 : 0.0;
      mask.push(Math.random() < Math.min(0.95, probability + bonus));
    }

    const newPattern: MelodyPattern = {
      id: "random_custom",
      name: `🎲 カスタム生成 (密度${noteDensity}%)`,
      mask,
    };

    setMelodyPatterns((prev) => {
      const filtered = prev.filter((p) => p.id !== "random_custom");
      return [...filtered, newPattern];
    });
    setSelectedMelodyPatternId("random_custom");
  };

  const getAutoMelodyFreqAndNote = useCallback(
    (chordName: string, yRatio: number, step: number, mask: boolean[]) => {
      const chord = DIATONIC_CHORDS.find((c) => c.name === chordName) || DIATONIC_CHORDS[0];

      let noteDurationSteps = 1;
      for (let i = step + 1; i < step + 16; i++) {
        if (mask[i % 16]) break;
        noteDurationSteps++;
      }
      const isShortNote = noteDurationSteps <= 2;
      const isFirstBeat = step === 0;

      const passingActive = allowPassingTonesRef.current;
      const shortActive = allowOnlyShortNotesRef.current;
      const chordChangeActive = forceChordToneOnChordChangeRef.current;

      let mustBeChordTone = false;

      if (!passingActive && !shortActive) {
        mustBeChordTone = true;
      } else {
        if (chordChangeActive && isFirstBeat) {
          mustBeChordTone = true;
        }
        if (shortActive && !isShortNote) {
          mustBeChordTone = true;
        }
      }

      let availableTones: number[] = [];

      if (mustBeChordTone) {
        availableTones = chord.chordTones;
      } else if (passingActive) {
        availableTones = C_MAJOR_SCALE.filter((tone) => {
          const isTone = chord.chordTones.includes(tone);
          const isAdjacent = chord.chordTones.some((ct) => Math.abs(ct - tone) <= 2 || Math.abs(ct - tone) >= 10);
          return isTone || isAdjacent;
        });
      } else {
        availableTones = C_MAJOR_SCALE;
      }

      const totalTonesCount = availableTones.length * 2;
      let toneIdx = Math.floor(yRatio * totalTonesCount);
      toneIdx = Math.max(0, Math.min(totalTonesCount - 1, toneIdx));

      const octave = Math.floor(toneIdx / availableTones.length) + 4;
      const semitone = availableTones[toneIdx % availableTones.length];

      const midiNote = (octave + 1) * 12 + semitone + keyOffsetRef.current;
      const freq = 261.63 * Math.pow(2, ((octave - 4) * 12 + semitone + keyOffsetRef.current) / 12);

      return { freq, midiNote };
    },
    []
  );

  const scheduleStroke = useCallback(
    (chordName: string, dir: "down" | "up", isAccent: boolean, time: number) => {
      if (dir === "none") return;
      const chord = DIATONIC_CHORDS.find((c) => c.name === chordName);
      if (!chord) return;

      const stringFreqs: { freq: number; midiNote: number }[] = [];
      chord.frets.forEach((fret, stringIdx) => {
        if (fret !== -1) {
          const openFreq = OPEN_STRINGS_FREQ[stringIdx];
          const totalFret = fret + keyOffsetRef.current;
          const freq = openFreq * Math.pow(2, totalFret / 12);

          const baseMidi = [40, 45, 50, 55, 59, 64][stringIdx];
          const midiNote = baseMidi + totalFret;

          stringFreqs.push({ freq, midiNote });
        }
      });

      if (dir === "up") stringFreqs.reverse();

      // ストロークディレイ（弦間のタイミングのズレ）はテンポとストローク種別で変化させる。
      // ・テンポが速いほど16分音符の枠が狭くなるので、スプレッドもそれに合わせて縮む
      //   （次の音符に食い込まないよう、16分音符幅に対する割合で計算する）。
      // ・アップストロークはダウンより手の動きが緩く、やや広がりが出る。
      // ・アクセント（強く弾く）は鋭くタイトになる。
      const secondsPerBeat = 60 / bpmRef.current;
      const secondsPer16th = secondsPerBeat / 4;

      const dirSpreadMultiplier = dir === "up" ? 1.25 : 1.0;
      const accentSpreadMultiplier = isAccent ? 0.7 : 1.0;

      const totalSpreadSec = secondsPer16th * 0.35 * dirSpreadMultiplier * accentSpreadMultiplier;
      const stringCount = stringFreqs.length;
      const rawPerStringDelay = stringCount > 1 ? totalSpreadSec / (stringCount - 1) : 0;
      const perStringDelaySec = Math.min(0.04, Math.max(0.004, rawPerStringDelay));

      const ticksPerSecond = (96 * bpmRef.current) / 60;
      stringFreqs.forEach((item, i) => {
        const delaySec = i * perStringDelaySec;
        const delayTicks = Math.round(delaySec * ticksPerSecond);
        playSingleStringScheduled(item.freq, time + delaySec, isAccent, item.midiNote, delayTicks);
      });
    },
    [playSingleStringScheduled]
  );

  const scheduler = useCallback(() => {
    const ctx = ensureAudioContext();
    const lookahead = 0.1;

    while (nextNoteTimeRef.current < ctx.currentTime + lookahead) {
      // カウントイン中は無音で4拍分だけ進め、コード/メロディは一切鳴らさない・録音もしない
      if (isCountingInRef.current) {
        const remaining = countInRemainingStepsRef.current;
        if (remaining % 4 === 0) {
          const beatsLeft = remaining / 4;
          setCountInBeatsLeft(beatsLeft);
          playCountInClick(nextNoteTimeRef.current, beatsLeft === 4);
        }

        const secondsPerBeatCountIn = 60.0 / bpmRef.current;
        const secondsPer16thCountIn = secondsPerBeatCountIn / 4.0;
        nextNoteTimeRef.current += secondsPer16thCountIn;
        countInRemainingStepsRef.current -= 1;

        if (countInRemainingStepsRef.current <= 0) {
          isCountingInRef.current = false;
          setIsCountingIn(false);
          isRecordingRef.current = true;
          setIsRecording(true);
          currentStepRef.current = 0;
          currentBarRef.current = 0;
          totalTickCounterRef.current = 0;
        }
        continue;
      }

      const strokePattern = STROKE_PATTERNS.find((p) => p.id === selectedPatternIdRef.current)!;
      const melodyPattern = melodyPatternsRef.current.find((p) => p.id === selectedMelodyPatternIdRef.current) || melodyPatternsRef.current[0];

      const step = currentStepRef.current;
      const bar = currentBarRef.current;
      const chord = progressionRef.current[bar];

      const strokeAction = strokePattern.actions[step];
      if (strokeAction && strokeAction.dir !== "none") {
        scheduleStroke(chord, strokeAction.dir, !!strokeAction.accent, nextNoteTimeRef.current);
      }

      if (melodyPattern.mask[step]) {
        const { freq, midiNote } = getAutoMelodyFreqAndNote(chord, paletteYRef.current, step, melodyPattern.mask);
        playMelodyScheduled(freq, nextNoteTimeRef.current, midiNote);
      }

      const s = step;
      const b = bar;
      setTimeout(() => {
        setCurrentStep(s);
        setCurrentBar(b);
      }, (nextNoteTimeRef.current - ctx.currentTime) * 1000);

      const secondsPerBeat = 60.0 / bpmRef.current;
      const secondsPer16th = secondsPerBeat / 4.0;

      nextNoteTimeRef.current += secondsPer16th;
      totalTickCounterRef.current += 24;

      currentStepRef.current++;
      if (currentStepRef.current >= 16) {
        currentStepRef.current = 0;
        currentBarRef.current = (currentBarRef.current + 1) % progressionRef.current.length;
      }
    }

    if (isPlayingRef.current) {
      timerIdRef.current = window.setTimeout(scheduler, 25);
    }
  }, [ensureAudioContext, scheduleStroke, getAutoMelodyFreqAndNote, playMelodyScheduled, playCountInClick]);

  // 再生・カウントイン・録音をすべて止めて無音の状態に戻す
  const stopAll = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    isCountingInRef.current = false;
    setIsCountingIn(false);
    isRecordingRef.current = false;
    setIsRecording(false);
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    setCurrentStep(-1);
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      stopAll();
      return;
    }

    // クリックのユーザージェスチャー内で同期的に resume を発火しておく（Safari対策）。
    // その上でawaitし、実際にrunning状態になってからスケジューラーを開始する。
    isPlayingRef.current = true;
    setIsPlaying(true);

    resumeAudioContext().then((ctx) => {
      // resume 待ちの間に停止ボタンが押されていたら再生開始をキャンセル
      if (!isPlayingRef.current) return;

      currentStepRef.current = 0;
      currentBarRef.current = 0;
      totalTickCounterRef.current = 0;
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      scheduler();
    });
  };

  // 「録音開始」: 再生中なら一旦音を止め、4カウント（無音＋クリック音）を置いてから
  // 設定したコード進行の1つ目（小節1・ステップ0）から録音つきで再生を始める。
  const startRecordingFlow = () => {
    // すでに何か鳴っていれば即座に止める
    isPlayingRef.current = false;
    isCountingInRef.current = false;
    isRecordingRef.current = false;
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    setIsRecording(false);
    setIsCountingIn(false);
    setCurrentStep(-1);
    setRecordedEvents([]);

    isPlayingRef.current = true;
    setIsPlaying(true);

    resumeAudioContext().then((ctx) => {
      if (!isPlayingRef.current) return;

      currentStepRef.current = 0;
      currentBarRef.current = 0;
      totalTickCounterRef.current = 0;
      countInRemainingStepsRef.current = 16; // 4拍分 = 16分音符16ステップ
      setCountInBeatsLeft(4);
      isCountingInRef.current = true;
      setIsCountingIn(true);
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      scheduler();
    });
  };

  const toggleRecording = () => {
    if (isRecording || isCountingIn) {
      stopAll();
    } else {
      startRecordingFlow();
    }
  };

  // Logic Pro 100% 動作保証 MIDIファイルダウンロード
  const downloadMidiFile = () => {
    if (recordedEvents.length === 0) {
      alert("録音データがありません。「録音開始」を押してフレーズを記録してください！");
      return;
    }

    const smfArray = buildLogicProPerfectSMF(recordedEvents, bpm);
    const arrayBuffer = smfArray.buffer.slice(smfArray.byteOffset, smfArray.byteOffset + smfArray.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "guitar-composition.mid";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleChordChange = (index: number, newChord: string) => {
    const next = [...progression];
    next[index] = newChord;
    setProgression(next);
  };

  const updatePaletteY = (clientY: number, rect: DOMRect) => {
    const y = clientY - rect.top;
    const ratio = 1.0 - Math.max(0, Math.min(1, y / rect.height));
    setPaletteY(ratio);
  };

  const hasAnyFilterOn = allowPassingTones || allowOnlyShortNotes;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 select-none">
      {/* 常に画面上部に固定される操作バー */}
      <div className="sticky top-0 z-30 bg-stone-950/95 backdrop-blur border-b border-stone-800 px-4 sm:px-6 py-3">
        <div className="w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-amber-400 shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold tracking-wide">ギター作曲アシスタント</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* 再生/停止ボタン */}
            <button
              onClick={togglePlay}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-colors shadow-lg ${
                isPlaying
                  ? "bg-rose-500 hover:bg-rose-400 text-white"
                  : "bg-amber-500 hover:bg-amber-400 text-stone-950"
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  <span>停止</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>再生</span>
                </>
              )}
            </button>

            {/* 録音ボタン */}
            <button
              onClick={toggleRecording}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                isRecording
                  ? "bg-rose-600 text-white animate-pulse shadow-rose-900/50"
                  : isCountingIn
                  ? "bg-amber-600 text-white animate-pulse shadow-amber-900/50"
                  : "bg-stone-800 border border-stone-700 text-rose-400 hover:bg-stone-700"
              }`}
            >
              <Disc className="w-4 h-4" />
              <span>
                {isRecording
                  ? "録音中 (停止)"
                  : isCountingIn
                  ? `カウント中… ${countInBeatsLeft}`
                  : "録音開始"}
              </span>
            </button>

            {/* MIDIダウンロードボタン */}
            <button
              onClick={downloadMidiFile}
              disabled={recordedEvents.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs border border-emerald-500/50 text-emerald-300 bg-emerald-950/30 hover:bg-emerald-900/50 disabled:opacity-40 disabled:border-stone-800 transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>MIDI出力</span>
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* コントロールパネル */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-900 border border-stone-800 p-4 rounded-2xl">
          <div className="flex items-center gap-4">
            <Sliders className="w-5 h-5 text-stone-400" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>TEMPO (BPM)</span>
                <span className="text-amber-400 font-mono">{bpm}</span>
              </div>
              <input
                type="range"
                min="60"
                max="180"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Repeat className="w-5 h-5 text-stone-400" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>KEY / 移調</span>
                <span className="text-amber-400 font-mono">
                  {KEY_OFFSET_NAMES[keyOffset]} (Key +{keyOffset})
                </span>
              </div>
              <select
                value={keyOffset}
                onChange={(e) => setKeyOffset(parseInt(e.target.value, 10))}
                className="w-full bg-stone-800 border border-stone-700 text-xs font-bold py-1.5 px-3 rounded-lg text-amber-300 outline-none"
              >
                {KEY_OFFSET_NAMES.map((name, i) => (
                  <option key={i} value={i}>
                    Key {name} {i === 0 ? "(原曲キー C)" : `(+${i} Capo)`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* STEP 1: ストローク */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 tracking-wider">
            STEP 1: ギターバッキングのリズムを選択
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {STROKE_PATTERNS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPatternId(p.id)}
                className={`p-2.5 rounded-xl text-left border transition-all ${
                  selectedPatternId === p.id
                    ? "bg-amber-500/10 border-amber-500 text-amber-300"
                    : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                }`}
              >
                <div className="text-xs font-bold">{p.name}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => setStrokeQuantizeMode(false)}
              className={`p-2.5 rounded-xl text-left border transition-all ${
                !strokeQuantizeMode
                  ? "bg-amber-500/10 border-amber-500 text-amber-300"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
            >
              <div className="text-xs font-bold">🎸 生ストローク (MIDIに時間差を記録)</div>
              <div className="text-[10px] text-stone-400 font-normal">弦ごとのタイミングのズレをそのまま記録。ギターらしい質感。</div>
            </button>
            <button
              onClick={() => setStrokeQuantizeMode(true)}
              className={`p-2.5 rounded-xl text-left border transition-all ${
                strokeQuantizeMode
                  ? "bg-amber-500/10 border-amber-500 text-amber-300"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
            >
              <div className="text-xs font-bold">📐 クオンタイズ (全弦を同時刻に記録)</div>
              <div className="text-[10px] text-stone-400 font-normal">ストロークの全弦を1拍に揃えて記録。打ち込み向け。</div>
            </button>
          </div>
        </div>

        {/* STEP 2: コード進行 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-400 tracking-wider">
            STEP 2: コード進行を作成（4小節）
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {progression.map((chord, barIdx) => (
              <div
                key={barIdx}
                className={`p-3 rounded-2xl border transition-all ${
                  isPlaying && currentBar === barIdx
                    ? "bg-stone-800 border-amber-400 shadow-md ring-1 ring-amber-400"
                    : "bg-stone-900 border-stone-800"
                }`}
              >
                <div className="text-[10px] font-mono text-stone-500 mb-1">小節 {barIdx + 1}</div>
                <select
                  value={chord}
                  onChange={(e) => handleChordChange(barIdx, e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 text-base font-bold py-2 px-2 rounded-xl text-amber-400 outline-none"
                >
                  {DIATONIC_CHORDS.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* STEP 3: メロディリズム */}
        <div className="space-y-3 bg-stone-900/60 border border-stone-800 p-4 rounded-2xl">
          <label className="text-xs font-bold text-stone-400 tracking-wider">
            STEP 3: メロディのリズムを選択 (またはランダム生成)
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {melodyPatterns.map((mp) => (
              <button
                key={mp.id}
                onClick={() => setSelectedMelodyPatternId(mp.id)}
                className={`p-2 rounded-xl text-center border text-xs font-bold transition-all ${
                  selectedMelodyPatternId === mp.id
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                    : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                }`}
              >
                {mp.name}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex-1 w-full">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-stone-400">ランダム音数・密度パラメータ</span>
                <span className="text-emerald-400 font-mono">{noteDensity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={noteDensity}
                onChange={(e) => setNoteDensity(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500"
              />
            </div>

            <button
              onClick={generateRandomMelodyPattern}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold px-5 py-2.5 rounded-xl shadow-md transition-colors text-xs whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4" />
              🎲 ランダムリズム生成
            </button>
          </div>
        </div>

        {/* STEP 4: 理論フィルター & 特大パレット */}
        <div className="space-y-4 bg-stone-900/80 border border-stone-800 p-4 rounded-2xl">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
            <Sparkles className="w-4 h-4" /> STEP 4: メロディ音階フィルター & 特大パレット
          </div>

          <div className="bg-stone-950 border border-stone-800 p-3 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1 text-stone-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> メロディ制限ルール
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                {!hasAnyFilterOn ? "★現在: 完全コード構成音のみモード" : "★現在: 経過音解禁モード"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setAllowPassingTones(!allowPassingTones)}
                className={`p-2.5 rounded-xl border font-bold text-left transition-all flex items-center justify-between ${
                  allowPassingTones
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow"
                    : "bg-stone-900 border-stone-800 text-stone-500"
                }`}
              >
                <div>
                  <div>① 経過音(お隣の音)のみ許可</div>
                  <div className="text-[10px] text-stone-400 font-normal">構成音と隣り合うスケール音を解禁</div>
                </div>
                <span className="font-mono text-sm">{allowPassingTones ? "ON" : "OFF"}</span>
              </button>

              <button
                onClick={() => setAllowOnlyShortNotes(!allowOnlyShortNotes)}
                className={`p-2.5 rounded-xl border font-bold text-left transition-all flex items-center justify-between ${
                  allowOnlyShortNotes
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow"
                    : "bg-stone-900 border-stone-800 text-stone-500"
                }`}
              >
                <div>
                  <div>② 短音(8分音符以下)のみ許可</div>
                  <div className="text-[10px] text-stone-400 font-normal">伸ばす長音は構成音に自動固定</div>
                </div>
                <span className="font-mono text-sm">{allowOnlyShortNotes ? "ON" : "OFF"}</span>
              </button>

              {hasAnyFilterOn && (
                <button
                  onClick={() => setForceChordToneOnChordChange(!forceChordToneOnChordChange)}
                  className={`p-2.5 rounded-xl border font-bold text-left transition-all flex items-center justify-between sm:col-span-2 ${
                    forceChordToneOnChordChange
                      ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow"
                      : "bg-stone-900 border-stone-800 text-stone-500"
                  }`}
                >
                  <div>
                    <div>③ コード変更のタイミング(1拍目)は構成音固定</div>
                    <div className="text-[10px] text-stone-400 font-normal">小節頭の1音目をコード構成音にして抜群の安定感をプラス</div>
                  </div>
                  <span className="font-mono text-sm">{forceChordToneOnChordChange ? "ON" : "OFF"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 4倍特大メロディパレット */}
          <div className="flex flex-col sm:flex-row items-stretch gap-6 justify-center pt-2">
            <div
              className="w-[224px] h-[360px] bg-gradient-to-t from-stone-900 via-emerald-950/60 to-stone-900 border-2 border-emerald-500/80 rounded-3xl relative overflow-hidden touch-none cursor-ns-resize shadow-2xl flex flex-col justify-between p-3 select-none"
              onMouseMove={(e) => {
                if (e.buttons === 1) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  updatePaletteY(e.clientY, rect);
                }
              }}
              onTouchMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                updatePaletteY(e.touches[0].clientY, rect);
              }}
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                updatePaletteY(e.clientY, rect);
              }}
            >
              <div className="absolute inset-0 grid grid-rows-12 pointer-events-none opacity-25">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="border-b border-emerald-300 w-full" />
                ))}
              </div>

              <div className="text-xs text-emerald-400 font-mono font-bold text-center pointer-events-none z-10">
                ▲ 高音域 (キーボード ↑)
              </div>

              <div
                className="absolute left-0 right-0 h-3 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,1.0)] pointer-events-none z-10"
                style={{ bottom: `${paletteY * 100}%` }}
              />

              <div className="text-[11px] text-stone-300 font-bold text-center pointer-events-none z-10 bg-stone-950/80 py-1 px-2 rounded-xl backdrop-blur-sm border border-emerald-500/30">
                特大メロディパレット<br />
                <span className="text-[10px] text-emerald-300 font-mono">
                  音高: {Math.round(paletteY * 100)}%
                </span>
              </div>

              <div className="text-xs text-emerald-400 font-mono font-bold text-center pointer-events-none z-10">
                ▼ 低音域 (キーボード ↓)
              </div>
            </div>

            <div className="flex flex-col gap-6 justify-center items-center sm:items-stretch">
              <div className="text-xs text-stone-300 space-y-2 text-center sm:text-left">
                <div className="font-bold text-emerald-400 text-sm">操作ガイド</div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  ・画面上部の「録音開始」を押すと、今鳴っている音は一旦止まり、4カウント（クリック音）の後に小節1・1つ目のコードから録音つきで再生が始まります。<br />
                  ・録音・再生・MIDI出力ボタンは画面をスクロールしても常に上部に表示されています。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 16ステップ可視化メーター */}
        <div className="bg-stone-900/60 border border-stone-800 p-4 rounded-2xl space-y-2">
          <div className="text-xs font-bold text-stone-400">16ステップ演奏進行（ギター↓↑ / メロディ★）</div>
          <div className="grid grid-cols-16 gap-1">
            {Array.from({ length: 16 }).map((_, i) => {
              const strokeAction = STROKE_PATTERNS.find((p) => p.id === selectedPatternId)?.actions[i];
              const currentMelodyPattern = melodyPatterns.find((p) => p.id === selectedMelodyPatternId) || melodyPatterns[0];
              const isMelody = currentMelodyPattern?.mask[i];

              return (
                <div
                  key={i}
                  className={`h-12 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-all ${
                    isPlaying && currentStep === i
                      ? "bg-amber-400 text-stone-950 font-bold scale-105"
                      : "bg-stone-900 border border-stone-800"
                  }`}
                >
                  <span className={strokeAction?.dir === "down" ? "text-amber-300" : "text-emerald-300"}>
                    {strokeAction?.dir === "down" ? "↓" : strokeAction?.dir === "up" ? "↑" : "・"}
                  </span>
                  <span className="text-[8px] font-bold text-rose-400">{isMelody ? "★" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}