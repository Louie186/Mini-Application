"""Little Ella's River Walk, told in a sing-song, talk-to-the-child teaching style.

Each segment is (scene, text, pause_after_seconds, speed_change, pitch_semitones).
Short phrases, questions with a pause for the child to answer, stretched words
(a slower speed), and a melody made by raising key words (positive pitch).
"""

TITLE = "Little Ella's River Walk"
SUBTITLE = "Sing-song version"

SEGMENTS = [
    (1, "Hi, friend!", 0.45, 0.95, 2),
    (1, "This is Ella.", 0.3, 0.9, 0),
    (1, "Ella is a baby elephant!", 0.5, 0.9, 1.5),
    (1, "She's walking with Mama...", 0.15, 0.9, 0),
    (1, "and Papa!", 0.5, 0.85, 2.5),
    (1, "Stomp!", 0.2, 0.8, 0.5),
    (1, "Stomp!", 0.2, 0.8, 2),
    (1, "Stomp!", 0.6, 0.8, 3.5),
    (1, "Can you stomp, too?", 1.6, 0.9, 1),
    (1, "Great stomping!", 0.6, 0.9, 2),

    (2, "Look!", 0.3, 0.8, 3),
    (2, "What's that?", 1.3, 0.9, 2),
    (2, "It's a river!", 0.25, 0.85, 1),
    (2, "A big, sparkly river!", 0.6, 0.85, 2.5),

    (3, "Ella is thirsty.", 0.3, 0.9, 0),
    (3, "Slurp!", 0.35, 0.7, 2),
    (3, "Can you say, splash?", 1.5, 0.9, 1),
    (3, "Splash!", 0.3, 0.6, 4),
    (3, "Yay! Good job!", 0.6, 0.9, 2.5),

    (4, "Now it's time to go.", 0.3, 0.88, 0),
    (4, "Bye bye, river!", 0.35, 0.85, 2),
    (4, "Walk, walk, walk...", 0.25, 0.85, 1),
    (4, "on a happy, happy journey!", 0.4, 0.88, 2.5),
    (4, "Hooray!", 0.8, 0.8, 3.5),
]
