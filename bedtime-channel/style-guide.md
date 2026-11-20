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
- v4: back to the v3 story text, calmer and more jolly (santa-heavy blend, slower). Waiting for feedback.
