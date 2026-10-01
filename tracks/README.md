# Pluggable tracks

Each track is a self-contained package:

```
tracks/<track-id>/
  manifest.json   # id, title, language, runner, prerequisites, modes
  lessons/*.json  # topic-by-topic content (example + exercise)
  tasks/*.json    # execute-only progressive tasks
```

The hub shell discovers manifests at runtime (`GET /tracks`). Adding a future track
(e.g. `general-programming`) means adding a folder + manifest + lessons/tasks and a
runner adapter on the appropriate API — not rewriting the Next.js shell.

`index.json` lists known tracks for static tooling.
