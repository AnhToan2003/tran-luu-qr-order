// Web Audio API Sound Synthesizer & Vietnamese Voice Notification System
// Specially engineered for high-noise sports halls, counter environments, and mobile/tablet speakers

export type RingtoneStyle = 'sound1' | 'sound2' | 'sound3' | 'sound4';

class SoundManager {
  private ctx: AudioContext | null = null;
  private isSoundEnabled: boolean = true;
  private masterVolume: number = 1.0;
  private isVoiceEnabled: boolean = true;
  private ringtoneStyle: RingtoneStyle = 'sound1';
  private viVoice: SpeechSynthesisVoice | null = null;
  private currentVoiceAudio: HTMLAudioElement | null = null;

  // Pending alert loop state
  private alertTimer: any = null;
  private voiceTimeoutId: any = null;
  private isAlerting: boolean = false;
  private pendingOrdersList: Array<{ id: string; courtId?: string; courtName?: string }> = [];
  private alertIndex: number = 0;

  constructor() {
    this.isSoundEnabled = true;
    try {
      const savedVol = localStorage.getItem('admin_sound_volume');
      if (savedVol !== null) {
        this.masterVolume = parseFloat(savedVol);
      }
      const savedVoice = localStorage.getItem('admin_voice_active');
      if (savedVoice !== null) {
        this.isVoiceEnabled = savedVoice === 'true';
      }
      let savedRingtone = localStorage.getItem('admin_ringtone_style');
      if (savedRingtone === 'shopee') savedRingtone = 'sound1';
      if (savedRingtone === 'dingdong') savedRingtone = 'sound2';
      if (savedRingtone === 'urgent') savedRingtone = 'sound3';
      if (savedRingtone === 'bell') savedRingtone = 'sound4';
      if (savedRingtone && ['sound1', 'sound2', 'sound3', 'sound4'].includes(savedRingtone)) {
        this.ringtoneStyle = savedRingtone as RingtoneStyle;
      } else {
        this.ringtoneStyle = 'sound1';
      }
    } catch {
      this.masterVolume = 1.0;
      this.isVoiceEnabled = true;
      this.ringtoneStyle = 'sound1';
    }

    this.initVoiceEngine();

    if (typeof window !== 'undefined') {
      const autoUnlock = () => {
        this.enableSound();
        window.removeEventListener('click', autoUnlock);
        window.removeEventListener('keydown', autoUnlock);
        window.removeEventListener('touchstart', autoUnlock);
        window.removeEventListener('pointerdown', autoUnlock);
      };
      window.addEventListener('click', autoUnlock, { once: true, passive: true });
      window.addEventListener('keydown', autoUnlock, { once: true, passive: true });
      window.addEventListener('touchstart', autoUnlock, { once: true, passive: true });
      window.addEventListener('pointerdown', autoUnlock, { once: true, passive: true });
    }
  }

