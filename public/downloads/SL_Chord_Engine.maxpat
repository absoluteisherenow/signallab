{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 6,
      "bugfix": 0
    },
    "classnamespace": "dsp.gen",
    "rect": [
      100,
      100,
      640,
      480
    ],
    "bglocked": 0,
    "openinpresentation": 1,
    "boxes": [
      {
        "box": {
          "id": "obj-1",
          "maxclass": "newobj",
          "text": "midiin",
          "patching_rect": [
            50,
            50,
            60,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-2",
          "maxclass": "newobj",
          "text": "midiout",
          "patching_rect": [
            50,
            400,
            65,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-3",
          "maxclass": "newobj",
          "text": "js signallab_chord.js",
          "patching_rect": [
            50,
            200,
            160,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-4",
          "maxclass": "comment",
          "text": "SL Chord Engine v1.0 \u2014 Signal Lab",
          "patching_rect": [
            50,
            20,
            300,
            22
          ],
          "fontsize": 13
        }
      },
      {
        "box": {
          "id": "obj-5",
          "maxclass": "textfield",
          "text": "Enter Signal Lab API key",
          "patching_rect": [
            50,
            100,
            300,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            40,
            280,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-6",
          "maxclass": "umenu",
          "items": [
            "A minor",
            "C major",
            "D minor",
            "E minor",
            "F major",
            "G major",
            "B minor"
          ],
          "patching_rect": [
            50,
            140,
            200,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            80,
            200,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-7",
          "maxclass": "comment",
          "text": "Key",
          "patching_rect": [
            260,
            140,
            60,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            220,
            80,
            60,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-8",
          "maxclass": "umenu",
          "items": [
            "Close",
            "Open",
            "Wide",
            "Drop 2",
            "Drop 3"
          ],
          "patching_rect": [
            50,
            170,
            200,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            110,
            200,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-9",
          "maxclass": "comment",
          "text": "Voicing",
          "patching_rect": [
            260,
            170,
            60,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            220,
            110,
            60,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-10",
          "maxclass": "live.dial",
          "patching_rect": [
            50,
            240,
            44,
            47
          ],
          "presentation": 1,
          "presentation_rect": [
            10,
            150,
            44,
            47
          ],
          "varname": "tension"
        }
      },
      {
        "box": {
          "id": "obj-11",
          "maxclass": "comment",
          "text": "Tension",
          "patching_rect": [
            100,
            250,
            60,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            60,
            165,
            60,
            22
          ]
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "source": [
            "obj-1",
            0
          ],
          "destination": [
            "obj-3",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-3",
            0
          ],
          "destination": [
            "obj-2",
            0
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-6",
            0
          ],
          "destination": [
            "obj-3",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-8",
            0
          ],
          "destination": [
            "obj-3",
            2
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-10",
            0
          ],
          "destination": [
            "obj-3",
            3
          ]
        }
      }
    ]
  }
}