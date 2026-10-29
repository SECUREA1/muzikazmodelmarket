# Bundled world narration

These are real, app-owned Kokoro neural voice recordings. They let the map introduction play directly from the website, including when the live generation service is starting or unavailable. The pack includes female and male narration for every sentence in the 38 authored maps, Public Commons and the eight default public districts' shared and solo introductions, with repeated instructions stored once.

The MP3 files are mono, 24 kHz and 64 kbit/s. Their voices remain at native pitch, with no reverb or other voice effects. `manifest.json` records the exact spoken sentence, speaker style, length, file size and SHA-256 digest for every clip. The source model and styles are Apache-2.0; see [the voice engine notice](../../../../voice-engine/NOTICE.md).

To regenerate deliberately, install the model with `npm run build:voices` and run `node scripts/build-world-voices.mjs`. Generation uses three isolated CPU processes, resumes valid completed clips, and saves the manifest after each new recording. Ordinary site builds copy the existing recordings and do not perform inference. Newly authored text remains eligible for live generation instead of being replaced by an unrelated recording.
