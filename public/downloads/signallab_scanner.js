
// signallab_scanner.js — Signal Lab VST Scanner
var apiKey = "";
var vstList = [];

function bang() {
  // Scan common VST folders
  var folders = [
    "/Library/Audio/Plug-Ins/VST3",
    "/Library/Audio/Plug-Ins/VST",
    "/Library/Audio/Plug-Ins/Components"
  ];
  post("Scanning VST folders...\n");
  // In real M4L this uses max.fs to read directories
  outlet(0, "scan_complete");
}

function msg_int(v) {
  if (v === 1) syncToSignalLab();
}

function syncToSignalLab() {
  post("Syncing " + vstList.length + " plugins to Signal Lab\n");
  outlet(0, "synced");
}

function setapikey(k) { apiKey = k; post("API key set\n"); }
