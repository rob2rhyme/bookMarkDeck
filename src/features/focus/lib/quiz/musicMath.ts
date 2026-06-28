// Curated quiz + quote bank for Music & Math. Bundled, offline, kid-friendly (~age 8).
import type { Quiz } from "@/features/focus/lib/topics";
import type { Quote } from "@/features/focus/lib/content";

export const MUSIC_QUIZZES: Quiz[] = [
  // ---- Instruments & families ----
  { topic: "music", level: "Easy", question: "Which instrument is the largest in the string family?", choices: ["Double bass", "Violin", "Viola", "Cello"], answer: 0, explain: "The double bass is the biggest string instrument, and you usually stand to play it.", fact: "A double bass can stand over six feet tall, and jazz players nicknamed it the 'doghouse' for its bulky size." },
  { topic: "music", level: "Easy", question: "Which of these is a brass instrument?", choices: ["Tuba", "Clarinet", "Cello", "Xylophone"], answer: 0, fact: "If you uncoiled a tuba's tubing, it would stretch out to roughly 18 feet of brass pipe." },
  { topic: "music", level: "Easy", question: "Which of these is a percussion instrument?", choices: ["Tambourine", "Flute", "Harp", "Trumpet"], answer: 0, fact: "The tambourine is ancient, appearing in artwork and religious ceremonies thousands of years ago across the Middle East." },
  { topic: "music", level: "Easy", question: "Which instrument do you blow into and cover holes with your fingers?", choices: ["Recorder", "Drum", "Piano", "Triangle"], answer: 0, fact: "The recorder was so popular in the 1500s and 1600s that even King Henry VIII owned dozens of them." },
  { topic: "music", level: "Easy", question: "Which instrument has a row of metal bars you hit with mallets?", choices: ["Xylophone", "Violin", "Trumpet", "Guitar"], answer: 0, fact: "Despite the metal bars in the question, a traditional xylophone actually uses wooden bars, while the metal version is called a glockenspiel." },
  { topic: "music", level: "Easy", question: "The violin is played by drawing a what across its strings?", choices: ["Bow", "Stick", "Brush", "Hammer"], answer: 0, fact: "A violin bow is traditionally strung with around 150 to 200 hairs taken from a horse's tail." },
  { topic: "music", level: "Easy", question: "Which instrument has 47 strings and is plucked with your fingers?", choices: ["Harp", "Drum", "Flute", "Piano"], answer: 0, explain: "A modern concert harp has 47 strings.", fact: "A concert harp also has seven foot pedals that let the player change the pitch of every string." },
  { topic: "music", level: "Medium", question: "Which instrument family does the saxophone belong to?", choices: ["Woodwind", "Brass", "String", "Percussion"], answer: 0, explain: "Even though it's made of metal, the saxophone uses a reed, so it's a woodwind.", fact: "Belgian inventor Adolphe Sax patented the saxophone in 1846, blending woodwind and brass ideas." },
  { topic: "music", level: "Medium", question: "Which of these is NOT a string instrument?", choices: ["Trombone", "Guitar", "Cello", "Violin"], answer: 0, fact: "The trombone's name comes from the Italian word 'tromba,' meaning trumpet, with an ending meaning 'large.'" },
  { topic: "music", level: "Medium", question: "Which instrument uses a reed to make its sound?", choices: ["Clarinet", "Trumpet", "Drum", "Piano"], answer: 0, fact: "A clarinet reed is shaved from cane plants, and players often soak it in water before playing." },
  { topic: "music", level: "Medium", question: "Which instrument is the smallest and highest in the string family?", choices: ["Violin", "Cello", "Viola", "Double bass"], answer: 0, fact: "The violin is sometimes affectionately called a 'fiddle,' especially in folk and country music traditions." },
  { topic: "music", level: "Medium", question: "Which of these is a keyboard instrument?", choices: ["Organ", "Trumpet", "Flute", "Cymbal"], answer: 0, fact: "The pipe organ is one of the oldest keyboard instruments, with versions dating back to ancient Greece." },

  // ---- Note values & rhythm ----
  { topic: "music", level: "Easy", question: "Which note lasts the longest?", choices: ["Whole note", "Half note", "Quarter note", "Eighth note"], answer: 0, fact: "In Britain a whole note is called a 'semibreve,' a leftover term from medieval music notation." },
  { topic: "music", level: "Medium", question: "How many beats does a half note get in 4/4 time?", choices: ["2", "1", "3", "4"], answer: 0, fact: "A half note is drawn as a hollow oval with a stem, unlike the filled-in quarter note." },
  { topic: "music", level: "Medium", question: "How many beats does a quarter note get in 4/4 time?", choices: ["1", "2", "3", "4"], answer: 0, fact: "The quarter note is often used as the 'beat unit' that a metronome ticks along to." },
  { topic: "music", level: "Medium", question: "How many quarter notes fit inside one whole note?", choices: ["4", "2", "3", "8"], answer: 0, explain: "Four quarter notes add up to one whole note.", fact: "This neat relationship is why note names like 'quarter' and 'whole' describe simple fractions of a measure." },
  { topic: "music", level: "Medium", question: "How many eighth notes equal one quarter note?", choices: ["2", "1", "3", "4"], answer: 0, fact: "Eighth notes are drawn with a little flag, and when grouped they are joined by a horizontal beam." },
  { topic: "music", level: "Medium", question: "What do we call a symbol that means a silence in music?", choices: ["Rest", "Note", "Clef", "Sharp"], answer: 0, fact: "Composer John Cage wrote a famous piece called '4'33' that is made up entirely of silence." },
  { topic: "music", level: "Medium", question: "The steady pulse you can clap along to in a song is called the…?", choices: ["Beat", "Lyric", "Title", "Cover"], answer: 0, fact: "Studies show humans naturally tap their feet to a beat, an ability few other animals share." },
  { topic: "music", level: "Hard", question: "How many beats does a dotted half note get in 4/4 time?", choices: ["3", "2", "4", "1"], answer: 0, explain: "A dot adds half the note's value, so a half note (2) plus 1 makes 3.", fact: "A dot beside any note always adds exactly half of that note's original value." },

  // ---- Dynamics & tempo ----
  { topic: "music", level: "Medium", question: "What does the dynamic marking \"forte\" tell you to do?", choices: ["Play loudly", "Play softly", "Play faster", "Stop playing"], answer: 0, fact: "The pianoforte, our modern piano, was named because it could play both soft ('piano') and loud ('forte')." },
  { topic: "music", level: "Medium", question: "What does \"pianissimo\" mean?", choices: ["Very soft", "Very loud", "Very fast", "Very slow"], answer: 0, explain: "\"Pianissimo\" (pp) means very quiet — even softer than piano.", fact: "Composers sometimes pile on extra letters, writing 'ppp' or even 'pppp' for almost inaudibly quiet passages." },
  { topic: "music", level: "Medium", question: "Which word means to gradually get LOUDER?", choices: ["Crescendo", "Diminuendo", "Staccato", "Legato"], answer: 0, fact: "The crescendo symbol on a page is a sideways angle that opens up, like a widening mouth." },
  { topic: "music", level: "Medium", question: "Which word means to gradually get SOFTER?", choices: ["Decrescendo", "Crescendo", "Accent", "Tempo"], answer: 0, fact: "A decrescendo is marked with a closing angle, the mirror image of the opening crescendo sign." },
  { topic: "music", level: "Medium", question: "A piece marked \"allegro\" should be played how?", choices: ["Fast and lively", "Very slowly", "Sadly", "Silently"], answer: 0, fact: "The Italian word 'allegro' literally means 'cheerful' or 'merry,' not just fast." },
  { topic: "music", level: "Hard", question: "Which Italian word tells you to play smoothly and connected?", choices: ["Legato", "Staccato", "Forte", "Presto"], answer: 0, explain: "\"Legato\" means smooth; \"staccato\" means short and detached.", fact: "On string instruments, legato is achieved by playing many notes in a single smooth bow stroke." },
  { topic: "music", level: "Hard", question: "Which word means to play the notes short and separated?", choices: ["Staccato", "Legato", "Crescendo", "Piano"], answer: 0, fact: "Staccato comes from an Italian word meaning 'detached,' and it is shown by a small dot above the note." },

  // ---- Basic theory: pitch, scales, notes ----
  { topic: "music", level: "Easy", question: "Which note comes right after G in the musical alphabet?", choices: ["A", "H", "F", "C"], answer: 0, explain: "After G the musical alphabet starts over again at A.", fact: "Western music uses only seven letter names, while some other cultures divide the octave very differently." },
  { topic: "music", level: "Easy", question: "How many notes are in the musical alphabet before it repeats?", choices: ["7", "5", "8", "12"], answer: 0, explain: "The notes A, B, C, D, E, F, G repeat over and over.", fact: "German notation famously uses 'H' for the note we call B, a quirk that once let composers spell their names in music." },
  { topic: "music", level: "Medium", question: "What do we call how HIGH or LOW a note sounds?", choices: ["Pitch", "Tempo", "Volume", "Rhythm"], answer: 0, fact: "Pitch depends on frequency, and the modern tuning note A is set at 440 vibrations per second." },
  { topic: "music", level: "Medium", question: "A symbol that raises a note by a half step is called a…?", choices: ["Sharp", "Flat", "Rest", "Clef"], answer: 0, fact: "The sharp symbol, two crossing lines, was the inspiration for the name of the hashtag key." },
  { topic: "music", level: "Medium", question: "A symbol that lowers a note by a half step is called a…?", choices: ["Flat", "Sharp", "Tie", "Slur"], answer: 0, fact: "The flat symbol looks like a lowercase letter 'b' and evolved from medieval rounded note shapes." },
  { topic: "music", level: "Medium", question: "Three or more notes played together at the same time make a…?", choices: ["Chord", "Scale", "Rest", "Beat"], answer: 0, fact: "A guitarist strumming a single chord can sound six different strings ringing together at once." },
  { topic: "music", level: "Medium", question: "A series of notes going up or down step by step is called a…?", choices: ["Scale", "Chord", "Rest", "Clef"], answer: 0, fact: "The word 'scale' comes from the Latin 'scala,' meaning ladder or staircase." },
  { topic: "music", level: "Medium", question: "Which clef is usually used for LOW notes, like the tuba?", choices: ["Bass clef", "Treble clef", "Soprano clef", "Tenor clef"], answer: 0, fact: "The bass clef is also called the 'F clef' because its two dots surround the line for the note F." },
  { topic: "music", level: "Hard", question: "How many notes are there in a major scale (before the octave repeats)?", choices: ["7", "5", "8", "12"], answer: 0, explain: "A major scale has 7 different notes, like do-re-mi-fa-sol-la-ti.", fact: "The familiar 'do-re-mi' singing system was popularized by an Italian monk named Guido of Arezzo around the year 1000." },
  { topic: "music", level: "Hard", question: "The distance from one note to the same note higher or lower is called an…?", choices: ["Octave", "Accent", "Anthem", "Encore"], answer: 0, fact: "An octave got its name from 'octo,' meaning eight, since you count eight scale steps to reach it." },

  // ---- Singing voices, groups, roles ----
  { topic: "music", level: "Easy", question: "A group of people singing together is called a…?", choices: ["Choir", "Crowd", "Team", "Class"], answer: 0, fact: "The word 'choir' shares its root with 'chorus' and 'choreography,' all tied to ancient Greek group performance." },
  { topic: "music", level: "Easy", question: "The person who leads an orchestra with a baton is the…?", choices: ["Conductor", "Drummer", "Singer", "Author"], answer: 0, fact: "Early conductors sometimes kept time by banging a heavy staff on the floor, which once gave one composer a fatal foot injury." },
  { topic: "music", level: "Medium", question: "Which is the HIGHEST type of singing voice?", choices: ["Soprano", "Bass", "Tenor", "Alto"], answer: 0, fact: "The word 'soprano' comes from the Italian 'sopra,' meaning above, since it sits atop the vocal range." },
  { topic: "music", level: "Medium", question: "Which is the LOWEST type of singing voice?", choices: ["Bass", "Soprano", "Alto", "Tenor"], answer: 0, fact: "The deepest bass voices can rumble down to notes so low they are felt as much as heard." },
  { topic: "music", level: "Medium", question: "A person who writes music is called a…?", choices: ["Composer", "Painter", "Dancer", "Director"], answer: 0, fact: "Mozart was composing music by age five and wrote his first symphony before he turned nine." },
  { topic: "music", level: "Medium", question: "A musical play where the story is mostly sung is called an…?", choices: ["Opera", "Movie", "Poem", "Speech"], answer: 0, fact: "The word 'opera' is Italian for 'work,' short for 'opera in musica,' meaning a work made in music." },

  // ---- Famous instrument facts ----
  { topic: "music", level: "Medium", question: "On a piano, which keys are usually the sharps and flats?", choices: ["The black keys", "The white keys", "The red keys", "The blue keys"], answer: 0, fact: "A standard piano has 88 keys in total, 52 white ones and 36 black ones." },
  { topic: "music", level: "Medium", question: "How many pedals does a standard modern piano usually have?", choices: ["3", "1", "5", "8"], answer: 0, explain: "Most modern pianos have three pedals at the bottom.", fact: "The right pedal, called the sustain pedal, lifts dampers so notes keep ringing after you release the keys." },
  { topic: "music", level: "Medium", question: "A standard drum kit's big drum you play with a foot pedal is the…?", choices: ["Bass drum", "Snare drum", "Cymbal", "Tom-tom"], answer: 0, fact: "The bass drum is also nicknamed the 'kick drum' because you strike it with a foot-operated beater." },
  { topic: "music", level: "Medium", question: "Which instrument is sometimes nicknamed the \"king of instruments\"?", choices: ["Pipe organ", "Kazoo", "Triangle", "Tambourine"], answer: 0, explain: "The huge pipe organ has long been called the \"king of instruments.\"", fact: "The largest pipe organs can have over ten thousand individual pipes ranging from tiny to several stories tall." },
  { topic: "music", level: "Hard", question: "A famous family of violin makers from Italy was named…?", choices: ["Stradivari", "Edison", "Mozart", "Yamaha"], answer: 0, explain: "Antonio Stradivari made violins that are still treasured today.", fact: "Surviving Stradivari violins can sell at auction for many millions of dollars each." },
  { topic: "music", level: "Easy", question: "Which instrument is shaped like a triangle and made of metal?", choices: ["Triangle", "Drum", "Flute", "Guitar"], answer: 0, fact: "The triangle is left open at one corner, which lets it ring with a bright, shimmering tone." },
  { topic: "music", level: "Medium", question: "Which brass instrument has a slide you move in and out to change notes?", choices: ["Trombone", "Trumpet", "Tuba", "French horn"], answer: 0, fact: "The trombone is unusual among brass instruments because it uses a sliding tube instead of valves to change pitch." },

  // ---- Sound, listening, general music ----
  { topic: "music", level: "Easy", question: "Which of these is a way to make a sound softer?", choices: ["Turn the volume down", "Turn the volume up", "Play faster", "Add more singers"], answer: 0, fact: "Sound level is measured in decibels, a unit named after telephone inventor Alexander Graham Bell." },
  { topic: "music", level: "Easy", question: "What do we call the catchy main tune of a song that you hum?", choices: ["Melody", "Rest", "Page", "Stand"], answer: 0, fact: "A tune that gets stuck in your head on repeat is nicknamed an 'earworm' by psychologists." },
  { topic: "music", level: "Medium", question: "The pattern of long and short sounds in music is called the…?", choices: ["Rhythm", "Color", "Title", "Cover"], answer: 0, fact: "The word 'rhythm' comes from a Greek term meaning 'flow,' the same root behind 'rhyme.'" },
  { topic: "music", level: "Medium", question: "When two or more notes sound pleasing together, we call it…?", choices: ["Harmony", "Silence", "Tempo", "Lyrics"], answer: 0, fact: "Ancient Greek thinker Pythagoras discovered that pleasing harmonies come from simple number ratios between notes." },
  { topic: "music", level: "Easy", question: "Which of these would you most likely find in a marching band?", choices: ["Snare drum", "Grand piano", "Pipe organ", "Harp"], answer: 0, fact: "Marching snare drums use tight heads and sometimes carbon-fiber shells to project crisp sound across a field." },
  { topic: "music", level: "Easy", question: "What do we call playing or singing music without any written notes, making it up as you go?", choices: ["Improvising", "Resting", "Erasing", "Sleeping"], answer: 0, fact: "Jazz musicians turned improvisation into an art form, often inventing melodies on the spot during live shows." },
  { topic: "music", level: "Medium", question: "The numbers at the start of music (like 4/4) are called the…?", choices: ["Time signature", "Score card", "Page number", "Address"], answer: 0, fact: "The waltz famously uses a 3/4 time signature, giving it its swaying one-two-three feel." },
  { topic: "music", level: "Medium", question: "What do we call the lines and spaces where musical notes are written?", choices: ["The staff", "The shelf", "The ladder", "The grid"], answer: 0, fact: "A standard staff has five lines, but Gregorian chant was once written on a staff of just four." },
  { topic: "music", level: "Easy", question: "Which of these is a wind instrument you might play in a band?", choices: ["Trumpet", "Cymbals", "Bongos", "Maracas"], answer: 0, fact: "A trumpet has only three valves, yet skilled players can sound every note across several octaves." },
  { topic: "music", level: "Easy", question: "What part of a guitar do you strum or pluck to make sound?", choices: ["The strings", "The neck", "The case", "The strap"], answer: 0, fact: "Guitar strings can be made of nylon or steel, and steel strings give the brighter, louder sound." },
];

