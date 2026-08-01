import { Injectable } from '@angular/core';

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
  private chunks: Float32Array[] = [];
  private inputRate = 16000;

  private static readonly TARGET_RATE = 16000;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: RecorderService.TARGET_RATE });
    this.inputRate = this.audioContext.sampleRate;

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.chunks = [];

    this.processor.onaudioprocess = (event) => {
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };

    // Route through a muted gain so onaudioprocess fires without echoing the mic.
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  async stop(): Promise<Blob> {
    this.processor?.disconnect();
    this.silentGain?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());

    const rate = this.inputRate;
    await this.audioContext?.close();
    this.audioContext = null;

    const merged = this.merge(this.chunks);
    const downsampled = this.downsample(merged, rate, RecorderService.TARGET_RATE);
    this.chunks = [];

    return new Blob([this.encodeWav(downsampled, RecorderService.TARGET_RATE)], {
      type: 'audio/wav',
    });
  }

  private merge(chunks: Float32Array[]): Float32Array {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
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

  private encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
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
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }

    return buffer;
  }
}
