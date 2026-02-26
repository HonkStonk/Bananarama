(() => {
  "use strict";

  const WIDTH = 1100;
  const HEIGHT = 760;
  const PLAY_TOP = 150;
  const GROUND_Y = HEIGHT - 70;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function rgba(hex, alpha) {
    const normalized = hex.replace("#", "");
    const h = normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function fadeColor(hex, factor) {
    const bg = [246, 238, 211];
    const normalized = hex.replace("#", "");
    const h = normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized;
    let r = parseInt(h.slice(0, 2), 16);
    let g = parseInt(h.slice(2, 4), 16);
    let b = parseInt(h.slice(4, 6), 16);
    r = Math.round(bg[0] + (r - bg[0]) * factor);
    g = Math.round(bg[1] + (g - bg[1]) * factor);
    b = Math.round(bg[2] + (b - bg[2]) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  class BananaPolicyGameWeb {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.canvas.tabIndex = 0;

      this.state = "menu";
      this.lastTime = performance.now();
      this.keysDown = new Set();
      this.mouse = { x: WIDTH / 2, y: HEIGHT / 2 };

      this.playerX = WIDTH / 2;
      this.playerSpeed = 560;
      this.inventory = 5;
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;

      this.roundIndex = 0;
      this.roundDuration = 40;
      this.roundTimeLeft = 40;
      this.spawnTimer = 0;
      this.deliveryCooldown = 0;

      this.items = [];
      this.floatingTexts = [];
      this.offices = [];

      this.metrics = {
        hallbarhet: 74,
        likvardighet: 72,
        konsekvens: 75,
      };
      this.wasteCount = 0;
      this.missedBananas = 0;

      this.quizIndex = -1;
      this.quizSelected = null;
      this.quizResultOk = false;
      this.quizFeedback = "";
      this.quizButtons = [];

      this.backgroundPhase = 0;
      this.titleBlink = 0;
      this.nowSeconds = performance.now() / 1000;

      this.audio = {
        enabled: true,
        muted: false,
        unlocked: false,
        ctx: null,
        master: null,
        music: null,
        sfx: null,
        nextBeatTime: 0,
        musicStep: 0,
        tempo: 118,
        scheduleAhead: 0.45,
        lastWasteSfxAt: -999,
      };

      this.quizzes = [
        {
          quote: "“frukt som är i säsong och har lägre miljöpåverkan är alltid att föredra”",
          prompt: "Vilket argument gör bananen till det praktiska standardvalet?",
          options: [
            ["Bananen gör säsongsfrågan praktiskt hanterbar med stabil tillgång och samma regel året runt.", true],
            ["Byt frukt varje vecka så policyn känns mer levande även om logistiken blir svårare.", false],
            ["Låt varje kontor välja fritt efter smak så slipper central styrning.", false],
          ],
          explainOk: "Rätt: hållbarhet måste fungera konsekvent i vardagen, inte bara i formuleringen.",
          explainBad: "Bananargumentet här är att stabil tillgång gör hållbarhetspolicyn möjlig att följa i praktiken.",
        },
        {
          quote: "“hållbarhet och hur vi säkerställer likvärdighet i hela organisationen”",
          prompt: "Vilket val stödjer likvärdighet bäst mellan kontor?",
          options: [
            ["Standardisera på banan: samma portion, samma tillgång, mindre variation mellan orter.", true],
            ["Låt stora kontor få premiumfrukt och små kontor enklare alternativ.", false],
            ["Variera fritt lokalt och acceptera olika kvalitet beroende på budget.", false],
          ],
          explainOk: "Rätt: likvärdighet kräver samma villkor och ett stabilt standardalternativ.",
          explainBad: "Likvärdighet blir starkast när samma lösning kan ges lika överallt. Där är bananen stark som standard.",
        },
        {
          quote: "“arbeta konsekvent, minska svinn och göra säsongsanpassade, hållbara val”",
          prompt: "Vad är det starkaste vardagsargumentet för bananen?",
          options: [
            ["Bananen minskar friktion och svinn: skyddande skal, enkel mognadsbedömning och lätt att rädda.", true],
            ["Det viktigaste är att varje leverans ser ny ut, även om mer kastas.", false],
            ["Köp många små sorter samtidigt så att alla kan prova något nytt varje dag.", false],
          ],
          explainOk: "Rätt: verklig hållbarhet avgörs ofta av svinn och friktion i den dagliga hanteringen.",
          explainBad: "Bananens systemstyrka är enkel hantering, mindre svinn och konsekvent arbetssätt.",
        },
      ];

      this.bindEvents();
      this.startMenu();
      requestAnimationFrame((t) => this.loop(t));
    }

    bindEvents() {
      window.addEventListener("keydown", (e) => this.onKeyDown(e));
      window.addEventListener("keyup", (e) => this.onKeyUp(e));
      this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
      this.canvas.addEventListener("click", (e) => this.onClick(e));
      this.canvas.addEventListener("mousedown", () => this.canvas.focus());
      window.addEventListener("blur", () => this.keysDown.clear());
    }

    canvasPointFromEvent(e) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = WIDTH / rect.width;
      const sy = HEIGHT / rect.height;
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy,
      };
    }

    onMouseMove(e) {
      this.mouse = this.canvasPointFromEvent(e);
    }

    onClick(e) {
      this.ensureAudioUnlocked();
      const p = this.canvasPointFromEvent(e);
      this.mouse = p;

      if (this.state === "quiz" && this.quizSelected === null) {
        for (let i = 0; i < this.quizButtons.length; i += 1) {
          const b = this.quizButtons[i];
          if (p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2) {
            this.answerQuiz(i);
            return;
          }
        }
      }

      if (this.state === "menu") {
        this.startNewGame();
      } else if (this.state === "win" || this.state === "gameover") {
        this.startMenu();
      }
    }

    onKeyDown(e) {
      const key = e.key.toLowerCase();
      const handledGameplayKeys = [" ", "arrowleft", "arrowright", "a", "d", "1", "2", "3", "r", "m", "enter"];
      if (handledGameplayKeys.includes(key)) e.preventDefault();
      this.ensureAudioUnlocked();
      this.keysDown.add(key);

      if (key === "m") {
        this.toggleAudioMute();
        return;
      }

      if (this.state === "menu") {
        if (key === "enter" || key === " ") this.startNewGame();
        return;
      }

      if (this.state === "play") {
        if (key === "1") this.deliverToOffice(0);
        else if (key === "2") this.deliverToOffice(1);
        else if (key === "3") this.deliverToOffice(2);
        else if (key === " ") this.deliverToMostNeedy();
        else if (key === "r") this.rescueOverripe();
        return;
      }

      if (this.state === "quiz") {
        if (this.quizSelected === null) {
          if (key === "1") this.answerQuiz(0);
          else if (key === "2") this.answerQuiz(1);
          else if (key === "3") this.answerQuiz(2);
        } else if (key === "enter" || key === " ") {
          this.advanceFromQuiz();
        }
        return;
      }

      if ((this.state === "win" || this.state === "gameover") && (key === "enter" || key === " ")) {
        this.startNewGame();
      }
    }

    onKeyUp(e) {
      this.keysDown.delete(e.key.toLowerCase());
    }

    ensureAudioUnlocked() {
      if (!this.audio.enabled) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.audio.enabled = false;
        return;
      }
      if (!this.audio.ctx) {
        const ctx = new AudioCtx();
        const master = ctx.createGain();
        const music = ctx.createGain();
        const sfx = ctx.createGain();
        master.gain.value = 0.18;
        music.gain.value = 0.55;
        sfx.gain.value = 0.85;
        music.connect(master);
        sfx.connect(master);
        master.connect(ctx.destination);
        this.audio.ctx = ctx;
        this.audio.master = master;
        this.audio.music = music;
        this.audio.sfx = sfx;
        this.audio.nextBeatTime = ctx.currentTime + 0.05;
        this.audio.musicStep = 0;
      }
      if (this.audio.ctx.state === "suspended") {
        this.audio.ctx.resume().catch(() => {});
      }
      this.audio.unlocked = this.audio.ctx.state !== "closed";
    }

    toggleAudioMute() {
      if (!this.audio.enabled) return;
      this.audio.muted = !this.audio.muted;
      if (this.audio.master) {
        const now = this.audio.ctx ? this.audio.ctx.currentTime : 0;
        const target = this.audio.muted ? 0.0001 : 0.18;
        this.audio.master.gain.cancelScheduledValues(now);
        this.audio.master.gain.setTargetAtTime(target, now, 0.02);
      }
      this.addFloating(
        this.audio.muted ? "Ljud av" : "Ljud på",
        WIDTH - 120,
        135,
        this.audio.muted ? "#8a1c1c" : "#2f7a37",
        1.0
      );
      if (!this.audio.muted) this.playSfx("toggle");
    }

    playSfx(type, amount = 1) {
      if (!this.audio.enabled || this.audio.muted || !this.audio.ctx || !this.audio.sfx) return;
      const ctx = this.audio.ctx;
      if (ctx.state !== "running") return;
      const t0 = ctx.currentTime;
      const out = this.audio.sfx;

      const tone = (freq, dur, {
        type: oscType = "sine",
        attack = 0.002,
        decay = dur * 0.8,
        gain = 0.12,
        endFreq = null,
        detune = 0,
        offset = 0,
      } = {}) => {
        const t = t0 + offset;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = oscType;
        osc.frequency.setValueAtTime(freq, t);
        if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur);
        if (detune) osc.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(g);
        g.connect(out);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      };

      const noise = (dur, gain = 0.06, hp = 350, offset = 0) => {
        const t = t0 + offset;
        const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const src = ctx.createBufferSource();
        const hpFilter = ctx.createBiquadFilter();
        hpFilter.type = "highpass";
        hpFilter.frequency.value = hp;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.buffer = buffer;
        src.connect(hpFilter);
        hpFilter.connect(g);
        g.connect(out);
        src.start(t);
        src.stop(t + dur + 0.01);
      };

      if (type === "catch_banana") {
        tone(760 + amount * 14, 0.08, { type: "triangle", gain: 0.08, endFreq: 940 + amount * 18 });
        tone(1140 + amount * 25, 0.05, { type: "sine", gain: 0.035, attack: 0.001, decay: 0.04 });
      } else if (type === "catch_bunch") {
        tone(620, 0.11, { type: "triangle", gain: 0.11, endFreq: 920 });
        tone(900, 0.07, { type: "triangle", gain: 0.045, endFreq: 1120, offset: 0.024 });
      } else if (type === "crate") {
        tone(300, 0.12, { type: "square", gain: 0.07, endFreq: 250 });
        tone(520, 0.08, { type: "triangle", gain: 0.06, endFreq: 700 });
      } else if (type === "deliver") {
        tone(420, 0.07, { type: "triangle", gain: 0.07, endFreq: 520 });
        tone(680, 0.11, { type: "sine", gain: 0.05, attack: 0.003, decay: 0.09 });
      } else if (type === "empty") {
        tone(190, 0.09, { type: "square", gain: 0.05, endFreq: 140 });
        noise(0.03, 0.02, 600);
      } else if (type === "bad_fruit") {
        tone(310, 0.12, { type: "sawtooth", gain: 0.05, endFreq: 220 });
        tone(230, 0.16, { type: "square", gain: 0.04, endFreq: 130, detune: -6 });
      } else if (type === "waste") {
        if (this.nowSeconds - this.audio.lastWasteSfxAt < 0.08) return;
        this.audio.lastWasteSfxAt = this.nowSeconds;
        tone(160, 0.08, { type: "triangle", gain: 0.035, endFreq: 95 });
        noise(0.025, 0.018, 250);
      } else if (type === "rescue") {
        tone(520, 0.08, { type: "triangle", gain: 0.08, endFreq: 640 });
        tone(780, 0.12, { type: "sine", gain: 0.05, attack: 0.004, decay: 0.11 });
      } else if (type === "quiz_ok") {
        tone(440, 0.10, { type: "triangle", gain: 0.07, endFreq: 520 });
        tone(660, 0.12, { type: "triangle", gain: 0.07, endFreq: 820 });
        tone(920, 0.08, { type: "sine", gain: 0.04, endFreq: 1180, offset: 0.06 });
      } else if (type === "quiz_bad") {
        tone(420, 0.12, { type: "sawtooth", gain: 0.045, endFreq: 290 });
        tone(280, 0.18, { type: "square", gain: 0.03, endFreq: 170 });
      } else if (type === "round_start") {
        tone(392, 0.10, { type: "triangle", gain: 0.06, endFreq: 440 });
        tone(523, 0.11, { type: "triangle", gain: 0.06, endFreq: 659, offset: 0.07 });
      } else if (type === "win") {
        tone(523, 0.18, { type: "triangle", gain: 0.07, endFreq: 659 });
        tone(659, 0.18, { type: "triangle", gain: 0.07, endFreq: 784, offset: 0.09 });
        tone(784, 0.24, { type: "sine", gain: 0.06, endFreq: 1046, offset: 0.19 });
      } else if (type === "lose") {
        tone(260, 0.16, { type: "sawtooth", gain: 0.04, endFreq: 190 });
        tone(185, 0.22, { type: "square", gain: 0.03, endFreq: 120, offset: 0.09 });
      } else if (type === "toggle") {
        tone(this.audio.muted ? 240 : 640, 0.07, { type: "triangle", gain: 0.05, endFreq: this.audio.muted ? 180 : 820 });
      }
    }

    noteFreq(midi) {
      return 440 * Math.pow(2, (midi - 69) / 12);
    }

    stateMusicProfile() {
      if (this.state === "play") {
        return {
          bass: [45, 45, 45, 45, 43, 43, 43, 43, 40, 40, 40, 40, 43, 43, 45, 47],
          lead: [69, null, 71, null, 72, 71, 69, null, 67, null, 69, null, 71, 72, 74, null],
          stepDur: (60 / this.audio.tempo) / 2,
          musicGain: 0.55,
        };
      }
      if (this.state === "quiz") {
        return {
          bass: [45, null, 43, null, 40, null, 43, null],
          lead: [72, 74, null, 72, 71, null, 69, null],
          stepDur: (60 / 96) / 2,
          musicGain: 0.36,
        };
      }
      if (this.state === "win") {
        return {
          bass: [45, 45, 47, 47, 49, 49, 52, 52],
          lead: [72, 74, 76, 79, 81, 79, 76, 74],
          stepDur: (60 / 108) / 2,
          musicGain: 0.42,
        };
      }
      return {
        bass: [45, null, 45, null, 43, null, 40, null],
        lead: [69, null, 67, null, 69, null, 71, null],
        stepDur: (60 / 92) / 2,
        musicGain: 0.28,
      };
    }

    scheduleMusicIfNeeded() {
      if (!this.audio.enabled || this.audio.muted || !this.audio.ctx || !this.audio.music) return;
      const ctx = this.audio.ctx;
      if (ctx.state !== "running") return;

      const profile = this.stateMusicProfile();
      const lookAhead = ctx.currentTime + this.audio.scheduleAhead;
      this.audio.music.gain.setTargetAtTime(profile.musicGain, ctx.currentTime, 0.1);
      if (this.audio.nextBeatTime < ctx.currentTime - 0.5) {
        this.audio.nextBeatTime = ctx.currentTime + 0.05;
      }

      while (this.audio.nextBeatTime < lookAhead) {
        const step = this.audio.musicStep;
        const bassMidi = profile.bass[step % profile.bass.length];
        const leadMidi = profile.lead[step % profile.lead.length];
        const t = this.audio.nextBeatTime;

        if (bassMidi != null) {
          this.scheduleMusicVoice(this.noteFreq(bassMidi), t, profile.stepDur * 0.92, {
            type: "triangle",
            gain: 0.035,
            out: this.audio.music,
            attack: 0.003,
            decay: profile.stepDur * 0.9,
          });
          this.scheduleKick(t, 0.02);
        }
        if (leadMidi != null) {
          this.scheduleMusicVoice(this.noteFreq(leadMidi), t + 0.015, profile.stepDur * 0.72, {
            type: "sine",
            gain: 0.02,
            out: this.audio.music,
            attack: 0.004,
            decay: profile.stepDur * 0.55,
          });
        }
        if (step % 2 === 1 && this.state === "play") {
          this.scheduleHat(t + 0.01, 0.008);
        }

        this.audio.musicStep += 1;
        this.audio.nextBeatTime += profile.stepDur;
      }
    }

    scheduleMusicVoice(freq, start, dur, opts) {
      const ctx = this.audio.ctx;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type || "sine";
      osc.frequency.setValueAtTime(freq, start);
      if (opts.endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(25, opts.endFreq), start + dur);
      }
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(opts.gain ?? 0.02, start + (opts.attack ?? 0.003));
      g.gain.exponentialRampToValueAtTime(0.0001, start + (opts.decay ?? dur));
      osc.connect(g);
      g.connect(opts.out || this.audio.music);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }

    scheduleKick(start, gain = 0.03) {
      const ctx = this.audio.ctx;
      if (!ctx || !this.audio.music) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, start);
      osc.frequency.exponentialRampToValueAtTime(48, start + 0.08);
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      osc.connect(g);
      g.connect(this.audio.music);
      osc.start(start);
      osc.stop(start + 0.1);
    }

    scheduleHat(start, gain = 0.008) {
      const ctx = this.audio.ctx;
      if (!ctx || !this.audio.music) return;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.015), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.02);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.audio.music);
      src.start(start);
      src.stop(start + 0.03);
    }

    startMenu() {
      this.state = "menu";
      this.items = [];
      this.floatingTexts = [];
      this.quizButtons = [];
    }

    startNewGame() {
      this.score = 0;
      this.inventory = 5;
      this.combo = 0;
      this.comboTimer = 0;
      this.roundIndex = 0;
      this.wasteCount = 0;
      this.missedBananas = 0;
      this.playerX = WIDTH / 2;
      this.metrics = { hallbarhet: 74, likvardighet: 72, konsekvens: 75 };
      this.items = [];
      this.floatingTexts = [];
      this.offices = [];
      this.state = "play";
      this.startRound();
    }

    startRound() {
      this.roundIndex += 1;
      this.roundDuration = 42 + (this.roundIndex - 1) * 6;
      this.roundTimeLeft = this.roundDuration;
      this.spawnTimer = 0;
      this.deliveryCooldown = 0;
      this.items = [];
      const baseDemand = 25 + this.roundIndex * 4;
      const xs = [200, 520, 840];
      const names = ["Ekonomi", "HR", "IT"];
      this.offices = xs.map((x, i) => ({
        name: names[i],
        keyLabel: String(i + 1),
        x,
        demand: baseDemand + randRange(-4, 6),
        served: 0,
      }));
      this.addFloating("Ny rond: säkra bananstandarden!", WIDTH / 2, HEIGHT / 2, "#3d2d1e", 2.2);
      this.playSfx("round_start");
    }

    startQuiz() {
      this.state = "quiz";
      this.quizIndex = this.roundIndex - 1;
      this.quizSelected = null;
      this.quizResultOk = false;
      this.quizFeedback = "";
      this.quizButtons = [];
    }

    advanceFromQuiz() {
      if (this.roundIndex >= this.quizzes.length) {
        this.finishGame();
      } else {
        this.state = "play";
        this.startRound();
      }
    }

    finishGame() {
      if (
        this.metrics.hallbarhet < 40 ||
        this.metrics.likvardighet < 40 ||
        this.metrics.konsekvens < 40
      ) {
        this.state = "gameover";
        this.playSfx("lose");
      } else {
        this.state = "win";
        this.playSfx("win");
      }
    }

    gameOver(reason) {
      this.state = "gameover";
      this.addFloating(reason, WIDTH / 2, HEIGHT / 2 - 40, "#8a1c1c", 2.4);
      this.playSfx("lose");
    }

    rescueOverripe() {
      if (this.state !== "play") return;
      if (this.inventory >= 2) {
        this.inventory -= 2;
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet + 5, 0, 100);
        this.metrics.konsekvens = clamp(this.metrics.konsekvens + 1, 0, 100);
        this.score += 25;
        this.addFloating("Rädda-banans-rutin! +hållbarhet", this.playerX, GROUND_Y - 50, "#2f7a37", 1.4);
        this.playSfx("rescue");
      } else {
        this.addFloating("Behöver minst 2 bananer i lager", this.playerX, GROUND_Y - 50, "#7d5a10", 1.3);
        this.playSfx("empty");
      }
    }

    deliverToMostNeedy() {
      if (!this.offices.length) return;
      let bestIdx = 0;
      let bestDemand = -1;
      for (let i = 0; i < this.offices.length; i += 1) {
        if (this.offices[i].demand > bestDemand) {
          bestDemand = this.offices[i].demand;
          bestIdx = i;
        }
      }
      this.deliverToOffice(bestIdx);
    }

    deliverToOffice(index) {
      if (this.state !== "play") return;
      if (index < 0 || index >= this.offices.length) return;
      if (this.deliveryCooldown > 0) return;

      if (this.inventory <= 0) {
        this.addFloating("Tomt lager! Fånga fler bananer.", this.playerX, GROUND_Y - 48, "#7c2f2f", 1.3);
        this.metrics.konsekvens = clamp(this.metrics.konsekvens - 0.6, 0, 100);
        this.playSfx("empty");
        return;
      }

      const office = this.offices[index];
      this.inventory -= 1;
      office.served += 1;
      const demandBefore = office.demand;
      office.demand = Math.max(0, office.demand - (28 + this.roundIndex * 2));
      this.deliveryCooldown = 0.12;

      const urgencyBonus = demandBefore >= 70 ? 10 : 0;
      this.score += 18 + urgencyBonus;
      this.comboTimer = 1.4;
      this.combo += 1;
      if (this.combo % 5 === 0) {
        this.score += 50;
        this.addFloating("Kedja! +50", office.x, PLAY_TOP + 55, "#a14f00", 1.3);
      }
      this.metrics.konsekvens = clamp(this.metrics.konsekvens + 0.7, 0, 100);
      this.metrics.hallbarhet = clamp(this.metrics.hallbarhet + 0.25, 0, 100);
      this.addFloating(`Levererat till ${office.name}`, office.x, PLAY_TOP + 70, "#3d2d1e", 1.1);
      this.playSfx("deliver");
      this.updateEqualityMetric();
    }

    updateEqualityMetric() {
      if (!this.offices.length) return;
      const demands = this.offices.map((o) => o.demand);
      const served = this.offices.map((o) => o.served);
      const demandSpread = Math.max(...demands) - Math.min(...demands);
      const servedSpread = Math.max(...served) - Math.min(...served);
      const penalty = demandSpread * 0.08 + servedSpread * 1.2;
      const target = clamp(92 - penalty, 20, 95);
      this.metrics.likvardighet += (target - this.metrics.likvardighet) * 0.16;
      this.metrics.likvardighet = clamp(this.metrics.likvardighet, 0, 100);
    }

    addFloating(text, x, y, color, ttl = 1.2) {
      this.floatingTexts.push({ text, x, y, color, ttl });
    }

    spawnItem() {
      const difficulty = 1 + (this.roundIndex - 1) * 0.15;
      const x = Math.round(randRange(70, WIDTH - 70));
      const y = PLAY_TOP + Math.round(randRange(-20, 10));
      const baseSpeed = randRange(210, 320) * difficulty;
      const vx = randRange(-28, 28);
      const wobbleSeed = Math.random() * Math.PI * 2;
      const roll = Math.random();

      let kind;
      let radius;
      let value;
      if (roll < 0.60) {
        kind = "banana";
        radius = 18;
        value = 1;
      } else if (roll < 0.75) {
        kind = "bunch";
        radius = 24;
        value = 3;
      } else if (roll < 0.90) {
        kind = ["apple", "pear", "dragonfruit"][Math.floor(Math.random() * 3)];
        radius = 20;
        value = 0;
      } else {
        kind = "crate";
        radius = 22;
        value = 2;
      }

      this.items.push({
        kind,
        x,
        y,
        vy: baseSpeed,
        vx,
        radius,
        value,
        wobbleSeed,
        rotation: randRange(-0.5, 0.5),
      });
    }

    updateItem(item, dt) {
      item.y += item.vy * dt;
      item.x += item.vx * dt + Math.sin(item.y * 0.02 + item.wobbleSeed) * 12 * dt;
      item.rotation += (item.vx * 0.0015 + Math.sin(item.y * 0.01 + item.wobbleSeed) * 0.01) * dt * 60;
    }

    playerRect() {
      return {
        x1: this.playerX - 64,
        y1: GROUND_Y - 24,
        x2: this.playerX + 64,
        y2: GROUND_Y + 26,
      };
    }

    itemBounds(item) {
      const r = item.radius;
      return { x1: item.x - r, y1: item.y - r, x2: item.x + r, y2: item.y + r };
    }

    itemHitsPlayer(item) {
      const p = this.playerRect();
      const b = this.itemBounds(item);
      return !(b.x2 < p.x1 || b.x1 > p.x2 || b.y2 < p.y1 || b.y1 > p.y2);
    }

    collectItem(item) {
      if (item.kind === "banana") {
        this.inventory += 1;
        this.score += 10;
        this.metrics.konsekvens = clamp(this.metrics.konsekvens + 0.35, 0, 100);
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet + 0.18, 0, 100);
        this.combo += 1;
        this.comboTimer = 1.2;
        this.addFloating("+1 banan", item.x, item.y, "#2f7a37", 1.1);
        this.playSfx("catch_banana");
      } else if (item.kind === "bunch") {
        this.inventory += item.value;
        this.score += 25;
        this.metrics.konsekvens = clamp(this.metrics.konsekvens + 0.6, 0, 100);
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet + 0.35, 0, 100);
        this.combo += 2;
        this.comboTimer = 1.4;
        this.addFloating(`+${item.value} bananer`, item.x, item.y, "#2f7a37", 1.1);
        this.playSfx("catch_bunch", item.value);
      } else if (item.kind === "crate") {
        this.inventory += item.value;
        this.score += 18;
        this.metrics.konsekvens = clamp(this.metrics.konsekvens + 0.8, 0, 100);
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet + 0.4, 0, 100);
        this.addFloating("Bananlåda! +2", item.x, item.y, "#5a3d28", 1.2);
        this.playSfx("crate");
      } else {
        this.score = Math.max(0, this.score - 8);
        this.metrics.konsekvens = clamp(this.metrics.konsekvens - 2.3, 0, 100);
        this.metrics.likvardighet = clamp(this.metrics.likvardighet - 1.2, 0, 100);
        this.addFloating("Fel frukt! Standarden sprack.", item.x, item.y, "#8a1c1c", 1.2);
        this.combo = 0;
        this.comboTimer = 0;
        this.playSfx("bad_fruit");
      }
    }

    missItem(item) {
      if (item.kind === "banana" || item.kind === "bunch" || item.kind === "crate") {
        const missed = item.kind === "banana" ? 1 : item.value;
        this.wasteCount += missed;
        this.missedBananas += missed;
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet - (0.35 + 0.25 * missed), 0, 100);
        this.metrics.konsekvens = clamp(this.metrics.konsekvens - 0.25, 0, 100);
        this.addFloating(`Svinn +${missed}`, item.x, GROUND_Y - 20, "#8a1c1c", 1.1);
        this.playSfx("waste");
      } else {
        this.metrics.likvardighet = clamp(this.metrics.likvardighet - 0.4, 0, 100);
      }
    }

    answerQuiz(idx) {
      if (this.quizSelected !== null) return;
      const quiz = this.quizzes[this.quizIndex];
      this.quizSelected = idx;
      const isCorrect = !!quiz.options[idx][1];
      this.quizResultOk = isCorrect;
      if (isCorrect) {
        this.score += 220;
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet + 8, 0, 100);
        this.metrics.likvardighet = clamp(this.metrics.likvardighet + 8, 0, 100);
        this.metrics.konsekvens = clamp(this.metrics.konsekvens + 10, 0, 100);
        this.quizFeedback = quiz.explainOk;
        this.playSfx("quiz_ok");
      } else {
        this.metrics.hallbarhet = clamp(this.metrics.hallbarhet - 5, 0, 100);
        this.metrics.likvardighet = clamp(this.metrics.likvardighet - 5, 0, 100);
        this.metrics.konsekvens = clamp(this.metrics.konsekvens - 7, 0, 100);
        this.quizFeedback = quiz.explainBad;
        this.playSfx("quiz_bad");
      }
    }

    updatePlay(dt) {
      const moveLeft = this.keysDown.has("arrowleft") || this.keysDown.has("a");
      const moveRight = this.keysDown.has("arrowright") || this.keysDown.has("d");
      if (moveLeft && !moveRight) this.playerX -= this.playerSpeed * dt;
      else if (moveRight && !moveLeft) this.playerX += this.playerSpeed * dt;
      this.playerX = clamp(this.playerX, 70, WIDTH - 70);

      this.roundTimeLeft -= dt;
      this.spawnTimer -= dt;
      this.deliveryCooldown = Math.max(0, this.deliveryCooldown - dt);
      this.backgroundPhase += dt;
      this.titleBlink += dt;

      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      const spawnInterval = clamp(0.82 - this.roundIndex * 0.08, 0.46, 0.82);
      if (this.spawnTimer <= 0) {
        this.spawnItem();
        if (this.roundIndex >= 2 && Math.random() < 0.14) this.spawnItem();
        this.spawnTimer = spawnInterval * randRange(0.72, 1.12);
      }

      for (const office of this.offices) {
        office.demand += dt * (5.7 + this.roundIndex * 1.4 + randRange(-0.2, 0.25));
        office.demand = clamp(office.demand, 0, 100);
        if (office.demand > 85) {
          this.metrics.likvardighet = clamp(
            this.metrics.likvardighet - 0.7 * dt * (office.demand - 84),
            0,
            100
          );
        }
        if (office.demand > 95) {
          this.metrics.konsekvens = clamp(
            this.metrics.konsekvens - 0.4 * dt * (office.demand - 94),
            0,
            100
          );
        }
      }
      this.updateEqualityMetric();

      const kept = [];
      for (const item of this.items) {
        this.updateItem(item, dt);
        if (this.itemHitsPlayer(item)) {
          this.collectItem(item);
          continue;
        }
        if (item.y >= GROUND_Y + 25) {
          this.missItem(item);
          continue;
        }
        kept.push(item);
      }
      this.items = kept;

      for (const ft of this.floatingTexts) {
        ft.ttl -= dt;
        ft.y -= 34 * dt;
      }
      this.floatingTexts = this.floatingTexts.filter((ft) => ft.ttl > 0);

      if (this.inventory > 10) {
        this.metrics.likvardighet = clamp(
          this.metrics.likvardighet - 0.25 * dt * (this.inventory - 9),
          0,
          100
        );
      }

      if (this.wasteCount > 0) {
        this.metrics.hallbarhet = clamp(
          this.metrics.hallbarhet - 0.004 * dt * this.wasteCount,
          0,
          100
        );
      }

      if (Math.min(this.metrics.hallbarhet, this.metrics.likvardighet, this.metrics.konsekvens) <= 0) {
        this.gameOver("Policykollaps: en ny standard behövs.");
        return;
      }

      if (this.roundTimeLeft <= 0) {
        this.startQuiz();
      }
    }

    loop(now) {
      const dt = clamp((now - this.lastTime) / 1000, 0, 0.05);
      this.lastTime = now;
      this.nowSeconds = now / 1000;

      if (this.state === "play") this.updatePlay(dt);
      else {
        this.backgroundPhase += dt;
        this.titleBlink += dt;
        for (const ft of this.floatingTexts) {
          ft.ttl -= dt;
          ft.y -= 34 * dt;
        }
        this.floatingTexts = this.floatingTexts.filter((ft) => ft.ttl > 0);
      }

      this.scheduleMusicIfNeeded();

      this.draw();
      requestAnimationFrame((t) => this.loop(t));
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      this.drawBackground(ctx);

      if (this.state === "menu") this.drawMenu(ctx);
      else if (this.state === "play") this.drawPlayfield(ctx, false);
      else if (this.state === "quiz") {
        this.drawPlayfield(ctx, true);
        this.drawQuizOverlay(ctx);
      } else if (this.state === "win") {
        this.drawEndScreen(ctx, true);
      } else if (this.state === "gameover") {
        this.drawEndScreen(ctx, false);
      }

      this.drawFloatingTexts(ctx);
    }

    drawBackground(ctx) {
      ctx.fillStyle = "#f6eed3";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      for (let i = 0; i < 14; i += 1) {
        const offset = (this.backgroundPhase * (10 + i * 2)) % (WIDTH + 300);
        const x = -150 + offset;
        const y = 35 + i * 48 + Math.sin(this.backgroundPhase * 0.9 + i) * 12;
        const color = i % 2 === 0 ? "#eedf9d" : "#f5d76a";
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.ellipse(x + 140, y + 55, 140, 55, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#d7c6a3";
      ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);
      ctx.fillStyle = "#b89f78";
      ctx.fillRect(0, HEIGHT - 86, WIDTH, 86);
      ctx.strokeStyle = "#ccb58e";
      ctx.lineWidth = 2;
      for (let i = 0; i < WIDTH + 60; i += 42) {
        ctx.beginPath();
        ctx.moveTo(i, HEIGHT - 120);
        ctx.lineTo(i + 26, HEIGHT);
        ctx.stroke();
      }
    }

    drawMenu(ctx) {
      this.drawTitleBananaCluster(ctx, WIDTH / 2, 120);

      ctx.fillStyle = "#3b2a17";
      ctx.font = "900 34px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BANANRAMA", WIDTH / 2, 136);

      ctx.fillStyle = "#684e2b";
      ctx.font = "700 16px 'Segoe UI', sans-serif";
      ctx.fillText("Standardfrukt Simulator - Browser Edition", WIDTH / 2, 172);

      this.roundedPanel(ctx, 80, 215, WIDTH - 80, HEIGHT - 120, "#fff9e8", "#cfb073", 2);

      const lines = [
        "Du ansvarar för fruktutdelningen i hela organisationen.",
        "Målet: bevisa i praktiken att BANANEN är den bästa standardfrukten.",
        "",
        "Spela så här:",
        "A/D eller vänster/höger: flytta vagnen",
        "1 / 2 / 3: leverera banan till Ekonomi / HR / IT",
        "Space: leverera till kontoret med störst behov",
        "R: aktivera \"rädda-banans\" (kostar 2 lager, höjer hållbarhet)",
        "",
        "Fånga bananer och bananlådor. Undvik fel frukter som stör standarden.",
        "Håll uppe: Hållbarhet, Likvärdighet och Konsekvens.",
        "Mellan rundor får du policyfrågor baserade på citaten.",
      ];

      let y = 251;
      ctx.textAlign = "left";
      for (const line of lines) {
        if (!line) {
          y += 14;
          continue;
        }
        ctx.fillStyle = "#3c3225";
        ctx.font = line.endsWith(":") ? "700 14px 'Segoe UI', sans-serif" : "15px 'Segoe UI', sans-serif";
        ctx.fillText(line, 106, y);
        y += 29;
      }

      const blink = 0.55 + 0.45 * Math.sin(this.titleBlink * 4.5);
      ctx.fillStyle = "#f3cf3f";
      ctx.strokeStyle = "#7e6115";
      ctx.lineWidth = 3;
      this.roundedPanel(ctx, WIDTH / 2 - 185, HEIGHT - 96, WIDTH / 2 + 185, HEIGHT - 38, "#f3cf3f", "#7e6115", 3);
      ctx.textAlign = "center";
      ctx.fillStyle = fadeColor("#3b2a17", blink);
      ctx.font = "700 15px 'Segoe UI', sans-serif";
      ctx.fillText("Klicka eller tryck Enter för att starta", WIDTH / 2, HEIGHT - 61);
    }

    drawPlayfield(ctx, dim) {
      this.drawTopHeader(ctx);
      this.drawOffices(ctx);
      this.drawLaneGuides(ctx);
      this.drawItems(ctx);
      this.drawPlayer(ctx);
      this.drawSidePanel(ctx);
      if (dim) {
        ctx.fillStyle = "rgba(46, 33, 22, 0.48)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }

    drawTopHeader(ctx) {
      ctx.fillStyle = "#fff7db";
      ctx.fillRect(0, 0, WIDTH, 128);
      ctx.strokeStyle = "#bc9c61";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 128);
      ctx.lineTo(WIDTH, 128);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#3b2a17";
      ctx.font = "700 19px 'Segoe UI', sans-serif";
      ctx.fillText(`Rond ${this.roundIndex}/3`, 22, 30);
      ctx.fillStyle = "#5d4729";
      ctx.font = "700 15px 'Segoe UI', sans-serif";
      ctx.fillText(`Poäng: ${this.score}`, 22, 60);
      ctx.fillText(`Lager (bananer): ${this.inventory}`, 22, 87);

      const timerRatio = clamp(this.roundTimeLeft / Math.max(this.roundDuration, 1), 0, 1);
      const tx1 = 280;
      const ty1 = 22;
      const tx2 = 650;
      const ty2 = 52;
      ctx.fillStyle = "#674f2e";
      ctx.font = "700 12px 'Segoe UI', sans-serif";
      ctx.fillText("Tid kvar", tx1, 14);
      ctx.fillStyle = "#ecdcb4";
      ctx.strokeStyle = "#b89558";
      ctx.lineWidth = 2;
      ctx.fillRect(tx1, ty1, tx2 - tx1, ty2 - ty1);
      ctx.strokeRect(tx1, ty1, tx2 - tx1, ty2 - ty1);
      ctx.fillStyle = "#f3c738";
      ctx.fillRect(tx1 + 2, ty1 + 2, (tx2 - tx1 - 4) * timerRatio, ty2 - ty1 - 4);
      ctx.fillStyle = "#3b2a17";
      ctx.font = "700 14px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${this.roundTimeLeft.toFixed(1).padStart(4, "0")}s`, (tx1 + tx2) / 2, 43);

      if (this.combo > 1 && this.comboTimer > 0) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#a14f00";
        ctx.font = "700 16px 'Segoe UI', sans-serif";
        ctx.fillText(`Kedja x${this.combo}`, 690, 40);
      }

      ctx.textAlign = "left";
      ctx.font = "700 12px 'Segoe UI', sans-serif";
      const audioStatus = !this.audio.enabled
        ? "Ljud: ej stöd"
        : this.audio.muted
          ? "Ljud: av (M)"
          : this.audio.unlocked
            ? "Ljud: på (M)"
            : "Ljud: klicka/tangent för att starta";
      ctx.fillStyle = this.audio.muted ? "#8a1c1c" : "#6e5735";
      ctx.fillText(audioStatus, 690, 62);

      ctx.textAlign = "left";
      ctx.fillStyle = "#6e5735";
      ctx.font = "12px 'Segoe UI', sans-serif";
      ctx.fillText(
        "Leverera med 1/2/3 eller Space. R = rädda-banans. M = ljud av/på.",
        22,
        110
      );
    }

    drawOffices(ctx) {
      for (const office of this.offices) {
        const x = office.x;
        const y = 145;
        this.roundedPanel(ctx, x - 120, y, x + 120, y + 110, "#fff4d2", "#c69d5a", 2);

        ctx.textAlign = "center";
        ctx.fillStyle = "#3b2a17";
        ctx.font = "700 14px 'Segoe UI', sans-serif";
        ctx.fillText(`${office.keyLabel}: ${office.name}`, x, y + 23);
        ctx.fillStyle = "#6a5534";
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.fillText(`Serverade: ${office.served}`, x, y + 44);

        const bx1 = x - 95;
        const by1 = y + 58;
        const bx2 = x + 95;
        const by2 = y + 84;
        ctx.fillStyle = "#ecdcb4";
        ctx.strokeStyle = "#b89558";
        ctx.lineWidth = 2;
        ctx.fillRect(bx1, by1, bx2 - bx1, by2 - by1);
        ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);
        const ratio = clamp(office.demand / 100, 0, 1);
        let color = "#2f9b4a";
        if (office.demand >= 45 && office.demand < 75) color = "#f1b433";
        else if (office.demand >= 75) color = "#d3472f";
        ctx.fillStyle = color;
        ctx.fillRect(bx1 + 2, by1 + 2, (bx2 - bx1 - 4) * ratio, by2 - by1 - 4);
        ctx.fillStyle = "#4d3a22";
        ctx.font = "700 11px 'Segoe UI', sans-serif";
        ctx.fillText(`Behov: ${office.demand.toFixed(0)}%`, x, y + 98);
      }
    }

    drawLaneGuides(ctx) {
      ctx.strokeStyle = "#e6d8b4";
      ctx.setLineDash([5, 8]);
      ctx.lineWidth = 2;
      for (const x of [200, 520, 840]) {
        ctx.beginPath();
        ctx.moveTo(x, 250);
        ctx.lineTo(x, GROUND_Y - 30);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    drawItems(ctx) {
      for (const item of this.items) this.drawItem(ctx, item);
    }

    drawItem(ctx, item) {
      const { x, y, radius: r } = item;
      if (item.kind === "banana") {
        this.drawDetailedBanana(ctx, x, y, r * 1.25, item.rotation, 0.35 + (Math.sin(item.wobbleSeed * 3) + 1) * 0.2);
      } else if (item.kind === "bunch") {
        this.drawBananaBunch(ctx, x, y, r * 1.15, item.rotation);
      } else if (item.kind === "crate") {
        this.drawBananaCrate(ctx, x, y, r);
      } else if (item.kind === "apple") {
        this.drawApple(ctx, x, y, r);
      } else if (item.kind === "pear") {
        this.drawPear(ctx, x, y, r);
      } else if (item.kind === "dragonfruit") {
        this.drawDragonfruit(ctx, x, y, r);
      }
    }

    drawDetailedBanana(ctx, x, y, size, rotation, ripeness = 0.5) {
      const s = size / 26;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      const p0 = { x: -30 * s, y: 10 * s };
      const p1 = { x: -18 * s, y: -18 * s };
      const p2 = { x: 8 * s, y: -24 * s };
      const p3 = { x: 31 * s, y: -3 * s };
      const samples = 24;

      const bezPoint = (t) => {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        return {
          x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
          y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
        };
      };
      const bezDeriv = (t) => {
        const u = 1 - t;
        return {
          x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
          y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
        };
      };
      const normFromDeriv = (d) => {
        const len = Math.hypot(d.x, d.y) || 1;
        // Normal chosen so the "outer" peel side stays on the same bend direction.
        return { x: -d.y / len, y: d.x / len };
      };
      const pathFromPoints = (points, close = false) => {
        if (!points.length) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        if (close) ctx.closePath();
      };

      const centerline = [];
      const outer = [];
      const inner = [];
      const ridgeA = [];
      const ridgeB = [];
      const highlight = [];
      const belly = [];

      for (let i = 0; i <= samples; i += 1) {
        const t = i / samples;
        const p = bezPoint(t);
        const d = bezDeriv(t);
        const n = normFromDeriv(d);
        const curve = Math.pow(Math.sin(Math.PI * t), 0.82);
        const tipTaper = clamp(Math.pow(Math.sin(Math.PI * t), 0.9), 0, 1);
        const width = (0.55 + 8.8 * curve) * s;
        const outerOff = width * (0.66 + 0.05 * (1 - t)); // slightly fuller peel side
        const innerOff = width * 0.40;

        centerline.push({ x: p.x, y: p.y, n, t });
        outer.push({ x: p.x + n.x * outerOff * tipTaper, y: p.y + n.y * outerOff * tipTaper });
        inner.push({ x: p.x - n.x * innerOff * tipTaper, y: p.y - n.y * innerOff * tipTaper });
        highlight.push({ x: p.x + n.x * outerOff * 0.62 * tipTaper, y: p.y + n.y * outerOff * 0.62 * tipTaper });
        belly.push({ x: p.x - n.x * innerOff * 0.62 * tipTaper, y: p.y - n.y * innerOff * 0.62 * tipTaper });
        ridgeA.push({ x: p.x + n.x * outerOff * 0.18 * tipTaper, y: p.y + n.y * outerOff * 0.18 * tipTaper });
        ridgeB.push({ x: p.x - n.x * innerOff * 0.18 * tipTaper, y: p.y - n.y * innerOff * 0.18 * tipTaper });
      }

      // Soft ground shadow, elongated so the silhouette reads as long/curved.
      ctx.fillStyle = "rgba(68, 45, 20, 0.16)";
      ctx.beginPath();
      ctx.ellipse(3 * s, 14 * s, 26 * s, 5 * s, 0.16, 0, Math.PI * 2);
      ctx.fill();

      // Banana body from two parallel-ish edges traced around the same centerline.
      ctx.beginPath();
      ctx.moveTo(outer[0].x, outer[0].y);
      for (let i = 1; i < outer.length; i += 1) ctx.lineTo(outer[i].x, outer[i].y);
      for (let i = inner.length - 1; i >= 0; i -= 1) ctx.lineTo(inner[i].x, inner[i].y);
      ctx.closePath();

      const grad = ctx.createLinearGradient(-34 * s, -24 * s, 34 * s, 18 * s);
      grad.addColorStop(0.0, "#fff8b8");
      grad.addColorStop(0.16, "#f7e95e");
      grad.addColorStop(0.50, ripeness > 0.65 ? "#efc623" : "#f0cf34");
      grad.addColorStop(0.82, ripeness > 0.8 ? "#d39a15" : "#dfb81f");
      grad.addColorStop(1.0, "#ae7d10");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "#8f6915";
      ctx.lineWidth = 1.85 * s;
      ctx.stroke();

      // Subtle fresher green tint near the stem end.
      ctx.beginPath();
      for (let i = 0; i <= Math.floor(samples * 0.22); i += 1) {
        const pt = outer[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      for (let i = Math.floor(samples * 0.22); i >= 0; i -= 1) {
        const pt = inner[i];
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = rgba("#8dbd37", ripeness < 0.5 ? 0.18 : 0.08);
      ctx.fill();

      // Outer highlight (cartoon readable).
      pathFromPoints(highlight);
      ctx.strokeStyle = "rgba(255,255,230,0.9)";
      ctx.lineWidth = 1.35 * s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Belly shadow line (same bend direction, inner side).
      pathFromPoints(belly);
      ctx.strokeStyle = "rgba(117, 82, 14, 0.44)";
      ctx.lineWidth = 1.15 * s;
      ctx.stroke();

      // Peel ridges along the same arc direction.
      pathFromPoints(ridgeA);
      ctx.strokeStyle = "rgba(160, 118, 20, 0.28)";
      ctx.lineWidth = 0.7 * s;
      ctx.stroke();
      pathFromPoints(ridgeB);
      ctx.strokeStyle = "rgba(126, 92, 15, 0.24)";
      ctx.lineWidth = 0.6 * s;
      ctx.stroke();

      // Small freckles / bruises clustered toward the mid-late section.
      ctx.fillStyle = ripeness > 0.6 ? "rgba(108, 68, 20, 0.2)" : "rgba(116, 89, 34, 0.12)";
      for (const idx of [9, 12, 15, 18]) {
        const p = centerline[idx];
        if (!p) continue;
        const r = (0.7 + (idx % 3) * 0.2) * s;
        ctx.beginPath();
        ctx.arc(p.x + p.n.x * (1.5 * s), p.y + p.n.y * (1.5 * s), r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Stem (left) aligned with tangent.
      const stemBase = centerline[0];
      const stemTan = bezDeriv(0.02);
      const stemLen = Math.hypot(stemTan.x, stemTan.y) || 1;
      const tx0 = stemTan.x / stemLen;
      const ty0 = stemTan.y / stemLen;
      const nx0 = -ty0;
      const ny0 = tx0;
      ctx.fillStyle = "#6d4b1d";
      ctx.beginPath();
      ctx.moveTo(stemBase.x + nx0 * 2.3 * s, stemBase.y + ny0 * 2.3 * s);
      ctx.lineTo(stemBase.x - tx0 * 8.8 * s + nx0 * 1.5 * s, stemBase.y - ty0 * 8.8 * s + ny0 * 1.5 * s);
      ctx.lineTo(stemBase.x - tx0 * 9.8 * s - nx0 * 1.4 * s, stemBase.y - ty0 * 9.8 * s - ny0 * 1.4 * s);
      ctx.lineTo(stemBase.x - nx0 * 1.8 * s, stemBase.y - ny0 * 1.8 * s);
      ctx.closePath();
      ctx.fill();

      // Tip (right) as a small dark point.
      const tipBase = centerline[centerline.length - 1];
      const tipTan = bezDeriv(0.98);
      const tipLen = Math.hypot(tipTan.x, tipTan.y) || 1;
      const tx1 = tipTan.x / tipLen;
      const ty1 = tipTan.y / tipLen;
      ctx.fillStyle = "#4b3518";
      ctx.beginPath();
      ctx.arc(tipBase.x + tx1 * 2.2 * s, tipBase.y + ty1 * 2.2 * s, 1.55 * s, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    drawBananaBunch(ctx, x, y, size, rotation = 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation * 0.7);
      this.drawDetailedBanana(ctx, -9, 4, size * 0.88, -0.18, 0.42);
      this.drawDetailedBanana(ctx, 11, 1, size * 0.92, 0.05, 0.55);
      this.drawDetailedBanana(ctx, 2, 13, size * 0.82, 0.22, 0.7);
      ctx.fillStyle = "#6b4720";
      ctx.beginPath();
      ctx.ellipse(0, -15, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.ellipse(2, -15, 3, 1.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawBananaCrate(ctx, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#b67d42";
      ctx.strokeStyle = "#6b4420";
      ctx.lineWidth = 2;
      this.roundedPanel(ctx, -r, -r, r, r, "#b67d42", "#6b4420", 2, true);
      ctx.strokeStyle = "#8f5d2c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r + 2, -2);
      ctx.lineTo(r - 2, -2);
      ctx.moveTo(-r + 2, 8);
      ctx.lineTo(r - 2, 8);
      ctx.stroke();
      ctx.fillStyle = "#fff0b5";
      ctx.font = "700 10px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BAN", 0, 6);
      this.drawDetailedBanana(ctx, -4, -8, 13, -0.1, 0.4);
      this.drawDetailedBanana(ctx, 8, -7, 12, 0.12, 0.6);
      ctx.restore();
    }

    drawApple(ctx, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      const grad = ctx.createRadialGradient(-5, -7, 2, 0, 0, r + 2);
      grad.addColorStop(0, "#ff8b78");
      grad.addColorStop(0.5, "#df4f3d");
      grad.addColorStop(1, "#ab2b22");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "#7a211b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#6b4520";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -r + 2);
      ctx.lineTo(3, -r - 8);
      ctx.stroke();
      ctx.fillStyle = "#4e9e3f";
      ctx.beginPath();
      ctx.ellipse(8, -r + 1, 7, 4, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawPear(ctx, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      const grad = ctx.createRadialGradient(-4, -8, 2, 2, 4, r + 8);
      grad.addColorStop(0, "#d4ef79");
      grad.addColorStop(0.6, "#a5c83c");
      grad.addColorStop(1, "#6f8d24");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "#678222";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 5, r * 0.9, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -6, r * 0.62, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#6b4520";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -r + 1);
      ctx.lineTo(2, -r - 10);
      ctx.stroke();
      ctx.restore();
    }

    drawDragonfruit(ctx, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      const grad = ctx.createRadialGradient(-4, -6, 2, 0, 0, r + 4);
      grad.addColorStop(0, "#ff9fc0");
      grad.addColorStop(0.5, "#ea5a96");
      grad.addColorStop(1, "#aa2d65");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "#8c2450";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let a = 0; a < 360; a += 60) {
        const rad = (a * Math.PI) / 180;
        const nx = Math.cos(rad) * (r + 2);
        const ny = Math.sin(rad) * (r + 2);
        const nx2 = Math.cos(rad + 0.3) * (r - 4);
        const ny2 = Math.sin(rad + 0.3) * (r - 4);
        ctx.fillStyle = "#55b14a";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(nx, ny);
        ctx.lineTo(nx2, ny2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    drawPlayer(ctx) {
      const p = this.playerRect();
      ctx.fillStyle = "#4e3a28";
      ctx.beginPath();
      ctx.arc(p.x1 + 23, p.y2 + 9, 11, 0, Math.PI * 2);
      ctx.arc(p.x2 - 23, p.y2 + 9, 11, 0, Math.PI * 2);
      ctx.fill();

      const cartGrad = ctx.createLinearGradient(p.x1, p.y1, p.x1, p.y2);
      cartGrad.addColorStop(0, "#c58c4e");
      cartGrad.addColorStop(1, "#996332");
      ctx.fillStyle = cartGrad;
      ctx.strokeStyle = "#5f3d1d";
      ctx.lineWidth = 3;
      this.roundedPanel(ctx, p.x1, p.y1, p.x2, p.y2, cartGrad, "#5f3d1d", 3, true);

      ctx.strokeStyle = "#d9a367";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x1 + 10, p.y1 + 8);
      ctx.lineTo(p.x2 - 10, p.y1 + 8);
      ctx.stroke();
      ctx.fillStyle = "#4f381f";
      ctx.font = "700 10px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BANANVAGN", (p.x1 + p.x2) / 2, p.y1 - 10);

      const shown = Math.min(this.inventory, 8);
      for (let i = 0; i < shown; i += 1) {
        const cx = p.x1 + 15 + (i % 4) * 28;
        const cy = p.y1 + 11 + Math.floor(i / 4) * 14;
        this.drawDetailedBanana(ctx, cx, cy, 10, -0.12 + (i % 4) * 0.04, 0.45 + i * 0.04);
      }
      if (this.inventory > 8) {
        ctx.fillStyle = "#fff4ba";
        ctx.font = "700 10px 'Segoe UI', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`+${this.inventory - 8}`, p.x2 - 34, p.y1 + 14);
      }
    }

    drawSidePanel(ctx) {
      const x1 = 900;
      const y1 = 145;
      const x2 = 1080;
      const y2 = 680;
      this.roundedPanel(ctx, x1, y1, x2, y2, "#fff7e1", "#c59c58", 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#3b2a17";
      ctx.font = "700 15px 'Segoe UI', sans-serif";
      ctx.fillText("Policypanel", (x1 + x2) / 2, y1 + 23);

      const entries = [
        ["Hållbarhet", this.metrics.hallbarhet, "#2f9b4a"],
        ["Likvärdighet", this.metrics.likvardighet, "#3b7ddd"],
        ["Konsekvens", this.metrics.konsekvens, "#d18b1f"],
      ];

      let y = y1 + 58;
      for (const [name, value, color] of entries) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#4a3a25";
        ctx.font = "700 12px 'Segoe UI', sans-serif";
        ctx.fillText(name, x1 + 14, y);
        ctx.fillStyle = "#eedfb8";
        ctx.strokeStyle = "#b89558";
        ctx.lineWidth = 2;
        ctx.fillRect(x1 + 14, y + 12, x2 - x1 - 28, 22);
        ctx.strokeRect(x1 + 14, y + 12, x2 - x1 - 28, 22);
        ctx.fillStyle = color;
        ctx.fillRect(x1 + 16, y + 14, (x2 - x1 - 32) * clamp(value / 100, 0, 1), 18);
        ctx.textAlign = "right";
        ctx.fillStyle = "#4a3a25";
        ctx.font = "700 11px 'Segoe UI', sans-serif";
        ctx.fillText(`${value.toFixed(0)}%`, x2 - 18, y + 2);
        y += 68;
      }

      const svinnScore = clamp(100 - this.wasteCount * 4.2, 0, 100);
      ctx.textAlign = "left";
      ctx.fillStyle = "#4a3a25";
      ctx.font = "700 12px 'Segoe UI', sans-serif";
      ctx.fillText("Svinnkontroll", x1 + 14, y);
      ctx.fillStyle = "#eedfb8";
      ctx.strokeStyle = "#b89558";
      ctx.fillRect(x1 + 14, y + 12, x2 - x1 - 28, 22);
      ctx.strokeRect(x1 + 14, y + 12, x2 - x1 - 28, 22);
      ctx.fillStyle = "#8e5ec9";
      ctx.fillRect(x1 + 16, y + 14, (x2 - x1 - 32) * (svinnScore / 100), 18);
      ctx.textAlign = "right";
      ctx.fillStyle = "#4a3a25";
      ctx.font = "700 11px 'Segoe UI', sans-serif";
      ctx.fillText(`${svinnScore.toFixed(0)}%`, x2 - 18, y + 2);

      y += 64;
      ctx.textAlign = "left";
      ctx.fillStyle = "#5e4b2f";
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.fillText(`Missade bananer: ${this.missedBananas}`, x1 + 14, y + 6);
      ctx.fillText(`Svinn-enheter: ${this.wasteCount}`, x1 + 14, y + 30);

      y += 68;
      ctx.fillStyle = "#4a3a25";
      ctx.font = "700 12px 'Segoe UI', sans-serif";
      ctx.fillText("Varför banan?", x1 + 14, y);
      const bullets = [
        "Stabil tillgång -> konsekvent policy",
        "Lätt att ge lika i hela organisationen",
        "Skal + mognad = mindre svinn i drift",
        "Låg friktion i beställning och utdelning",
      ];
      let yy = y + 24;
      for (const bullet of bullets) {
        this.drawWrappedText(ctx, `• ${bullet}`, x1 + 16, yy, x2 - x1 - 28, 16, "10px 'Segoe UI', sans-serif", "#5f4c30");
        yy += 42;
      }
    }

    drawQuizOverlay(ctx) {
      const quiz = this.quizzes[this.quizIndex];
      const x1 = 110;
      const y1 = 115;
      const x2 = WIDTH - 110;
      const y2 = HEIGHT - 110;
      this.roundedPanel(ctx, x1, y1, x2, y2, "#fff9ec", "#c79d5b", 4);

      ctx.textAlign = "center";
      ctx.fillStyle = "#3b2a17";
      ctx.font = "700 18px 'Segoe UI', sans-serif";
      ctx.fillText(`Policyfråga ${this.quizIndex + 1}/3`, (x1 + x2) / 2, y1 + 34);

      this.drawWrappedText(ctx, quiz.quote, x1 + 24, y1 + 70, x2 - x1 - 48, 22, "italic 14px 'Segoe UI', sans-serif", "#5e4b2e");
      this.drawWrappedText(ctx, quiz.prompt, x1 + 24, y1 + 136, x2 - x1 - 48, 22, "700 15px 'Segoe UI', sans-serif", "#3b2a17");

      this.quizButtons = [];
      const oy = y1 + 190;
      for (let i = 0; i < quiz.options.length; i += 1) {
        const [text, correct] = quiz.options[i];
        const bx1 = x1 + 22;
        const by1 = oy + i * 102;
        const bx2 = x2 - 22;
        const by2 = oy + i * 102 + 82;

        const hovered = this.quizSelected === null &&
          this.mouse.x >= bx1 && this.mouse.x <= bx2 &&
          this.mouse.y >= by1 && this.mouse.y <= by2;

        let fill = hovered ? "#fff3ca" : "#fffdf4";
        let outline = "#d0a55d";
        if (this.quizSelected !== null) {
          if (i === this.quizSelected) {
            if (this.quizResultOk) {
              fill = "#d9f5dd";
              outline = "#3c8f46";
            } else {
              fill = "#ffd9d9";
              outline = "#b83838";
            }
          } else if (correct) {
            fill = "#e9f9e7";
            outline = "#6baa58";
          }
        }

        this.roundedPanel(ctx, bx1, by1, bx2, by2, fill, outline, 2);
        this.drawWrappedText(
          ctx,
          `${i + 1}. ${text}`,
          bx1 + 16,
          by1 + 16,
          bx2 - bx1 - 32,
          18,
          "12px 'Segoe UI', sans-serif",
          "#3a2d1e"
        );
        this.quizButtons.push({ x1: bx1, y1: by1, x2: bx2, y2: by2 });
      }

      if (this.quizSelected === null) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#6a5534";
        ctx.font = "700 12px 'Segoe UI', sans-serif";
        ctx.fillText("Klicka på ett svar eller tryck 1 / 2 / 3", (x1 + x2) / 2, y2 - 30);
      } else {
        this.drawWrappedText(
          ctx,
          this.quizFeedback,
          x1 + 24,
          y2 - 60,
          x2 - x1 - 48,
          18,
          "700 12px 'Segoe UI', sans-serif",
          this.quizResultOk ? "#2c6631" : "#8a1c1c"
        );
        ctx.textAlign = "center";
        ctx.fillStyle = "#5f4c30";
        ctx.font = "700 12px 'Segoe UI', sans-serif";
        ctx.fillText("Tryck Enter eller Space för nästa steg", (x1 + x2) / 2, y2 - 18);
      }
    }

    drawEndScreen(ctx, win) {
      this.drawTitleBananaCluster(ctx, WIDTH / 2, 110);
      const title = win ? "Bananen Vann Organisationen!" : "Standarden Brast";
      const subtitle = win
        ? "Om vi menar allvar med konsekvens, likvärdighet och minskat svinn är bananen det enda stabila valet."
        : "För låg stabilitet i vardagen. Testa igen och håll ihop leveranserna bättre.";

      ctx.textAlign = "center";
      ctx.fillStyle = "#3b2a17";
      ctx.font = "900 28px 'Segoe UI', sans-serif";
      ctx.fillText(title, WIDTH / 2, 132);
      this.drawWrappedText(ctx, subtitle, 120, 154, WIDTH - 240, 18, "13px 'Segoe UI', sans-serif", "#644d2c", true);

      this.roundedPanel(ctx, 120, 220, WIDTH - 120, HEIGHT - 110, "#fff8e5", "#c79d5b", 2);

      const metrics = [
        ["Poäng", this.score, null],
        ["Hållbarhet", this.metrics.hallbarhet, "%"],
        ["Likvärdighet", this.metrics.likvardighet, "%"],
        ["Konsekvens", this.metrics.konsekvens, "%"],
        ["Missade bananer", this.missedBananas, null],
        ["Svinn-enheter", this.wasteCount, null],
      ];
      let y = 265;
      for (const [name, value, suffix] of metrics) {
        const valText = (typeof value === "number" && suffix === "%")
          ? `${value.toFixed(0)}${suffix}`
          : `${Math.round(value)}${suffix || ""}`;
        ctx.textAlign = "left";
        ctx.fillStyle = "#443420";
        ctx.font = "700 15px 'Segoe UI', sans-serif";
        ctx.fillText(name, 170, y);
        ctx.textAlign = "right";
        ctx.fillStyle = "#5d4729";
        ctx.font = "15px 'Segoe UI', sans-serif";
        ctx.fillText(valText, WIDTH - 170, y);
        ctx.strokeStyle = "#e4d3ab";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(160, y + 16);
        ctx.lineTo(WIDTH - 160, y + 16);
        ctx.stroke();
        y += 48;
      }

      ctx.textAlign = "left";
      ctx.fillStyle = "#443420";
      ctx.font = "700 14px 'Segoe UI', sans-serif";
      ctx.fillText("Speltips:", 170, y + 12);
      const tips = [
        "Prioritera jämn fördelning mellan kontoren för hög likvärdighet.",
        "Använd Space för snabb leverans till störst behov.",
        "Tryck R vid lageröverskott för att rädda hållbarhet.",
        "Undvik fel frukter - de skadar standard och konsekvens.",
      ];
      let yy = y + 42;
      for (const tip of tips) {
        ctx.fillStyle = "#5d4729";
        ctx.font = "12px 'Segoe UI', sans-serif";
        ctx.fillText(`• ${tip}`, 180, yy);
        yy += 32;
      }

      this.roundedPanel(ctx, WIDTH / 2 - 190, HEIGHT - 79, WIDTH / 2 + 190, HEIGHT - 26, "#f2cd42", "#7f6216", 3);
      ctx.textAlign = "center";
      ctx.fillStyle = "#3b2a17";
      ctx.font = "700 13px 'Segoe UI', sans-serif";
      ctx.fillText("Klicka eller tryck Enter för ny omgång", WIDTH / 2, HEIGHT - 48);
    }

    drawFloatingTexts(ctx) {
      ctx.textAlign = "center";
      for (const ft of this.floatingTexts) {
        const alphaLike = clamp(ft.ttl / 1.2, 0.2, 1.0);
        ctx.font = "700 11px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#fff6de";
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = fadeColor(ft.color, alphaLike);
        ctx.fillText(ft.text, ft.x, ft.y);
      }
    }

    drawTitleBananaCluster(ctx, cx, cy) {
      const angles = [-35, -10, 18, 42];
      for (let i = 0; i < angles.length; i += 1) {
        const ang = (angles[i] * Math.PI) / 180;
        const dx = Math.cos(ang) * 85;
        const dy = Math.sin(ang) * 18;
        this.drawDetailedBanana(ctx, cx + dx, cy + dy, 28, ang * 0.32, 0.35 + i * 0.12);
      }
    }

    roundedPanel(ctx, x1, y1, x2, y2, fill, outline, width = 2, local = false) {
      const r = 14;
      ctx.save();
      if (!local) ctx.beginPath();
      this.roundRectPath(ctx, x1, y1, x2 - x1, y2 - y1, r);
      if (typeof fill === "string") {
        ctx.fillStyle = fill;
      } else {
        ctx.fillStyle = fill;
      }
      ctx.fill();
      ctx.lineWidth = width;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.restore();
    }

    roundRectPath(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    }

    drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, font, color, center = false) {
      ctx.save();
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = center ? "center" : "left";

      const words = String(text).split(/\s+/);
      const lines = [];
      let current = "";

      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);

      for (let i = 0; i < lines.length; i += 1) {
        if (center) {
          ctx.fillText(lines[i], x + maxWidth / 2, y + i * lineHeight);
        } else {
          ctx.fillText(lines[i], x, y + i * lineHeight);
        }
      }
      ctx.restore();
    }
  }

  function boot() {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) return;
    new BananaPolicyGameWeb(canvas);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