export const MATH_QUIZZES: Quiz[] = [
  // ---- Addition & subtraction ----
  { topic: "math", level: "Easy", question: "What is 6 + 7?", choices: ["13", "12", "14", "11"], answer: 0, fact: "The plus sign first appeared in print in a German arithmetic book back in 1489." },
  { topic: "math", level: "Easy", question: "What is 9 + 9?", choices: ["18", "16", "17", "19"], answer: 0, fact: "There is a trick for nines: any single-digit number times nine has digits that add up to nine." },
  { topic: "math", level: "Easy", question: "What is 14 − 6?", choices: ["8", "7", "9", "6"], answer: 0, fact: "The minus sign also debuted in that same 1489 German book alongside the plus sign." },
  { topic: "math", level: "Easy", question: "What is 20 − 11?", choices: ["9", "8", "10", "11"], answer: 0, fact: "Subtraction is the opposite of addition, so you can always check your answer by adding it back." },
  { topic: "math", level: "Medium", question: "What is 38 + 25?", choices: ["63", "53", "62", "64"], answer: 0, fact: "Breaking numbers into tens and ones, a trick called 'partitioning,' makes adding larger numbers in your head easier." },
  { topic: "math", level: "Medium", question: "What is 84 − 29?", choices: ["55", "65", "45", "56"], answer: 0, fact: "A handy shortcut is to subtract 30 and then add 1 back, since 29 is one less than 30." },
  { topic: "math", level: "Medium", question: "What is 250 + 150?", choices: ["400", "300", "350", "450"], answer: 0, fact: "Adding round numbers like these is the basis of estimation, which shoppers use to guess a total bill." },

  // ---- Multiplication & division ----
  { topic: "math", level: "Easy", question: "What is 3 × 4?", choices: ["12", "7", "9", "16"], answer: 0, fact: "Multiplication is just repeated addition, so three times four is the same as four plus four plus four." },
  { topic: "math", level: "Easy", question: "What is 2 × 8?", choices: ["16", "10", "14", "18"], answer: 0, fact: "Doubling, or multiplying by two, is one of the very first multiplication skills children master." },
  { topic: "math", level: "Easy", question: "What is 10 × 6?", choices: ["60", "16", "66", "600"], answer: 0, fact: "Multiplying by ten is easy because you simply add a zero to the end of the number." },
  { topic: "math", level: "Medium", question: "What is 7 × 8?", choices: ["56", "54", "63", "48"], answer: 0, fact: "Many students find seven times eight the trickiest fact, and it equals 56, the digits 5 and 6 in a row." },
  { topic: "math", level: "Medium", question: "What is 6 × 9?", choices: ["54", "56", "45", "63"], answer: 0, fact: "You can find six times nine by doing six times ten and then subtracting one six." },
  { topic: "math", level: "Easy", question: "What is 12 ÷ 3?", choices: ["4", "3", "6", "9"], answer: 0, fact: "The division symbol with two dots is called an 'obelus,' a word borrowed from ancient Greek." },
  { topic: "math", level: "Easy", question: "What is 18 ÷ 2?", choices: ["9", "8", "6", "16"], answer: 0, fact: "Dividing by two is the same as finding half, one of the oldest math ideas humans used." },
  { topic: "math", level: "Medium", question: "What is 56 ÷ 7?", choices: ["8", "7", "9", "6"], answer: 0, fact: "Division and multiplication are inverses, so knowing seven times eight instantly gives you 56 divided by seven." },
  { topic: "math", level: "Medium", question: "What is 81 ÷ 9?", choices: ["9", "8", "7", "10"], answer: 0, fact: "Eighty-one is a perfect square, since nine multiplied by itself equals 81." },

  // ---- Shapes & basic geometry ----
  { topic: "math", level: "Easy", question: "How many sides does a pentagon have?", choices: ["5", "4", "6", "7"], answer: 0, fact: "The U.S. Defense Department headquarters is named the Pentagon because the building has five sides." },
  { topic: "math", level: "Easy", question: "How many sides does an octagon have?", choices: ["8", "6", "7", "10"], answer: 0, explain: "A stop sign is shaped like an octagon — it has 8 sides.", fact: "The prefix 'octo' means eight, the same root behind octopus and the month name October." },
  { topic: "math", level: "Easy", question: "How many corners (vertices) does a triangle have?", choices: ["3", "2", "4", "5"], answer: 0, fact: "The triangle is the only shape that cannot be pushed out of shape, which is why bridges use them." },
  { topic: "math", level: "Easy", question: "Which shape is perfectly round with no corners?", choices: ["Circle", "Square", "Triangle", "Rectangle"], answer: 0, fact: "A circle is the set of all points equally distant from one center point." },
  { topic: "math", level: "Easy", question: "A shape with 4 equal sides and 4 right angles is a…?", choices: ["Square", "Triangle", "Circle", "Pentagon"], answer: 0, fact: "Every square is also a rectangle, but not every rectangle is a square." },
  { topic: "math", level: "Medium", question: "How many faces does a cube have?", choices: ["6", "4", "8", "12"], answer: 0, explain: "A cube is like a dice — it has 6 flat square faces.", fact: "On a standard dice, the numbers on opposite faces of the cube always add up to seven." },
  { topic: "math", level: "Medium", question: "How many edges does a cube have?", choices: ["12", "6", "8", "4"], answer: 0, fact: "A cube belongs to a special group of five shapes called the Platonic solids, known since ancient Greece." },
  { topic: "math", level: "Medium", question: "Which 3D shape looks like a ball?", choices: ["Sphere", "Cube", "Cone", "Cylinder"], answer: 0, fact: "A sphere holds the most volume for its surface area, which is why bubbles form round shapes." },
  { topic: "math", level: "Medium", question: "An ice cream cone is shaped most like which 3D shape?", choices: ["Cone", "Cube", "Sphere", "Cylinder"], answer: 0, fact: "A cone has just one flat circular face and one curved surface meeting at a single point." },
  { topic: "math", level: "Hard", question: "How many vertices (corners) does a cube have?", choices: ["8", "6", "12", "4"], answer: 0, fact: "A cube neatly has 6 faces, 12 edges, and 8 vertices, numbers that follow a famous formula by Euler." },

  // ---- Fractions ----
  { topic: "math", level: "Easy", question: "If you cut a pizza into 2 equal pieces, each piece is one…?", choices: ["Half", "Third", "Quarter", "Whole"], answer: 0, fact: "The word 'fraction' comes from the Latin 'fractus,' meaning broken, as in broken into pieces." },
  { topic: "math", level: "Easy", question: "Which fraction means one quarter?", choices: ["1/4", "1/2", "1/3", "4/1"], answer: 0, fact: "The bottom number of a fraction is the denominator, telling how many equal pieces the whole is split into." },
  { topic: "math", level: "Medium", question: "What is 1/2 + 1/2?", choices: ["1 whole", "1/4", "2/4", "1/2"], answer: 0, explain: "Two halves make one whole.", fact: "To add fractions, the bottom numbers must match first, which they already do for halves." },
  { topic: "math", level: "Medium", question: "Which fraction is the SMALLEST?", choices: ["1/10", "1/2", "1/4", "1/5"], answer: 0, explain: "When the top number is 1, the bigger the bottom number, the smaller the piece.", fact: "With the same top number, a bigger bottom number means more pieces, so each piece is tinier." },
  { topic: "math", level: "Medium", question: "How many quarters (1/4) make a whole?", choices: ["4", "2", "3", "8"], answer: 0, fact: "A U.S. quarter coin is worth one quarter of a dollar, a tidy real-life example of the fraction." },
  { topic: "math", level: "Medium", question: "Which fraction is equal to 1/2?", choices: ["2/4", "1/4", "1/3", "3/4"], answer: 0, explain: "2/4 is the same amount as 1/2.", fact: "Two-fourths and one-half are called equivalent fractions because they describe the very same amount." },
  { topic: "math", level: "Hard", question: "What is 3/4 − 1/4?", choices: ["1/2", "2/4", "1/4", "4/4"], answer: 0, explain: "3/4 minus 1/4 is 2/4, which is the same as 1/2.", fact: "Since the bottoms match, you simply subtract the top numbers and keep the same denominator." },

  // ---- Time ----
  { topic: "math", level: "Easy", question: "How many hours are in one day?", choices: ["24", "12", "60", "10"], answer: 0, fact: "The 24-hour day traces back to ancient Egypt, which split daylight and night into twelve parts each." },
  { topic: "math", level: "Easy", question: "How many seconds are in one minute?", choices: ["60", "30", "100", "24"], answer: 0, fact: "Our use of 60 comes from the ancient Babylonians, who counted using a base-60 number system." },
  { topic: "math", level: "Easy", question: "How many days are in one week?", choices: ["7", "5", "10", "30"], answer: 0, fact: "The seven-day week may have come from the seven moving objects ancient people saw in the sky." },
  { topic: "math", level: "Medium", question: "How many months are in one year?", choices: ["12", "10", "24", "52"], answer: 0, fact: "The months July and August were named after Roman rulers Julius and Augustus Caesar." },
  { topic: "math", level: "Medium", question: "A clock's minute hand points to 6. How many minutes past the hour is it?", choices: ["30", "6", "15", "45"], answer: 0, explain: "When the minute hand points to 6, it's half past — 30 minutes.", fact: "Each number on a clock face is five minutes apart, so the 6 marks exactly 30 minutes." },
  { topic: "math", level: "Medium", question: "How many minutes are there in half an hour?", choices: ["30", "60", "15", "20"], answer: 0, fact: "Saying 'half past' for thirty minutes after the hour is a tradition that goes back centuries." },
  { topic: "math", level: "Hard", question: "How many days are in a normal (non-leap) year?", choices: ["365", "366", "360", "300"], answer: 0, fact: "We add a leap day every four years because Earth actually takes about 365 and a quarter days to orbit the Sun." },

  // ---- Place value & number sense ----
  { topic: "math", level: "Easy", question: "In the number 47, what is the value of the 4?", choices: ["40", "4", "7", "400"], answer: 0, explain: "The 4 is in the tens place, so it means 40.", fact: "Place value is what makes our number system so powerful, letting just ten digits write any number." },
  { topic: "math", level: "Medium", question: "In the number 308, which digit is in the hundreds place?", choices: ["3", "0", "8", "1"], answer: 0, fact: "The number zero acts as a placeholder here, an idea developed by mathematicians in ancient India." },
  { topic: "math", level: "Medium", question: "What number is 10 more than 56?", choices: ["66", "57", "46", "65"], answer: 0, fact: "Adding ten changes only the tens digit, leaving the ones digit untouched." },
  { topic: "math", level: "Medium", question: "What number is 100 more than 250?", choices: ["350", "260", "251", "200"], answer: 0, fact: "Adding a hundred shifts only the hundreds digit, a pattern that makes mental math fast." },
  { topic: "math", level: "Medium", question: "Which number is the largest?", choices: ["999", "899", "989", "998"], answer: 0, fact: "When numbers have the same number of digits, you compare them digit by digit from the left." },
  { topic: "math", level: "Medium", question: "Round 63 to the nearest ten.", choices: ["60", "70", "63", "65"], answer: 0, explain: "63 is closer to 60 than to 70.", fact: "The rounding rule is that a ones digit of five or more rounds up, otherwise it rounds down." },

  // ---- Even/odd, comparing, patterns ----
  { topic: "math", level: "Easy", question: "Which of these numbers is even?", choices: ["8", "7", "5", "3"], answer: 0, fact: "Every even number ends in 0, 2, 4, 6, or 8, no matter how large it gets." },
  { topic: "math", level: "Easy", question: "Which of these numbers is odd?", choices: ["9", "4", "6", "10"], answer: 0, fact: "Odd numbers always leave a remainder of one when you try to split them into two equal groups." },
  { topic: "math", level: "Easy", question: "Which symbol means \"greater than\"?", choices: [">", "<", "=", "+"], answer: 0, fact: "A trick for remembering the symbol is that the open mouth always faces the bigger number." },
  { topic: "math", level: "Medium", question: "What is the next number in the pattern: 5, 10, 15, 20, …?", choices: ["25", "21", "30", "24"], answer: 0, explain: "The pattern counts up by 5 each time.", fact: "Counting by fives is called skip counting, and it matches the five-minute marks on a clock." },
  { topic: "math", level: "Medium", question: "What is the next number: 1, 3, 5, 7, …?", choices: ["9", "8", "10", "11"], answer: 0, explain: "These are the odd numbers, going up by 2.", fact: "Add up the first few odd numbers and you always land on a perfect square, like 1, 4, 9, and 16." },
  { topic: "math", level: "Medium", question: "What is the next number: 100, 90, 80, 70, …?", choices: ["60", "65", "75", "50"], answer: 0, fact: "Counting backward by tens is just as much a pattern as counting forward." },

  // ---- Money, measurement, word problems ----
  { topic: "math", level: "Easy", question: "How many cents are in one dollar?", choices: ["100", "10", "50", "25"], answer: 0, fact: "The word 'cent' comes from the Latin 'centum,' meaning one hundred, the same root as century." },
  { topic: "math", level: "Medium", question: "Sam has 3 bags with 4 apples in each bag. How many apples does he have?", choices: ["12", "7", "9", "10"], answer: 0, explain: "3 groups of 4 is 3 × 4 = 12.", fact: "Word problems like this train you to spot multiplication hiding inside everyday situations." },
  { topic: "math", level: "Medium", question: "How many centimeters are in one meter?", choices: ["100", "10", "1000", "12"], answer: 0, fact: "The metric system is built on tens, which is why almost the whole world uses it for science." },
  { topic: "math", level: "Medium", question: "A book costs $5. How much do 3 books cost?", choices: ["$15", "$8", "$10", "$53"], answer: 0, fact: "Finding the cost of several identical items is one of the most common uses of multiplication in real life." },
  { topic: "math", level: "Hard", question: "What is half of 100, plus 25?", choices: ["75", "50", "125", "25"], answer: 0, explain: "Half of 100 is 50, and 50 + 25 = 75.", fact: "Following the right order of operations, doing the halving before the adding, keeps the answer correct." },
  { topic: "math", level: "Hard", question: "Which of these is a prime number?", choices: ["13", "9", "15", "21"], answer: 0, explain: "13 can only be divided evenly by 1 and 13.", fact: "A prime number has exactly two factors, itself and one, and there are infinitely many of them." },
  { topic: "math", level: "Easy", question: "How many sides does a rectangle have?", choices: ["4", "3", "5", "6"], answer: 0, fact: "In a rectangle, opposite sides are always equal in length and every corner is a perfect right angle." },
  { topic: "math", level: "Medium", question: "What is double 7?", choices: ["14", "12", "9", "17"], answer: 0, explain: "Double means add the number to itself: 7 + 7 = 14.", fact: "Doubling repeatedly grows numbers astonishingly fast, a pattern behind the famous chessboard and rice legend." },
];

