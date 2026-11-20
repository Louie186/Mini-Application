"""Little Ella's River Walk, v5: told slowly, like a father telling a story to his child.
The feeling of each line follows what the characters are doing.

Each segment is (scene, text, pause_after_seconds, speed_change, pitch_semitones).
"""

TITLE = "Little Ella's River Walk"
SUBTITLE = "A happy short story"

SEGMENTS = [
    # Walking together: warm and proud
    (1, "Once upon a time, little Ella the elephant went for a walk with Mama and Papa.", 0.7, 0.8, 0),
    # Stomping: playful, each stomp a little bigger
    (1, "Stomp...", 0.35, 0.78, 0),
    (1, "stomp...", 0.35, 0.78, 0.5),
    (1, "stomp!", 0.8, 0.8, 1),
    # Seeing the river: curious, then excited
    (2, "Then Ella saw something sparkly.", 0.5, 0.78, 0.5),
    (2, "The river!", 0.8, 0.82, 1.5),
    # Drinking: playful, then a happy, satisfied sigh
    (3, "Slurp!", 0.4, 0.72, 1),
    (3, "Splash!", 0.6, 0.72, 1.5),
    (3, "Ahh... the water was so cool and yummy.", 0.9, 0.76, -0.5),
    # Walking on: warm, content, joyful at the end
    (4, "Then, with happy tummies, off they went again...", 0.4, 0.8, 0),
    (4, "on their happy, happy journey.", 0.5, 0.8, 0.5),
    (4, "Hooray!", 0.9, 0.8, 1.5),
]
