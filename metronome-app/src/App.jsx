import { useState, useEffect, useRef, useCallback } from "react";
import ReactSlider from "react-slider";
import "./App.css";

const METRONOME_MODES = {
  BEGINNER: "Débutant",
  MEDIUM: "Moyen",
  PRO: "Pro",
};

const SKIP_PATTERNS = {
  [METRONOME_MODES.BEGINNER]: {
    frequency: 8,
    pattern: [1, 1, 1, 1, 1, 1, 1, 0],
  }, // Skip every 8th beat
  [METRONOME_MODES.MEDIUM]: { frequency: 6, pattern: [1, 1, 1, 1, 1, 0] }, // Skip every 6th beat
  [METRONOME_MODES.PRO]: { frequency: 4, pattern: [1, 1, 1, 0] }, // Skip every 4th beat
};

function App() {
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isProgressiveMetronome, setIsProgressiveMetronome] = useState(false);
  const [isMetronomeTroue, setIsMetronomeTroue] = useState(false);
  const [troueMode, setTroueMode] = useState(METRONOME_MODES.BEGINNER);
  const [isTimer, setIsTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(300); // 5 minutes
  const [originalTimerSeconds] = useState(300);
  const [progressiveStartBpm, setProgressiveStartBpm] = useState(80);
  const [progressiveEndBpm, setProgressiveEndBpm] = useState(140);
  const [progressiveDuration, setProgressiveDuration] = useState(2); // in minutes

  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const beatCountRef = useRef(0);
  const troueCountRef = useRef(0);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext ||
      window.webkitAudioContext)();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Play sound
  const playSound = useCallback(
    (frequency = 800, duration = 0.1, volume = 0.3) => {
      if (!audioContextRef.current) return;

      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContextRef.current.currentTime + duration
      );

      oscillator.start(audioContextRef.current.currentTime);
      oscillator.stop(audioContextRef.current.currentTime + duration);
    },
    []
  );

  // Get beats per measure
  const getBeatsPerMeasure = () => {
    return parseInt(timeSignature.split("/")[0]);
  };

  // Check if current beat should be skipped (for metronome troué)
  const shouldSkipBeat = useCallback(() => {
    if (!isMetronomeTroue) return false;

    const pattern = SKIP_PATTERNS[troueMode].pattern;
    const patternIndex = troueCountRef.current % pattern.length;
    return pattern[patternIndex] === 0;
  }, [isMetronomeTroue, troueMode]);

  // Progressive metronome BPM calculation
  const progressiveTotalBeats = getBeatsPerMeasure() * (progressiveDuration * 60 * (bpm / 60));
  const progressiveTotalTicks = progressiveDuration * 60 * (bpm / 60);
  const progressiveBpmStep =
    progressiveDuration > 0
      ? (progressiveEndBpm - progressiveStartBpm) / (progressiveDuration * 60)
      : 0;

  // Metronome tick function
  const tick = useCallback(() => {
    const beatsPerMeasure = getBeatsPerMeasure();
    const isFirstBeat = beatCountRef.current % beatsPerMeasure === 0;

    // Progressive BPM calculation
    if (isProgressiveMetronome) {
      const elapsedSeconds = Math.floor(beatCountRef.current * (60 / bpm));
      let nextBpm = Math.round(
        Math.min(
          progressiveStartBpm + progressiveBpmStep * elapsedSeconds,
          progressiveEndBpm
        )
      );
      if (nextBpm !== bpm) setBpm(nextBpm);
    }

    if (isMetronomeTroue) {
      if (!shouldSkipBeat()) {
        // Play sound if not skipped
        playSound(isFirstBeat ? 1000 : 800, 0.1, 0.3);
      }
      troueCountRef.current++;
    } else {
      // Normal metronome
      playSound(isFirstBeat ? 1000 : 800, 0.1, 0.3);
    }

    setCurrentBeat(beatCountRef.current % beatsPerMeasure);
    beatCountRef.current++;

    if (isTimer) {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsPlaying(false);
          return 0;
        }
        return prev - 1;
      });
    }
  }, [
    isMetronomeTroue,
    shouldSkipBeat,
    playSound,
    isTimer,
    isProgressiveMetronome,
    bpm,
    progressiveStartBpm,
    progressiveEndBpm,
    progressiveBpmStep,
  ]);

  // Start/stop metronome
  useEffect(() => {
    if (isPlaying) {
      const interval = 60000 / bpm;
      intervalRef.current = setInterval(tick, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, bpm, tick]);

  // Handle play/pause
  const handlePlayPause = async () => {
    if (!isPlaying && audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }

    if (!isPlaying) {
      beatCountRef.current = 0;
      troueCountRef.current = 0;
      setCurrentBeat(0);
      if (isTimer && timerSeconds === 0) {
        setTimerSeconds(originalTimerSeconds);
      }
    }

    setIsPlaying(!isPlaying);
  };

  // Handle BPM change
  const handleBpmChange = (e) => {
    setBpm(parseInt(e.target.value));
  };

  // Handle time signature change
  const handleTimeSignatureChange = (signature) => {
    setTimeSignature(signature);
    setCurrentBeat(0);
    beatCountRef.current = 0;
  };

  // Format timer display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get beat indicators
  const renderBeatIndicators = () => {
    const beatsPerMeasure = getBeatsPerMeasure();
    const indicators = [];

    for (let i = 0; i < 4; i++) {
      const isActive = isPlaying && i === currentBeat && i < beatsPerMeasure;
      indicators.push(
        <div
          key={i}
          className={`beat-indicator ${isActive ? "active" : ""} ${
            i >= beatsPerMeasure ? "disabled" : ""
          }`}
        />
      );
    }

    return indicators;
  };

  return (
    <div className="metronome-app">
      <div className="metronome-container">
        {/* Beat indicators */}
        <div className="beat-indicators">{renderBeatIndicators()}</div>

        {/* BPM Display */}
        <div className="bpm-display">
          <span className="bpm-value">{bpm}</span>
          <span className="bpm-label">BPM</span>
        </div>

        {/* BPM Slider */}
        <div className="bpm-slider-container">
          <input
            type="range"
            min="40"
            max="200"
            value={bpm}
            onChange={handleBpmChange}
            className="bpm-slider"
          />
        </div>

        {/* Time Signature */}
        <div className="time-signature-section">
          <h3>Signature Rythmique</h3>
          <div className="time-signature-buttons">
            {["2/4", "3/4", "4/4", "5/4", "6/4"].map((sig) => (
              <button
                key={sig}
                className={`time-sig-btn ${
                  timeSignature === sig ? "active" : ""
                }`}
                onClick={() => handleTimeSignatureChange(sig)}
              >
                {sig}
              </button>
            ))}
          </div>
          <div className="time-signature-buttons">
            {["6/8", "7/8", "9/8", "12/8"].map((sig) => (
              <button
                key={sig}
                className={`time-sig-btn ${
                  timeSignature === sig ? "active" : ""
                }`}
                onClick={() => handleTimeSignatureChange(sig)}
              >
                {sig}
              </button>
            ))}
          </div>
        </div>

        {/* Progressive Metronome */}
        <div className="feature-toggle">
          <span>Métronome Progressif</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isProgressiveMetronome}
              onChange={(e) => setIsProgressiveMetronome(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </div>
        {isProgressiveMetronome && (
          <div className="progressive-settings">
            <div className="progressive-row">
              <label style={{ width: "100%" }}>
                Progression
                <div className="progressive-bar-range-container">
                  <ReactSlider
                    className="progressive-bar-range"
                    thumbClassName="progressive-bar-thumb"
                    trackClassName="progressive-bar-track"
                    min={40}
                    max={200}
                    value={[progressiveStartBpm, progressiveEndBpm]}
                    minDistance={1}
                    onChange={([min, max]) => {
                      setProgressiveStartBpm(min);
                      setProgressiveEndBpm(max);
                    }}
                    pearling
                    withTracks={true}
                  />
                  <div className="progressive-bar-labels">
                    <span>{progressiveStartBpm}</span>
                    <span style={{ margin: "0 8px", color: "#aaa" }}>→</span>
                    <span>{progressiveEndBpm}</span>
                  </div>
                </div>
              </label>
            </div>
            <div className="progressive-row progressive-row-column">
              <label>Durée de la progression</label>
              <div className="progressive-duration-buttons">
                {[1, 2, 3, 5, 10].map((min) => (
                  <button
                    key={min}
                    className={`duration-btn ${progressiveDuration === min ? "active" : ""}`}
                    onClick={() => setProgressiveDuration(min)}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Metronome Troué */}
        <div className="feature-toggle">
          <span>Métronome Troué</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isMetronomeTroue}
              onChange={(e) => setIsMetronomeTroue(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Troué Mode Selection */}
        {isMetronomeTroue && (
          <div className="troue-mode-selection">
            <div className="troue-mode-buttons">
              {Object.entries(METRONOME_MODES).map(([key, mode]) => (
                <button
                  key={mode}
                  className={`troue-mode-btn ${
                    troueMode === mode ? "active" : ""
                  }`}
                  onClick={() => setTroueMode(mode)}
                >
                  {mode.charAt(0) + mode.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timer */}
        <div className="timer-section">
          <div className="timer-header">
            <span className="timer-title">Chronomètre d'entraînement</span>
            <label className="toggle-switch" aria-label="Activer le chronomètre d'entraînement">
              <input
                type="checkbox"
                checked={isTimer}
                onChange={(e) => setIsTimer(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
          {isTimer && (
            <>
              <div className="timer-duration-buttons">
                {[1, 2, 3, 4, 5, 10].map((min) => (
                  <button
                    key={min}
                    className={`duration-btn ${timerSeconds / 60 === min ? "active" : ""}`}
                    onClick={() => setTimerSeconds(min * 60)}
                    type="button"
                  >
                    {min} min
                  </button>
                ))}
              </div>
              <div className="timer-card improved">
                <div className="timer-label">Temps restant</div>
                <div className="timer-main-value">
                  {formatTime(timerSeconds)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Play/Pause Button */}
        <button className="play-button" onClick={handlePlayPause}>
          <span className="play-icon">{isPlaying ? "⏸" : "▶"}</span>
          <span className="play-text">{isPlaying ? "Pause" : "Démarrer"}</span>
        </button>
      </div>
    </div>
  );
}

export default App;
