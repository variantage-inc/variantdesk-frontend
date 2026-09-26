/* Recording a sentence, and handing back something Gemini will accept.

   The browser's own recorder produces WebM with Opus inside it on Chrome and
   MP4 on Safari, and Gemini's documented audio formats are WAV, MP3, AIFF,
   AAC, OGG and FLAC. WebM is not among them. So the clip is recorded however
   the browser likes, decoded once when recording stops, and re-encoded as
   plain WAV before it is sent.

   Decoding after the fact rather than tapping the live audio is deliberate:
   real time processing means an AudioWorklet, a second file, and samples that
   can be dropped while the main thread is busy. `decodeAudioData` runs once,
   handles whatever the browser recorded, and cannot drop anything.

   16 kHz mono, which is what speech recognition wants and nothing more. A
   thirty second clip is under a megabyte, so nobody on a phone in a van is
   waiting on an upload. */

/* Speech lives well below 8 kHz, so 16 kHz captures all of it. Anything higher
   is a bigger upload for no extra accuracy. */
const SAMPLE_RATE = 16_000;

export type Recording = { blob: Blob; seconds: number };

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private liveContext: AudioContext | null = null;
  private startedAt = 0;

  /* Levels for the meter, 0 to 1, one per bar. Read by the screen on an
     animation frame rather than pushed, so nothing renders when nobody is
     looking at it. */
  levels(bars: number): number[] {
    if (!this.analyser) return new Array(bars).fill(0);

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);

    const perBar = Math.floor(data.length / bars) || 1;
    return Array.from({ length: bars }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < perBar; j += 1) sum += data[i * perBar + j] ?? 0;
      return Math.min(1, sum / perBar / 180);
    });
  }

  get seconds(): number {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  async start(): Promise<void> {
    /* This is what raises the browser's own microphone prompt. It is called
       only when somebody presses the button, never on page load, which is what
       the screen promises: nothing is recorded until you press. */
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    this.liveContext = new AudioContext();
    this.analyser = this.liveContext.createAnalyser();
    this.analyser.fftSize = 128;
    this.liveContext.createMediaStreamSource(this.stream).connect(this.analyser);

    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.startedAt = Date.now();
  }

  /* Stops, releases the microphone, and returns the clip as WAV. */
  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder) throw new Error('Not recording.');

    const seconds = this.seconds;

    const recorded = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      recorder.stop();
    });

    this.release();

    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await recorded.arrayBuffer());
      return { blob: toWav(downmix(decoded)), seconds };
    } finally {
      void context.close();
    }
  }

  /* The microphone light goes out the moment recording ends, whether it ended
     because somebody pressed stop, hit the time limit, or left the page. */
  release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.analyser = null;
    void this.liveContext?.close();
    this.liveContext = null;
    this.startedAt = 0;
  }
}

/* Every channel averaged into one, resampled to 16 kHz.

   Averaging rather than taking the nearest sample: a plain nearest-neighbour
   resample of 48 kHz down to 16 kHz throws away two samples in three and
   aliases the discarded energy back into the audible range, which sounds like
   a lisp on exactly the consonants that tell "fifty" from "fifteen". */
function downmix(buffer: AudioBuffer): Float32Array {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );

  const ratio = buffer.sampleRate / SAMPLE_RATE;
  const length = Math.floor(buffer.length / ratio);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const from = Math.floor(i * ratio);
    const to = Math.min(buffer.length, Math.floor((i + 1) * ratio));

    let sum = 0;
    let count = 0;
    for (let s = from; s < to; s += 1) {
      for (const channel of channels) {
        sum += channel[s] ?? 0;
        count += 1;
      }
    }
    out[i] = count ? sum / count : 0;
  }

  return out;
}

/* 16 bit PCM in a WAV wrapper. Forty four bytes of header and the samples. */
function toWav(samples: Float32Array): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);

  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(at + i, value.charCodeAt(i));
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // the size of this chunk
  view.setUint16(20, 1, true); // 1 is uncompressed PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    /* Clamped before scaling: a sample past 1.0 would wrap round to a loud
       crack at the other end of the range rather than simply clipping. */
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([bytes], { type: 'audio/wav' });
}

/* Whether this browser can do it at all, asked before the button is offered
   rather than after somebody has pressed it. */
export const canRecord = (): boolean =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined';
