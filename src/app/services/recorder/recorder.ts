import { Injectable } from '@angular/core';

export interface RecorderOptions {
  /**
   * Called with each block of 16 kHz mono 16-bit PCM as it is captured.
   *
   * Live assessment needs the audio *while* the child is reading, and the
   * server still needs the whole recording afterwards to score it properly.
   * Rather than opening the microphone twice — which browsers refuse, or
   * resolve by handing one of the two a dead stream — one capture feeds both:
   * the callback streams, and the same samples are kept for the WAV.
   */
  onChunk?: (pcm: Int16Array) => void;
}

/**
 * Records microphone audio and produces a 16 kHz mono 16-bit PCM WAV Blob,
 * which is the format Azure Speech pronunciation assessment expects.
 */
@Injectable({ providedIn: 'root' })
export class RecorderService {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Int16Array[] = [];
  private inputRate = 16000;

  private static readonly TARGET_RATE = 16000;

  /** Whether a recording is in progress — the guard against double-starting. */
  get recording(): boolean {
    return this.audioContext !== null;
  }

  async start(options: RecorderOptions = {}): Promise<void> {
    if (this.recording) {
      // Starting twice would leak the first stream and leave the microphone on.
      await this.stop();
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: RecorderService.TARGET_RATE });
    this.inputRate = this.audioContext.sampleRate;

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.chunks = [];

    this.processor.onaudioprocess = (event) => {
      // Downsample and quantise here rather than at stop(), so the same bytes
      // can go straight out to the live recogniser.
      const float = this.downsample(
        event.inputBuffer.getChannelData(0),
        this.inputRate,
        RecorderService.TARGET_RATE,
      );
      const pcm = this.toPcm16(float);
      this.chunks.push(pcm);

      if (options.onChunk) {
        // A listener that throws must not kill the recording — the WAV is
        // still worth having even if the live stream has gone.
        try {
          options.onChunk(pcm);
        } catch {
          /* the live stream is best-effort */
        }
      }
    };

    // Route through a muted gain so onaudioprocess fires without echoing the mic.
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  async stop(): Promise<Blob> {
    if (this.processor) {
      this.processor.onaudioprocess = null;
    }
    this.processor?.disconnect();
    this.silentGain?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());

    await this.audioContext?.close();
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this.silentGain = null;
    this.stream = null;

    const merged = this.merge(this.chunks);
    this.chunks = [];

    return new Blob([this.encodeWav(merged, RecorderService.TARGET_RATE)], {
      type: 'audio/wav',
    });
  }

  private merge(chunks: Int16Array[]): Int16Array {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Int16Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private toPcm16(samples: Float32Array): Int16Array {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return pcm;
  }

  private downsample(buffer: Float32Array, inputRate: number, targetRate: number): Float32Array {
    if (inputRate === targetRate) {
      return buffer;
    }
    const ratio = inputRate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let position = 0;
    for (let i = 0; i < newLength; i++) {
      const nextPosition = Math.round((i + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let j = position; j < nextPosition && j < buffer.length; j++) {
        sum += buffer[j];
        count++;
      }
      result[i] = count ? sum / count : 0;
      position = nextPosition;
    }
    return result;
  }

  private encodeWav(samples: Int16Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(offset, samples[i], true);
      offset += 2;
    }

    return buffer;
  }
}