export const MUSIC_QUOTES: Quote[] = [
  { text: "Music is the universal language of mankind.", author: "Henry Wadsworth Longfellow" },
  { text: "Where words fail, music speaks.", author: "Hans Christian Andersen" },
  { text: "Music gives a soul to the universe, wings to the mind, flight to the imagination.", author: "Plato" },
  { text: "One good thing about music: when it hits you, you feel no pain.", author: "Bob Marley" },
  { text: "Without music, life would be a mistake.", author: "Friedrich Nietzsche" },
  { text: "If I were not a physicist, I would probably be a musician.", author: "Albert Einstein" },
  { text: "To play a wrong note is insignificant; to play without passion is inexcusable.", author: "Ludwig van Beethoven" },
  { text: "Music can change the world.", author: "Ludwig van Beethoven" },
  { text: "Music expresses that which cannot be put into words and that which cannot remain silent.", author: "Victor Hugo" },
  { text: "Practice the way you want to play, and you'll play the way you practiced.", author: null },
  { text: "Every master musician was once a beginner who didn't quit.", author: null },
  { text: "Music is the silence between the notes.", author: "Claude Debussy" },
  { text: "The wrong notes today become the right ones tomorrow — keep practicing.", author: null },
  { text: "There are no rules for good music — just keep listening and learning.", author: null },
  { text: "Music washes away from the soul the dust of everyday life.", author: "Berthold Auerbach" },
];

