import type { MicHardwareStatus } from '../types/dialer';

const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

class DialerAudioController {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private ringInterval: number | null = null;
  private isLocked = true;

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!this.audioCtx) {
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public async requestMicrophone(): Promise<{
    status: MicHardwareStatus;
    deviceLabel: string;
  }> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      return { status: 'unavailable', deviceLabel: 'Виртуальный модуль блокировки' };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      });

      this.stopMicrophone();
      this.micStream = stream;

      const audioTracks = stream.getAudioTracks();
      const label = audioTracks[0]?.label || 'Системный микрофон';

      // Apply current lock state immediately upon acquisition
      for (const track of audioTracks) {
        track.enabled = !this.isLocked;
      }

      const ctx = this.ensureAudioContext();
      if (ctx) {
        this.micSource = ctx.createMediaStreamSource(stream);
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.micSource.connect(this.analyser);
        this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      }

      return { status: 'granted', deviceLabel: label };
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { status: 'denied', deviceLabel: 'Доступ запрещён браузером' };
      }
      return { status: 'unavailable', deviceLabel: 'Аппаратный микрофон не найден' };
    }
  }

  public setHardwareMicLocked(locked: boolean): void {
    this.isLocked = locked;
    if (!this.micStream) return;
    for (const track of this.micStream.getAudioTracks()) {
      track.enabled = !locked;
    }
  }

  public getHardwareTrackLocked(): boolean | null {
    if (!this.micStream) return null;
    const tracks = this.micStream.getAudioTracks();
    if (tracks.length === 0) return null;
    return tracks.every((t) => !t.enabled);
  }

  public getMicInputLevel(): number {
    if (this.isLocked || !this.analyser || !this.dataArray) {
      return 0;
    }
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i += 1) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    return Math.min(100, Math.round(rms * 280));
  }

  public stopMicrophone(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // ignore
      }
      this.micSource = null;
    }
    this.analyser = null;
    this.dataArray = null;
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
  }

  public async playDtmfSequence(phone: string): Promise<void> {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const digits = phone.replace(/[^0-9*#]/g, '').slice(-10);
    for (let i = 0; i < digits.length; i += 1) {
      const pair = DTMF_FREQS[digits[i]];
      if (!pair) continue;
      const startTime = ctx.currentTime + i * 0.085;
      const duration = 0.06;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.setValueAtTime(pair[0], startTime);
      osc2.frequency.setValueAtTime(pair[1], startTime);
      gain.gain.setValueAtTime(0.04, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration);
      osc2.stop(startTime + duration);
    }
  }

  public startRingbackTone(): void {
    this.stopRingbackTone();
    const playBurst = () => {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, now);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.setValueAtTime(0.035, now + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.75);
    };

    playBurst();
    this.ringInterval = window.setInterval(playBurst, 2200);
  }

  public stopRingbackTone(): void {
    if (this.ringInterval !== null) {
      window.clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }
}

export const audioController = new DialerAudioController();
