# Pit / race audio

Shipped WAV cues used by `lib/raceAudio.ts` (with oscillator fallback if decode fails):

| File | Cue |
|------|-----|
| `gun.wav` | Wheel guns |
| `jack.wav` | Jack up/down |
| `release.wav` | Box release |
| `unsafe.wav` | Unsafe release sting |
| `pit-bed.wav` | Pit-lane rumble (loop) |
| `race-bed.wav` | F1 engine loop (optional — procedural V6 synth used if missing) |

Start-light ticks and lights-out cues are synthesized in `lib/raceAudio.ts` (no WAV required).
