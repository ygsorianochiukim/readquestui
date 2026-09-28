# Sound cues

`AudioService` (`src/app/services/audio/audio.ts`) looks for these files here.
**Every file is optional.** When one is missing (or fails to load), a small
synthesised version plays instead — built with the Web Audio API in
`src/app/services/audio/synth.ts` — so the app has sound before any of these
exist. Drop the real cues in with these exact names and they are used in
preference to the synthesised ones.

| File              | When it plays                                           | Synthesised fallback            |
| ----------------- | ------------------------------------------------------- | ------------------------------- |
| `correct.mp3`     | A right answer, a passed reading, a finished page        | Rising two-note chime           |
| `incorrect.mp3`   | A wrong answer or a reading below the pass mark          | Soft low double bloop           |
| `page-turn.mp3`   | Moving between pages in the reader                       | Short paper swish               |
| `celebrate.mp3`   | A badge, an achievement, or a finished book              | Little arpeggio fanfare         |
| `level-up.mp3`    | Reserved for milestone reveals                           | Ascending sparkle               |
| `tap.mp3`         | Small confirmations (revealing a hint, entering a book)  | Soft blip                       |
| `background.mp3`  | Looping music on the reading screens                     | Gentle pentatonic tune over a pad |

Whether a cue came from its file or was synthesised is remembered for the
session, so a missing file is only requested once.

Keep them short (under a second, apart from the music) and quiet. The music is
played at 12% volume so it is not picked up by the microphone while a child is
being recorded, and both the effects and the music can be switched off from the
reading screen — that preference is stored per device. Browsers keep audio
silent until the first tap on the page, so the very first cue after a fresh load
may be skipped.
