window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const { midiToFrequency, clamp } = CM.utils;

  const MAX_VOICES = 16;

  const audio = {
    ctx: null,
    master: null,
    reverb: null,
    reverbGain: null,
    dryGain: null,
    voices: new Map(),
    nextId: 1,
    pitchBendSemitones: 0
  };

  const mods = {
    filter: 0.55,
    reverb: 0.22,
    vibrato: 0,
    tremolo: 0
  };

  function createReverbImpulse(ctx, duration, decay) {
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  function filterFreqFor(layer, baseFreq) {
    const mod = mods.filter;
    const layerScale = layer === "bass" ? 0.45 : layer === "pad" ? 1.15 : 1;
    const min = 400 * layerScale;
    const max = (layer === "bass" ? 1800 : 7200) * layerScale;
    return baseFreq * (0.65 + mod * 0.7) + min + (max - min) * mod * 0.35;
  }

  async function ensureAudio(volume) {
    if (!audio.ctx) {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.master = audio.ctx.createGain();
      audio.dryGain = audio.ctx.createGain();
      audio.reverbGain = audio.ctx.createGain();
      audio.reverb = audio.ctx.createConvolver();
      audio.reverb.buffer = createReverbImpulse(audio.ctx, 1.8, 2.2);
      audio.dryGain.gain.value = 0.88;
      audio.dryGain.connect(audio.master);
      audio.reverb.connect(audio.reverbGain);
      audio.reverbGain.connect(audio.master);
      audio.master.connect(audio.ctx.destination);
      setModulation("reverb", mods.reverb);
    }
    if (audio.ctx.state === "suspended") await audio.ctx.resume();
    if (audio.master) audio.master.gain.setTargetAtTime(volume, audio.ctx.currentTime, 0.01);
  }

  function setModulation(key, normalized) {
    const value = clamp(normalized, 0, 1);
    mods[key] = value;
    if (!audio.ctx) return;
    const now = audio.ctx.currentTime;
    if (key === "reverb") {
      audio.reverbGain.gain.setTargetAtTime(value * 0.55, now, 0.04);
      audio.dryGain.gain.setTargetAtTime(0.95 - value * 0.25, now, 0.04);
    }
    if (key === "filter") {
      audio.voices.forEach((voice) => {
        if (!voice.filter || voice.baseFilter == null) return;
        voice.filter.frequency.setTargetAtTime(filterFreqFor(voice.layer, voice.baseFilter), now, 0.03);
      });
    }
    if (key === "vibrato" || key === "tremolo") {
      audio.voices.forEach((voice) => applyVoiceModulation(voice));
    }
  }

  function getModulation(key) {
    return mods[key] ?? 0;
  }

  function applyVoiceModulation(voice) {
    if (!audio.ctx || !voice.osc) return;
    const now = audio.ctx.currentTime;
    if (voice.vibratoLfo) {
      voice.vibratoLfo.frequency.setTargetAtTime(4 + mods.vibrato * 4, now, 0.05);
      voice.vibratoGain.gain.setTargetAtTime(mods.vibrato * 35, now, 0.05);
    }
    if (voice.tremoloLfo) {
      voice.tremoloLfo.frequency.setTargetAtTime(3 + mods.tremolo * 5, now, 0.05);
      voice.tremoloGain.gain.setTargetAtTime(mods.tremolo * 0.42, now, 0.05);
    }
  }

  function setPitchBendSemitones(semitones) {
    audio.pitchBendSemitones = semitones;
    if (!audio.ctx) return;
    const now = audio.ctx.currentTime;
    audio.voices.forEach((voice) => {
      if (voice.baseMidi == null) return;
      const bent = voice.baseMidi + semitones;
      voice.osc.frequency.setTargetAtTime(midiToFrequency(bent), now, 0.02);
    });
  }

  function stealOldestVoice() {
    if (audio.voices.size < MAX_VOICES) return;
    const oldest = audio.voices.keys().next().value;
    if (oldest != null) stopAudioNote(oldest);
  }

  function layerSynthConfig(layer, waveform) {
    if (layer === "bass") {
      return { type: "sawtooth", filterFreq: 820, attack: 0.008, release: 0.12, gain: 0.9, detune: 0 };
    }
    if (layer === "pad") {
      return { type: "sine", filterFreq: 2400, attack: 0.14, release: 0.48, gain: 0.4, detune: 4 };
    }
    if (layer === "arp") {
      return { type: "square", filterFreq: 3200, attack: 0.006, release: 0.07, gain: 0.48, detune: 0 };
    }
    if (layer === "melodic") {
      return { type: waveform || "triangle", filterFreq: 3800, attack: 0.01, release: 0.18, gain: 0.65, detune: 0 };
    }
    return { type: waveform || "triangle", filterFreq: 2800, attack: 0.012, release: 0.2, gain: 0.6, detune: 0 };
  }

  function playAudioNote(note, velocity, layer, waveform) {
    if (!audio.ctx || !audio.master) return null;
    stealOldestVoice();

    const now = audio.ctx.currentTime;
    const cfg = layerSynthConfig(layer, waveform);
    const osc = audio.ctx.createOscillator();
    const filter = audio.ctx.createBiquadFilter();
    const gain = audio.ctx.createGain();
    const id = audio.nextId++;

    const bentNote = note + audio.pitchBendSemitones;
    const peak = (velocity / 127) * cfg.gain;
    osc.type = cfg.type;
    osc.frequency.value = midiToFrequency(bentNote);
    osc.detune.value = cfg.detune;

    const baseFilter = cfg.filterFreq;
    filter.type = "lowpass";
    filter.frequency.value = filterFreqFor(layer, baseFilter);
    filter.Q.value = 0.7;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + cfg.attack);

    const vibratoLfo = audio.ctx.createOscillator();
    const vibratoGain = audio.ctx.createGain();
    vibratoLfo.frequency.value = 4;
    vibratoGain.gain.value = mods.vibrato * 35;
    vibratoLfo.connect(vibratoGain);
    vibratoGain.connect(osc.detune);
    vibratoLfo.start(now);

    const tremoloLfo = audio.ctx.createOscillator();
    const tremoloGain = audio.ctx.createGain();
    tremoloLfo.frequency.value = 4;
    tremoloGain.gain.value = mods.tremolo * 0.42;
    tremoloLfo.connect(tremoloGain);
    tremoloGain.connect(gain.gain);
    tremoloLfo.start(now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audio.dryGain);
    gain.connect(audio.reverb);
    osc.start(now);

    const voice = {
      osc,
      gain,
      filter,
      layer,
      release: cfg.release,
      baseFilter,
      baseMidi: note,
      vibratoLfo,
      vibratoGain,
      tremoloLfo,
      tremoloGain
    };
    applyVoiceModulation(voice);
    audio.voices.set(id, voice);
    return id;
  }

  function stopAudioNote(id) {
    const voice = audio.voices.get(id);
    if (!voice || !audio.ctx) return;
    const now = audio.ctx.currentTime;
    const release = voice.release || 0.1;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, release / 4);
    voice.osc.stop(now + release + 0.05);
    if (voice.vibratoLfo) voice.vibratoLfo.stop(now + release + 0.05);
    if (voice.tremoloLfo) voice.tremoloLfo.stop(now + release + 0.05);
    voice.osc.onended = () => {
      voice.osc.disconnect();
      voice.filter.disconnect();
      voice.gain.disconnect();
      voice.vibratoLfo?.disconnect();
      voice.vibratoGain?.disconnect();
      voice.tremoloLfo?.disconnect();
      voice.tremoloGain?.disconnect();
    };
    audio.voices.delete(id);
  }

  function setVolume(volume) {
    if (audio.ctx && audio.master) {
      audio.master.gain.setTargetAtTime(volume, audio.ctx.currentTime, 0.01);
    }
  }

  function stopAllAudio() {
    [...audio.voices.keys()].forEach(stopAudioNote);
  }

  CM.audio = {
    audio,
    mods,
    ensureAudio,
    playAudioNote,
    stopAudioNote,
    setVolume,
    stopAllAudio,
    setModulation,
    getModulation,
    setPitchBendSemitones
  };
})(window.ChordMaster);
