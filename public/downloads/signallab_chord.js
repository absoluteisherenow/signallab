
// signallab_chord.js — Signal Lab Chord Engine
// Drop this in your Max search path alongside SL_Chord_Engine.maxpat

var apiKey = "";
var currentKey = "A minor";
var voicing = "Open";
var tension = 0.4;

// Chord voicings database
var CHORDS = {
  "A minor": {
    "i":  [57, 60, 64],
    "VI": [53, 57, 60],
    "III":[52, 55, 59],
    "VII":[47, 50, 55]
  },
  "C major": {
    "I":  [48, 52, 55],
    "V":  [43, 47, 50],
    "vi": [45, 48, 52],
    "IV": [41, 45, 48]
  }
};

var progIndex = 0;
var prog = ["i", "VI", "III", "VII"];

function msg_int(note) {
  if (note > 0) {
    // Note on — output the next chord in the progression
    var chordName = prog[progIndex % prog.length];
    var keyChords = CHORDS[currentKey] || CHORDS["A minor"];
    var intervals = keyChords[chordName] || [57, 60, 64];

    // Apply voicing spread
    if (voicing === "Wide") {
      intervals = intervals.map(function(n, i) { return n + (i * 12); });
    } else if (voicing === "Open") {
      if (intervals.length >= 3) intervals[1] += 12;
    }

    // Output each note
    for (var i = 0; i < intervals.length; i++) {
      outlet(0, [intervals[i], 100]);
    }
    progIndex++;
  } else {
    // Note off — silence
    outlet(0, [0, 0]);
  }
}

function setkey(k) { currentKey = k; }
function setvoicing(v) { voicing = v; }
function settension(t) { tension = t / 100; }
function setapikey(k) { apiKey = k; }
