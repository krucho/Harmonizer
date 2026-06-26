window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const TRACKS = ["drums", "bass", "harmony", "melody"];

  let hooks = null;
  let bpm = 92;
  let bars = 4;
  let recording = false;
  let playing = false;
  let loopStart = 0;
  let timerId = null;
  let lastLoopPos = 0;
  const tracks = { drums: [], bass: [], harmony: [], melody: [] };
  const armed = { drums: true, bass: true, harmony: true, melody: true };

  function beatDurationMs() {
    return (60 / bpm) * 1000;
  }

  function loopDurationMs() {
    return bars * 4 * beatDurationMs();
  }

  function quantizeBeat(ms) {
    const step = beatDurationMs() / 4;
    const loopMs = loopDurationMs();
    const pos = ms % loopMs;
    return Math.round(pos / step) * step;
  }

  function currentOffsetMs() {
    if (!playing && !recording) return 0;
    const elapsed = performance.now() - loopStart;
    return elapsed % loopDurationMs();
  }

  function positionInfo() {
    const loopMs = loopDurationMs();
    const pos = currentOffsetMs();
    const beatMs = beatDurationMs();
    const bar = Math.floor(pos / (beatMs * 4)) + 1;
    const beat = Math.floor((pos % (beatMs * 4)) / beatMs) + 1;
    const cycle = Math.floor((performance.now() - loopStart) / loopMs) + 1;
    return { pos, loopMs, bar, beat, bars, cycle };
  }

  function init(handlerHooks) {
    hooks = handlerHooks;
  }

  function setBpm(value) {
    bpm = Math.max(40, Math.min(200, value));
    if (playing) alignLoopStart();
  }

  function setBars(value) {
    bars = [2, 4, 8].includes(value) ? value : 4;
    if (playing) alignLoopStart();
  }

  function alignLoopStart() {
    loopStart = performance.now() - lastLoopPos;
  }

  function toggleRecord() {
    if (!recording) {
      recording = true;
      playing = true;
      loopStart = performance.now();
      lastLoopPos = 0;
      startPlaybackTimer();
    } else {
      recording = false;
      loopStart = performance.now();
      lastLoopPos = 0;
    }
    return recording;
  }

  function togglePlay() {
    if (recording) return playing;
    playing = !playing;
    if (playing) {
      loopStart = performance.now();
      lastLoopPos = 0;
      startPlaybackTimer();
    } else {
      stopPlaybackTimer();
    }
    return playing;
  }

  function stop() {
    recording = false;
    playing = false;
    lastLoopPos = 0;
    stopPlaybackTimer();
  }

  function clearTrack(track) {
    if (track) tracks[track] = [];
    else TRACKS.forEach((t) => { tracks[t] = []; });
  }

  function setArmed(track, value) {
    if (armed[track] != null) armed[track] = value;
  }

  function record(track, payload) {
    if (!recording || !armed[track]) return;
    const offset = quantizeBeat(currentOffsetMs());
    tracks[track].push({ offset, ...payload });
    hooks?.onTrackUpdate?.(track, tracks[track].length);
  }

  function crossedOffset(prev, pos, offset) {
    if (prev === pos) return false;
    if (prev < pos) return offset > prev && offset <= pos;
    return offset > prev || offset <= pos;
  }

  function tickPlayback() {
    if (!playing) return;

    const loopMs = loopDurationMs();
    const elapsed = performance.now() - loopStart;
    const loopPos = elapsed % loopMs;
    const prev = lastLoopPos;

    if (loopPos < prev) {
      hooks?.onLoopCycle?.(Math.floor(elapsed / loopMs) + 1);
    }

    TRACKS.forEach((track) => {
      tracks[track].forEach((event) => {
        if (crossedOffset(prev, loopPos, event.offset)) {
          hooks?.playEvent(track, event);
        }
      });
    });

    lastLoopPos = loopPos;
    hooks?.onPosition?.(positionInfo());
  }

  function startPlaybackTimer() {
    stopPlaybackTimer();
    lastLoopPos = 0;
    timerId = window.setInterval(tickPlayback, 20);
  }

  function stopPlaybackTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function getState() {
    return {
      bpm,
      bars,
      recording,
      playing,
      tracks,
      armed,
      position: positionInfo(),
      trackCounts: TRACKS.reduce((acc, t) => {
        acc[t] = tracks[t].length;
        return acc;
      }, {})
    };
  }

  CM.looper = {
    TRACKS,
    init,
    setBpm,
    setBars,
    toggleRecord,
    togglePlay,
    stop,
    clearTrack,
    clearAll: () => clearTrack(null),
    setArmed,
    record,
    getState,
    positionInfo
  };
})(window.ChordMaster);
