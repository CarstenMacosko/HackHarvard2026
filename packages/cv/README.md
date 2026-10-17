# @vf/cv: on-device computer vision

A TypeScript port of the reference CV modules in `services/cv`, so participants get quality
feedback and measurements **in their browser**, without uploading the raw media first.

- `image.ts`: OpenCV-compatible 8-bit image math (gray, Laplacian, Gaussian blur, YCrCb, CIELAB,
  ellipse morphology), reproducing OpenCV's integer formulas so results match the server.
- `eczema.ts`: the `eczema_photo` module (quality gate, erythema, affected area, feature vector).
- `tapping.ts`: the `finger_tapping` signal math (Savitzky–Golay, SciPy-compatible peak finding)
  plus the quality gate. Hand landmarks come from MediaPipe Tasks in the browser
  (`apps/web/lib/cv-client`).

`test/parity.test.ts` checks every number against `fixtures/expected.json`, which the Python
modules generate (`services/cv/scripts/export_parity_fixtures.py`). The Python test suite fails if
those fixtures go stale, so the two implementations cannot drift apart silently.
