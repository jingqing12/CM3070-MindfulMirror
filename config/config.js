let config = {
	address: "localhost",
	port: 8080,
	basePath: "/",
	ipWhitelist: [],

	useHttps: false,
	httpsPrivateKey: "",
	httpsCertificate: "",

	language: "en",
	locale: "en-US",

	logLevel: ["INFO", "LOG", "WARN", "ERROR"],
	timeFormat: 24,
	units: "metric",

	electronOptions: {
		webPreferences: {
			webviewTag: true
		}
	},

	modules: [
		{
			module: "alert",
		},	  
		{
			module: "updatenotification",
			position: "top_bar"
		},
		{
			module: "clock",
			position: "top_left"
		},
		{
			module: "calendar",
			header: "Singapore Holidays",
			position: "top_left",
			config: {
				calendars: [
					{
						fetchInterval: 7 * 24 * 60 * 60 * 1000,
						symbol: "calendar-check",
						url: "https://ics.calendarlabs.com/67/e6e3233a/Singapore_Holidays.ics"
					}
				]
			}
		},
		{
			module: "weather",
			position: "top_right",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: 1.344872,
				lon: 103.746754
			}
		},
		{
			module: "weather",
			position: "top_right",
			header: "Weather Forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 1.344872,
				lon: 103.746754
			}
		},
		{
			module: "newsfeed",
			position: "bottom_bar",
			config: {
				feeds: [
					{
						title: "The Straits Times - Singapore",
						url: "https://www.straitstimes.com/news/singapore/rss.xml"
					}
				],
				showSourceTitle: true,
				showPublishDate: true,
				broadcastNewsFeeds: true,
				broadcastNewsUpdates: true
			}
		},
		{
			module: "MMM-VoiceCommands",
			position: "fullscreen_above",
			config: {
				debug: true,
				language: "en-US"
			}
		},
		{
			module: "MMM-BreathingCoach",
			position: "fullscreen_above",
			config: {
				enableAudio: true,
				audioVolume: 1.0,
				audioInhale: "sounds/inhale.mp3",
				audioHold: "sounds/hold.mp3",
				audioExhale: "sounds/exhale.mp3"
			}
		},
		{
			module: "MMM-HandTargetGame",
			position: "fullscreen_above",
			config: {
				startHidden: true,
				defaultDuration: 30,
				initialDifficulty: 4,
				maxDifficulty: 7,
				evaluationWindowRounds: 5,
				gracePeriodMs: 350,
				safeMarginRatio: 0.12,
				gameOverDisplayMs: 5000,
				levels: {
					1: { radius: 160, lifetimeMs: 4000, spawn: "center", spawnWeights: {1: 1.0, 2: 0.0, 3: 0.0} },
					2: { radius: 140, lifetimeMs: 3500, spawn: "center", spawnWeights: {1: 1.0, 2: 0.0, 3: 0.0} },
					3: { radius: 125, lifetimeMs: 3000, spawn: "inner",  spawnWeights: {1: 0.9, 2: 0.1, 3: 0.0} },
					4: { radius: 110, lifetimeMs: 2600, spawn: "inner",  spawnWeights: {1: 0.75, 2: 0.25, 3: 0.0} },
					5: { radius: 95,  lifetimeMs: 2200, spawn: "full",   spawnWeights: {1: 0.45, 2: 0.50, 3: 0.05} },
					6: { radius: 80,  lifetimeMs: 1800, spawn: "full",   spawnWeights: {1: 0.20, 2: 0.65, 3: 0.15} },
					7: { radius: 68,  lifetimeMs: 1500, spawn: "full",   spawnWeights: {1: 0.20, 2: 0.60, 3: 0.20} }
				}
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }