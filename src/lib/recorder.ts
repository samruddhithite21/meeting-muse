// Captures audio from the user's mic + (optionally) shared tab/screen audio,
// records it as one continuous WebM stream while also emitting fixed-size
// chunks for streaming transcription. Works in modern Chromium browsers.

export interface RecorderOptions {
  chunkMs?: number; // size of each emitted chunk for streaming transcription
  onChunk?: (chunk: Blob, chunkStartMs: number, chunkEndMs: number) => void;
  onError?: (err: Error) => void;
}

export interface RecorderHandles {
  audioStream: MediaStream;
  displayStream: MediaStream | null;
  videoEl: HTMLVideoElement | null;
  stop: () => Promise<{ fullBlob: Blob; durationMs: number; mimeType: string }>;
  startedAt: number;
}

function pickMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

export async function startMeetingCapture(opts: RecorderOptions = {}): Promise<RecorderHandles> {
  const chunkMs = opts.chunkMs ?? 6000;

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  // Optional: ask user to share a tab/window WITH audio (Zoom/Meet/Teams in a tab)
  let displayStream: MediaStream | null = null;
  let videoEl: HTMLVideoElement | null = null;
  try {
    displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
      audio: true,
      video: { frameRate: 4 },
    });
    if (displayStream && displayStream.getVideoTracks().length > 0) {
      videoEl = document.createElement("video");
      videoEl.srcObject = displayStream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play().catch(() => {});
    }
  } catch {
    // User declined or browser doesn't support; mic-only is fine.
  }

  // Mix mic + tab audio into a single stream for recording
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  audioCtx.createMediaStreamSource(micStream).connect(dest);
  if (displayStream && displayStream.getAudioTracks().length > 0) {
    audioCtx.createMediaStreamSource(displayStream).connect(dest);
  }
  const mixed = dest.stream;

  const mimeType = pickMime();
  const fullChunks: Blob[] = [];
  const startedAt = Date.now();

  // Full recorder (continuous, used for replay later)
  const fullRec = new MediaRecorder(mixed, { mimeType });
  fullRec.ondataavailable = (e) => { if (e.data && e.data.size > 0) fullChunks.push(e.data); };
  fullRec.onerror = (e: any) => opts.onError?.(new Error(e?.error?.message ?? "recorder error"));
  fullRec.start();

  // Chunked recorder (separate, restarts every chunkMs to produce self-contained webm files)
  let chunkRec: MediaRecorder | null = null;
  let chunkStart = 0;
  function startChunkRecorder() {
    chunkStart = Date.now() - startedAt;
    const r = new MediaRecorder(mixed, { mimeType });
    const parts: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data && e.data.size > 0) parts.push(e.data); };
    r.onstop = () => {
      const end = Date.now() - startedAt;
      if (parts.length) {
        const b = new Blob(parts, { type: mimeType });
        opts.onChunk?.(b, chunkStart, end);
      }
    };
    r.start();
    chunkRec = r;
    setTimeout(() => {
      if (chunkRec === r && r.state !== "inactive") {
        r.stop();
        startChunkRecorder();
      }
    }, chunkMs);
  }
  startChunkRecorder();

  async function stop(): Promise<{ fullBlob: Blob; durationMs: number; mimeType: string }> {
    return new Promise((resolve) => {
      const finalize = () => {
        const blob = new Blob(fullChunks, { type: mimeType });
        const durationMs = Date.now() - startedAt;
        try { mixed.getTracks().forEach((t) => t.stop()); } catch {}
        try { micStream.getTracks().forEach((t) => t.stop()); } catch {}
        try { displayStream?.getTracks().forEach((t) => t.stop()); } catch {}
        try { audioCtx.close(); } catch {}
        resolve({ fullBlob: blob, durationMs, mimeType });
      };
      if (chunkRec && chunkRec.state !== "inactive") {
        chunkRec.onstop = () => {
          if (fullRec.state !== "inactive") {
            fullRec.onstop = finalize;
            fullRec.stop();
          } else finalize();
        };
        chunkRec.stop();
      } else if (fullRec.state !== "inactive") {
        fullRec.onstop = finalize;
        fullRec.stop();
      } else {
        finalize();
      }
    });
  }

  return { audioStream: mixed, displayStream, videoEl, stop, startedAt };
}

/**
 * Captures a frame from a video element to a JPEG blob.
 * Returns a downscaled image (max width 960) and a perceptual hash for diffing.
 */
export async function captureFrame(video: HTMLVideoElement, maxW = 960): Promise<{ blob: Blob; phash: string } | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const ratio = Math.min(1, maxW / video.videoWidth);
  const w = Math.round(video.videoWidth * ratio);
  const h = Math.round(video.videoHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, w, h);

  // Perceptual hash: 16x16 grayscale, threshold against mean
  const small = document.createElement("canvas");
  small.width = 16; small.height = 16;
  small.getContext("2d")!.drawImage(canvas, 0, 0, 16, 16);
  const pix = small.getContext("2d")!.getImageData(0, 0, 16, 16).data;
  const grays: number[] = [];
  for (let i = 0; i < pix.length; i += 4) {
    grays.push(0.299 * pix[i] + 0.587 * pix[i + 1] + 0.114 * pix[i + 2]);
  }
  const mean = grays.reduce((a, b) => a + b, 0) / grays.length;
  let hash = "";
  for (let i = 0; i < grays.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) nibble = (nibble << 1) | (grays[i + j] > mean ? 1 : 0);
    hash += nibble.toString(16);
  }

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.78));
  if (!blob) return null;
  return { blob, phash: hash };
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) * 4;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += (x.toString(2).match(/1/g) ?? []).length;
  }
  return d;
}
