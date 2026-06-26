// Interest topics for the "Need a push?" card. The card adapts to the user's
// chosen interests (FocusSettings.interests): quotes are drawn from the matching
// topic pools, the coding nugget/challenge show only for code-leaning interests,
// and an interactive quiz pulls questions from the selected topics.
//
// Framework-free (no React/Firebase) so the data layer and pure logic can import
// it freely. Content is curated + bundled — instant, offline, no external API.

import type { Quote } from "@/features/focus/lib/content";

export type TopicId =
  | "general"
  | "coding"
  | "music"
  | "math"
  | "astronomy"
  | "science"
  | "nature"
  | "geography"
  | "history"
  | "words";

export type Topic = { id: TopicId; label: string; emoji: string };

export const TOPICS: readonly Topic[] = [
  { id: "general", label: "General", emoji: "✨" },
  { id: "coding", label: "Coding", emoji: "💻" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "math", label: "Math", emoji: "➗" },
  { id: "astronomy", label: "Astronomy", emoji: "🪐" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "nature", label: "Nature", emoji: "🐾" },
  { id: "geography", label: "Geography", emoji: "🌍" },
  { id: "history", label: "History", emoji: "🏛️" },
  { id: "words", label: "Words", emoji: "🔤" },
];

const TOPIC_BY_ID: Record<TopicId, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t])
) as Record<TopicId, Topic>;

const TOPIC_IDS: ReadonlySet<string> = new Set(TOPICS.map((t) => t.id));

export function isTopicId(v: unknown): v is TopicId {
  return typeof v === "string" && TOPIC_IDS.has(v);
}

export function topicLabel(id: TopicId): string {
  return TOPIC_BY_ID[id]?.label ?? id;
}

export function topicEmoji(id: TopicId): string {
  return TOPIC_BY_ID[id]?.emoji ?? "✨";
}

/**
 * Which topics are "active" for a given interests list. Empty interests keeps
 * the original audience (coding + general) so existing users see no change.
 */
export function activeTopics(interests: readonly TopicId[] | undefined): Set<TopicId> {
  if (!interests || interests.length === 0) return new Set(["coding", "general"]);
  return new Set(interests.filter(isTopicId));
}

/** True when code-flavoured blocks (nugget, challenge) make sense to show. */
export function showsCoding(interests: readonly TopicId[] | undefined): boolean {
  const active = activeTopics(interests);
  return active.has("coding") || active.has("general");
}

/* --------------------------------------------------------------- quizzes --- */

export type QuizLevel = "Easy" | "Medium" | "Hard";

export type Quiz = {
  topic: TopicId;
  level: QuizLevel;
  question: string;
  choices: string[]; // 2–4 options
  answer: number; // index into choices
  explain?: string; // shown after answering
};

/** Points awarded for a correct answer, by difficulty. */
export const POINTS: Record<QuizLevel, number> = { Easy: 10, Medium: 20, Hard: 30 };

