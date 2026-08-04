// Headings for the printed worksheet.
//
// Beginners get English headings so they can find their way around the page
// without decoding it first. From B1 the page is fully in Russian — at that
// level the instructions are themselves useful input.

const RU = {
  text: "Текст",
  summary: "Конспект",
  topics: "Темы",
  keyPoints: "Ключевые мысли",
  discussion: "Вопросы для обсуждения",
  vocabulary: "Лексика",
  word: "Слово",
  translation: "Перевод",
  example: "Пример",
  exercises: "Упражнения",
  answers: "Ключи",
  level: "Уровень",
  words: "слов",
};

const EN = {
  text: "Text",
  summary: "Summary",
  topics: "Topics",
  keyPoints: "Key points",
  discussion: "Discussion questions",
  vocabulary: "Vocabulary",
  word: "Word",
  translation: "Translation",
  example: "Example",
  exercises: "Exercises",
  answers: "Answer key",
  level: "Level",
  words: "words",
};

/** B1 and above get a Russian worksheet; A1–A2 get English headings. */
export function isAdvanced(level) {
  return level === "B1" || level === "B2" || level === "C1";
}

export function labels(level) {
  return isAdvanced(level) ? RU : EN;
}

/** Heading for an exercise block, in the same language as the rest of the sheet. */
export function exerciseHeading(type, level) {
  return isAdvanced(level) ? type.ru : type.en;
}
