{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 6,
      "bugfix": 0
    },
    "rect": [
      100,
      100,
      500,
      400
    ],
    "boxes": [
      {
        "box": {
          "id": "obj-1",
          "maxclass": "comment",
          "text": "SL Scanner v1.0 \u2014 Signal Lab VST Library",
          "patching_rect": [
            20,
            20,
            350,
            22
          ],
          "fontsize": 13
        }
      },
      {
        "box": {
          "id": "obj-2",
          "maxclass": "newobj",
          "text": "js signallab_scanner.js",
          "patching_rect": [
            20,
            80,
            180,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-3",
          "maxclass": "textbutton",
          "text": "Scan VST Folder",
          "patching_rect": [
            20,
            120,
            140,
            28
          ],
          "presentation": 1,
          "presentation_rect": [
            20,
            60,
            140,
            28
          ]
        }
      },
      {
        "box": {
          "id": "obj-4",
          "maxclass": "textbutton",
          "text": "Sync to Signal Lab",
          "patching_rect": [
            180,
            120,
            140,
            28
          ],
          "presentation": 1,
          "presentation_rect": [
            180,
            60,
            140,
            28
          ]
        }
      },
      {
        "box": {
          "id": "obj-5",
          "maxclass": "live.text",
          "text": "Enter API Key",
          "patching_rect": [
            20,
            50,
            200,
            22
          ],
          "presentation": 1,
          "presentation_rect": [
            20,
            20,
            280,
            22
          ]
        }
      },
      {
        "box": {
          "id": "obj-6",
          "maxclass": "newobj",
          "text": "print",
          "patching_rect": [
            20,
            200,
            50,
            22
          ]
        }
      }
    ],
    "lines": [
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
            "obj-4",
            0
          ],
          "destination": [
            "obj-2",
            1
          ]
        }
      },
      {
        "patchline": {
          "source": [
            "obj-2",
            0
          ],
          "destination": [
            "obj-6",
            0
          ]
        }
      }
    ]
  }
}