  private initVoiceEngine() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const findVi = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        // Only accept REAL Vietnamese voices - NEVER use foreign voices to read Vietnamese!
        this.viVoice =
          voices.find(v => v.lang === 'vi-VN' || v.lang === 'vi_VN') ||
          voices.find(v => v.lang.toLowerCase().startsWith('vi')) ||
          voices.find(v => v.name.toLowerCase().includes('vietnam') || v.name.toLowerCase().includes('tiếng việt')) ||
          null;
      } catch {
        this.viVoice = null;
      }
    };

    findVi();
    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = findVi;
    }
  }

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public enableSound(): boolean {
    try {
      const ctx = this.getContext();
      this.isSoundEnabled = true;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      return ctx.state === 'running';
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
      return false;
    }
  }

  public isEnabled(): boolean {
    return this.isSoundEnabled;
  }

  public setVolume(vol: number) {
    this.masterVolume = Math.max(0.2, Math.min(1.0, vol));
    try {
      localStorage.setItem('admin_sound_volume', String(this.masterVolume));
    } catch {}
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public setVoiceEnabled(enabled: boolean) {
    this.isVoiceEnabled = enabled;
    try {
      localStorage.setItem('admin_voice_active', String(enabled));
    } catch {}
  }

  public isVoiceActive(): boolean {
    return this.isVoiceEnabled;
  }

  public setRingtone(style: RingtoneStyle) {
    this.ringtoneStyle = style;
    try {
      localStorage.setItem('admin_ringtone_style', style);
    } catch {}
  }

  public getRingtone(): RingtoneStyle {
    return this.ringtoneStyle;
  }

  /**
   * Sound 1 Note: Marimba / FM Pluck
   * Upbeat, bubbly, juicy pop-pluck attack with warm sustain and bright sparkle (Shopee/Grab style)
   */
  private strikeMarimba(
    ctx: AudioContext,
    destination: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    gainMultiplier: number = 1.0
  ) {
    const vol = this.masterVolume * gainMultiplier;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.35, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq, startTime + 0.035);
    gain.gain.setValueAtTime(0.95 * vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(startTime);
    osc.stop(startTime + duration);

    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2.0, startTime);
    overtoneGain.gain.setValueAtTime(0.55 * vol, startTime);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.55);
    overtone.connect(overtoneGain);
    overtoneGain.connect(destination);
    overtone.start(startTime);
    overtone.stop(startTime + duration * 0.55);

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'sine';
    click.frequency.setValueAtTime(freq * 3.5, startTime);
    clickGain.gain.setValueAtTime(0.35 * vol, startTime);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.04);
    click.connect(clickGain);
    clickGain.connect(destination);
    click.start(startTime);
    click.stop(startTime + 0.04);
  }

  /**
   * Sound 2 Note: Resonant Tubular Chime (Ding-Dong)
   */
  private strikeTubular(
    ctx: AudioContext,
    destination: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    gainMultiplier: number = 1.0
  ) {
    const vol = this.masterVolume * gainMultiplier;

    const bodyA = ctx.createOscillator();
    const gainA = ctx.createGain();
    bodyA.type = 'sine';
    bodyA.frequency.setValueAtTime(freq, startTime);
    gainA.gain.setValueAtTime(0.90 * vol, startTime);
    gainA.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    bodyA.connect(gainA);
    gainA.connect(destination);
    bodyA.start(startTime);
    bodyA.stop(startTime + duration);

    const bodyB = ctx.createOscillator();
    const gainB = ctx.createGain();
    bodyB.type = 'sine';
    bodyB.frequency.setValueAtTime(freq + 4.0, startTime);
    gainB.gain.setValueAtTime(0.80 * vol, startTime);
    gainB.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    bodyB.connect(gainB);
    gainB.connect(destination);
    bodyB.start(startTime);
    bodyB.stop(startTime + duration);

    const octave = ctx.createOscillator();
    const octGain = ctx.createGain();
    octave.type = 'triangle';
    octave.frequency.setValueAtTime(freq * 2.0, startTime);
    octGain.gain.setValueAtTime(0.60 * vol, startTime);
    octGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);
    octave.connect(octGain);
    octGain.connect(destination);
    octave.start(startTime);
    octave.stop(startTime + duration * 0.7);
  }

  /**
   * Sound 4 Note: Metallic Brass Counter Bell
   */
  private strikeBrass(
    ctx: AudioContext,
    destination: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    gainMultiplier: number = 1.0
  ) {
    const vol = this.masterVolume * gainMultiplier;

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(freq * 3.2, startTime);
    clickGain.gain.setValueAtTime(0.70 * vol, startTime);
    clickGain.gain.exponentialRampToValueAtTime(0.0005, startTime + 0.045);
    click.connect(clickGain);
    clickGain.connect(destination);
    click.start(startTime);
    click.stop(startTime + 0.045);

    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(freq, startTime);
    bodyGain.gain.setValueAtTime(0.95 * vol, startTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.0003, startTime + duration);
    body.connect(bodyGain);
    bodyGain.connect(destination);
    body.start(startTime);
    body.stop(startTime + duration);

    const overtone = ctx.createOscillator();
    const ovGain = ctx.createGain();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2.0, startTime);
    ovGain.gain.setValueAtTime(0.70 * vol, startTime);
    ovGain.gain.exponentialRampToValueAtTime(0.0005, startTime + duration * 0.75);
    overtone.connect(ovGain);
    ovGain.connect(destination);
    overtone.start(startTime);
    overtone.stop(startTime + duration * 0.75);
  }

  /**
   * Native Vietnamese Person Voice Audio Player
   * Plays authentic, crystal-clear, high-volume Vietnamese speech recorded from native Vietnamese audio.
   * Completely avoids robotic English accents from foreign system voices.
   */
  public playVietnameseVoiceNotice(
    courtId?: string,
    courtName?: string,
    onEnded?: () => void
  ) {
    try {
      if (this.currentVoiceAudio) {
        this.currentVoiceAudio.pause();
        this.currentVoiceAudio.currentTime = 0;
        this.currentVoiceAudio = null;
      }

      let audioPath = '/audio/order-notice.mp3';
      let courtNum = '';
      if (courtName) {
        const m = String(courtName).match(/\d+/);
        if (m) courtNum = m[0];
      }
      if (!courtNum && courtId) {
        const m = String(courtId).match(/\d+/);
        if (m) courtNum = m[0];
      }

      if (courtNum) {
        const num = parseInt(courtNum, 10);
        if (num >= 1 && num <= 16) {
          const padded = String(num).padStart(2, '0');
          audioPath = `/audio/court-${padded}.mp3`;
        }
      }

      let hasFinished = false;
      const finish = () => {
        if (hasFinished) return;
        hasFinished = true;
        this.currentVoiceAudio = null;
        if (onEnded) onEnded();
      };

      const audio = new Audio(audioPath);
      audio.volume = Math.min(1.0, this.masterVolume * 1.25);
      this.currentVoiceAudio = audio;

      audio.onended = finish;

      audio.onerror = () => {
        // If specific court file fails, fallback to general notice
        if (audioPath !== '/audio/order-notice.mp3') {
          const fallbackAudio = new Audio('/audio/order-notice.mp3');
          fallbackAudio.volume = Math.min(1.0, this.masterVolume * 1.25);
          this.currentVoiceAudio = fallbackAudio;
          fallbackAudio.onended = finish;
          fallbackAudio.onerror = () => {
            if (this.viVoice) {
              this.speakNotice(`Thông báo! Quầy ơi, có đơn hàng mới ${courtNum ? 'sân ' + courtNum : ''}!`, finish);
            } else {
              finish();
            }
          };
          fallbackAudio.play().catch(() => {
            if (this.viVoice) {
              this.speakNotice(`Thông báo! Quầy ơi, có đơn hàng mới ${courtNum ? 'sân ' + courtNum : ''}!`, finish);
            } else {
              finish();
            }
          });
        } else if (this.viVoice) {
          this.speakNotice(`Thông báo! Quầy ơi, có đơn hàng mới ${courtNum ? 'sân ' + courtNum : ''}!`, finish);
        } else {
          finish();
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (this.viVoice) {
            this.speakNotice(`Thông báo! Quầy ơi, có đơn hàng mới ${courtNum ? 'sân ' + courtNum : ''}!`, finish);
          } else {
            finish();
          }
        });
      }
    } catch (e) {
      console.warn('Error playing Vietnamese voice notice:', e);
      if (onEnded) onEnded();
    }
  }

  /**
   * Fallback Vietnamese TTS - Only speaks if a confirmed Vietnamese voice is present
   */
  public speakNotice(text: string = 'Thông báo! Quầy ơi, có đơn hàng mới!', onEnded?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnded) onEnded();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      if (!this.viVoice) {
        this.initVoiceEngine();
      }
      // Strictly prevent speaking if no Vietnamese voice is available (do NOT speak in English!)
      if (!this.viVoice) {
        if (onEnded) onEnded();
        return;
      }

      let hasFinished = false;
      const finish = () => {
        if (hasFinished) return;
        hasFinished = true;
        if (onEnded) onEnded();
      };

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.viVoice;
      utterance.lang = 'vi-VN';
      utterance.rate = 0.90;
      utterance.pitch = 1.05;
      utterance.volume = Math.min(1.0, this.masterVolume * 1.2);
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    } catch {
      if (onEnded) onEnded();
    }
  }

  /**
   * Master Order Chime Player
   * Plays the selected Sound 1, 2, 3, or 4 and triggers the native Vietnamese voice
   */
  public playOrderChime(options?: {
    style?: RingtoneStyle;
    withVoice?: boolean;
    customVoiceText?: string;
    courtId?: string;
    courtName?: string;
    onVoiceEnd?: () => void;
  }) {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Dynamics Compressor + Limiter Node
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-5, now);
      compressor.knee.setValueAtTime(5, now);
      compressor.ratio.setValueAtTime(5, now);
      compressor.attack.setValueAtTime(0.002, now);
      compressor.release.setValueAtTime(0.10, now);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.20 * this.masterVolume, now);

      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      const style = options?.style || this.ringtoneStyle;

      if (style === 'sound1') {
        // ====================================================================
        // SOUND 1: GIAI ĐIỆU BÁO ĐƠN MARIMBA (SHOPEE/GRAB STYLE - NỔI BẬT NHẤT)
        // ====================================================================
        this.strikeMarimba(ctx, compressor, 783.99, now + 0.00, 0.28, 0.85); // G5
        this.strikeMarimba(ctx, compressor, 1046.50, now + 0.09, 0.28, 0.90); // C6
        this.strikeMarimba(ctx, compressor, 1318.51, now + 0.18, 0.28, 0.95); // E6
        this.strikeMarimba(ctx, compressor, 1567.98, now + 0.27, 0.32, 1.00); // G6
        this.strikeMarimba(ctx, compressor, 2093.00, now + 0.39, 0.65, 1.10); // C7 đỉnh
        this.strikeMarimba(ctx, compressor, 1567.98, now + 0.54, 0.30, 0.90); // G6
        this.strikeMarimba(ctx, compressor, 2093.00, now + 0.66, 1.50, 1.15); // C7 ngân vang
      } else if (style === 'sound2') {
        // ====================================================================
        // SOUND 2: CHUÔNG CỬA HÀNG 2 HỒI VANG XA (ĐÍNG - ĐÓNG! ĐÍNG - ĐÓNG!)
        // ====================================================================
        this.strikeTubular(ctx, compressor, 1318.5, now + 0.00, 0.70, 1.05); // E6: ĐÍNG
        this.strikeTubular(ctx, compressor, 1046.5, now + 0.22, 1.00, 1.10); // C6: ĐÓNG
        this.strikeTubular(ctx, compressor, 1318.5, now + 0.58, 0.70, 1.05); // E6: ĐÍNG
        this.strikeTubular(ctx, compressor, 1046.5, now + 0.80, 1.80, 1.15); // C6: ĐÓNG ngân
      } else if (style === 'sound3') {
        // ====================================================================
        // SOUND 3: CÒI BÁO CẤP TỐC DỒN DẬP (URGENT ALERT)
        // ====================================================================
        for (let i = 0; i < 3; i++) {
          const t = now + i * 0.24;
          this.strikeMarimba(ctx, compressor, 1760.0, t + 0.00, 0.16, 0.95); // A6
          this.strikeMarimba(ctx, compressor, 2349.3, t + 0.08, 0.22, 1.10); // D7
        }
      } else {
        // ====================================================================
        // SOUND 4: CHUÔNG ĐỒNG QUẦY LỄ TÂN (BRASS BELL)
        // ====================================================================
        this.strikeBrass(ctx, compressor, 1760.0, now + 0.00, 0.45, 0.90);
        this.strikeBrass(ctx, compressor, 2093.0, now + 0.14, 0.50, 0.95);
        this.strikeBrass(ctx, compressor, 2637.0, now + 0.30, 1.80, 1.10);
      }

      // Trigger Authentic Vietnamese Person Voice Notification
      const shouldVoice = options?.withVoice ?? this.isVoiceEnabled;
      if (shouldVoice) {
        if (this.voiceTimeoutId) {
          clearTimeout(this.voiceTimeoutId);
          this.voiceTimeoutId = null;
        }
        const voiceDelayMs = style === 'sound1' ? 820 : style === 'sound2' ? 950 : 700;
        this.voiceTimeoutId = setTimeout(() => {
          this.voiceTimeoutId = null;
          this.playVietnameseVoiceNotice(options?.courtId, options?.courtName, options?.onVoiceEnd);
        }, voiceDelayMs);
      } else {
        if (options?.onVoiceEnd) {
          const chimeDuration = style === 'sound2' ? 2200 : 1800;
          setTimeout(() => {
            if (options.onVoiceEnd) options.onVoiceEnd();
          }, chimeDuration);
        }
      }

    } catch (e) {
      console.warn('Could not play order chime:', e);
      if (options?.onVoiceEnd) options.onVoiceEnd();
    }
  }

  /**
   * Đồng bộ và phát vòng lặp chuông + giọng đọc liên tục khi có đơn chờ phục vụ
   * Lặp lại liên tục cho đến khi nhân viên bấm "Đem ra sân" (danh sách đơn chờ rỗng) mới ngưng!
   */
  public syncPendingAlert(
    pendingOrders: Array<{ id: string; courtId?: string; courtName?: string }>,
    options?: { withVoice?: boolean }
  ) {
    if (!pendingOrders || pendingOrders.length === 0) {
      this.stopPendingAlert();
      return;
    }

    this.pendingOrdersList = [...pendingOrders];

    if (this.isAlerting) {
      return;
    }

    this.isAlerting = true;
    this.alertIndex = 0;
    this.runAlertCycle(options?.withVoice);
  }

  private runAlertCycle(withVoiceOverride?: boolean) {
    if (!this.isAlerting || this.pendingOrdersList.length === 0) {
      this.stopPendingAlert();
      return;
    }

    if (this.alertIndex >= this.pendingOrdersList.length) {
      this.alertIndex = 0;
    }
    const currentOrder = this.pendingOrdersList[this.alertIndex];
    this.alertIndex = (this.alertIndex + 1) % this.pendingOrdersList.length;

    const shouldVoice = withVoiceOverride ?? this.isVoiceEnabled;

    let cycleHandled = false;
    const scheduleNext = (delayMs: number) => {
      if (cycleHandled) return;
      cycleHandled = true;
      if (this.alertTimer) {
        clearTimeout(this.alertTimer);
        this.alertTimer = null;
      }
      this.alertTimer = setTimeout(() => {
        this.alertTimer = null;
        if (this.isAlerting && this.pendingOrdersList.length > 0) {
          this.runAlertCycle(withVoiceOverride);
        } else {
          this.stopPendingAlert();
        }
      }, delayMs);
    };

    // Phát chuông báo và giọng đọc tiếng Việt theo sân
    this.playOrderChime({
      courtId: currentOrder?.courtId,
      courtName: currentOrder?.courtName,
      withVoice: shouldVoice,
      onVoiceEnd: () => {
        // Sau khi đọc xong thông báo, nghỉ 1800ms rồi tiếp tục lặp lại chu kỳ chuông & giọng
        scheduleNext(1800);
      }
    });

    // Fallback bảo vệ nếu âm thanh bị trình duyệt chặn hoặc không kích hoạt sự kiện
    const maxSafetyDelay = shouldVoice ? 6000 : 3500;
    this.alertTimer = setTimeout(() => {
      scheduleNext(0);
    }, maxSafetyDelay);
  }

  /**
   * Ngưng ngay lập tức toàn bộ chuông báo, giọng đọc và các bộ định thời
   * Được gọi ngay khi bấm "Đem ra sân" và không còn đơn chờ phục vụ
   */
  public stopPendingAlert() {
    this.isAlerting = false;
    this.pendingOrdersList = [];
    if (this.alertTimer) {
      clearTimeout(this.alertTimer);
      this.alertTimer = null;
    }
    if (this.voiceTimeoutId) {
      clearTimeout(this.voiceTimeoutId);
      this.voiceTimeoutId = null;
    }
    if (this.currentVoiceAudio) {
      try {
        this.currentVoiceAudio.pause();
        this.currentVoiceAudio.currentTime = 0;
      } catch {}
      this.currentVoiceAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public stop() {
    this.stopPendingAlert();
  }

  public playActionClick() {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime); // D6 crisp tap
      gain.gain.setValueAtTime(0.12 * this.masterVolume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      // ignore
    }
  }
}

export const sound = new SoundManager();