export const QUIZZES: readonly Quiz[] = [
  // ---- Music ----
  { topic: "music", level: "Easy", question: "How many strings does a standard guitar have?", choices: ["4", "5", "6", "7"], answer: 2 },
  { topic: "music", level: "Easy", question: "Which instrument has black and white keys?", choices: ["Piano", "Drum", "Harp", "Cello"], answer: 0 },
  { topic: "music", level: "Easy", question: "Which instrument do you play by hitting it?", choices: ["Drum", "Flute", "Violin", "Trumpet"], answer: 0 },
  { topic: "music", level: "Easy", question: "A big group of musicians playing together is called an…?", choices: ["Orchestra", "Audience", "Stadium", "Library"], answer: 0 },
  { topic: "music", level: "Medium", question: "How many beats does a whole note get in 4/4 time?", choices: ["1", "2", "3", "4"], answer: 3 },
  { topic: "music", level: "Medium", question: "The trumpet belongs to which family of instruments?", choices: ["Brass", "String", "Woodwind", "Percussion"], answer: 0 },
  { topic: "music", level: "Medium", question: "The musical alphabet runs from A up to which letter?", choices: ["E", "F", "G", "H"], answer: 2 },
  { topic: "music", level: "Medium", question: "How many lines make up a music staff?", choices: ["4", "5", "6", "7"], answer: 1 },
  { topic: "music", level: "Medium", question: "What word means the speed of a piece of music?", choices: ["Tempo", "Pitch", "Chord", "Lyric"], answer: 0 },
  { topic: "music", level: "Medium", question: "In music, what does \"piano\" tell you to play?", choices: ["Softly", "Loudly", "Faster", "Slower"], answer: 0, explain: "\"Piano\" (p) means soft; \"forte\" (f) means loud." },
  { topic: "music", level: "Easy", question: "Which of these is a woodwind instrument?", choices: ["Flute", "Trumpet", "Violin", "Drum"], answer: 0 },
  { topic: "music", level: "Medium", question: "How many keys are on a full-size piano?", choices: ["66", "76", "88", "100"], answer: 2, explain: "A standard piano has 88 keys." },
  { topic: "music", level: "Medium", question: "What does \"forte\" mean in music?", choices: ["Loud", "Soft", "Fast", "Slow"], answer: 0 },
  { topic: "music", level: "Medium", question: "Which clef is usually used for higher notes?", choices: ["Treble", "Bass", "Alto", "Tenor"], answer: 0 },
  { topic: "music", level: "Medium", question: "How many beats are in a bar of 3/4 time?", choices: ["2", "3", "4", "6"], answer: 1 },
  { topic: "music", level: "Easy", question: "The words of a song are called the…?", choices: ["Lyrics", "Tempo", "Rhythm", "Chord"], answer: 0 },

  // ---- Math ----
  { topic: "math", level: "Easy", question: "What is 7 + 8?", choices: ["13", "14", "15", "16"], answer: 2 },
  { topic: "math", level: "Easy", question: "How many sides does a hexagon have?", choices: ["5", "6", "7", "8"], answer: 1 },
  { topic: "math", level: "Easy", question: "What is half of 50?", choices: ["20", "25", "30", "15"], answer: 1 },
  { topic: "math", level: "Easy", question: "How many minutes are in an hour?", choices: ["30", "60", "90", "100"], answer: 1 },
  { topic: "math", level: "Easy", question: "How many angles does a triangle have?", choices: ["2", "3", "4", "5"], answer: 1 },
  { topic: "math", level: "Medium", question: "What is 9 × 6?", choices: ["54", "56", "63", "45"], answer: 0 },
  { topic: "math", level: "Medium", question: "Which of these numbers is prime?", choices: ["9", "15", "17", "21"], answer: 2, explain: "17 has no factors besides 1 and itself." },
  { topic: "math", level: "Medium", question: "What is 100 − 37?", choices: ["63", "73", "67", "57"], answer: 0 },
  { topic: "math", level: "Medium", question: "What is 12 × 12?", choices: ["124", "132", "144", "121"], answer: 2 },
  { topic: "math", level: "Medium", question: "Which fraction is the largest?", choices: ["1/2", "1/3", "1/4", "1/8"], answer: 0 },
  { topic: "math", level: "Medium", question: "What is 6 squared (6 × 6)?", choices: ["12", "30", "36", "18"], answer: 2 },
  { topic: "math", level: "Medium", question: "Round 47 to the nearest ten.", choices: ["40", "45", "50", "47"], answer: 2 },
  { topic: "math", level: "Easy", question: "What is 5 × 5?", choices: ["10", "20", "25", "30"], answer: 2 },
  { topic: "math", level: "Easy", question: "What is 20 ÷ 4?", choices: ["4", "5", "6", "8"], answer: 1 },
  { topic: "math", level: "Easy", question: "How many sides does a square have?", choices: ["3", "4", "5", "6"], answer: 1 },
  { topic: "math", level: "Medium", question: "What is 15 + 27?", choices: ["32", "42", "41", "52"], answer: 1 },
  { topic: "math", level: "Medium", question: "What is 3/4 written as a decimal?", choices: ["0.25", "0.5", "0.75", "0.34"], answer: 2 },
  { topic: "math", level: "Medium", question: "How many degrees are in a right angle?", choices: ["45", "90", "180", "360"], answer: 1 },
  { topic: "math", level: "Medium", question: "What is the next number: 2, 4, 8, 16, …?", choices: ["20", "24", "32", "18"], answer: 2, explain: "Each number doubles." },
  { topic: "math", level: "Hard", question: "What is 144 ÷ 12?", choices: ["12", "11", "14", "16"], answer: 0 },

  // ---- Astronomy ----
  { topic: "astronomy", level: "Easy", question: "Which planet is closest to the Sun?", choices: ["Mercury", "Venus", "Earth", "Mars"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "What is the name of our galaxy?", choices: ["Milky Way", "Andromeda", "Orion", "Solaris"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which planet is known as the Red Planet?", choices: ["Mars", "Jupiter", "Saturn", "Venus"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which planet is famous for its bright rings?", choices: ["Saturn", "Mars", "Earth", "Mercury"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "How many planets are in our Solar System?", choices: ["7", "8", "9", "10"], answer: 1 },
  { topic: "astronomy", level: "Easy", question: "Earth's natural satellite is called the…?", choices: ["Moon", "Sun", "Comet", "Station"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which is the largest planet in our Solar System?", choices: ["Jupiter", "Saturn", "Earth", "Neptune"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "How long does Earth take to orbit the Sun once?", choices: ["One day", "One month", "One year", "Ten years"], answer: 2 },
  { topic: "astronomy", level: "Medium", question: "What is the closest star to Earth?", choices: ["The Sun", "Polaris", "Sirius", "Proxima Centauri"], answer: 0, explain: "The Sun is a star — and by far our nearest one." },
  { topic: "astronomy", level: "Medium", question: "What do we call a space rock that burns up in Earth's sky?", choices: ["Meteor", "Comet", "Asteroid", "Planet"], answer: 0 },
  { topic: "astronomy", level: "Medium", question: "What force keeps the planets orbiting the Sun?", choices: ["Gravity", "Magnetism", "Wind", "Friction"], answer: 0 },
  { topic: "astronomy", level: "Hard", question: "The Sun is mostly made of which gas?", choices: ["Hydrogen", "Oxygen", "Carbon", "Nitrogen"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "What do we call a person who travels into space?", choices: ["Astronaut", "Pilot", "Sailor", "Captain"], answer: 0 },
  { topic: "astronomy", level: "Easy", question: "Which planet do we live on?", choices: ["Earth", "Mars", "Venus", "Jupiter"], answer: 0 },
  { topic: "astronomy", level: "Medium", question: "Which planet is the hottest, wrapped in thick clouds?", choices: ["Venus", "Neptune", "Mars", "Uranus"], answer: 0 },
  { topic: "astronomy", level: "Medium", question: "A pattern of stars in the sky is called a…?", choices: ["Constellation", "Galaxy", "Nebula", "Comet"], answer: 0 },
  { topic: "astronomy", level: "Medium", question: "Roughly how long does the Moon take to orbit Earth?", choices: ["1 day", "1 week", "1 month", "1 year"], answer: 2 },
  { topic: "astronomy", level: "Hard", question: "Which is the farthest planet from the Sun?", choices: ["Neptune", "Saturn", "Uranus", "Mercury"], answer: 0, explain: "Pluto is now a dwarf planet, so Neptune is the farthest planet." },

  // ---- Coding ----
  { topic: "coding", level: "Easy", question: "What does HTML stand for?", choices: ["HyperText Markup Language", "High Tech Modern Language", "Hyperlink Text Mode", "Home Tool Markup Language"], answer: 0 },
  { topic: "coding", level: "Easy", question: "Which symbol starts a single-line comment in JavaScript?", choices: ["//", "/*", "#", "--"], answer: 0 },
  { topic: "coding", level: "Easy", question: "What does CSS mainly control on a web page?", choices: ["Appearance / styling", "The database", "The server", "Network speed"], answer: 0 },
  { topic: "coding", level: "Easy", question: "What does API stand for?", choices: ["Application Programming Interface", "Applied Process Index", "Automated Program Input", "Active Page Item"], answer: 0 },
  { topic: "coding", level: "Medium", question: "Which is NOT a primitive JavaScript type?", choices: ["Array", "Number", "Boolean", "String"], answer: 0, explain: "Arrays are objects; number, boolean and string are primitives." },
  { topic: "coding", level: "Medium", question: "What does === check in JavaScript?", choices: ["Value and type", "Only value", "Assignment", "Inequality"], answer: 0 },
  { topic: "coding", level: "Medium", question: "Which keyword declares a block-scoped variable?", choices: ["let", "var", "global", "def"], answer: 0 },
  { topic: "coding", level: "Medium", question: "Which data structure is LIFO (last in, first out)?", choices: ["Stack", "Queue", "Array", "Tree"], answer: 0 },
  { topic: "coding", level: "Hard", question: "What is the time complexity of binary search?", choices: ["O(log n)", "O(n)", "O(n²)", "O(1)"], answer: 0 },

  // ---- General ----
  { topic: "general", level: "Easy", question: "What color do you get mixing blue and yellow?", choices: ["Green", "Purple", "Orange", "Brown"], answer: 0 },
  { topic: "general", level: "Easy", question: "How many continents are there on Earth?", choices: ["5", "6", "7", "8"], answer: 2 },
  { topic: "general", level: "Easy", question: "Which is the largest ocean?", choices: ["Pacific", "Atlantic", "Indian", "Arctic"], answer: 0 },
  { topic: "general", level: "Easy", question: "How many legs does a spider have?", choices: ["6", "8", "10", "4"], answer: 1 },
  { topic: "general", level: "Easy", question: "How many colors are in a rainbow?", choices: ["5", "6", "7", "8"], answer: 2 },
  { topic: "general", level: "Easy", question: "Which is the tallest land animal?", choices: ["Giraffe", "Elephant", "Horse", "Camel"], answer: 0 },
  { topic: "general", level: "Medium", question: "How many days are in a leap year?", choices: ["365", "366", "364", "360"], answer: 1 },
  { topic: "general", level: "Medium", question: "Which gas do plants take in to make food?", choices: ["Carbon dioxide", "Oxygen", "Helium", "Nitrogen"], answer: 0 },

  // ---- Science ----
  { topic: "science", level: "Easy", question: "What do we call water when it freezes solid?", choices: ["Ice", "Steam", "Mist", "Cloud"], answer: 0 },
  { topic: "science", level: "Easy", question: "Which part of a plant takes in water from the soil?", choices: ["Roots", "Leaves", "Flower", "Petals"], answer: 0 },
  { topic: "science", level: "Easy", question: "Which organ pumps blood around your body?", choices: ["Heart", "Brain", "Lungs", "Liver"], answer: 0 },
  { topic: "science", level: "Easy", question: "Which part of your body do you use to smell?", choices: ["Nose", "Ears", "Eyes", "Tongue"], answer: 0 },
  { topic: "science", level: "Medium", question: "What are the three states of matter?", choices: ["Solid, liquid, gas", "Hot, warm, cold", "Big, small, tiny", "Up, down, sideways"], answer: 0 },
  { topic: "science", level: "Medium", question: "What do bees make?", choices: ["Honey", "Milk", "Silk", "Bread"], answer: 0 },
  { topic: "science", level: "Medium", question: "What do caterpillars turn into?", choices: ["Butterflies", "Spiders", "Bees", "Ants"], answer: 0 },
  { topic: "science", level: "Medium", question: "H₂O is the chemical name for what?", choices: ["Water", "Salt", "Air", "Oil"], answer: 0 },
  { topic: "science", level: "Medium", question: "Animals that eat only plants are called…?", choices: ["Herbivores", "Carnivores", "Omnivores", "Predators"], answer: 0 },
  { topic: "science", level: "Hard", question: "About how many bones are in an adult human body?", choices: ["106", "206", "306", "406"], answer: 1 },

  // ---- Nature ----
  { topic: "nature", level: "Easy", question: "How many legs does an insect have?", choices: ["4", "6", "8", "10"], answer: 1 },
  { topic: "nature", level: "Easy", question: "What do you call a baby dog?", choices: ["Puppy", "Kitten", "Cub", "Foal"], answer: 0 },
  { topic: "nature", level: "Easy", question: "Which animal is known as the “king of the jungle”?", choices: ["Lion", "Tiger", "Bear", "Wolf"], answer: 0 },
  { topic: "nature", level: "Easy", question: "Which is the largest land animal?", choices: ["Elephant", "Giraffe", "Rhino", "Hippo"], answer: 0 },
  { topic: "nature", level: "Medium", question: "Which is the fastest land animal?", choices: ["Cheetah", "Lion", "Horse", "Greyhound"], answer: 0 },
  { topic: "nature", level: "Medium", question: "Animals active at night are called…?", choices: ["Nocturnal", "Diurnal", "Hibernating", "Migrating"], answer: 0 },
  { topic: "nature", level: "Medium", question: "Which sea creature has eight arms?", choices: ["Octopus", "Crab", "Starfish", "Shark"], answer: 0 },
  { topic: "nature", level: "Medium", question: "What is the largest animal on Earth?", choices: ["Blue whale", "Elephant", "Great white shark", "Giraffe"], answer: 0 },
  { topic: "nature", level: "Medium", question: "What do you call a group of wolves?", choices: ["Pack", "Herd", "Flock", "School"], answer: 0 },
  { topic: "nature", level: "Hard", question: "Which of these birds cannot fly?", choices: ["Penguin", "Eagle", "Sparrow", "Owl"], answer: 0 },

  // ---- Geography ----
  { topic: "geography", level: "Easy", question: "Which is the largest continent?", choices: ["Asia", "Africa", "Europe", "Australia"], answer: 0 },
  { topic: "geography", level: "Easy", question: "What is the capital of France?", choices: ["Paris", "London", "Rome", "Madrid"], answer: 0 },
  { topic: "geography", level: "Easy", question: "Which ocean is the largest?", choices: ["Pacific", "Atlantic", "Indian", "Arctic"], answer: 0 },
  { topic: "geography", level: "Medium", question: "What is the tallest mountain on Earth?", choices: ["Mount Everest", "K2", "Kilimanjaro", "Denali"], answer: 0 },
  { topic: "geography", level: "Medium", question: "What is the capital of Japan?", choices: ["Tokyo", "Kyoto", "Osaka", "Seoul"], answer: 0 },
  { topic: "geography", level: "Medium", question: "On which continent is the Sahara Desert?", choices: ["Africa", "Asia", "Australia", "Europe"], answer: 0 },
  { topic: "geography", level: "Medium", question: "Which is the smallest continent?", choices: ["Australia", "Europe", "Antarctica", "South America"], answer: 0 },
  { topic: "geography", level: "Medium", question: "Which river is generally considered the longest?", choices: ["Nile", "Amazon", "Mississippi", "Yangtze"], answer: 0 },
  { topic: "geography", level: "Hard", question: "Which line divides Earth into the Northern and Southern hemispheres?", choices: ["The Equator", "The Prime Meridian", "The Tropic of Cancer", "The Date Line"], answer: 0 },

  // ---- History ----
  { topic: "history", level: "Easy", question: "What were the giant reptiles that lived millions of years ago?", choices: ["Dinosaurs", "Dragons", "Mammoths", "Lizards"], answer: 0 },
  { topic: "history", level: "Easy", question: "What were the huge stone tombs built by the ancient Egyptians?", choices: ["Pyramids", "Castles", "Temples", "Towers"], answer: 0 },
  { topic: "history", level: "Medium", question: "Who was the first person to walk on the Moon?", choices: ["Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "Michael Collins"], answer: 0 },
  { topic: "history", level: "Medium", question: "Ancient Egyptian kings were called…?", choices: ["Pharaohs", "Emperors", "Knights", "Sultans"], answer: 0 },
  { topic: "history", level: "Medium", question: "Which ship sank in 1912 after hitting an iceberg?", choices: ["Titanic", "Mayflower", "Santa Maria", "Endeavour"], answer: 0 },
  { topic: "history", level: "Medium", question: "Who is said to have explained gravity after seeing an apple fall?", choices: ["Isaac Newton", "Albert Einstein", "Galileo", "Charles Darwin"], answer: 0 },
  { topic: "history", level: "Medium", question: "Before cars, what did people most commonly ride to travel on land?", choices: ["Horses", "Planes", "Boats", "Rockets"], answer: 0 },
  { topic: "history", level: "Hard", question: "About how old is the Great Pyramid of Giza?", choices: ["About 4,500 years", "About 500 years", "About 1,000 years", "About 10,000 years"], answer: 0 },

  // ---- Words ----
  { topic: "words", level: "Easy", question: "Which of these words is a noun?", choices: ["Dog", "Run", "Quickly", "Happy"], answer: 0 },
  { topic: "words", level: "Easy", question: "What is the opposite of “hot”?", choices: ["Cold", "Warm", "Boiling", "Spicy"], answer: 0 },
  { topic: "words", level: "Easy", question: "Which word rhymes with “cat”?", choices: ["Hat", "Dog", "Cup", "Sun"], answer: 0 },
  { topic: "words", level: "Easy", question: "How many letters are in the English alphabet?", choices: ["24", "25", "26", "27"], answer: 2 },
  { topic: "words", level: "Medium", question: "Which word is spelled correctly?", choices: ["Because", "Becuase", "Becaus", "Becouse"], answer: 0 },
  { topic: "words", level: "Medium", question: "A word that means the same as another is a…?", choices: ["Synonym", "Antonym", "Homonym", "Pronoun"], answer: 0 },
  { topic: "words", level: "Medium", question: "Which of these is a verb (an action word)?", choices: ["Jump", "Table", "Blue", "Slowly"], answer: 0 },
  { topic: "words", level: "Medium", question: "What is the plural of “mouse”?", choices: ["Mice", "Mouses", "Mouse", "Mices"], answer: 0 },
  { topic: "words", level: "Medium", question: "Which punctuation mark ends a question?", choices: ["Question mark", "Period", "Comma", "Exclamation mark"], answer: 0 },
  { topic: "words", level: "Hard", question: "A word that means the opposite of another is an…?", choices: ["Antonym", "Synonym", "Adjective", "Adverb"], answer: 0 },
];

/** Quizzes drawn from the user's active topics (random order is up to callers). */
export function quizzesFor(interests: readonly TopicId[] | undefined): Quiz[] {
  const active = activeTopics(interests);
  const pool = QUIZZES.filter((q) => active.has(q.topic));
  return pool.length > 0 ? pool : [...QUIZZES];
}

/* ---------------------------------------------------------------- quotes --- */

// Topic-flavoured quotes layered on top of the base (coding/productivity) pool.
export const TOPIC_QUOTES: Partial<Record<TopicId, Quote[]>> = {
  music: [
    { text: "Music is the space between the notes.", author: "Claude Debussy" },
    { text: "Where words fail, music speaks.", author: "Hans Christian Andersen" },
    { text: "Practice makes progress — one note at a time.", author: null },
    { text: "Every great musician started by learning a single scale.", author: null },
    { text: "Music gives a soul to the universe and wings to the mind.", author: "Plato" },
    { text: "Keep playing. The wrong notes are how you find the right ones.", author: null },
  ],
  math: [
    { text: "Pure mathematics is, in its way, the poetry of logical ideas.", author: "Albert Einstein" },
    { text: "Mistakes are proof that you are trying.", author: null },
    { text: "Math isn't about being right the first time — it's about not giving up.", author: null },
    { text: "Every problem has a solution; sometimes you just need a new angle.", author: null },
    { text: "Numbers are the building blocks of everything around us.", author: null },
    { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
  ],
  astronomy: [
    { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan" },
    { text: "We are made of star-stuff.", author: "Carl Sagan" },
    { text: "Look up at the stars and not down at your feet.", author: "Stephen Hawking" },
    { text: "The Universe is under no obligation to make sense to you — so stay curious.", author: "Neil deGrasse Tyson" },
    { text: "Shoot for the Moon. Even if you miss, you'll land among the stars.", author: "Norman Vincent Peale" },
    { text: "Across the sea of space, the stars are other suns.", author: "Carl Sagan" },
  ],
  science: [
    { text: "The important thing is to never stop questioning.", author: "Albert Einstein" },
    { text: "Nothing in life is to be feared, it is only to be understood.", author: "Marie Curie" },
    { text: "I have no special talent. I am only passionately curious.", author: "Albert Einstein" },
    { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan" },
    { text: "Somewhere, something incredible is waiting to be discovered.", author: null },
  ],
  nature: [
    { text: "Look deep into nature, and then you will understand everything better.", author: "Albert Einstein" },
    { text: "In every walk with nature one receives far more than he seeks.", author: "John Muir" },
    { text: "The earth has music for those who listen.", author: null },
    { text: "The poetry of the earth is never dead.", author: "John Keats" },
    { text: "Every creature is better alive than dead.", author: "Henry David Thoreau" },
  ],
  geography: [
    { text: "The world is a book, and those who do not travel read only one page.", author: null },
    { text: "Not all those who wander are lost.", author: "J.R.R. Tolkien" },
    { text: "The Earth is what we all have in common.", author: "Wendell Berry" },
    { text: "Wherever you go becomes a part of you somehow.", author: "Anita Desai" },
    { text: "To travel is to discover that everyone is wrong about other countries.", author: "Aldous Huxley" },
  ],
  history: [
    { text: "Those who cannot remember the past are condemned to repeat it.", author: "George Santayana" },
    { text: "Study the past if you would define the future.", author: "Confucius" },
    { text: "History is who we are and why we are the way we are.", author: "David McCullough" },
    { text: "The more you know about the past, the better prepared you are for the future.", author: "Theodore Roosevelt" },
    { text: "A people without knowledge of their history is like a tree without roots.", author: "Marcus Garvey" },
  ],
  words: [
    { text: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
    { text: "A word after a word after a word is power.", author: "Margaret Atwood" },
    { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
    { text: "There is no friend as loyal as a book.", author: "Ernest Hemingway" },
    { text: "Reading is to the mind what exercise is to the body.", author: "Joseph Addison" },
  ],
};

/**
 * The quote pool for the card: the base (coding/productivity) quotes when a
 * code-leaning interest is active, plus the flavoured quotes for every active
 * topic. Falls back to the base pool so the card is never empty.
 */
export function quotesFor(
  interests: readonly TopicId[] | undefined,
  base: Quote[]
): Quote[] {
  const active = activeTopics(interests);
  const flavoured = (Object.keys(TOPIC_QUOTES) as TopicId[])
    .filter((t) => active.has(t))
    .flatMap((t) => TOPIC_QUOTES[t] ?? []);
  const includeBase = active.has("coding") || active.has("general");
  const pool = includeBase ? [...base, ...flavoured] : flavoured;
  return pool.length > 0 ? pool : base;
}
