# Midnight Laughs clown voices

The dialogue in `voices/` is original funhouse dialogue. Its captions are the
exact words spoken in each clip. The WAV files are rendered locally with the
project's existing Kokoro-82M natural male and female voice engine, then
normalized to -20 LUFS without pitch shifting or voice effects.

The 30 clips include the attraction hosts, all six Lost Laugh discoveries, and
six Night Watch responses: its welcome, four haunted lanterns and the finale.

The Kokoro model and voice attribution is retained in
[`voice-engine/NOTICE.md`](../../../voice-engine/NOTICE.md), with its Apache-2.0
license files beside it. No third-party music or recorded performances were
sampled for these clips.

To rebuild after installing the existing neural engine dependencies and model:

```sh
node scripts/build-funhouse-voices.mjs
```

Use `--force` to regenerate unchanged clips. `voices/manifest.json` records each
text, voice, duration and file hash. Playback uses local static files, so the
funhouse does not need installed browser speech voices or a generation request.
