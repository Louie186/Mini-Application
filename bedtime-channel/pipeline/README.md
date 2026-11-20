# Bedtime story video pipeline

Turns a story script into a finished video, with free tools only. Built for Pilot 01.

## What each step does

| Step | Script | Agent | What it makes |
|------|--------|-------|---------------|
| 1 | `make_voice.py` | Echo | Reads the story aloud in a calm male voice (Kokoro, free, runs offline) and records when each line is spoken |
| 2 | `make_scenes.py` | Pixel | Draws the six pictures and a title card (placeholder art you can replace) |
| 3 | `make_sound.py` | Echo | Makes a soft night background and mixes it under the voice |
| 4 | `make_video.py` | Louie | Joins pictures and sound into an MP4, plus an `.srt` captions file |

The story itself lives in `story_pilot01.py`. For a new story, copy that file, change the text and the scene numbers, and point the scripts at it.

## One-time setup on your PC (Windows, Mac or Linux)

1. Install Python 3.10 or newer.
2. Install ffmpeg and make sure `ffmpeg` works in a terminal.
3. Install the Python packages:
   `pip install kokoro-onnx soundfile numpy pillow`
4. Download the two Kokoro voice files (from the kokoro-onnx project's GitHub releases page, "model-files-v1.0") into one folder:
   `kokoro-v1.0.onnx` and `voices-v1.0.bin`.
5. The title card uses a DejaVu font. On Windows or Mac, change the two font paths near the bottom of `make_scenes.py` to any bold serif font you have.

## Run it

```
python make_voice.py  --models <models folder> --out <work folder>
python make_scenes.py --out <work folder>
python make_sound.py  --work <work folder>
python make_video.py  --work <work folder> --out <work folder>/episode.mp4
```

Useful options:
- `make_voice.py --voice bm_george` for a deeper British voice, `--speed 0.65` for even slower.
- `make_sound.py --bed 0.06` for a quieter background.

## Before you upload

- Check the voice, pictures and sound by watching the whole video once.
- Keep a note of where any extra music or art came from, and its licence.
- Answer YouTube's "made for kids" and "altered or synthetic content" questions honestly.
- Put an AI-voice note in the description.
