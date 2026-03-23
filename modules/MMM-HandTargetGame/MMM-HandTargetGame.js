Module.register("MMM-HandTargetGame", {
  defaults: {
    startHidden: true,
    defaultDuration: 30,
    initialDifficulty: 4,
    maxDifficulty: 7,
    evaluationWindowRounds: 5,
    gracePeriodMs: 350,
    safeMarginRatio: 0.12,
    gameOverDisplayMs: 5000,
    levels: {
      1: { radius: 130, lifetimeMs: 3200, spawn: "center",  spawnWeights: { 1: 1.0, 2: 0.0, 3: 0.0 } },
      2: { radius: 115, lifetimeMs: 2800, spawn: "center",  spawnWeights: { 1: 1.0, 2: 0.0, 3: 0.0 } },
      3: { radius: 100, lifetimeMs: 2400, spawn: "inner",   spawnWeights: { 1: 0.9, 2: 0.1, 3: 0.0 } },
      4: { radius: 90,  lifetimeMs: 2100, spawn: "inner",   spawnWeights: { 1: 0.75, 2: 0.25, 3: 0.0 } },
      5: { radius: 78,  lifetimeMs: 1800, spawn: "full",    spawnWeights: { 1: 0.45, 2: 0.50, 3: 0.05 } },
      6: { radius: 66,  lifetimeMs: 1500, spawn: "full",    spawnWeights: { 1: 0.20, 2: 0.65, 3: 0.15 } },
      7: { radius: 54,  lifetimeMs: 1200, spawn: "full",    spawnWeights: { 1: 0.20, 2: 0.60, 3: 0.20 } }
    }
  },

  start: function () {
    this.state = "IDLE";
    this.visible = !this.config.startHidden;
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.currentDifficulty = this.config.initialDifficulty || 4;
    this.gameDuration = this.config.defaultDuration || 30;
    this.remainingGameMs = this.gameDuration * 1000;
    this.targets = [];
    this.activeRoundStart = null;
    this.activeRoundExpiresAt = null;
    this.roundTimer = null;
    this.gameTimer = null;
    this.countdownTimer = null;
    this.hudTimer = null;
    this.feedbackMessage = "";
    this.feedbackTimeout = null;
    this.lastKnownHands = []; // array of {x, y}
    this.roundResults = [];
    this.gameStartedAt = null;
    this.videoFrameSrc = null;
    this.wrapperId = `hand-target-game-${this.identifier}`;
  },

  getStyles: function () {
    return ["MMM-HandTargetGame.css"];
  },

  notificationReceived: function (notification, payload, sender) {
    if (notification === "START_HAND_TARGET_GAME") {
      this.startDurationSelection();
    }

    if (notification === "HAND_GAME_DURATION_30" && this.state === "AWAITING_DURATION") {
      this.beginCountdown(30);
    }
    if (notification === "HAND_GAME_DURATION_45" && this.state === "AWAITING_DURATION") {
      this.beginCountdown(45);
    }
    if (notification === "HAND_GAME_DURATION_60" && this.state === "AWAITING_DURATION") {
      this.beginCountdown(60);
    }

    if (notification === "EXIT_HAND_TARGET_GAME") {
      if (this.state === "ACTIVE" || this.state === "COUNTDOWN" || this.state === "AWAITING_DURATION") {
        this.endGame();
      }
    }
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "HAND_COORDS_MULTI") {
      this.lastKnownHands = payload.points || [];
      if (this.state === "ACTIVE") {
        this.checkHits();
      }
      this.updateHandCursors();
    }

    if (notification === "VIDEO_FRAME") {
      const videoEl = document.getElementById("htg-video-bg");
      if (videoEl) {
        videoEl.src = `data:image/jpeg;base64,${payload.data}`;
        videoEl.style.display = "";
      }
      this.videoFrameSrc = `data:image/jpeg;base64,${payload.data}`;
    }
  },


  updateHandCursors: function () {
    // remove old cursors
    document.querySelectorAll(".htg-hand-cursor").forEach(el => el.remove());

    const screen = document.querySelector(".htg-screen");
    if (!screen) return;

    this.lastKnownHands.forEach((hand, i) => {
      const cursor = document.createElement("div");
      cursor.className = "htg-hand-cursor";
      cursor.style.left = `${hand.x * 100}%`;
      cursor.style.top = `${hand.y * 100}%`;
      screen.appendChild(cursor);
    });
  },

  startHudTimer: function () {
    if (this.hudTimer) clearInterval(this.hudTimer);
    this.hudTimer = setInterval(() => {
      const timeEl = document.getElementById("htg-time-display");
      const scoreEl = document.getElementById("htg-score-display");
      if (timeEl && this.gameStartedAt) {
        const elapsed = Date.now() - this.gameStartedAt;
        this.remainingGameMs = Math.max(0, this.gameDuration * 1000 - elapsed);
        timeEl.textContent = `Time: ${(this.remainingGameMs / 1000).toFixed(1)}s`;

        if (this.remainingGameMs <= 0) {
          this.endGame();
        }
      }
      if (scoreEl) {
        scoreEl.textContent = `Score: ${this.score}`;
      }

      // update target countdown timers directly
      if (this.activeRoundExpiresAt) {
        const msLeft = Math.max(0, this.activeRoundExpiresAt - Date.now());
        const secsLeft = (msLeft / 1000).toFixed(1);
        const timerEls = document.querySelectorAll(".htg-target-timer");
        timerEls.forEach(el => { el.textContent = secsLeft; });
      }
    }, 50);
  },

  stopHudTimer: function () {
    if (this.hudTimer) {
      clearInterval(this.hudTimer);
      this.hudTimer = null;
    }
  },

  // game flow

  startDurationSelection: function () {
    this.resetGameState();
    this.state = "AWAITING_DURATION";
    this.visible = true;
    this.sendSocketNotification("START_HAND_TRACKER", {});
    this.updateDom();
  },

  beginCountdown: function (seconds) {
    this.gameDuration = seconds;
    this.remainingGameMs = seconds * 1000;
    this.state = "COUNTDOWN";
    this.countdownValue = 3;
    this.updateDom();

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      this.countdownValue -= 1;
      if (this.countdownValue <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startGame();
      }
      this.updateDom();
    }, 1000);
  },

  startGame: function () {
    this.state = "ACTIVE";
    this.visible = true;
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.currentDifficulty = this.config.initialDifficulty || 4;
    this.roundResults = [];
    this.gameStartedAt = Date.now();

    // build the game DOM once
    this.updateDom();

    // start HUD timer for direct updates so no DOM rebuilds
    this.startHudTimer();

    // spawn first round after DOM is ready
    setTimeout(() => { this.spawnRound(); }, 100);
  },

  endGame: function () {
    this.stopHudTimer();
    if (this.roundTimer) clearInterval(this.roundTimer);
    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.roundTimer = null;
    this.gameTimer = null;
    this.countdownTimer = null;
    this.sendSocketNotification("STOP_HAND_TRACKER", {});
    this.targets = [];
    this.state = "ENDED";
    this.videoFrameSrc = null;
    this.updateDom();

    setTimeout(() => {
      this.state = "IDLE";
      this.visible = false;
      this.updateDom();
      this.sendNotification("HAND_GAME_ENDED");
    }, this.config.gameOverDisplayMs);
  },

  resetGameState: function () {
    this.stopHudTimer();
    if (this.roundTimer) clearInterval(this.roundTimer);
    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.targets = [];
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.roundResults = [];
    this.feedbackMessage = "";
    this.lastKnownHands = [];
    this.videoFrameSrc = null;
    this.remainingGameMs = (this.config.defaultDuration || 30) * 1000;
  },

  // target spawning

  chooseTargetCount: function (difficulty) {
    const weights = this.config.levels[difficulty].spawnWeights;
    const roll = Math.random();
    let cumulative = 0;
    for (const k of [1, 2, 3]) {
      cumulative += weights[k] || 0;
      if (roll <= cumulative) return k;
    }
    return 1;
  },

  spawnRound: function () {
    if (this.state !== "ACTIVE") return;

    const levelCfg = this.config.levels[this.currentDifficulty];
    const count = this.chooseTargetCount(this.currentDifficulty);
    const area = this.getPlayableArea(levelCfg.spawn);

    this.targets = [];
    for (let i = 0; i < count; i++) {
      this.targets.push(this.generateTarget(levelCfg.radius, area, this.targets));
    }

    this.activeRoundStart = Date.now();
    this.activeRoundExpiresAt = this.activeRoundStart + levelCfg.lifetimeMs;

    // render targets directly into the game container
    this.renderTargets();

    // set round expiry check
    if (this.roundTimer) clearInterval(this.roundTimer);
    this.roundTimer = setInterval(() => {
      const now = Date.now();
      if (now >= this.activeRoundExpiresAt) {
        clearInterval(this.roundTimer);
        this.roundTimer = null;
        const missed = this.targets.filter(t => !t.hit).length;
        this.misses += missed;
        for (let i = 0; i < missed; i++) {
          this.roundResults.push({ hit: false });
        }
        this.evaluateDifficultyIfNeeded();
        this.spawnRound();
      }
    }, 50);
  },

  renderTargets: function () {
    const container = document.getElementById("htg-target-container");
    if (!container) return;

    // remove old targets
    container.querySelectorAll(".htg-target").forEach(el => el.remove());

    // add new targets
    this.targets.forEach((t) => {
      const div = document.createElement("div");
      div.className = "htg-target";
      div.id = `htg-t-${t.id}`;
      div.style.width = `${t.radius * 2}px`;
      div.style.height = `${t.radius * 2}px`;
      div.style.left = `${t.x - t.radius}px`;
      div.style.top = `${t.y - t.radius}px`;

      const span = document.createElement("span");
      span.className = "htg-target-timer";
      const msLeft = Math.max(0, this.activeRoundExpiresAt - Date.now());
      span.textContent = (msLeft / 1000).toFixed(1);
      div.appendChild(span);

      container.appendChild(div);
    });
  },

  getPlayableArea: function (mode) {
    const width = window.innerWidth || 1280;
    const height = window.innerHeight || 720;
    const mX = width * this.config.safeMarginRatio;
    const mY = height * this.config.safeMarginRatio;

    if (mode === "center") {
      return { minX: width * 0.3, maxX: width * 0.7, minY: height * 0.25, maxY: height * 0.75 };
    }
    if (mode === "inner") {
      return { minX: width * 0.2, maxX: width * 0.8, minY: height * 0.18, maxY: height * 0.82 };
    }
    return { minX: mX, maxX: width - mX, minY: mY, maxY: height - mY };
  },

  generateTarget: function (radius, area, existingTargets) {
    let x, y, tries = 0;
    do {
      x = Math.random() * (area.maxX - area.minX) + area.minX;
      y = Math.random() * (area.maxY - area.minY) + area.minY;
      tries += 1;
    } while (
      existingTargets.some(t => this.distance(x, y, t.x, t.y) < radius * 2.4) &&
      tries < 50
    );
    return { id: `${Date.now()}-${Math.random()}`, x, y, radius, hit: false };
  },

  // hit detection

  checkHits: function () {
    if (!this.lastKnownHands.length || !this.targets.length) return;

    const elapsedFromSpawn = Date.now() - this.activeRoundStart;
    if (elapsedFromSpawn < this.config.gracePeriodMs) return;

    let anyHit = false;

    // check each hand against each target
    this.lastKnownHands.forEach((hand) => {
      const handX = hand.x * window.innerWidth;
      const handY = hand.y * window.innerHeight;

      this.targets.forEach((target) => {
        if (!target.hit && this.distance(handX, handY, target.x, target.y) <= target.radius) {
          target.hit = true;
          this.score += 1;
          this.hits += 1;
          this.roundResults.push({
            hit: true,
            reactionMs: Date.now() - this.activeRoundStart
          });
          anyHit = true;

          const el = document.getElementById(`htg-t-${target.id}`);
          if (el) el.remove();
        }
      });
    });

    if (anyHit) {
      const remaining = this.targets.filter(t => !t.hit);
      if (remaining.length === 0) {
        const totalInRound = this.targets.length;
        if (totalInRound === 2) this.score += 1;
        if (totalInRound === 3) this.score += 2;

        if (this.roundTimer) clearInterval(this.roundTimer);
        this.roundTimer = null;
        this.evaluateDifficultyIfNeeded();
        this.spawnRound();
      }
    }
  },

  // adaptable difficulty

  evaluateDifficultyIfNeeded: function () {
    const windowSize = this.config.evaluationWindowRounds || 5;
    const recent = this.roundResults.slice(-windowSize);
    if (recent.length < windowSize) return;

    const hits = recent.filter(r => r.hit).length;
    const accuracy = hits / recent.length;
    const successfulReactions = recent.filter(r => r.hit && typeof r.reactionMs === "number");
    const avgReaction = successfulReactions.length
      ? successfulReactions.reduce((a, b) => a + b.reactionMs, 0) / successfulReactions.length
      : Infinity;

    const prev = this.currentDifficulty;
    if (accuracy >= 0.75 && avgReaction < this.config.levels[this.currentDifficulty].lifetimeMs * 0.8) {
      this.currentDifficulty = Math.min(this.config.maxDifficulty, this.currentDifficulty + 1);
    } else if (accuracy <= 0.4) {
      this.currentDifficulty = Math.max(1, this.currentDifficulty - 1);
    }

    if (this.currentDifficulty !== prev) {
      const msg = this.currentDifficulty > prev ? "Difficulty increased!" : "Difficulty decreased!";
      this.flashMessage(msg);

      // update difficulty display
      const diffEl = document.getElementById("htg-difficulty-display");
      if (diffEl) diffEl.textContent = `Difficulty: ${this.currentDifficulty}/7`;
    }
  },

  flashMessage: function (message) {
    this.feedbackMessage = message;
    const feedbackEl = document.getElementById("htg-feedback");
    if (feedbackEl) {
      feedbackEl.textContent = message;
      feedbackEl.style.display = "";
    }
    if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => {
      this.feedbackMessage = "";
      const el = document.getElementById("htg-feedback");
      if (el) el.style.display = "none";
    }, 1400);
  },

  distance: function (x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  },

  // DOM only rebuild wehn state changes

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.id = this.wrapperId;
    wrapper.className = "hand-target-game-wrapper";

    if (!this.visible) {
      wrapper.style.display = "none";
      return wrapper;
    }

    const videoBgHtml = `<img id="htg-video-bg" class="htg-video-bg"
      src="${this.videoFrameSrc || ""}"
      style="${this.videoFrameSrc ? "" : "display:none;"}"
      alt="" />`;

    const handCursorHtml = ``;

    if (this.state === "AWAITING_DURATION") {
      wrapper.innerHTML = `
        <div class="htg-screen">
          ${videoBgHtml}
          <div class="htg-overlay"></div>
          ${handCursorHtml}
          <div class="htg-center-panel">
            <h1>Hand Target Game</h1>
            <p>Say <strong>30 seconds</strong>, <strong>45 seconds</strong>, or <strong>60 seconds</strong></p>
            <p class="htg-hint">Say <strong>"exit"</strong> to go back</p>
          </div>
        </div>
      `;
      return wrapper;
    }

    if (this.state === "COUNTDOWN") {
      wrapper.innerHTML = `
        <div class="htg-screen">
          ${videoBgHtml}
          <div class="htg-overlay"></div>
          ${handCursorHtml}
          <div class="htg-center-panel">
            <h1 class="htg-countdown-num">${this.countdownValue}</h1>
            <p>Get ready!</p>
          </div>
        </div>
      `;
      return wrapper;
    }

    if (this.state === "ENDED") {
      const attempts = this.hits + this.misses;
      const acc = attempts ? Math.round((this.hits / attempts) * 100) : 0;
      wrapper.innerHTML = `
        <div class="htg-screen">
          <div class="htg-overlay htg-overlay-dark"></div>
          <div class="htg-center-panel">
            <h1>Game Over</h1>
            <div class="htg-results">
              <div class="htg-result-row">
                <span class="htg-result-label">Score</span>
                <span class="htg-result-value">${this.score}</span>
              </div>
              <div class="htg-result-row">
                <span class="htg-result-label">Accuracy</span>
                <span class="htg-result-value">${acc}%</span>
              </div>
              <div class="htg-result-row">
                <span class="htg-result-label">Final Difficulty</span>
                <span class="htg-result-value">${this.currentDifficulty}/7</span>
              </div>
            </div>
            <p class="htg-hint">Returning to menu...</p>
          </div>
        </div>
      `;
      return wrapper;
    }

    if (this.state === "ACTIVE") {
      // only build game screen once. targets are controlled by renderTargets()
      wrapper.innerHTML = `
        <div class="htg-screen">
          ${videoBgHtml}
          <div class="htg-overlay htg-overlay-light"></div>
          ${handCursorHtml}

          <div class="htg-hud htg-left">
            <div id="htg-score-display">Score: ${this.score}</div>
            <div id="htg-time-display">Time: ${(this.remainingGameMs / 1000).toFixed(1)}s</div>
          </div>

          <div class="htg-hud htg-right">
            <div id="htg-difficulty-display">Difficulty: ${this.currentDifficulty}/7</div>
          </div>

          <div id="htg-feedback" class="htg-feedback" style="display:none;"></div>

          <div id="htg-target-container"></div>
        </div>
      `;
      return wrapper;
    }

    wrapper.innerHTML = "";
    return wrapper;
  }
});