"""Little Ella's River Walk, v6: the v5 script, read with an emotional voice (Chatterbox).

Each segment is (scene, text, pause_after_seconds, emotion, steadiness).
emotion: 0.5 = calm, 0.7 = lively, 0.9 = very excited.
steadiness: lower = slower and more deliberate (0.3 to 0.5 works well).
"""

TITLE = "Little Ella's River Walk"
SUBTITLE = "A happy short story"

SEGMENTS = [
    (1, "Once upon a time, little Ella the elephant went for a walk with Mama and Papa.", 0.7, 0.6, 0.4),   # warm, proud
    (1, "Stomp... stomp... STOMP!", 0.8, 0.85, 0.3),                                                    # playful
    (2, "Then Ella saw something sparkly.", 0.5, 0.6, 0.4),                                              # curious
    (2, "The river!", 0.8, 0.95, 0.3),                                                                   # excited
    (3, "Slurp! Splash!", 0.6, 0.85, 0.3),                                                               # playful
    (3, "Ahh... the water was so cool and yummy.", 0.9, 0.55, 0.45),                                     # happy sigh
    (4, "Then, with happy tummies, off they went again...", 0.4, 0.6, 0.4),                              # warm
    (4, "on their happy, happy journey.", 0.5, 0.7, 0.4),                                                # cheerful
    (4, "Hooray!", 0.9, 0.95, 0.3),                                                                      # joyful
]
