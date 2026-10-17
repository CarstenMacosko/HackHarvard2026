# Test fixtures

`hand_open.jpg` (originally `pointing_up.jpg`) and `hand_closed.jpg` (originally `fist.jpg`) are
MediaPipe test assets from `https://storage.googleapis.com/mediapipe-assets/`, distributed under
the Apache License 2.0 as part of the MediaPipe project. `tests/videos.py` alternates them to
synthesise a finger-tapping video, so the real hand-landmark model can be tested end to end.
