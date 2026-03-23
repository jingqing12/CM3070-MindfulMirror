const NodeHelper = require("node_helper");
const { spawn } = require("child_process");
const path = require("path");

module.exports = NodeHelper.create({
  start() {
    this.pythonProcess = null;
    this.lineBuffer = "";
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "START_HAND_TRACKER") {
      this.startTracker();
    }

    if (notification === "STOP_HAND_TRACKER") {
      this.stopTracker();
    }
  },

  startTracker() {
    if (this.pythonProcess) return;

    const scriptPath = path.join(__dirname, "python", "hand_tracker.py");
    console.log(`[MMM-HandTargetGame] Starting Python tracker: ${scriptPath}`);

    this.pythonProcess = spawn("python3", [scriptPath], {
      env: { ...process.env }
    });

    this.lineBuffer = "";

    this.pythonProcess.stdout.on("data", (data) => {
      this.lineBuffer += data.toString();
      const lines = this.lineBuffer.split("\n");
      this.lineBuffer = lines.pop();

      lines.forEach((line) => {
        if (!line.trim()) return;
        try {
          const parsed = JSON.parse(line);

          if (parsed.type === "hands") {
            this.sendSocketNotification("HAND_COORDS_MULTI", {
              points: parsed.points,
              width: parsed.width,
              height: parsed.height,
              ts: parsed.ts
            });
          }

          if (parsed.type === "hand") {
            this.sendSocketNotification("HAND_COORDS_MULTI", {
              points: [{ x: parsed.x, y: parsed.y }],
              width: parsed.width,
              height: parsed.height,
              ts: parsed.ts
            });
          }

          if (parsed.type === "frame") {
            this.sendSocketNotification("VIDEO_FRAME", {
              data: parsed.data,
              width: parsed.width,
              height: parsed.height
            });
          }

        } catch (err) {
          // Skip partial lines
        }
      });
    });

    this.pythonProcess.stderr.on("data", (data) => {
      console.error("[MMM-HandTargetGame][python]", data.toString().trim());
    });

    this.pythonProcess.on("close", (code) => {
      console.log(`[MMM-HandTargetGame] Python exited with code ${code}`);
      this.pythonProcess = null;
      this.lineBuffer = "";
    });
  },

  stopTracker() {
    if (this.pythonProcess) {
      this.pythonProcess.kill("SIGTERM");
      this.pythonProcess = null;
      this.lineBuffer = "";
    }
  }
});