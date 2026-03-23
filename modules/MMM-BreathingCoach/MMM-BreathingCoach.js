Module.register("MMM-BreathingCoach", {

  defaults: {
    inhaleTime: 4000,    // 4 seconds
    holdTime: 7000,      // 7 seconds  
    exhaleTime: 8000,    // 8 seconds
    cycles: 3,           // 3 cycles per minute (total: 19 seconds per cycle)
    circleSize: 200,     // base circle size
    enableAudio: true,  
    audioVolume: 0.5,
    // audio file paths 
    audioInhale: "sounds/inhale.mp3",
    audioHold: "sounds/hold.mp3",
    audioExhale: "sounds/exhale.mp3"
  },

  start: function () {
    this.state = "IDLE";
    this.duration = 0; 
    this.remainingCycles = 0;
    this.countdownNumber = 3;
    this.breathPhase = "Inhale";
    this.countdownTimer = null;
    this.breathTimer = null;
    this.animationStartTime = null;
    this.currentCircleSize = this.config.circleSize;
    this.targetCircleSize = this.config.circleSize;
    this.currentColor = "rgba(76, 175, 80, 0.4)"; 
    this.animationFrame = null;
    
    // initialize audio objects
    this.audioInhale = null;
    this.audioHold = null;
    this.audioExhale = null;
    
    if(this.config.enableAudio) {
      this.setupAudio();
    }
    
    Log.info("MMM-BreathingCoach started");
  },

  getStyles: function () {
    return ["css/MMM-BreathingCoach.css"];
  },

  setupAudio: function() {
    const modulePath = this.file("");
    
    this.audioInhale = new Audio(modulePath + this.config.audioInhale);
    this.audioHold = new Audio(modulePath + this.config.audioHold);
    this.audioExhale = new Audio(modulePath + this.config.audioExhale);
    
    // set vol for all audio
    this.audioInhale.volume = this.config.audioVolume;
    this.audioHold.volume = this.config.audioVolume;
    this.audioExhale.volume = this.config.audioVolume;
    
    Log.info("Audio cues loaded");
  },

  playAudio: function(phase) {
    if(!this.config.enableAudio) return;
    
    try {
      switch(phase) {
        case "Inhale":
          if(this.audioInhale) {
            this.audioInhale.currentTime = 0;
            this.audioInhale.play().catch(e => Log.error("Audio play error:", e));
          }
          break;
        case "Hold":
          if(this.audioHold) {
            this.audioHold.currentTime = 0;
            this.audioHold.play().catch(e => Log.error("Audio play error:", e));
          }
          break;
        case "Exhale":
          if(this.audioExhale) {
            this.audioExhale.currentTime = 0; 
            this.audioExhale.play().catch(e => Log.error("Audio play error:", e));
          }
          break;
      }
    } catch(error) {
      Log.error("Error playing audio:", error);
    }
  },

  getDom: function () {
    let wrapper = document.createElement("div");
    wrapper.className = "breathing-coach-wrapper";

    // no display on mirror idle
    if (this.state === "IDLE") {
      wrapper.style.display = "none";
      return wrapper;
    }

    switch (this.state) {
      case "AWAITING_DURATION":
        wrapper.innerHTML = `
          <div style="
            position: absolute;
            top: 45%;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            text-align: center;
          ">
            <div class='breathing-awaiting-state'>
              <h2>Breathing Coach</h2>
              <p>Say how many minutes for your session</p>
              <p style="color: #81d4fa; font-size: 24px; margin-top: 16px;">
                1, 2, 3, 4, 5, or 10 minutes
              </p>
              <p style="color: rgba(255,255,255,0.45); font-size: 16px; margin-top: 24px;">
                Say "exit" to go back
              </p>
            </div>
          </div>`;
        break;
        

      case "COUNTDOWN":
        wrapper.innerHTML = `
          <div style="
            position: absolute;
            top: 45%;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            text-align: center;
          ">
          <div class='breathing-countdown-state'>
            <h1>${this.countdownNumber}</h1>
            <p>Get ready to breathe</p>
          </div>`;
        break;

        case "ACTIVE":
        case "PAUSED":
          const maxSize = this.config.circleSize * 1.8;
          const circleOffset = maxSize / 2;
          
          wrapper.innerHTML = `
            <div class="breathing-active-container">
        
              <svg class="breathing-circle-svg" 
                style="position: fixed; 
                  top: 50%; 
                  left: 50%; 
                  width: ${maxSize}px; 
                  height: ${maxSize}px;
                  margin-left: -${circleOffset}px;
                  margin-top: -${circleOffset}px;
                  pointer-events: none;
                  z-index: 0;">
                <circle cx="${maxSize/2}" 
                  cy="${maxSize/2}" 
                  r="${this.currentCircleSize/2}" 
                  fill="${this.currentColor}"
                  stroke="rgba(255, 255, 255, 0.2)"
                  stroke-width="2"/>
                </svg>
          
                <div style="
                  position: absolute;
                  top: 10%;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 100%;
                  text-align: center;
                ">
          
                  <div class="breathing-phase-display">
                    <h2 class="breathing-phase-text">${this.breathPhase}</h2>
                    <p class="breathing-phase-description">${this.getPhaseDescription()}</p>
                  </div>
          
                  <div style="margin-top: 16px;">
                    <div class="breathing-info-row">
                      <span>Duration: ${this.duration} min</span>
                      <span> | </span>
                      <span>Cycles: ${this.remainingCycles} remaining</span>
                    </div>
                    <p class="breathing-instructions">
                      Say '${this.state === "ACTIVE" ? "pause" : "resume"}' or 'exit' to stop
                    </p>
                  </div>
          
                </div>
              </div>
            `;
            break;
    }

    return wrapper;
  },

  getPhaseDescription: function() {
    switch(this.breathPhase) {
      case "Inhale": return "Breathe in slowly";
      case "Hold": return "Hold your breath";
      case "Exhale": return "Breathe out slowly";
      default: return "";
    }
  },

  notificationReceived: function(notification, payload, sender) {
    console.log("[BreathingCoach] Received:", notification);
    
    if(notification === "START_BREATHING_COACH") {
        this.startSession();
        return;
    }
    
    if(notification.startsWith("DURATION_")) {
        if(this.state === "AWAITING_DURATION") {
            let minutes = parseInt(notification.replace("DURATION_", ""), 10);
            this.processDuration(minutes);
        }
        return;
    }
    
    if(notification === "PAUSE_BREATHING") {
        if(this.state === "ACTIVE") {
            this.pauseSession();
        } else if(this.state === "PAUSED") {
            this.resumeSession();
        }
        return;
    }
    
    if(notification === "EXIT_BREATHING") {
        this.exitSession();
        return;
    }
  },

  startSession: function() {
    this.state = "AWAITING_DURATION";
    this.updateDom();
    
    this.showAlert("How many minutes for your session? Say 1, 2, 3, 4, 5, or 10 minutes");
  },

  processDuration: function(minutes) {
    this.duration = minutes;
    this.remainingCycles = Math.ceil(minutes * this.config.cycles);
    
    this.showAlert(`Starting ${minutes}-minute breathing session. Get ready!`);
    
    if(this.countdownTimer) clearInterval(this.countdownTimer);
    if(this.breathTimer) clearTimeout(this.breathTimer);
    
    setTimeout(() => {
        this.startCountdown();
    }, 2000);
  },

  showAlert: function(message) {
    this.sendNotification("SHOW_ALERT", {
        type: "notification",
        title: "Breathing Coach",
        message: message,
        timer: 3000
    });
  },

  startCountdown: function() {
    this.state = "COUNTDOWN";
    this.countdownNumber = 3;
    this.updateDom();
    
    let self = this;
    this.countdownTimer = setInterval(() => {
        self.countdownNumber--;
        self.updateDom();
        
        if(self.countdownNumber <= 0) {
            clearInterval(self.countdownTimer);
            self.startBreathing();
        }
    }, 1000);
  },

  startBreathing: function() {
    this.state = "ACTIVE";
    this.breathPhase = "Inhale";
    this.currentCircleSize = this.config.circleSize;
    this.targetCircleSize = this.config.circleSize * 1.8;
    this.currentColor = "rgba(76, 175, 80, 0.4)";
    this.animationStartTime = Date.now();
    
    this.playAudio("Inhale");
    
    this.updateDom();
    this.animateCircle();
    this.scheduleNextPhase();
  },

  animateCircle: function() {
    if(this.state !== "ACTIVE") {
      if(this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      return;
    }
    
    let self = this;
    let now = Date.now();
    let phaseTime = this.getPhaseTime();
    let elapsed = now - this.animationStartTime;
    let progress = Math.min(elapsed / phaseTime, 1);
    
    let easedProgress = this.easeInOutCubic(progress);
    
    switch(this.breathPhase) {
      case "Inhale":
        this.currentCircleSize = this.config.circleSize + 
            (easedProgress * (this.targetCircleSize - this.config.circleSize));
        this.currentColor = this.interpolateColor(
            "rgba(76, 175, 80, 0.4)",
            "rgba(139, 195, 74, 0.5)",
            easedProgress
        );
        break;
        
      case "Hold":
        this.currentCircleSize = this.targetCircleSize;
        this.currentColor = "rgba(33, 150, 243, 0.4)";
        break;
        
      case "Exhale":
        let startSize = this.config.circleSize * 1.8;
        this.currentCircleSize = startSize - 
            (easedProgress * (startSize - this.config.circleSize));
        this.currentColor = this.interpolateColor(
            "rgba(255, 235, 59, 0.4)",
            "rgba(255, 152, 0, 0.5)",
            easedProgress
        );
        break;
    }
    
    this.updateDom();
    
    this.animationFrame = requestAnimationFrame(() => {
      self.animateCircle();
    });
  },

  easeInOutCubic: function(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  },

  interpolateColor: function(color1, color2, factor) {
    let c1 = this.parseRgba(color1);
    let c2 = this.parseRgba(color2);
    
    let r = Math.round(c1.r + factor * (c2.r - c1.r));
    let g = Math.round(c1.g + factor * (c2.g - c1.g));
    let b = Math.round(c1.b + factor * (c2.b - c1.b));
    let a = c1.a + factor * (c2.a - c1.a);
    
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  },

  parseRgba: function(rgbaString) {
    let match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    return match ? {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] ? parseFloat(match[4]) : 1
    } : {r: 0, g: 0, b: 0, a: 1};
  },

  scheduleNextPhase: function() {
    if(this.remainingCycles <= 0) {
        this.exitSession();
        return;
    }
    
    let self = this;
    let phaseTime = this.getPhaseTime();
    
    this.breathTimer = setTimeout(() => {
        switch(self.breathPhase) {
            case "Inhale":
                self.breathPhase = "Hold";
                self.currentCircleSize = self.targetCircleSize;
                self.currentColor = "rgba(33, 150, 243, 0.4)";
                self.playAudio("Hold");
                break;
            case "Hold":
                self.breathPhase = "Exhale";
                self.targetCircleSize = self.config.circleSize;
                self.currentColor = "rgba(255, 235, 59, 0.4)";
                self.playAudio("Exhale");
                break;
            case "Exhale":
                self.remainingCycles--;
                if(self.remainingCycles > 0) {
                    self.breathPhase = "Inhale";
                    self.currentCircleSize = self.config.circleSize;
                    self.targetCircleSize = self.config.circleSize * 1.8;
                    self.currentColor = "rgba(76, 175, 80, 0.4)";
                    self.playAudio("Inhale");
                } else {
                    self.exitSession();
                    return;
                }
                break;
        }
        
        self.animationStartTime = Date.now();
        self.updateDom();
        
        if(self.state === "ACTIVE") {
            self.scheduleNextPhase();
        }
    }, phaseTime);
  },

  getPhaseTime: function() {
    switch(this.breathPhase) {
        case "Inhale": return this.config.inhaleTime;
        case "Hold": return this.config.holdTime;
        case "Exhale": return this.config.exhaleTime;
        default: return this.config.inhaleTime;
    }
  },

  pauseSession: function() {
    if(this.state === "ACTIVE") {
        this.state = "PAUSED";
        clearTimeout(this.breathTimer);
        if(this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.currentColor = "rgba(158, 158, 158, 0.4)";
        this.updateDom();
        this.showAlert("Session paused");
    }
  },

  resumeSession: function() {
    if(this.state === "PAUSED") {
        this.state = "ACTIVE";
        this.animationStartTime = Date.now();
        this.updateDom();
        this.animateCircle();
        this.scheduleNextPhase();
        this.showAlert("Session resumed");
    }
  },

  // breathing coach end notification
  exitSession: function() {
    clearInterval(this.countdownTimer);
    clearTimeout(this.breathTimer);
    if(this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
    }
    this.state = "IDLE";
    this.updateDom();
    this.showAlert("Session ended");
    this.sendNotification("BREATHING_SESSION_ENDED");
  }
});