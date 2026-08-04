# Расшифровка уроков

An app for Russian teachers. It turns a lesson into a clean text, plus a
summary, a vocabulary list with English translations, and exercises.

You set it up once. Then you send your teachers a link and a password. They
don't need to install anything or have any accounts.

---

**The app itself is entirely in Russian.** This file is in English, for you,
the person setting it up. Your teachers never see it.

---

## What it does

There are three ways to start a lesson. All three end with the same materials.

**1. Record** — press record in the browser, speak, press stop.

**2. Upload audio** — drag in a file you already have.

**3. From class notes** — drop in your lesson pictures with your notes written
on them. The app writes the narration for you. You edit it, then read it aloud
if you want.

After recording, you see the sound as a wave. Drag across it to select a part,
then delete it. Good for cutting out a bad start.

---

## What you need

Three accounts. Two are free.

| | Cost | What it's for |
| --- | --- | --- |
| [GitHub](https://github.com) | Free | Keeps the code |
| [Vercel](https://vercel.com) | Free | Runs the app on the internet |
| [OpenAI](https://platform.openai.com) | ~$1–2 a month | Does the actual work |

Set up time: about 15 minutes.

---

## Setting it up

### Step 1 — Get an OpenAI key and set a spending limit

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   and sign up.
2. Click **Create new secret key**. Copy it. It starts with `sk-`.
   **Save it somewhere now** — the site will never show it to you again.
3. Add $5 of credit. This is the minimum, and it will last you months.
4. **Important:** go to
   [platform.openai.com/settings/organization/limits](https://platform.openai.com/settings/organization/limits)
   and set a monthly limit. Try $10. This way you can never be surprised by a
   big bill.

Do step 4 before you give anyone the link.

### Step 2 — Put the code on GitHub

1. Sign up at [github.com](https://github.com).
2. Go to [github.com/new](https://github.com/new).
3. Name it `ru-transcribe`. Choose **Private**. Click **Create repository**.
4. On the next page, click the link **uploading an existing file**.
5. Open this folder on your computer. Select everything inside it and drag it
   into the browser window.
   - If you see a folder called `node_modules`, don't include it.
6. Click the green **Commit changes** button.

### Step 3 — Put it on the internet

1. Go to [vercel.com/new](https://vercel.com/new). Sign in with GitHub.
2. Find `ru-transcribe` in the list. Click **Import**.
3. **Before you click Deploy**, find the section called
   **Environment Variables**. These are settings. Add two:

   | Key | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | your key from Step 1, starting `sk-` |
   | `APP_PASSWORD` | any password you invent, e.g. `masha-2026` |

   Type the name in the left box, the value in the right box, click **Add**.
   Then do the second one.

4. Click **Deploy**. Wait 2 minutes.

You now have a link like `https://ru-transcribe.vercel.app`.

### Step 4 — Test it

1. Open your link. Type your password.
2. Try it with one lesson you already have.
3. If it works, send the link and the password to your teachers.

That's it. You're done.

---

## Updating it later

Once it's deployed, Vercel watches your GitHub repository. Any change to the
code rebuilds the site automatically. You never repeat the Vercel setup.

To install a newer version of the app:

1. Open your `ru-transcribe` repository on GitHub.
2. Click **Add file** → **Upload files**.
3. Drag in the new `app`, `components` and `lib` folders plus the root files.
   Skip `node_modules`.
4. Click **Commit changes**. Wait about a minute.

GitHub replaces files that have the same name, so this is safe.

You do **not** need to set `OPENAI_API_KEY` or `APP_PASSWORD` again — those
live in Vercel, not in the code. Your teachers stay signed in.

Afterwards, refresh with **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac).
A normal refresh may show you the old cached version and make you think nothing
happened.

**If an update breaks something:** Vercel keeps every previous version. Go to
**Deployments**, find the one that worked, click **⋯** → **Promote to
Production**. You're back in seconds.

---

## Using it

Open the link, type the password once, and the browser remembers you for a
month.

### Making a transcript from audio

1. Choose **Record** or **Upload audio**.
2. Record or drop in your file.
3. Cut out any bad parts on the wave picture.
4. In section 2, write any names or special words from the lesson, one per
   line. **This is the most useful thing you can do.** It's how the app knows
   «Бильбо Бэггинс» and not «Убильбо Бегинса».
5. Choose the student level.
6. Press **Transcribe**.

When it finishes you get tabs:

- **Текст** — the clean transcript
- **Исправления** — every change the app made, so you can check it
- **Конспект**, **Лексика**, **Упражнения** — teaching materials
- **Без обработки** — the transcript before correction

### Choosing the exercises

Under **Создать материалы** there's a list of exercise types. Tick up to four:

Лексика в контексте · Падежные окончания · Глаголы движения · Виды глагола ·
Видовые пары · Спряжение глаголов · Предлоги · Вопросы по тексту ·
Правда или неправда · Говорение · Письменное задание

Five exercises are made for each type you tick, all built from the actual
lesson text. Four is the cap because beyond that each type gets too thin to be
worth doing.

### Fixing mistakes

Press **Править**. Everything becomes editable — not just the transcript, but
the summary, the vocabulary table and every exercise. Press **Готово** when
you're finished.

- **Текст** — a plain box; a blank line separates paragraphs
- **Конспект** — title, summary, and each list one item per line
- **Лексика** — a row per word, with ✕ to delete and a button to add
- **Упражнения** — question and answer separately, per item

If you've already made the materials, a yellow note offers **Пересоздать по
новому тексту**, which rebuilds them from your corrections. Skip it for small
fixes — it costs a few cents each time.

Nothing is saved anywhere. **Download what you want to keep before closing the
tab.**

### Printing and PDF

**Печать или PDF** prints the whole worksheet, not just the tab you're looking
at: summary, text, vocabulary and exercises.

Two things are arranged for the classroom:

- **Exercises print without answers**, with a line to write on.
- **The answer key goes on its own last page**, so you can hand out the front
  sheets and keep the last one.

Headings follow the student's level: **A1 and A2 get English headings** (Text,
Vocabulary, Answer key) so beginners can navigate the page. **B1 and above get
a fully Russian sheet** — at that level the instructions are useful input in
themselves. Set this in `lib/labels.js`.

### Writing the text first, recording after

1. Choose **From class notes**.
2. Drag in your lesson pictures. Up to 6. You can also paste with Ctrl+V.
3. Fill in section 2 (names, what the lesson is about, level).
4. Press **Write the narration**.
5. Read what it wrote. **Edit it freely** — it's just a text box.
6. Then choose:
   - **Record audio for this text** — read it aloud, then **Download MP3**
   - **Use this text** — go straight to the teaching materials

The app follows your notes closely. It uses your words, in your order. It reads
your shorthand out loud too: `Спаси меня! =Помоги мне!` becomes «Спаси меня —
это значит: помоги мне».

If it couldn't read something in your picture, it tells you above the text box.

---

## What it costs

You pay for your teachers' use as well as your own.

| How much audio | Cost |
| --- | --- |
| 1 lesson (5 minutes) | about 5 cents |
| 36 lessons a month | **about $1–2** |
| 1 hour a day, every day | about $12–15 a month |

Turning off the teaching materials checkbox makes it about half.

Prices change. The current ones are at
[openai.com/api/pricing](https://openai.com/api/pricing).

**One thing to check yourself:** Vercel's free plan is meant for personal,
non-commercial use. If this becomes part of how your school earns money, their
rules point at a paid plan ($20 a month). Have a look at
[their guidelines](https://vercel.com/docs/limits/fair-use-guidelines) and
decide where you sit.

---

## If something goes wrong

**"That password isn't right."**
Check what you typed into `APP_PASSWORD` in Vercel. Capital letters matter.

**"Transcription failed (401)."**
Your OpenAI key is wrong. In Vercel: **Settings → Environment Variables**, fix
`OPENAI_API_KEY`, then **Deployments → ⋯ → Redeploy**.

**"Transcription failed (429)."**
You've run out of credit. Add more at
[platform.openai.com/settings/organization/billing](https://platform.openai.com/settings/organization/billing).

**"Couldn't read that audio."**
The browser doesn't understand that file. Convert it to MP3 or M4A.

**"Microphone access was blocked."**
Click the padlock icon in the address bar and allow the microphone. Reload the
page. On iPhone, the link must start with `https` — your Vercel link does.

**The microphone list just says "Default microphone".**
Normal. Record once and allow permission. The names appear after that.

**The narration misread your notes.**
The screenshot is probably too small. Take it at full size. Put the words it
got wrong into the box in section 2, then press **Rewrite from notes**.

**Something takes too long and fails.**
Only happens with recordings over 10 minutes on the free Vercel plan. See
"Long recordings" below.

**Someone got the password who shouldn't have.**
In Vercel, change `APP_PASSWORD` and redeploy. Everyone signs in again.

---

## Optional things

You can ignore all of this. It only matters if you want to change something.

### Making the transcripts better over time

Open the file `lib/prompts.js`. Near the top there's a list of examples like
this:

```
- «как Убильбо Бегинса» → «как у Бильбо Бэггинса»
- «там очень сыра внутри» → «там очень сыро внутри»
```

When you notice the app making the same mistake again and again, add a line
like these. This helps more than anything else. Five or six real examples from
your own lessons make a big difference.

Edit the file on GitHub directly (click the file, then the pencil icon). Vercel
updates the app automatically in about a minute.

### Changing the Russian wording

If a button or a hint should say something different, the Russian text sits
directly in the files — there's no separate translation file to hunt through.
Search GitHub for the words you see on screen and change them.

Where the text lives:

| File | What's in it |
| --- | --- |
| `app/page.js` | Section titles, main buttons, progress messages |
| `components/Recorder.js` | Everything on the recording screen |
| `components/WaveformEditor.js` | The buttons under the sound wave |
| `components/NotesComposer.js` | The screenshot upload area |
| `components/Results.js` | Tab names and download buttons |

One thing to be careful with: counts like «5 слов» use a small helper in
`lib/ru.js` so the ending changes correctly (1 слово, 2 слова, 5 слов). If you
add a new count somewhere, use `plural()` rather than writing the word by hand.

### Sound quality

Browsers apply call-centre processing to microphones by default — noise
suppression, automatic gain, echo cancellation. It's tuned for phone calls, and
on a spoken monologue it dulls the voice and makes it sound filtered, unlike
Audacity which records raw.

**All of that is off by default here.** There's a checkbox, «Подавлять фоновый
шум», for teachers working in a genuinely noisy room — it trades clarity for
less background hum.

The app keeps two versions of every recording:

| | Quality | Used for |
| --- | --- | --- |
| Master | 48 kHz, 128 kbps | What you hear, and what **Download MP3** gives you |
| Transcription copy | 16 kHz, 40 kbps | Sent to OpenAI — it listens at 16 kHz anyway |

So the small file only exists on the way to the API. What you hand students is
full quality.

Recordings over 25 minutes are kept at 16 kHz throughout, because a 48 kHz
master of something that long uses too much memory. Change
`MASTER_RATE_MAX_MINUTES` in `lib/audio.js` if you need otherwise.

### Choosing a better model

Open `your-link.vercel.app/api/models` in your browser while signed in. It
shows a list of what your OpenAI account can use.

If there's a newer model than `gpt-4.1`, add a setting in Vercel:

| Key | Value |
| --- | --- |
| `TEXT_MODEL` | the newer model name |

This mostly affects how well it corrects Russian.

### Long recordings

Your lessons are 2–5 minutes, so **you can skip this**.

Recordings under 10 minutes are sent in one piece and finish in seconds.

For longer ones, the free Vercel plan stops any job after 60 seconds. Two ways
around it:

- **Free:** in `app/api/transcribe/route.js` change `maxDuration = 300` to
  `maxDuration = 60`. In `lib/audio.js` change `TARGET_CHUNK_SEC = 540` to
  `TARGET_CHUNK_SEC = 240`.
- **Paid:** Vercel Pro, $20 a month. Change nothing.

### Running it on your own computer

Only if you want to experiment without deploying. You need Node.js installed.

```bash
npm install
cp .env.example .env.local
```

Open `.env.local`, put your key in, then:

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## Things it doesn't do

- **No speaker labels.** Everything is treated as one voice. Fine for your
  narration recordings.
- **No subtitles or timestamps.** Getting those requires an older, less
  accurate transcription model, which isn't a good trade here.
- **Recordings live in the browser's memory.** If the browser crashes while
  recording, the audio is lost. Not a problem for 5-minute recordings.
- **Nothing is saved on the server.** Every transcript exists only in your
  browser until you download it. Download what you want to keep.
