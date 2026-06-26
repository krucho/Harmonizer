window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const { mod, clamp, midiToName, scaleCC, processVelocity } = CM.utils;
  const theory = CM.theory;
  const voicing = CM.voicing;
  const {
    ensureAudio, playAudioNote, stopAudioNote, setVolume, stopAllAudio,
    setModulation, setPitchBendSemitones
  } = CM.audio;
  const keyboard = CM.keyboard;
  const drums = CM.drums;
  const looper = CM.looper;

  const STORAGE_KEY = "chordmaster-midi-bridge-v03";
  const STORAGE_KEY_V02 = "chordmaster-midi-bridge-v02";
  const BASS_PAD_DEGREES = [0, 3, 4, 5];
  const STORAGE_KEY_LEGACY = "chordmaster-midi-bridge-v01";

  const rangeSpecs = [
    { key: "complexity", label: "Complexity", min: 0, max: 3, step: 1 },
    { key: "voicing", label: "Voicing", min: 0, max: 3, step: 1 },
    { key: "spread", label: "Spread", min: 0, max: 3, step: 1 },
    { key: "strum", label: "Strum", min: 0, max: 90, step: 1, suffix: "ms" },
    { key: "arpRate", label: "Arp Rate", min: 1, max: 6, step: 1 },
    { key: "bassMode", label: "Bass Mode", min: 0, max: 4, step: 1 },
    { key: "humanize", label: "Humanize", min: 0, max: 32, step: 1, suffix: "ms" },
    { key: "volume", label: "Volume", min: 0, max: 1, step: 0.01 },
    { key: "velocityMin", label: "Vel Min", min: 1, max: 127, step: 1 },
    { key: "velocityMax", label: "Vel Max", min: 1, max: 127, step: 1 },
    { key: "velocityCompress", label: "Vel Compress", min: 0, max: 100, step: 1, suffix: "%" }
  ];

  const state = {
    midiAccess: null,
    midiInput: null,
    midiOutput: null,
    keyRoot: 0,
    scale: "major",
    performanceMode: "harmony-degree",
    inputBaseNote: 48,
    baseOctave: 3,
    wrapDegree: true,
    followInputOctave: true,
    splitNote: 60,
    melodicSnap: "strict",
    melodicChannel: 5,
    complexity: 1,
    voicing: 0,
    spread: 0,
    strum: 0,
    arpRate: 2,
    bassMode: 1,
    humanize: 0,
    volume: 0.42,
    velocityClamp: true,
    velocityMin: 58,
    velocityMax: 108,
    velocityCompress: 55,
    pitchBendRange: 2,
    modToMidiOut: false,
    internalSound: true,
    midiOutEnabled: false,
    arpPattern: "up",
    arpSource: "chord",
    waveform: "triangle",
    layers: { keys: true, bass: true, arp: false, pad: false },
    activeVoices: new Map(),
    melodicVoices: new Map(),
    previousVoicings: new Map(),
    melodicLegato: new Map(),
    pitchBend: new Map(),
    midiLearn: null,
    ccMap: {},
    noteMap: {},
    midiInputId: null,
    padNoteMin: 36,
    padNoteMax: 43,
    bassFromPadsOnly: true,
    looperBpm: 92,
    looperBars: 4,
    log: []
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    loadState();
    buildStaticUi();
    keyboard.init({
      getConfig: () => ({
        performanceMode: state.performanceMode,
        inputBaseNote: state.inputBaseNote,
        splitNote: state.splitNote
      }),
      onNoteOn: (note, velocity, source) => dispatchKeyNote(note, velocity, source),
      onNoteOff: (note, source) => routeInputNoteOff(note, source),
      onDrum: (index, velocity) => triggerDrum(index, velocity, "keyboard"),
      onBassPad: (index, velocity) => triggerBassPad(index, velocity, "keyboard"),
      shapeVelocity: shapedVelocity,
      ensureAudio: () => ensureAudio(state.volume).catch(() => {})
    });
    bindUi();
    refreshMidiDevices();
    syncUi();
    drums.init(() => CM.audio.audio.ctx);
    looper.init({
      playEvent: playLooperEvent,
      onTrackUpdate: updateLooperTrackUi,
      onPosition: updateLooperPosition
    });
    looper.setBpm(state.looperBpm);
    looper.setBars(state.looperBars);
    renderPlaySurface();
    renderMonitor();
    updateMidiStatus();
    updateLooperUi();
    if (!navigator.requestMIDIAccess) {
      logMessage("system", "--", "--", "Web MIDI API is unavailable in this browser.");
    }
  }

  function cacheDom() {
    [
      "midiStatus", "enableMidi", "panicTop", "panicBottom", "allNotesOff", "refreshMidi",
      "midiInput", "midiOutput", "learnBase", "keyRoot", "scale", "performanceMode",
      "inputBaseNote", "baseOctave", "wrapDegree", "followInputOctave", "splitNote",
      "melodicSnap", "melodicChannel", "internalSound", "midiOutEnabled", "layerKeys",
      "layerBass", "layerBassLabel", "layerArp", "layerArpLabel", "layerPad",
      "drumPads", "bassPads", "keyPads",
      "padNoteMin", "padNoteMax", "bassFromPadsOnly",
      "looperBpm", "looperBars", "looperRecord", "looperPlay", "looperStop", "looperClear",
      "looperTrackDrums", "looperTrackBass", "looperTrackHarmony", "looperTrackMelody", "looperPosition",
      "functionName", "realName", "noteCount", "noteNames", "lastType", "lastChannel",
      "lastData", "lastValue", "lastRemap", "rangeControls", "arpPattern", "arpSource",
      "waveform", "learnStatus", "monitor", "clearLog", "harmonyControls", "melodicControls", "splitField",
      "velocityClamp", "pitchBendRange", "modToMidiOut", "loadMpkMini", "modReadout", "keyboardHint"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function buildStaticUi() {
    CM.utils.NOTE_NAMES.forEach((name, pc) => {
      dom.keyRoot.appendChild(new Option(name, String(pc)));
    });

    rangeSpecs.forEach((spec) => {
      const field = document.createElement("div");
      field.className = "field";
      field.innerHTML = `
        <div class="range-head">
          <span>${spec.label}</span>
          <span class="value" id="${spec.key}Value"></span>
        </div>
        <div class="mini-grid">
          <input id="${spec.key}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}">
          <button class="small" data-learn-param="${spec.key}">Learn</button>
        </div>
      `;
      dom.rangeControls.appendChild(field);
      dom[spec.key] = field.querySelector(`#${spec.key}`);
      dom[`${spec.key}Value`] = field.querySelector(`#${spec.key}Value`);
    });
  }

  function bindUi() {
    dom.enableMidi.addEventListener("click", enableMidi);
    dom.refreshMidi.addEventListener("click", refreshMidiDevices);
    dom.midiInput.addEventListener("change", selectMidiInput);
    dom.midiOutput.addEventListener("change", selectMidiOutput);
    dom.learnBase.addEventListener("click", () => startLearn({ type: "baseNote" }));
    dom.panicTop.addEventListener("click", panic);
    dom.panicBottom.addEventListener("click", panic);
    dom.allNotesOff.addEventListener("click", sendAllNotesOff);
    dom.clearLog.addEventListener("click", () => {
      state.log = [];
      renderMonitor();
    });

    [
      "keyRoot", "scale", "performanceMode", "inputBaseNote", "baseOctave",
      "splitNote", "melodicSnap", "melodicChannel", "arpPattern", "arpSource", "waveform"
    ].forEach((key) => {
      dom[key].addEventListener("change", () => {
        state[key] = coerceValue(key, dom[key].value);
        if (key === "arpPattern" || key === "arpSource") refreshActiveLayer("arp");
        if (key === "performanceMode" || key === "scale" || key === "keyRoot") {
          updateModePanels();
          state.previousVoicings.clear();
        }
        persistState();
        renderPlaySurface();
        syncUi();
        updateKeyboardHint();
      });
    });

    ["padNoteMin", "padNoteMax", "looperBpm"].forEach((key) => {
      dom[key].addEventListener("change", () => {
        state[key] = coerceValue(key, dom[key].value);
        if (key === "looperBpm") looper.setBpm(state.looperBpm);
        persistState();
      });
    });
    dom.looperBars?.addEventListener("change", () => {
      state.looperBars = Number.parseInt(dom.looperBars.value, 10);
      looper.setBars(state.looperBars);
      persistState();
    });
    dom.bassFromPadsOnly?.addEventListener("change", () => {
      state.bassFromPadsOnly = dom.bassFromPadsOnly.checked;
      persistState();
    });
    dom.looperRecord?.addEventListener("click", () => {
      const on = looper.toggleRecord();
      dom.looperRecord.classList.toggle("active", on);
      updateLooperUi();
    });
    dom.looperPlay?.addEventListener("click", () => {
      looper.togglePlay();
      updateLooperUi();
    });
    dom.looperStop?.addEventListener("click", () => {
      looper.stop();
      dom.looperRecord.classList.remove("active");
      updateLooperUi();
    });
    dom.looperClear?.addEventListener("click", () => {
      looper.clearAll();
      updateLooperTrackUi();
    });
    [
      ["looperTrackDrums", "drums"],
      ["looperTrackBass", "bass"],
      ["looperTrackHarmony", "harmony"],
      ["looperTrackMelody", "melody"]
    ].forEach(([id, track]) => {
      dom[id]?.addEventListener("click", () => {
        const ls = looper.getState();
        looper.setArmed(track, !ls.armed[track]);
        updateLooperTrackUi();
      });
    });

    ["wrapDegree", "internalSound", "midiOutEnabled", "followInputOctave"].forEach((key) => {
      dom[key].addEventListener("change", () => {
        state[key] = dom[key].checked;
        persistState();
        syncUi();
      });
    });

    [
      ["layerKeys", "keys"],
      ["layerBass", "bass"],
      ["layerArp", "arp"],
      ["layerPad", "pad"]
    ].forEach(([id, layer]) => {
      dom[id].addEventListener("change", () => {
        state.layers[layer] = dom[id].checked;
        if (layer === "bass") state.bassMode = state.layers.bass ? Math.max(1, state.bassMode) : 0;
        if (layer === "bass" || layer === "arp") refreshActiveLayer(layer);
        persistState();
        syncUi();
      });
    });

    rangeSpecs.forEach((spec) => {
      dom[spec.key].addEventListener("input", () => {
        state[spec.key] = coerceValue(spec.key, dom[spec.key].value);
        if (spec.key === "bassMode") state.layers.bass = state.bassMode > 0;
        if (spec.key === "bassMode") refreshActiveLayer("bass");
        if (spec.key === "arpRate") refreshActiveLayer("arp");
        if (spec.key === "volume") setVolume(state.volume);
        persistState();
        syncUi();
        renderPlaySurface();
      });
    });

    document.querySelectorAll("[data-learn-param]").forEach((button) => {
      button.addEventListener("click", () => startLearn({ type: "param", target: button.dataset.learnParam }));
    });

    document.querySelectorAll("[data-learn-action]").forEach((button) => {
      button.addEventListener("click", () => startLearn({ type: "action", target: button.dataset.learnAction }));
    });

    if (dom.velocityClamp) {
      dom.velocityClamp.addEventListener("change", () => {
        state.velocityClamp = dom.velocityClamp.checked;
        persistState();
        syncUi();
      });
    }
    if (dom.pitchBendRange) {
      dom.pitchBendRange.addEventListener("change", () => {
        state.pitchBendRange = coerceValue("pitchBendRange", dom.pitchBendRange.value);
        persistState();
      });
    }
    if (dom.modToMidiOut) {
      dom.modToMidiOut.addEventListener("change", () => {
        state.modToMidiOut = dom.modToMidiOut.checked;
        persistState();
      });
    }
    if (dom.loadMpkMini) {
      dom.loadMpkMini.addEventListener("click", loadMpkMiniPreset);
    }
  }

  function shapedVelocity(velocity) {
    return processVelocity(velocity, {
      enabled: state.velocityClamp,
      min: state.velocityMin,
      max: state.velocityMax,
      compress: state.velocityCompress / 100
    });
  }

  function updateModePanels() {
    const mode = state.performanceMode;
    const harmony = mode === "harmony-degree" || mode === "harmony-root" || mode === "split";
    const melodic = mode === "melodic" || mode === "split";
    if (dom.harmonyControls) dom.harmonyControls.style.display = harmony ? "" : "none";
    if (dom.melodicControls) dom.melodicControls.style.display = melodic ? "" : "none";
    if (dom.splitField) dom.splitField.style.display = mode === "split" ? "" : "none";
  }

  function syncUi() {
    dom.keyRoot.value = String(state.keyRoot);
    dom.scale.value = state.scale;
    dom.performanceMode.value = state.performanceMode;
    dom.inputBaseNote.value = String(state.inputBaseNote);
    dom.baseOctave.value = String(state.baseOctave);
    dom.wrapDegree.checked = state.wrapDegree;
    dom.followInputOctave.checked = state.followInputOctave;
    dom.splitNote.value = String(state.splitNote);
    dom.melodicSnap.value = state.melodicSnap;
    dom.melodicChannel.value = String(state.melodicChannel);
    dom.internalSound.checked = state.internalSound;
    dom.midiOutEnabled.checked = state.midiOutEnabled;
    dom.layerKeys.checked = state.layers.keys;
    dom.layerBass.checked = state.layers.bass;
    dom.layerArp.checked = state.layers.arp;
    dom.layerBassLabel.textContent = state.layers.bass
      ? `Bass: ${["Off", "Root", "Root + 5th", "Approach", "Walk"][state.bassMode] || "Root"}`
      : "Bass: Off";
    dom.layerArpLabel.textContent = state.layers.arp
      ? `Arp: ${formatArpPattern(state.arpPattern)}`
      : "Arp: Off";
    dom.layerPad.checked = state.layers.pad;
    dom.arpPattern.value = state.arpPattern;
    dom.arpSource.value = state.arpSource;
    dom.waveform.value = state.waveform;
    if (dom.velocityClamp) dom.velocityClamp.checked = state.velocityClamp;
    if (dom.pitchBendRange) dom.pitchBendRange.value = String(state.pitchBendRange);
    if (dom.modToMidiOut) dom.modToMidiOut.checked = state.modToMidiOut;
    if (dom.padNoteMin) dom.padNoteMin.value = String(state.padNoteMin);
    if (dom.padNoteMax) dom.padNoteMax.value = String(state.padNoteMax);
    if (dom.bassFromPadsOnly) dom.bassFromPadsOnly.checked = state.bassFromPadsOnly;
    if (dom.looperBpm) dom.looperBpm.value = String(state.looperBpm);
    if (dom.looperBars) dom.looperBars.value = String(state.looperBars);
    updateModReadout();
    rangeSpecs.forEach((spec) => {
      dom[spec.key].value = String(state[spec.key]);
      dom[`${spec.key}Value`].textContent = formatRangeValue(spec, state[spec.key]);
    });
    setVolume(state.volume);
    updateModePanels();
    updateKeyboardHint();
    updateLearnStatus();
  }

  function updateKeyboardHint() {
    if (!dom.keyboardHint) return;
    const usingKeyboard = keyboard.isKeyboardInput(dom.midiInput?.value);
    dom.keyboardHint.style.display = usingKeyboard ? "block" : "none";
    if (usingKeyboard) {
      dom.keyboardHint.textContent = keyboard.layoutHint({
        performanceMode: state.performanceMode
      });
    }
  }

  function coerceValue(key, value) {
    const intKeys = [
      "keyRoot", "inputBaseNote", "baseOctave", "splitNote", "melodicChannel",
      "complexity", "voicing", "spread", "strum", "arpRate", "bassMode", "humanize",
      "velocityMin", "velocityMax", "velocityCompress", "pitchBendRange",
      "padNoteMin", "padNoteMax", "looperBpm"
    ];
    if (intKeys.includes(key)) return Number.parseInt(value, 10);
    if (key === "volume") return Number.parseFloat(value);
    return value;
  }

  function formatRangeValue(spec, value) {
    if (spec.key === "bassMode") {
      return ["off", "root", "root+5", "approach", "walk"][value] || String(value);
    }
    if (spec.key === "volume") return `${Math.round(value * 100)}%`;
    if (spec.key === "velocityCompress") return `${value}%`;
    return `${value}${spec.suffix || ""}`;
  }

  function persistState() {
    const snapshot = {};
    [
      "keyRoot", "scale", "performanceMode", "inputBaseNote", "baseOctave", "wrapDegree",
      "followInputOctave", "splitNote", "melodicSnap", "melodicChannel",
      "complexity", "voicing", "spread", "strum", "arpRate", "bassMode", "humanize",
      "volume", "velocityClamp", "velocityMin", "velocityMax", "velocityCompress",
      "pitchBendRange", "modToMidiOut", "padNoteMin", "padNoteMax", "bassFromPadsOnly",
      "looperBpm", "looperBars",
      "internalSound", "midiOutEnabled", "layers", "arpPattern", "arpSource",
      "waveform", "ccMap", "noteMap", "midiInputId"
    ].forEach((key) => { snapshot[key] = state[key]; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }

  function loadState() {
    try {
      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) saved = JSON.parse(localStorage.getItem(STORAGE_KEY_V02) || "null");
      if (!saved) {
        const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY_LEGACY) || "{}");
        saved = { ...legacy };
        if (legacy.inputMode === "root") saved.performanceMode = "harmony-root";
        else saved.performanceMode = "harmony-degree";
      }
      Object.assign(state, saved);
      state.layers = Object.assign({ keys: true, bass: true, arp: false, pad: false }, saved.layers || {});
      state.layers.bass = state.bassMode > 0 && state.layers.bass;
      state.ccMap = saved.ccMap || {};
      state.noteMap = saved.noteMap || {};
      if (state.followInputOctave == null) state.followInputOctave = true;
      if (state.splitNote == null) state.splitNote = 60;
      if (state.melodicSnap == null) state.melodicSnap = "strict";
      if (state.melodicChannel == null) state.melodicChannel = 5;
      if (state.arpSource == null) state.arpSource = "chord";
      if (!state.performanceMode) state.performanceMode = "harmony-degree";
      if (state.velocityClamp == null) state.velocityClamp = true;
      if (state.velocityMin == null) state.velocityMin = 58;
      if (state.velocityMax == null) state.velocityMax = 108;
      if (state.velocityCompress == null) state.velocityCompress = 55;
      if (state.pitchBendRange == null) state.pitchBendRange = 2;
      if (state.modToMidiOut == null) state.modToMidiOut = false;
      if (state.midiInputId == null && saved.midiInputId) state.midiInputId = saved.midiInputId;
      if (state.padNoteMin == null) state.padNoteMin = 36;
      if (state.padNoteMax == null) state.padNoteMax = 43;
      if (state.bassFromPadsOnly == null) state.bassFromPadsOnly = true;
      if (state.looperBpm == null) state.looperBpm = 92;
      if (state.looperBars == null) state.looperBars = 4;
    } catch (error) {
      console.warn("Could not load state", error);
    }
  }

  /* MIDI */
  async function enableMidi() {
    try {
      await ensureAudio(state.volume);
      if (!navigator.requestMIDIAccess) throw new Error("Web MIDI API is not available.");
      state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      state.midiAccess.onstatechange = refreshMidiDevices;
      refreshMidiDevices();
      logMessage("system", "--", "--", "Web MIDI enabled.");
    } catch (error) {
      logMessage("error", "--", "--", error.message);
    }
    updateMidiStatus();
  }

  function refreshMidiDevices() {
    const inputs = state.midiAccess ? [...state.midiAccess.inputs.values()] : [];
    const outputs = state.midiAccess ? [...state.midiAccess.outputs.values()] : [];
    fillInputSelect(dom.midiInput, inputs);
    fillSelect(dom.midiOutput, outputs, "No outputs");
    const preferred = state.midiInputId || dom.midiInput.value;
    if (preferred && [...dom.midiInput.options].some((o) => o.value === preferred)) {
      dom.midiInput.value = preferred;
    } else if (!inputs.length) {
      dom.midiInput.value = keyboard.KEYBOARD_INPUT_ID;
    }
    selectMidiInput();
    selectMidiOutput();
    updateMidiStatus();
  }

  function fillInputSelect(select, devices) {
    const previous = select.value || state.midiInputId;
    select.innerHTML = "";
    select.appendChild(new Option("Computer Keyboard", keyboard.KEYBOARD_INPUT_ID));
    devices.forEach((device) => {
      const label = `${device.name || "MIDI device"}${device.manufacturer ? ` - ${device.manufacturer}` : ""}`;
      select.appendChild(new Option(label, device.id));
    });
    if (previous && [...select.options].some((option) => option.value === previous)) {
      select.value = previous;
    }
  }

  function fillSelect(select, devices, emptyText) {
    const previous = select.value;
    select.innerHTML = "";
    if (!devices.length) {
      select.appendChild(new Option(emptyText, ""));
      return;
    }
    devices.forEach((device) => {
      const label = `${device.name || "MIDI device"}${device.manufacturer ? ` - ${device.manufacturer}` : ""}`;
      select.appendChild(new Option(label, device.id));
    });
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function selectMidiInput() {
    const selected = dom.midiInput.value;
    const wasKeyboard = keyboard.isKeyboardInput(state.midiInputId);
    const isKeyboard = keyboard.isKeyboardInput(selected);

    if (!isKeyboard && state.midiInput && state.midiInput.id !== selected) panic();
    if (wasKeyboard && !isKeyboard) keyboard.disable();

    if (state.midiInput) state.midiInput.onmidimessage = null;
    state.midiInput = null;

    if (isKeyboard) {
      keyboard.enable();
    } else if (state.midiAccess && selected) {
      state.midiInput = state.midiAccess.inputs.get(selected) || null;
      if (state.midiInput) state.midiInput.onmidimessage = handleMidiMessage;
      keyboard.disable();
    } else {
      keyboard.disable();
    }

    state.midiInputId = selected || null;
    persistState();
    updateMidiStatus();
    updateKeyboardHint();
  }

  function selectMidiOutput() {
    if (state.midiOutput && state.midiOutput.id !== dom.midiOutput.value) panic();
    state.midiOutput = state.midiAccess ? state.midiAccess.outputs.get(dom.midiOutput.value) || null : null;
    updateMidiStatus();
  }

  function updateMidiStatus() {
    const keyboardOn = keyboard.isKeyboardInput(dom.midiInput?.value);
    const connected = Boolean(state.midiInput || state.midiOutput || keyboardOn);
    dom.midiStatus.classList.toggle("connected", connected);
    dom.midiStatus.textContent = keyboardOn && !state.midiInput
      ? "keyboard"
      : connected ? "connected" : "disconnected";
  }

  function isPadNote(note) {
    return note >= state.padNoteMin && note <= state.padNoteMax;
  }

  function padSlotFromNote(note) {
    return note - state.padNoteMin;
  }

  function dispatchInputNote(note, velocity, source) {
    if (isPadNote(note)) {
      handlePadNote(note, velocity, source);
      return;
    }
    dispatchKeyNote(note, velocity, source);
  }

  function dispatchKeyNote(note, velocity, source) {
    const mode = state.performanceMode;
    if (mode === "melodic") {
      handleMelodicNote(note, velocity, source);
      return;
    }
    if (mode === "split") {
      if (note < state.splitNote) handleHarmonicTrigger(note, velocity, source);
      else handleMelodicNote(note, velocity, source);
      return;
    }
    handleHarmonicTrigger(note, velocity, source);
  }

  function handlePadNote(note, velocity, source) {
    const slot = padSlotFromNote(note);
    if (slot < 4) triggerDrum(slot, velocity, source);
    else if (slot < 8) triggerBassPad(slot - 4, velocity, source);
  }

  function triggerDrum(index, velocity, source, fromLooper) {
    ensureAudio(state.volume).catch(() => {});
    drums.playDrum(index, velocity);
    if (state.midiOutEnabled && state.midiOutput) {
      const drumNote = [36, 38, 42, 46][index] || 36;
      sendNoteOn(drumNote, velocity, drums.DRUM_MIDI_CH);
      window.setTimeout(() => sendNoteOff(drumNote, drums.DRUM_MIDI_CH, true), 120);
    }
    flashPad(dom.drumPads, index);
    if (!fromLooper) looper.record("drums", { index, velocity });
    logMessage("drum", source, drums.DRUM_LABELS[index], velocity);
  }

  function triggerBassPad(slot, velocity, source, fromLooper) {
    if (!state.layers.bass) return;
    const degreeIndex = BASS_PAD_DEGREES[slot] ?? 0;
    const chord = theory.getDegreeChord(degreeIndex, state.keyRoot, state.scale, 0);
    const notes = voicing.buildBass(chord.rootPc, chord, 1, state.keyRoot, state.scale);
    if (!notes.length) return;
    ensureAudio(state.volume).catch(() => {});
    const note = notes[0];
    sendNoteOn(note, velocity, 2);
    if (state.internalSound) {
      const id = playAudioNote(note, velocity, "bass", state.waveform);
      window.setTimeout(() => stopAudioNote(id), 420);
    }
    if (state.midiOutEnabled && state.midiOutput) {
      window.setTimeout(() => sendNoteOff(note, 2, true), 420);
    }
    flashPad(dom.bassPads, slot);
    if (!fromLooper) looper.record("bass", { slot, velocity, degreeIndex });
    dom.functionName.textContent = chord.label;
    dom.realName.textContent = `Bass ${CM.utils.midiToName(note)} / ${chord.name}`;
    logMessage("bass pad", source, chord.label, CM.utils.midiToName(note));
  }

  function flashPad(container, index) {
    if (!container) return;
    const pad = container.querySelector(`[data-index="${index}"]`);
    if (!pad) return;
    pad.classList.add("active");
    window.setTimeout(() => pad.classList.remove("active"), 140);
  }

  function playLooperEvent(track, event) {
    if (track === "drums") triggerDrum(event.index, event.velocity, "looper", true);
    if (track === "bass") triggerBassPad(event.slot, event.velocity, "looper", true);
    if (track === "harmony") {
      handleHarmonicTrigger(event.inputNote, event.velocity, `looper:${event.inputNote}`, true);
      const releaseMs = Math.max(300, (60 / state.looperBpm) * 1000 * 2);
      window.setTimeout(() => stopHarmonicTrigger(event.inputNote, `looper:${event.inputNote}`), releaseMs);
    }
    if (track === "melody") {
      handleMelodicNote(event.inputNote, event.velocity, `looper:${event.inputNote}`, true);
      const releaseMs = Math.max(200, (60 / state.looperBpm) * 1000 * 1.5);
      window.setTimeout(() => stopMelodicNote(event.inputNote, `looper:${event.inputNote}`), releaseMs);
    }
  }

  function updateLooperPosition(info) {
    if (!dom.looperPosition || !info) return;
    dom.looperPosition.textContent = `Bar ${info.bar}/${info.bars} · Beat ${info.beat} · Loop ${info.cycle}`;
  }

  function updateLooperTrackUi() {
    const ls = looper.getState();
    const map = {
      looperTrackDrums: "drums",
      looperTrackBass: "bass",
      looperTrackHarmony: "harmony",
      looperTrackMelody: "melody"
    };
    Object.entries(map).forEach(([id, track]) => {
      const el = dom[id];
      if (!el) return;
      const count = ls.trackCounts[track] || 0;
      const label = track.charAt(0).toUpperCase() + track.slice(1);
      el.textContent = `${label} ${count}`;
      el.classList.toggle("armed", ls.armed[track]);
      el.classList.toggle("has-data", count > 0);
    });
  }

  function updateLooperUi() {
    const ls = looper.getState();
    dom.looperRecord?.classList.toggle("active", ls.recording);
    dom.looperPlay?.classList.toggle("active", ls.playing && !ls.recording);
    updateLooperTrackUi();
  }

  function routeInputNote(note, velocity, source) {
    dispatchInputNote(note, velocity, source);
  }

  function routeInputNoteOff(note, source) {
    const mode = state.performanceMode;
    if (mode === "melodic") {
      stopMelodicNote(note, source);
      return;
    }
    if (mode === "split") {
      if (note < state.splitNote) stopHarmonicTrigger(note, source);
      else stopMelodicNote(note, source);
      return;
    }
    stopHarmonicTrigger(note, source);
  }

  function handleMidiMessage(event) {
    const [status, data1 = 0, data2 = 0] = event.data;
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;

    if (command === 0x90 && data2 > 0) {
      updateLastInput("note on", channel, midiToName(data1), data2, null);
      ensureAudio(state.volume).catch(() => {});
      if (consumeLearn("note", channel, data1, data2)) return;
      if (runMappedNoteAction(channel, data1)) return;
      dispatchInputNote(data1, shapedVelocity(data2), `midi:${channel}`);
    } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      updateLastInput("note off", channel, midiToName(data1), data2, null);
      routeInputNoteOff(data1, `midi:${channel}`);
    } else if (command === 0xb0) {
      updateLastInput("cc", channel, `CC ${data1}`, data2, null);
      if (consumeLearn("cc", channel, data1, data2)) return;
      applyMappedCc(channel, data1, data2);
    } else if (command === 0xe0) {
      const bend = ((data2 << 7) | data1) - 8192;
      state.pitchBend.set(channel, bend);
      updateLastInput("pitch bend", channel, "bend", bend, null);
      applyPitchBend(channel);
    } else {
      updateLastInput(`0x${command.toString(16)}`, channel, data1, data2, null);
    }
  }

  function applyPitchBend(channel) {
    const bend = state.pitchBend.get(channel) || 0;
    const semitones = (bend / 8192) * state.pitchBendRange;
    setPitchBendSemitones(semitones);

    if (state.modToMidiOut && state.midiOutput) {
      const bendValue = clamp(Math.round(8192 + bend * (state.pitchBendRange / 2)), 0, 16383);
      for (let ch = 1; ch <= 5; ch += 1) {
        state.midiOutput.send([0xe0 + (ch - 1), bendValue & 0x7f, (bendValue >> 7) & 0x7f]);
      }
    }

    state.melodicVoices.forEach((group, voiceKey) => {
      if (!voiceKey.startsWith(`midi:${channel}:`)) return;
      if (!group.outputNote) return;
      const bent = clamp(Math.round(group.baseOutputNote + semitones), 0, 127);
      if (bent === group.outputNote) return;
      group.audioIds.forEach(stopAudioNote);
      group.audioIds = [];
      sendNoteOff(group.outputNote, state.melodicChannel, true);
      group.outputNote = bent;
      sendNoteOn(bent, group.velocity, state.melodicChannel);
      if (state.internalSound) {
        group.audioIds.push(playAudioNote(bent, group.velocity, "melodic", state.waveform));
      }
    });
  }

  function applyMod(target, ccValue) {
    const norm = ccValue / 127;
    if (target === "filter" || target === "reverb" || target === "vibrato" || target === "tremolo") {
      setModulation(target, norm);
      updateModReadout();
      return;
    }
    if (target === "spread") state.spread = Math.round(norm * 3);
    if (target === "complexity") state.complexity = Math.round(norm * 3);
    if (target === "humanize") state.humanize = Math.round(norm * 32);
    if (target === "arpRate") state.arpRate = 1 + Math.round(norm * 5);
    if (target === "strum") state.strum = Math.round(norm * 90);
    if (target === "volume") state.volume = Number(norm.toFixed(2));
    if (["spread", "complexity", "humanize", "arpRate", "strum", "volume"].includes(target)) {
      if (target === "arpRate") refreshActiveLayer("arp");
      if (target === "volume") setVolume(state.volume);
      syncUi();
      renderPlaySurface();
    }
  }

  function updateModReadout() {
    if (!dom.modReadout) return;
    const m = CM.audio.mods;
    dom.modReadout.textContent = `filter ${Math.round(m.filter * 100)}% / reverb ${Math.round(m.reverb * 100)}% / vib ${Math.round(m.vibrato * 100)}% / trem ${Math.round(m.tremolo * 100)}%`;
  }

  function loadMpkMiniPreset() {
    const any = "any:";
    state.ccMap = {
      ...state.ccMap,
      [`${any}1`]: { type: "mod", target: "vibrato" },
      [`${any}70`]: { type: "mod", target: "filter" },
      [`${any}71`]: { type: "mod", target: "reverb" },
      [`${any}72`]: { type: "param", target: "spread" },
      [`${any}73`]: { type: "param", target: "complexity" },
      [`${any}74`]: { type: "param", target: "humanize" },
      [`${any}75`]: { type: "param", target: "arpRate" },
      [`${any}76`]: { type: "mod", target: "tremolo" },
      [`${any}77`]: { type: "param", target: "strum" }
    };
    setModulation("filter", 0.55);
    setModulation("reverb", 0.22);
    setModulation("vibrato", 0);
    setModulation("tremolo", 0);
    persistState();
    syncUi();
    updateModReadout();
    state.padNoteMin = 36;
    state.padNoteMax = 43;
    dom.padNoteMin.value = "36";
    dom.padNoteMax.value = "43";
    state.bassFromPadsOnly = true;
    logMessage("preset", "--", "MPK Mini", "CC map + pad range 36–43. Set MPC pads to match.");
  }

  function startLearn(request) {
    state.midiLearn = request;
    updateLearnStatus();
  }

  function updateLearnStatus() {
    if (!state.midiLearn) {
      dom.learnStatus.classList.remove("visible");
      dom.learnStatus.textContent = "";
      return;
    }
    dom.learnStatus.classList.add("visible");
    if (state.midiLearn.type === "baseNote") {
      dom.learnStatus.textContent = "Learning base note: play the MIDI note that should become index 0.";
    } else if (state.midiLearn.type === "param") {
      dom.learnStatus.textContent = `Learning CC for ${state.midiLearn.target}. Move a knob/fader.`;
    } else {
      dom.learnStatus.textContent = `Learning action ${state.midiLearn.target}. Send a CC or note.`;
    }
  }

  function consumeLearn(kind, channel, number, value) {
    if (!state.midiLearn) return false;
    const learn = state.midiLearn;
    if (learn.type === "baseNote" && kind === "note") {
      state.inputBaseNote = clamp(number, 0, 127);
      state.midiLearn = null;
      persistState();
      syncUi();
      renderPlaySurface();
      logMessage("learn", channel, midiToName(number), "Base note assigned.");
      return true;
    }
    if (learn.type === "param" && kind === "cc") {
      const modTargets = ["filter", "reverb", "vibrato", "tremolo"];
      const type = modTargets.includes(learn.target) ? "mod" : "param";
      state.ccMap[`${channel}:${number}`] = { type, target: learn.target };
      state.midiLearn = null;
      persistState();
      syncUi();
      logMessage("learn", channel, `CC ${number}`, `Assigned to ${learn.target}.`);
      return true;
    }
    if (learn.type === "action" && (kind === "cc" || kind === "note") && value > 0) {
      const map = { type: "action", target: learn.target };
      if (kind === "cc") state.ccMap[`${channel}:${number}`] = map;
      if (kind === "note") state.noteMap[`${channel}:${number}`] = map;
      state.midiLearn = null;
      persistState();
      syncUi();
      logMessage("learn", channel, kind === "cc" ? `CC ${number}` : midiToName(number), `Assigned to ${learn.target}.`);
      return true;
    }
    return false;
  }

  function applyMappedCc(channel, cc, value) {
    const mapped = state.ccMap[`${channel}:${cc}`] || state.ccMap[`any:${cc}`];
    if (!mapped) return;
    if (mapped.type === "param") setMappedParam(mapped.target, value);
    else if (mapped.type === "mod") applyMod(mapped.target, value);
    else if (mapped.type === "action" && value >= 64) runAction(mapped.target);
  }

  function runMappedNoteAction(channel, note) {
    const mapped = state.noteMap[`${channel}:${note}`];
    if (!mapped || mapped.type !== "action") return false;
    runAction(mapped.target);
    return true;
  }

  function setMappedParam(param, ccValue) {
    const spec = rangeSpecs.find((item) => item.key === param);
    if (!spec) return;
    state[param] = scaleCC(ccValue, spec.min, spec.max, spec.step >= 1);
    if (param === "bassMode") {
      state.layers.bass = state.bassMode > 0;
      refreshActiveLayer("bass");
    }
    if (param === "arpRate") refreshActiveLayer("arp");
    if (param === "volume") setVolume(state.volume);
    persistState();
    syncUi();
    renderPlaySurface();
  }

  function runAction(action) {
    if (action === "toggleInternal") state.internalSound = !state.internalSound;
    if (action === "toggleMidiOut") state.midiOutEnabled = !state.midiOutEnabled;
    if (action === "toggleBass") {
      state.layers.bass = !state.layers.bass;
      state.bassMode = state.layers.bass ? Math.max(1, state.bassMode) : 0;
      refreshActiveLayer("bass");
    }
    if (action === "toggleArp") {
      state.layers.arp = !state.layers.arp;
      refreshActiveLayer("arp");
    }
    if (action === "togglePad") state.layers.pad = !state.layers.pad;
    if (action === "panic") panic();
    persistState();
    syncUi();
  }

  /* Melodic */
  function handleMelodicNote(inputNote, velocity, source, fromLooper) {
    const voiceKey = `${source}:${inputNote}`;
    stopMelodicNote(inputNote, source);
    if (state.internalSound) ensureAudio(state.volume).catch((e) => logMessage("audio", "--", "--", e.message));

    const legatoKey = source;
    const prev = state.melodicLegato.get(legatoKey);
    const outputNote = theory.quantizeToScale(inputNote, state.keyRoot, state.scale, {
      snapMode: state.melodicSnap,
      snapBias: state.melodicSnap === "up" ? "up" : state.melodicSnap === "down" ? "down" : undefined,
      legatoPrev: prev,
      preserveOctave: true
    });
    state.melodicLegato.set(legatoKey, outputNote);

    const group = { inputNote, outputNote, baseOutputNote: outputNote, velocity, audioIds: [] };
    sendNoteOn(outputNote, velocity, state.melodicChannel);
    if (state.internalSound) {
      group.audioIds.push(playAudioNote(outputNote, velocity, "melodic", state.waveform));
    }
    state.melodicVoices.set(voiceKey, group);
    if (!fromLooper) looper.record("melody", { inputNote, velocity });

    const label = theory.getMelodicLabel(outputNote, state.keyRoot, state.scale);
    dom.functionName.textContent = label;
    dom.realName.textContent = `${midiToName(outputNote)} / melodic`;
    dom.noteCount.textContent = "1 note";
    dom.noteNames.textContent = `${midiToName(inputNote)} → ${midiToName(outputNote)}`;
    updateLastInput("melodic", source.replace("midi:", "ch "), midiToName(inputNote), velocity, midiToName(outputNote));
    logMessage("melodic", source.replace("midi:", "ch "), `${midiToName(inputNote)} → ${midiToName(outputNote)}`, label);
  }

  function stopMelodicNote(inputNote, source) {
    const voiceKey = `${source}:${inputNote}`;
    const group = state.melodicVoices.get(voiceKey);
    if (!group) return;
    sendNoteOff(group.outputNote, state.melodicChannel, true);
    group.audioIds.forEach(stopAudioNote);
    state.melodicVoices.delete(voiceKey);
  }

  /* Harmony */
  function getInputIndex(note) {
    if (state.performanceMode === "harmony-root") return mod(note, 12);
    const offset = note - state.inputBaseNote;
    if (!state.wrapDegree && (offset < 0 || offset > 11)) return null;
    return mod(offset, 12);
  }

  function handleHarmonicTrigger(inputNote, velocity, source, fromLooper) {
    const voiceKey = `${source}:${inputNote}`;
    stopHarmonicTrigger(inputNote, source);
    if (state.internalSound) ensureAudio(state.volume).catch((e) => logMessage("audio", "--", "--", e.message));

    const index = getInputIndex(inputNote);
    if (index == null) return;

    const chordInfo = state.performanceMode === "harmony-root"
      ? theory.getRootChord(inputNote, state.keyRoot, state.scale, state.complexity, state.melodicSnap)
      : theory.getDegreeChord(index, state.keyRoot, state.scale, state.complexity);

    const effectiveBase = voicing.getEffectiveBaseOctave(inputNote, state.followInputOctave, state.baseOctave);
    const zoneKey = source;
    const previousVoicing = state.previousVoicings.get(zoneKey) || null;
    const bassActive = state.layers.bass && state.bassMode > 0;
    const omitFifth = state.complexity >= 1 && bassActive;

    const keysNotes = voicing.buildVoicing(chordInfo.intervals, {
      rootPc: chordInfo.rootPc,
      baseOctave: effectiveBase,
      voicing: state.voicing,
      spread: state.spread,
      maxNotes: bassActive ? (state.complexity >= 2 ? 4 : 3) : (state.complexity >= 2 ? 5 : 4),
      previousVoicing,
      omitFifth,
      bassActive
    });
    state.previousVoicings.set(zoneKey, keysNotes.slice());

    const group = {
      inputNote,
      chordInfo,
      velocity,
      voicing: keysNotes,
      keys: null,
      bass: null,
      pad: null,
      arp: null
    };

    if (state.layers.keys) group.keys = playLayer("keys", keysNotes, velocity, 1, { strum: state.strum });
    const bassFromKeys = bassActive && !state.bassFromPadsOnly;
    const bassNotes = bassFromKeys
      ? voicing.buildBass(chordInfo.rootPc, chordInfo, state.bassMode, state.keyRoot, state.scale)
      : [];
    if (bassNotes.length) group.bass = playLayer("bass", bassNotes, Math.round(velocity * 0.9), 2, { strum: 0 });
    if (state.layers.pad) {
      const padNotes = voicing.buildVoicing(chordInfo.intervals, {
        rootPc: chordInfo.rootPc,
        baseOctave: effectiveBase + 1,
        voicing: state.voicing,
        spread: state.spread + 1,
        maxNotes: 4,
        previousVoicing: null,
        omitFifth: true,
        bassActive: false
      });
      group.pad = playLayer("pad", padNotes, Math.round(velocity * 0.58), 4, { strum: state.strum + 8 });
    }
    if (state.layers.arp) {
      const arpNotes = state.arpSource === "scale"
        ? voicing.buildScaleArpNotes(chordInfo.rootPc, state.keyRoot, state.scale, effectiveBase)
        : keysNotes;
      group.arp = startArp(arpNotes, velocity, voiceKey);
    }

    state.activeVoices.set(voiceKey, group);
    if (!fromLooper) looper.record("harmony", { inputNote, velocity });
    renderChord(chordInfo, keysNotes, bassNotes);
    setPadActive(index, true);
    logMessage("trigger", source.replace("midi:", "ch "), midiToName(inputNote), `${chordInfo.label} -> ${chordInfo.name}`);
  }

  function stopHarmonicTrigger(inputNote, source) {
    const voiceKey = `${source}:${inputNote}`;
    const group = state.activeVoices.get(voiceKey);
    if (!group) return;
    stopLayer(group.keys);
    stopLayer(group.bass);
    stopLayer(group.pad);
    stopArp(group.arp);
    state.activeVoices.delete(voiceKey);
    const index = getInputIndex(inputNote);
    if (index != null) setPadActive(index, false);
  }

  function refreshActiveLayer(layer) {
    state.activeVoices.forEach((group, voiceKey) => {
      if (layer === "bass") {
        stopLayer(group.bass);
        group.bass = null;
        const bassNotes = state.layers.bass && state.bassMode > 0
          ? voicing.buildBass(group.chordInfo.rootPc, group.chordInfo, state.bassMode, state.keyRoot, state.scale)
          : [];
        if (bassNotes.length) group.bass = playLayer("bass", bassNotes, Math.round(group.velocity * 0.9), 2, { strum: 0 });
      }
      if (layer === "arp") {
        stopArp(group.arp);
        if (state.layers.arp) {
          const effectiveBase = voicing.getEffectiveBaseOctave(group.inputNote, state.followInputOctave, state.baseOctave);
          const arpNotes = state.arpSource === "scale"
            ? voicing.buildScaleArpNotes(group.chordInfo.rootPc, state.keyRoot, state.scale, effectiveBase)
            : group.voicing;
          group.arp = startArp(arpNotes, group.velocity, voiceKey);
        } else {
          group.arp = null;
        }
      }
    });
  }

  /* Performance */
  function playLayer(layer, notes, velocity, channel, options) {
    const group = { layer, channel, midiNotes: [], audioIds: [], timeouts: [], cancelled: false };
    notes.forEach((note, index) => {
      const delay = Math.max(0, (options.strum || 0) * index + randomHumanize());
      const timeoutId = window.setTimeout(() => {
        if (group.cancelled) return;
        sendNoteOn(note, velocity, channel);
        if (state.midiOutEnabled && state.midiOutput) group.midiNotes.push(note);
        if (state.internalSound) group.audioIds.push(playAudioNote(note, velocity, layer, state.waveform));
      }, delay);
      group.timeouts.push(timeoutId);
    });
    return group;
  }

  function stopLayer(group) {
    if (!group) return;
    group.cancelled = true;
    group.timeouts.forEach((id) => clearTimeout(id));
    group.midiNotes.forEach((note) => sendNoteOff(note, group.channel, true));
    group.audioIds.forEach(stopAudioNote);
  }

  function startArp(notes, velocity, voiceKey) {
    if (!notes.length) return null;
    const group = {
      notes: notes.slice(),
      velocity,
      voiceKey,
      step: 0,
      direction: 1,
      activeMidi: [],
      activeAudio: [],
      timeouts: [],
      intervalId: null
    };
    const tick = () => playArpTick(group);
    tick();
    group.intervalId = window.setInterval(tick, arpIntervalMs());
    return group;
  }

  function playArpTick(group) {
    const note = pickArpNote(group);
    const decay = 0.72 - (group.step % 4) * 0.04;
    const velocity = Math.max(1, Math.round(group.velocity * decay));
    sendNoteOn(note, velocity, 3);
    if (state.midiOutEnabled && state.midiOutput) group.activeMidi.push(note);
    if (state.internalSound) group.activeAudio.push(playAudioNote(note, velocity, "arp", state.waveform));
    const timeoutId = window.setTimeout(() => {
      sendNoteOff(note, 3, true);
      group.activeMidi = group.activeMidi.filter((item) => item !== note);
      const audioId = group.activeAudio.shift();
      if (audioId) stopAudioNote(audioId);
    }, Math.max(80, arpIntervalMs() * 0.58));
    group.timeouts.push(timeoutId);
  }

  function pickArpNote(group) {
    const notes = group.notes;
    if (state.arpPattern === "random") return notes[Math.floor(Math.random() * notes.length)];
    if (state.arpPattern === "down") {
      const note = notes[notes.length - 1 - (group.step % notes.length)];
      group.step += 1;
      return note;
    }
    if (state.arpPattern === "upDown") {
      const note = notes[group.step];
      group.step += group.direction;
      if (group.step >= notes.length - 1 || group.step <= 0) group.direction *= -1;
      return note;
    }
    const note = notes[group.step % notes.length];
    group.step += 1;
    return note;
  }

  function stopArp(group) {
    if (!group) return;
    clearInterval(group.intervalId);
    group.timeouts.forEach((id) => clearTimeout(id));
    group.activeMidi.forEach((note) => sendNoteOff(note, 3, true));
    group.activeAudio.forEach(stopAudioNote);
  }

  function arpIntervalMs() {
    return [900, 650, 460, 320, 220, 150][clamp(state.arpRate, 1, 6) - 1];
  }

  function randomHumanize() {
    if (!state.humanize) return 0;
    return Math.round((Math.random() * 2 - 1) * state.humanize);
  }

  function panic() {
    state.activeVoices.forEach((group) => {
      stopLayer(group.keys);
      stopLayer(group.bass);
      stopLayer(group.pad);
      stopArp(group.arp);
    });
    state.activeVoices.clear();
    state.melodicVoices.forEach((group) => {
      sendNoteOff(group.outputNote, state.melodicChannel, true);
      group.audioIds.forEach(stopAudioNote);
    });
    state.melodicVoices.clear();
    stopAllAudio();
    keyboard.releaseAllHeld();
    looper.stop();
    dom.looperRecord?.classList.remove("active");
    updateLooperUi();
    sendAllNotesOff();
    document.querySelectorAll(".pad.active").forEach((pad) => pad.classList.remove("active"));
    logMessage("panic", "--", "--", "All generated notes stopped.");
  }

  function sendNoteOn(note, velocity, channel) {
    if (!state.midiOutEnabled || !state.midiOutput) return;
    state.midiOutput.send([0x90 + (channel - 1), clamp(Math.round(note), 0, 127), clamp(Math.round(velocity), 1, 127)]);
  }

  function sendNoteOff(note, channel, force) {
    if (!force && (!state.midiOutEnabled || !state.midiOutput)) return;
    if (!state.midiOutput) return;
    state.midiOutput.send([0x80 + (channel - 1), clamp(Math.round(note), 0, 127), 0]);
  }

  function sendAllNotesOff() {
    if (!state.midiOutput) return;
    for (let channel = 1; channel <= 16; channel += 1) {
      state.midiOutput.send([0xb0 + (channel - 1), 123, 0]);
    }
  }

  /* UI */
  function renderPlaySurface() {
    renderDrumPads();
    renderBassPads();
    renderKeyPads();
  }

  function renderDrumPads() {
    if (!dom.drumPads) return;
    dom.drumPads.innerHTML = "";
    drums.DRUM_LABELS.forEach((label, index) => {
      const button = document.createElement("button");
      button.className = "pad drum-pad";
      button.dataset.index = String(index);
      button.innerHTML = `<span class="pad-label">${label}</span><span class="pad-role">Pad ${index + 1}</span>`;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        triggerDrum(index, shapedVelocity(100), "virtual");
      });
      dom.drumPads.appendChild(button);
    });
  }

  function renderBassPads() {
    if (!dom.bassPads) return;
    dom.bassPads.innerHTML = "";
    const labels = ["I", "IV", "V", "vi"];
    labels.forEach((label, index) => {
      const degreeIndex = BASS_PAD_DEGREES[index];
      const chord = theory.getDegreeChord(degreeIndex, state.keyRoot, state.scale, 0);
      const button = document.createElement("button");
      button.className = "pad bass-pad";
      button.dataset.index = String(index);
      button.innerHTML = `<span class="pad-label">${label}</span><span class="pad-role">${chord.name}</span>`;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        triggerBassPad(index, shapedVelocity(96), "virtual");
      });
      dom.bassPads.appendChild(button);
    });
  }

  function renderKeyPads() {
    if (!dom.keyPads) return;
    dom.keyPads.innerHTML = "";
    const isMelodicOnly = state.performanceMode === "melodic";
    for (let index = 0; index < 12; index += 1) {
      let label;
      let sub;
      if (isMelodicOnly) {
        const pc = mod(state.keyRoot + theory.getScaleIntervals(state.scale)[index % 7], 12);
        const note = 60 + index;
        label = theory.getMelodicLabel(note, state.keyRoot, state.scale);
        sub = `${CM.utils.pcToName(pc)} / scale degree`;
      } else if (state.performanceMode === "harmony-root") {
        const chord = theory.getRootChord(index, state.keyRoot, state.scale, state.complexity, state.melodicSnap);
        label = chord.label;
        sub = `${chord.name} / ${chord.role}`;
      } else {
        const chord = theory.getDegreeChord(index, state.keyRoot, state.scale, state.complexity);
        label = chord.label;
        sub = `${chord.name} / ${chord.role}`;
      }
      const button = document.createElement("button");
      button.className = "pad";
      button.dataset.index = String(index);
      button.innerHTML = `<span class="pad-label">${label}</span><span class="pad-role">${sub}</span>`;
      bindKeyPad(button, index);
      dom.keyPads.appendChild(button);
    }
  }

  function bindKeyPad(button, index) {
    const note = state.performanceMode === "harmony-root" || state.performanceMode === "melodic"
      ? 60 + index
      : state.inputBaseNote + index;
    const source = "virtual";
    const start = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      const vel = shapedVelocity(100);
      if (state.performanceMode === "melodic") handleMelodicNote(note, vel, source);
      else if (state.performanceMode === "split") {
        if (note < state.splitNote) handleHarmonicTrigger(note, vel, source);
        else handleMelodicNote(note, vel, source);
      } else handleHarmonicTrigger(note, vel, source);
    };
    const stop = (event) => {
      event.preventDefault();
      if (state.performanceMode === "melodic") stopMelodicNote(note, source);
      else if (state.performanceMode === "split") {
        if (note < state.splitNote) stopHarmonicTrigger(note, source);
        else stopMelodicNote(note, source);
      } else stopHarmonicTrigger(note, source);
    };
    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("pointerleave", (event) => {
      if (event.buttons) stop(event);
    });
  }

  function setPadActive(index, active) {
    const pad = dom.keyPads?.querySelector(`[data-index="${mod(index, 12)}"]`);
    if (pad) pad.classList.toggle("active", active);
  }

  function renderChord(chordInfo, notes, bassNotes) {
    dom.functionName.textContent = chordInfo.label;
    dom.realName.textContent = `${chordInfo.name} / ${chordInfo.role}`;
    dom.noteCount.textContent = `${notes.length} notes`;
    const layers = [`Keys ${notes.map(midiToName).join(", ")}`];
    if (bassNotes.length) layers.push(`Bass ${bassNotes.map(midiToName).join(", ")}`);
    if (state.layers.arp) layers.push(`Arp ${formatArpPattern(state.arpPattern)} (${state.arpSource})`);
    dom.noteNames.textContent = layers.join(" / ");
  }

  function updateLastInput(type, channel, data, value, remap) {
    dom.lastType.textContent = type;
    dom.lastChannel.textContent = `Channel ${channel}`;
    dom.lastData.textContent = data;
    dom.lastValue.textContent = `Velocity/value ${value}`;
    if (dom.lastRemap) dom.lastRemap.textContent = remap ? `→ ${remap}` : "--";
    logMessage(type, channel, data, remap ? `${value} → ${remap}` : value);
  }

  function logMessage(type, channel, data, value) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    state.log.unshift({ time, type, channel, data, value });
    state.log = state.log.slice(0, 80);
    renderMonitor();
  }

  function renderMonitor() {
    if (!state.log.length) {
      dom.monitor.innerHTML = `<div class="log-line"><span>--</span><strong>idle</strong><span>--</span><span>No MIDI messages yet.</span></div>`;
      return;
    }
    dom.monitor.innerHTML = state.log.map((line) => `
      <div class="log-line">
        <span>${line.time}</span>
        <strong>${line.type}</strong>
        <span>${line.channel}</span>
        <span>${line.data} / ${line.value}</span>
      </div>
    `).join("");
  }

  function formatArpPattern(pattern) {
    return pattern === "upDown" ? "Up Down" : pattern.charAt(0).toUpperCase() + pattern.slice(1);
  }

  CM.app = { state, panic };
})(window.ChordMaster);
