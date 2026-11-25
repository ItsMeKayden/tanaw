/**
 * Demo question content (text + choices A–D) for the demo exam: 20 questions
 * per competency, matching the demo answer key (questions 1–20 Mathematics,
 * 21–40 English, 41–60 Science, 61–80 Logical Reasoning, 81–100 Filipino).
 *
 * Each entry is [question, correct answer, wrong, wrong, wrong]. The correct
 * answer is placed at the letter already in the answer key (correct_answer),
 * so scores and recorded responses stay valid. Only questions without text
 * are filled, so hand-written questions are never overwritten.
 */
import { log, prisma } from "./client";

type Item = readonly [question: string, correct: string, ...wrong: [string, string, string]];

const BANK: Record<string, readonly Item[]> = {
  Mathematics: [
    ["What is 15% of 240?", "36", "24", "32", "40"],
    ["Solve for x: 3x + 7 = 22.", "5", "4", "6", "7"],
    ["What is the value of 2³ × 3²?", "72", "36", "54", "108"],
    ["A shirt costs ₱450 after a 10% discount. What was its original price?", "₱500", "₱495", "₱405", "₱550"],
    ["What is the least common multiple of 6 and 8?", "24", "12", "48", "14"],
    ["Simplify: (x²)(x³).", "x⁵", "x⁶", "x", "2x⁵"],
    ["The perimeter of a square is 36 cm. What is its area?", "81 cm²", "36 cm²", "72 cm²", "144 cm²"],
    ["What is 3/4 + 2/3?", "17/12", "5/7", "5/12", "6/7"],
    ["If a car travels 180 km in 3 hours, what is its average speed?", "60 km/h", "50 km/h", "54 km/h", "90 km/h"],
    ["What is the slope of the line y = 4x − 9?", "4", "−9", "9", "−4"],
    ["Evaluate: 48 ÷ 6 × 2 + 3.", "19", "7", "4", "22"],
    ["What is the square root of 196?", "14", "13", "16", "18"],
    ["The ratio of boys to girls is 3:5. If there are 40 students, how many are girls?", "25", "15", "24", "20"],
    ["Factor: x² − 9.", "(x − 3)(x + 3)", "(x − 3)²", "(x + 9)(x − 1)", "(x − 9)(x + 1)"],
    ["What is the sum of the interior angles of a triangle?", "180°", "90°", "270°", "360°"],
    ["Convert 0.375 to a fraction in lowest terms.", "3/8", "3/5", "37/100", "5/8"],
    ["What is the median of 4, 9, 2, 7, 5?", "5", "7", "4", "5.4"],
    ["Solve: 2(x − 4) = 10.", "9", "7", "3", "14"],
    ["A circle has a radius of 7 cm. What is its circumference? (Use π ≈ 22/7)", "44 cm", "22 cm", "154 cm", "49 cm"],
    ["What is −8 + 15 − (−3)?", "10", "4", "−10", "26"],
  ],
  English: [
    ["Choose the correct verb: She ___ to school every day.", "walks", "walk", "walking", "have walked"],
    ["What is the synonym of “diligent”?", "hardworking", "lazy", "careless", "noisy"],
    ["What is the antonym of “ancient”?", "modern", "old", "historic", "antique"],
    ["Which sentence is grammatically correct?", "Neither of the boys is ready.", "Neither of the boys are ready.", "Neither of the boy are ready.", "Neither the boys is ready."],
    ["Identify the noun: “The quick fox jumped over the fence.”", "fence", "quick", "jumped", "over"],
    ["Choose the correct word: I have ___ apple.", "an", "a", "the", "some"],
    ["What is the past tense of “begin”?", "began", "begun", "beginned", "begins"],
    ["Which word is an adverb?", "quickly", "quick", "quickness", "quicker"],
    ["“Break the ice” means to…", "start a conversation", "destroy something cold", "stop talking", "feel cold"],
    ["Choose the correct pronoun: Between you and ___, this is a secret.", "me", "I", "myself", "mine"],
    ["What is the plural of “child”?", "children", "childs", "childes", "child’s"],
    ["Which is a complete sentence?", "The students passed the exam.", "Because the students studied.", "Passing the exam.", "When the bell rang."],
    ["Choose the correct spelling.", "necessary", "neccessary", "necesary", "neccesary"],
    ["What figure of speech is “The wind whispered through the trees”?", "personification", "simile", "hyperbole", "metaphor"],
    ["Choose the correct preposition: The book is ___ the table.", "on", "in", "at", "into"],
    ["What is the main idea of a paragraph usually found in?", "the topic sentence", "the title only", "the last word", "the footnote"],
    ["Which word means “to make something better”?", "improve", "worsen", "ignore", "remove"],
    ["Choose the correct form: If I ___ rich, I would travel the world.", "were", "am", "was being", "be"],
    ["Which sentence uses the correct punctuation?", "Yes, I will come.", "Yes I will, come.", "Yes; I will come", "Yes I will come,"],
    ["“Benevolent” most nearly means…", "kind", "angry", "wealthy", "careless"],
  ],
  Science: [
    ["What is the chemical symbol for water?", "H₂O", "O₂", "CO₂", "HO"],
    ["Which planet is known as the Red Planet?", "Mars", "Venus", "Jupiter", "Mercury"],
    ["What part of the cell contains genetic material?", "nucleus", "cell wall", "cytoplasm", "ribosome"],
    ["What is the unit of force?", "newton", "joule", "watt", "pascal"],
    ["Which gas do plants absorb during photosynthesis?", "carbon dioxide", "oxygen", "nitrogen", "hydrogen"],
    ["What is the boiling point of water at sea level?", "100 °C", "90 °C", "0 °C", "212 °C"],
    ["Which organ pumps blood throughout the body?", "heart", "lungs", "liver", "kidney"],
    ["What type of energy is stored in food?", "chemical energy", "nuclear energy", "sound energy", "light energy"],
    ["Which layer of the Earth do we live on?", "crust", "mantle", "outer core", "inner core"],
    ["What is the smallest unit of matter?", "atom", "molecule", "cell", "compound"],
    ["Which vitamin is mainly produced when skin is exposed to sunlight?", "vitamin D", "vitamin C", "vitamin A", "vitamin B12"],
    ["What do you call an animal that eats only plants?", "herbivore", "carnivore", "omnivore", "decomposer"],
    ["What is the pH of pure water?", "7", "0", "14", "1"],
    ["Which simple machine is a ramp?", "inclined plane", "lever", "pulley", "wheel and axle"],
    ["What causes the seasons on Earth?", "the tilt of Earth’s axis", "distance from the Moon", "solar flares", "Earth’s rotation speed"],
    ["Which blood cells fight infection?", "white blood cells", "red blood cells", "platelets", "plasma"],
    ["What is the process of a liquid turning into a gas called?", "evaporation", "condensation", "freezing", "melting"],
    ["Which is a renewable energy source?", "solar power", "coal", "natural gas", "petroleum"],
    ["What force keeps planets in orbit around the Sun?", "gravity", "friction", "magnetism", "tension"],
    ["In which part of the plant does photosynthesis mainly occur?", "leaves", "roots", "stem", "flowers"],
  ],
  "Logical Reasoning": [
    ["What comes next: 2, 4, 8, 16, …?", "32", "24", "18", "30"],
    ["What comes next: 3, 6, 11, 18, …?", "27", "24", "25", "29"],
    ["If all roses are flowers and some flowers fade quickly, which must be true?", "All roses are flowers.", "All flowers are roses.", "All roses fade quickly.", "No roses fade quickly."],
    ["Book is to reading as fork is to…", "eating", "cooking", "kitchen", "spoon"],
    ["Which does not belong: apple, banana, carrot, mango?", "carrot", "apple", "banana", "mango"],
    ["If today is Monday, what day is it 10 days from now?", "Thursday", "Wednesday", "Friday", "Tuesday"],
    ["What comes next: A, C, E, G, …?", "I", "H", "J", "K"],
    ["Ana is taller than Ben. Ben is taller than Carlo. Who is the shortest?", "Carlo", "Ana", "Ben", "Cannot be determined"],
    ["Find the odd one out: 9, 16, 25, 30, 36.", "30", "16", "25", "36"],
    ["Doctor is to hospital as teacher is to…", "school", "student", "book", "lesson"],
    ["If CAT is coded as DBU, how is DOG coded?", "EPH", "CNF", "EOG", "DPH"],
    ["What comes next: 1, 1, 2, 3, 5, 8, …?", "13", "11", "12", "15"],
    ["All students in a class passed. Maria is in the class. Which is true?", "Maria passed.", "Maria failed.", "Maria may have passed.", "Maria is the top student."],
    ["Which number completes the pattern: 5, 10, 20, 40, …?", "80", "60", "45", "50"],
    ["A clock shows 3:00. What is the angle between the hands?", "90°", "45°", "60°", "120°"],
    ["Which shape has the most sides: triangle, pentagon, hexagon, square?", "hexagon", "pentagon", "square", "triangle"],
    ["If 4 workers finish a job in 6 days, how long will 8 workers take?", "3 days", "12 days", "4 days", "6 days"],
    ["Bird is to nest as bee is to…", "hive", "honey", "flower", "wing"],
    ["What comes next: Z, X, V, T, …?", "R", "S", "Q", "U"],
    ["Which word can be formed from the letters of “LISTEN”?", "SILENT", "TALENT", "LESSON", "STOLEN"],
  ],
  Filipino: [
    ["Ano ang kasingkahulugan ng salitang “masipag”?", "matiyaga", "tamad", "mabagal", "maingay"],
    ["Ano ang kasalungat ng salitang “maliwanag”?", "madilim", "maaraw", "makinang", "malinaw"],
    ["Alin ang pangngalan sa pangungusap: “Kumain ng mangga si Ana.”?", "mangga", "kumain", "ng", "si"],
    ["Ano ang aspektong naganap ng pandiwang “kain”?", "kumain", "kumakain", "kakain", "kainin"],
    ["Ano ang ibig sabihin ng idyomang “bukas-palad”?", "matulungin", "madamot", "mayaman", "masayahin"],
    ["Alin ang tamang baybay?", "pagkakaisa", "pagkaka-isa", "pagkakaysa", "pagka-kaisa"],
    ["Ano ang tawag sa salitang naglalarawan sa pangngalan?", "pang-uri", "pandiwa", "pang-abay", "pangatnig"],
    ["Sino ang sumulat ng “Noli Me Tangere”?", "Jose Rizal", "Andres Bonifacio", "Francisco Balagtas", "Apolinario Mabini"],
    ["Ano ang kasingkahulugan ng “marikit”?", "maganda", "pangit", "matanda", "malungkot"],
    ["Alin ang pang-abay sa pangungusap: “Mabilis tumakbo ang bata.”?", "mabilis", "tumakbo", "bata", "ang"],
    ["Ano ang ibig sabihin ng “nagbibilang ng poste”?", "walang trabaho", "nagtatrabaho sa kalsada", "nag-aaral magbilang", "naglalakad sa gabi"],
    ["Ano ang panghalip sa pangungusap: “Siya ay mahusay umawit.”?", "siya", "mahusay", "umawit", "ay"],
    ["Ano ang kasalungat ng “matapang”?", "duwag", "malakas", "matatag", "mabangis"],
    ["Ano ang tawag sa akdang patula na may sukat at tugma?", "tula", "sanaysay", "maikling kuwento", "talambuhay"],
    ["Ano ang wastong pangatnig: “Nag-aral siya nang mabuti ___ pumasa siya.”?", "kaya", "ngunit", "o", "habang"],
    ["Ano ang ibig sabihin ng salitang “dalisay”?", "malinis", "marumi", "malabo", "maalat"],
    ["Alin ang halimbawa ng salitang tambalan?", "bahay-kubo", "bahay", "kubo", "mabahay"],
    ["Ano ang pambansang wika ng Pilipinas?", "Filipino", "Ingles", "Cebuano", "Ilokano"],
    ["Ano ang kasingkahulugan ng “hinagpis”?", "matinding lungkot", "malaking tuwa", "galit", "pagod"],
    ["Ano ang tamang gamit: “___ ang aklat mo?”", "Nasaan", "Saan", "Kanino", "Paano"],
  ],
};

