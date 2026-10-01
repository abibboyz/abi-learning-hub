# Pluggable tracks (in-app)

Each track is a self-contained **data package** — not a separate Docker stack.

```
tracks/<track-id>/
  manifest.json   # id, title, language, runner, prerequisites, modes
  lessons/*.json  # topic-by-topic: why, objectives, pitfalls, references, mapping
  tasks/*.json    # execute-only: requirements, why, teach-along, starter code
```

The hub discovers manifests at runtime (`GET /api/tracks`). Learners switch tracks in the **web UI**.

Adding a future track (e.g. `general-programming`) means a folder + manifest + lessons/tasks and a runner adapter on the appropriate **internal** API — not a new Compose file and not a hub rewrite.

`index.json` lists known tracks for static tooling.