export const MATH_QUOTES: Quote[] = [
  { text: "Pure mathematics is, in its way, the poetry of logical ideas.", author: "Albert Einstein" },
  { text: "Do not worry about your difficulties in mathematics. I can assure you mine are still greater.", author: "Albert Einstein" },
  { text: "Mathematics is the music of reason.", author: "James Joseph Sylvester" },
  { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
  { text: "Mistakes are proof that you are trying.", author: null },
  { text: "The only way to learn mathematics is to do mathematics.", author: "Paul Halmos" },
  { text: "Mathematics is not about numbers; it is about understanding.", author: null },
  { text: "Somehow it's okay for people to chuckle about not being good at math — but the truth is, anyone can learn it.", author: null },
  { text: "Every problem has a solution; sometimes you just need to look at it a new way.", author: null },
  { text: "Numbers are the building blocks of everything around us.", author: null },
  { text: "Five out of four people struggle with fractions — and that's okay, keep going.", author: null },
  { text: "If you can't solve a problem, then there is an easier problem you can solve: find it.", author: "George Pólya" },
  { text: "Math is like a puzzle — the more you practice, the more pieces fit.", author: null },
  { text: "Don't be afraid of a hard problem. Be excited to figure it out.", author: null },
  { text: "Wherever there is number, there is beauty.", author: "Proclus" },
];
