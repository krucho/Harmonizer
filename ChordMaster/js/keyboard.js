window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const KEYBOARD_INPUT_ID = "__keyboard__";

  const DRUM_KEYS = ["1", "2", "3", "4"];
  const BASS_KEYS = ["5", "6", "7", "8"];
  const HARMONY_KEYS = ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/", ";", "'"];

  const PIANO_MAP = {
    a: 0, w: 1, s: 2, e: 3, f: 4, t: 5, g: 6, y: 7, h: 8, u: 9, j: 10, k: 11,
    o: 12, l: 13, p: 14, ";": 15, "'": 16, "]": 17,
    q: 12, "2": 1, "3": 3, "5": 6, "6": 8, "7": 10, "9": 13, "0": 15, "-": 17, "=": 18
  };

  const SPLIT_LOW_BASE = 48;
  const MELODY_BASE = 60;

  let hooks = null;
  let active = false;
  const held = new Set();

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
    return Boolean(target.isContentEditable);
  }

  function midiFromKey(key, config) {
    const k = key.length === 1 ? key.toLowerCase() : key;
    const mode = config.performanceMode;
    const harmonyIdx = HARMONY_KEYS.indexOf(k);

    if (mode === "harmony-degree" && harmonyIdx >= 0) {
      return config.inputBaseNote + harmonyIdx;
    }
    if (mode === "harmony-root" && harmonyIdx >= 0) {
      return MELODY_BASE + harmonyIdx;
    }
    if (mode === "split" && harmonyIdx >= 0) {
      return SPLIT_LOW_BASE + harmonyIdx;
    }

    if (mode === "melodic" || mode === "split") {
      const offset = PIANO_MAP[k];
      if (offset != null) return MELODY_BASE + offset;
    }

    return null;
  }

  function onKeyDown(event) {
    if (!active || !hooks) return;
    if (isTypingTarget(event.target)) return;
    if (event.repeat) return;

    const k = event.key;
    const drumIdx = DRUM_KEYS.indexOf(k);
    if (drumIdx >= 0 && hooks.onDrum) {
      event.preventDefault();
      hooks.ensureAudio();
      hooks.onDrum(drumIdx, hooks.shapeVelocity(100));
      return;
    }
    const bassIdx = BASS_KEYS.indexOf(k);
    if (bassIdx >= 0 && hooks.onBassPad) {
      event.preventDefault();
      hooks.ensureAudio();
      hooks.onBassPad(bassIdx, hooks.shapeVelocity(96));
      return;
    }

    const note = midiFromKey(event.key, hooks.getConfig());
    if (note == null) return;

    event.preventDefault();
    const token = `${event.key}:${note}`;
    if (held.has(token)) return;
    held.add(token);

    hooks.ensureAudio();
    const velocity = hooks.shapeVelocity(96);
    hooks.onNoteOn(note, velocity, "keyboard");
  }

  function onKeyUp(event) {
    if (!active || !hooks) return;
    if (isTypingTarget(event.target)) return;

    const note = midiFromKey(event.key, hooks.getConfig());
    if (note == null) return;

    event.preventDefault();
    const token = `${event.key}:${note}`;
    if (!held.has(token)) return;
    held.delete(token);
    hooks.onNoteOff(note, "keyboard");
  }

  function releaseAllHeld() {
    if (!hooks) return;
    held.forEach((token) => {
      const note = Number(token.split(":").pop());
      if (!Number.isNaN(note)) hooks.onNoteOff(note, "keyboard");
    });
    held.clear();
  }

  function onBlur() {
    releaseAllHeld();
  }

  function enable() {
    if (active) return;
    active = true;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
  }

  function disable() {
    if (!active) return;
    releaseAllHeld();
    active = false;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  }

  function isKeyboardInput(value) {
    return value === KEYBOARD_INPUT_ID;
  }

  function layoutHint(config) {
    const mode = config?.performanceMode || "harmony-degree";
    if (mode === "melodic") {
      return "Melody: A W S E D F T G Y H U J K O L P ; ' ] (piano from C4). Sustain while held.";
    }
    if (mode === "split") {
      return "Low Z–' = chords (C3–B3). High A–] = melody (C4+). Sustain while held.";
    }
    return "Pads 1–4 drums, 5–8 bass. Keys Z–' harmony. Sustain on key rows while held.";
  }

  function init(handlerHooks) {
    hooks = handlerHooks;
  }

  CM.keyboard = {
    KEYBOARD_INPUT_ID,
    HARMONY_KEYS,
    init,
    enable,
    disable,
    isKeyboardInput,
    layoutHint,
    releaseAllHeld
  };
})(window.ChordMaster);
