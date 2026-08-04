// The exercise types a teacher can ask for.
//
// `ru`/`en` are the printed headings — which one gets used depends on the
// student's level (see lib/labels.js). `brief` is what the model is told to
// produce; that's the part worth editing if a type isn't coming out right.

export const EXERCISE_TYPES = [
  {
    id: "vocab",
    ru: "Лексика в контексте",
    en: "Vocabulary in context",
    instruction: "Вставьте пропущенное слово.",
    brief:
      "Предложения из текста с пропущенным словом (___). Пропускай именно новую или полезную лексику, не служебные слова.",
  },
  {
    id: "cases",
    ru: "Падежные окончания",
    en: "Case endings",
    instruction: "Поставьте слова в скобках в нужную форму.",
    brief:
      "Предложения из текста, где существительное, прилагательное или местоимение дано в скобках в начальной форме — ученик ставит его в нужный падеж. Пример: «Маша смотрит на (муха) ___.» Ответ: «муху». Разнообразь падежи.",
  },
  {
    id: "motion",
    ru: "Глаголы движения",
    en: "Verbs of motion",
    instruction: "Выберите правильный глагол движения.",
    brief:
      "Предложения с пропуском, где нужен глагол движения (идти/ходить, ехать/ездить, нести/носить, приставочные: пришёл, вышел, подошёл). В скобках дай 2–3 варианта на выбор. Если в тексте мало движения, строй предложения на его материале, но с новыми ситуациями.",
  },
  {
    id: "aspect",
    ru: "Виды глагола",
    en: "Verb aspect",
    instruction: "Выберите глагол нужного вида.",
    brief:
      "Предложения с пропуском, где в скобках даны совершенный и несовершенный вид (например: «делать/сделать»). Ученик выбирает нужный по смыслу. В ответе укажи форму и коротко почему.",
  },
  {
    id: "aspectPairs",
    ru: "Видовые пары",
    en: "Aspect pairs",
    instruction: "Напишите видовую пару к глаголу.",
    brief:
      "Глаголы из текста. Ученик пишет парный глагол другого вида. Пример: «просить — ?» Ответ: «попросить».",
  },
  {
    id: "conjugation",
    ru: "Спряжение глаголов",
    en: "Verb conjugation",
    instruction: "Поставьте глагол в нужную форму.",
    brief:
      "Предложения, где глагол дан в скобках в инфинитиве — ученик ставит его в нужное лицо, число и время. Пример: «Она (шить) ___ одежду.» Ответ: «шьёт». Бери глаголы с интересным чередованием.",
  },
  {
    id: "prepositions",
    ru: "Предлоги",
    en: "Prepositions",
    instruction: "Вставьте нужный предлог.",
    brief:
      "Предложения из текста с пропущенным предлогом (в, на, под, из, к, с, о, для, из-за). Обращай внимание на пары предлог + падеж.",
  },
  {
    id: "comprehension",
    ru: "Вопросы по тексту",
    en: "Comprehension questions",
    instruction: "Ответьте на вопросы по тексту.",
    brief:
      "Вопросы на понимание содержания. В ответе — краткий правильный ответ по-русски.",
  },
  {
    id: "trueFalse",
    ru: "Правда или неправда",
    en: "True or false",
    instruction: "Правда или неправда?",
    brief:
      "Утверждения по содержанию текста, часть верных, часть неверных. Ответ — «правда» или «неправда».",
  },
  {
    id: "speaking",
    ru: "Говорение",
    en: "Speaking",
    instruction: "Задания для устной практики.",
    brief:
      "Задания для устной работы: пересказать, описать, разыграть диалог, высказать мнение. Ответов нет — оставь поле ответа пустым.",
  },
  {
    id: "writing",
    ru: "Письменное задание",
    en: "Written homework",
    instruction: "Письменное домашнее задание.",
    brief:
      "2–3 письменных задания разного объёма (например: 5 предложений, короткий текст, письмо). Ответов нет — оставь поле ответа пустым.",
  },
];

// A gentle default: covers most lessons without the teacher ticking anything.
export const DEFAULT_TYPES = ["vocab", "comprehension", "speaking"];

// More than this and each type gets too thin to be worth doing.
export const MAX_TYPES = 4;

export function typeById(id) {
  return EXERCISE_TYPES.find((t) => t.id === id);
}

/** Types that have answers worth printing in a key. */
export function hasAnswers(id) {
  return id !== "speaking" && id !== "writing";
}
