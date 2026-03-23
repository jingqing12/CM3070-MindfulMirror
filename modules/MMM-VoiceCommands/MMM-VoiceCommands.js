Module.register("MMM-VoiceCommands", {
  defaults: {
    debug: false,
    language: "en-US",
    wakePhrase: ["hello mirror", "hey mirror", "hi mirror"],
    sleepPhrase: ["goodbye mirror", "goodbye", "sleep mirror"],
    sleepTimeoutMs: 120000
  },

  start: function () {
    Log.info("[VoiceCommands] Module started");
    this.activeModule = "sleeping";
    this.recognition = null;
    this.recognitionRunning = false;
    this.restartTimeout = null;
    this.sleepTimeout = null;
    this.lastTranscript = "";
  },

  getStyles: function () {
    return ["MMM-VoiceCommands.css"];
  },

  getDom: function () {
    const wrapper = document.createElement("div");
    wrapper.className = "vc-wrapper";

    if (this.activeModule === "sleeping") {
      wrapper.innerHTML = `
        <div class="vc-sleep-screen">
          <div class="vc-sleep-content">
            <div class="vc-sleep-text">Say <strong>"Hello/Hey/Hi Mirror"</strong> to wake up</div>
            <div class="vc-mic-indicator">
              <span class="vc-mic-dot ${this.recognitionRunning ? "vc-mic-active" : ""}"></span>
              <span class="vc-mic-label">${this.recognitionRunning ? "Listening..." : "Initializing mic..."}</span>
            </div>
            ${this.config.debug && this.lastTranscript ? `<div class="vc-debug">Last heard: "${this.lastTranscript}"</div>` : ""}
          </div>
        </div>
      `;
      return wrapper;
    }

    if (this.activeModule === null) {
      wrapper.innerHTML = `
        <div class="vc-idle-screen">
          <div class="vc-title">Mindful Mirror</div>
          <div class="vc-commands">
            <div class="vc-command-row">
              <span class="vc-command-text">Say <strong>"start breathing coach"</strong> to launch Breathing Coach</span>
            </div>
            <div class="vc-command-row">
              <span class="vc-command-text">Say <strong>"start physical game"</strong> to begin Hand Tracking Game</span>
            </div>
          </div>
          <div class="vc-mic-indicator">
            <span class="vc-mic-dot ${this.recognitionRunning ? "vc-mic-active" : ""}"></span>
            <span class="vc-mic-label">${this.recognitionRunning ? "Listening..." : "Initializing mic..."}</span>
          </div>
          ${this.config.debug && this.lastTranscript ? `<div class="vc-debug">Last heard: "${this.lastTranscript}"</div>` : ""}
        </div>
      `;
      return wrapper;
    }

    wrapper.style.display = "none";
    return wrapper;
  },

  notificationReceived: function (notification, payload, sender) {
    if (notification === "DOM_OBJECTS_CREATED") {
      this.hideAllModules();
      this.initSpeechRecognition();
    }
    if (notification === "BREATHING_SESSION_ENDED") {
      this.activeModule = null;
      this.showDefaultModules();
      this.updateDom();
      this.resetSleepTimer();
    }
    if (notification === "HAND_GAME_ENDED") {
      this.activeModule = null;
      this.showDefaultModules();
      this.updateDom();
      this.resetSleepTimer();
    }
  },

  hideAllModules: function () {
    MM.getModules().enumerate(function (module) {
      if (module.name !== "MMM-VoiceCommands") {
        module.hide(0);
      }
    });
  },

  hideDefaultModules: function () {
    MM.getModules().enumerate(function (module) {
      if (module.name !== "MMM-VoiceCommands" &&
          module.name !== "MMM-BreathingCoach" &&
          module.name !== "MMM-HandTargetGame") {
        module.hide(0);
      }
    });
  },

  showDefaultModules: function () {
    MM.getModules().enumerate(function (module) {
      if (module.name !== "MMM-VoiceCommands" &&
          module.name !== "MMM-BreathingCoach" &&
          module.name !== "MMM-HandTargetGame") {
        module.show(0);
      }
    });
  },

  showAllModules: function () {
    MM.getModules().enumerate(function (module) {
      if (module.name !== "MMM-VoiceCommands") {
        module.show(0);
      }
    });
  },

  resetSleepTimer: function () {
    if (this.sleepTimeout) clearTimeout(this.sleepTimeout);
    if (this.config.sleepTimeoutMs > 0) {
      this.sleepTimeout = setTimeout(() => {
        if (this.activeModule === null) {
          this.goToSleep();
        }
      }, this.config.sleepTimeoutMs);
    }
  },

  goToSleep: function () {
    Log.info("[VoiceCommands] Going to sleep");
    this.activeModule = "sleeping";
    this.hideAllModules();
    this.updateDom();
  },

  wakeUp: function () {
    Log.info("[VoiceCommands] Waking up");
    this.activeModule = null;
    this.showAllModules();
    this.updateDom();
    this.resetSleepTimer();
  },

  initSpeechRecognition: function () {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Log.error("[VoiceCommands] Web Speech API not supported in this browser");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = this.config.language;
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      Log.info("[VoiceCommands] Speech recognition started");
      this.recognitionRunning = true;
      this.updateDom();
    };

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          for (let alt = 0; alt < event.results[i].length; alt++) {
            const transcript = event.results[i][alt].transcript.trim().toLowerCase();
            if (this.config.debug) {
              Log.info(`[VoiceCommands] Heard (alt ${alt}): "${transcript}"`);
            }
            this.lastTranscript = transcript;
            if (this.processCommand(transcript)) break;
          }
          this.updateDom();
        }
      }
    };

    this.recognition.onerror = (event) => {
      Log.warn(`[VoiceCommands] Recognition error: ${event.error}`);
      if (event.error === "not-allowed") {
        Log.error("[VoiceCommands] Microphone access denied!");
        this.recognitionRunning = false;
        this.updateDom();
        return;
      }
      this.recognitionRunning = false;
      this.scheduleRestart();
    };

    this.recognition.onend = () => {
      this.recognitionRunning = false;
      this.scheduleRestart();
    };

    setTimeout(() => { this.startRecognition(); }, 2000);
  },

  startRecognition: function () {
    if (this.recognitionRunning || !this.recognition) return;
    try { this.recognition.start(); }
    catch (e) { this.scheduleRestart(); }
  },

  scheduleRestart: function () {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => { this.startRecognition(); }, 1000);
  },

  processCommand: function (transcript) {
    if (this.activeModule === "sleeping") {
      if (this.matchPhrase(transcript, this.config.wakePhrase)) {
        this.wakeUp();
        return true;
      }
      return false;
    }

    if (this.activeModule === null) {
      if (this.matchPhrase(transcript, this.config.sleepPhrase)) {
        this.goToSleep();
        return true;
      }
      if (this.matchPhrase(transcript, ["start breathing coach", "start breathing", "breathing coach"])) {
        this.activeModule = "breathing";
        if (this.sleepTimeout) clearTimeout(this.sleepTimeout);
        this.hideDefaultModules();
        this.updateDom();
        this.sendNotification("START_BREATHING_COACH");
        return true;
      }
      if (this.matchPhrase(transcript, ["start physical game", "start hand game", "physical game", "hand game", "start game"])) {
        this.activeModule = "handgame";
        if (this.sleepTimeout) clearTimeout(this.sleepTimeout);
        this.hideDefaultModules();
        this.updateDom();
        this.sendNotification("START_HAND_TARGET_GAME");
        return true;
      }
      return false;
    }

    if (this.activeModule === "breathing") {
      if (this.matchPhrase(transcript, ["1 minute", "one minute"])) { this.sendNotification("DURATION_1"); return true; }
      if (this.matchPhrase(transcript, ["2 minutes", "two minutes"])) { this.sendNotification("DURATION_2"); return true; }
      if (this.matchPhrase(transcript, ["3 minutes", "three minutes"])) { this.sendNotification("DURATION_3"); return true; }
      if (this.matchPhrase(transcript, ["4 minutes", "four minutes"])) { this.sendNotification("DURATION_4"); return true; }
      if (this.matchPhrase(transcript, ["5 minutes", "five minutes"])) { this.sendNotification("DURATION_5"); return true; }
      if (this.matchPhrase(transcript, ["10 minutes", "ten minutes"])) { this.sendNotification("DURATION_10"); return true; }
      if (this.matchPhrase(transcript, ["pause"])) { this.sendNotification("PAUSE_BREATHING"); return true; }
      if (this.matchPhrase(transcript, ["resume"])) { this.sendNotification("PAUSE_BREATHING"); return true; }
      if (this.matchPhrase(transcript, ["exit", "stop", "quit"])) { this.sendNotification("EXIT_BREATHING"); return true; }
      return false;
    }

    if (this.activeModule === "handgame") {
      if (this.matchPhrase(transcript, ["30 seconds", "thirty seconds"])) { this.sendNotification("HAND_GAME_DURATION_30"); return true; }
      if (this.matchPhrase(transcript, ["45 seconds", "forty five seconds", "forty-five seconds"])) { this.sendNotification("HAND_GAME_DURATION_45"); return true; }
      if (this.matchPhrase(transcript, ["60 seconds", "sixty seconds", "1 minute", "one minute"])) { this.sendNotification("HAND_GAME_DURATION_60"); return true; }
      if (this.matchPhrase(transcript, ["exit", "stop", "quit"])) { this.sendNotification("EXIT_HAND_TARGET_GAME"); return true; }
      return false;
    }

    return false;
  },

  matchPhrase: function (transcript, phrases) {
    for (const phrase of phrases) {
      if (transcript.includes(phrase)) return true;
    }
    return false;
  }
});