const LETTERS = ["A", "B", "C", "D"] as const;

/** Puts the correct answer at its letter and fills the other choices in order. */
function arrange(item: Item, letter: string) {
  const [question, correct, ...wrong] = item;
  const correctIndex = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  if (correctIndex === -1) return null;
  const choices: string[] = [];
  let w = 0;
  for (let i = 0; i < LETTERS.length; i++) choices.push(i === correctIndex ? correct : wrong[w++]);
  return { question_text: question, choice_a: choices[0], choice_b: choices[1], choice_c: choices[2], choice_d: choices[3] };
}

/**
 * Fills text and choices for the exam's questions that have none, by
 * competency in question order. Returns how many questions were filled.
 */
export async function seedDemoQuestionContent(examId: number) {
  const questions = await prisma.tbl_exam_question.findMany({
    where: { exam_id: examId },
    orderBy: { question_no: "asc" },
    select: {
      question_id: true,
      question_text: true,
      correct_answer: true,
      tbl_competency: { select: { competency_name: true } },
    },
  });

  const position = new Map<string, number>();
  const updates: { question_id: number; data: NonNullable<ReturnType<typeof arrange>> }[] = [];
  for (const q of questions) {
    const subject = q.tbl_competency?.competency_name;
    const bank = subject ? BANK[subject] : undefined;
    if (!subject || !bank) continue;
    const index = position.get(subject) ?? 0;
    position.set(subject, index + 1);
    if (q.question_text) continue; // keep hand-written content
    const item = bank[index % bank.length];
    const data = arrange(item, q.correct_answer.trim().toUpperCase());
    if (data) updates.push({ question_id: q.question_id, data });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.tbl_exam_question.update({ where: { question_id: u.question_id }, data: u.data })),
    );
  }
  log("demo", `${updates.length} exam question${updates.length === 1 ? "" : "s"} given demo text and choices`);
  return updates.length;
}
