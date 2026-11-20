# Channel style guide (the team's memory)

Read this before writing or voicing any story.

## Main character
- **Ella**, a baby elephant with a pink bow, who goes on small adventures with Mama and Papa.
- Open question: keep the name "Ella" on the public channel, or use another name (Ella is the owner's daughter's name).

## Narrator voice
- A **jolly, calm, happy father**, ideally with a **Filipino English** accent.
- Warm and smiling, never sad, never flat.
- Medium-low pitch. Too low sounded sad (v2). Lift brightness instead of dropping pitch.
- Natural storytelling pace. Not rushed, not slow and sleepy for daytime stories.

## Feeling follows the action
- Tell it like a father to a real child sitting beside him, not a performance.
- Each line's feeling matches what the characters are doing: proud while walking, playful while stomping, curious then excited at the river, a happy sigh after drinking, warm and joyful at the end.
- Slow pace, about 120 to 130 words per minute, with real pauses between moments.
- Every script gets delivery notes, so the owner can also read it aloud.

## Do not
- **Do not use the "preschool teacher / sing-song / Ms Rachel" style.** No "Can you say…?" questions to the viewer, no pauses for the child to answer, no exaggerated melody.
- Do not imitate or name any real presenter or brand.

## Current free voice settings (Kokoro, no Filipino accent available)
- Voice blend: `am_santa:0.65+am_puck:0.35`
- Speed 0.9, pitch -0.5, `--bright`
- Background: `make_sound.py --style day --bed 0.09`

## Story format that works
- About 20 seconds, 4 pictures, soft fade between pictures.
- Short, happy lines with sound words ("Stomp! Stomp! Stomp!", "Slurp! Splash!") and a cheerful ending ("Hooray!").

## Version history
- v1: am_fenrir, lowered. Feedback: needs lower and more expressive.
- v2: onyx and puck blend, lowered more. Feedback: sounds sad.
- v3: santa and puck blend, brighter, faster. (Sent with A/B/C voice options.)
- Sing-song test: rejected. Do not repeat this style.
- v4: back to the v3 story text, calmer and more jolly (santa-heavy blend, slower).
- v5: slower (about 124 words per minute), emotion per line based on the action, "Once upon a time" opening, reading script in `scripts/ella-river-walk-v5.md`. Feedback: script OK, voice not friendly or emotional enough. Owner does not want to record their own voice.
- v6: new free emotional voice (Chatterbox) with an emotion level per line, copying the tone of a short synthetic male reference clip (Kokoro santa/puck blend), then slowed 10% (`stretch_voice.py --tempo 0.9`). Waiting for feedback.

## Current best voice route (v6)
- `make_voice_emotion.py --story story_ella_v6 --ref ref_voice.wav` (runs in its own Python environment with Chatterbox).
- Emotion per line: 0.55 calm, 0.6 warm, 0.7 cheerful, 0.85 playful, 0.95 excited. Steadiness 0.3 to 0.45.
- Chatterbox adds an inaudible AI watermark. Keep it on.
