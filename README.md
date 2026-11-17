# Natalia’s Language School

A student platform behind one login. Students see their personal cabinet first, with five tabs above it:

| Tab | Address | What it is |
|---|---|---|
| Grammar | `/grammar` | Broad topic areas first, then the topics of one area, then a topic page with a hideable topic list on the left. Lesson texts are not written yet. |
| Vocabulary | `/vocabulary` | The library: TV series, plus Movies and Other as placeholder sections. Japanese is visible but locked for students. |
| Homework | `/homework` | Empty for now. |
| Training | `/training` | The word trainer from the Desperate Housewives page: your unknown words from all episodes, or all words of one episode. |
| Personal cabinet | `/` | Photo, study streak, days studied, level (preview), next class and “Book a class” (preview), words to learn, notifications, a year of study activity. |

Episodes open as their own pages: `/en/desperate-housewives`, and `/ja/naruto` for accounts with Japanese.

## The room game

The personal cabinet is a small pixel-art room. Its objects are the way around:

| Object | Opens |
|---|---|
| Computer | messages: reminders about classes, homework and tests |
| Calendar | this month with deadlines marked, what is coming up, and “Book a class” (a preview) |
| Diary | level, XP, coins, streak, days studied, English level, words, and the activity map |
| Bookshelf | the student’s shows, movies and books; each show or movie stands on the shelf as a DVD |
| Door | the shop |

Hovering over an object (or reaching it with Tab) makes it glow and grow slightly.

**XP, levels and coins.** Students earn XP for:

- attending a class (the teacher logs it);
- completed homework (the teacher marks the reminder completed);
- reaching the end of an episode (once per episode);
- finishing a word training of at least 5 words (up to 3 a day).

Every 1000 XP is a level, up to 60, and each level gives 100 coins. Students start with 100 coins. All of this, including every limit, is set in **Room & shop → Rules**.

Levels and coins are calculated from each student’s total XP, so changing XP per level or coins per level recalculates everyone straight away.

**The shop** sells shows, movies and books (Desperate Housewives: level 1, 1 coin; a student must own it to open it) and things for the room: furniture skins, rugs, wallpapers and floors, plants, lamps, pictures. Its sections and their order are set in the editor. A bought item goes into its fixed spot in the room. Rugs, plants, lamps, pictures, the armchair and the clock can be taken out again. Students keep what they bought even if the teacher later hides or deletes it.

**The DVD shelf.** The bookshelf starts empty. Every show or movie a student owns adds a DVD, in the order they were bought, row by row: the title’s uploaded spine picture if it has one, otherwise a blank DVD in the title’s cover colour. The shelf holds 15; after that a “+N” badge shows how many more there are, and the bookshelf panel lists them all. Books are listed in the panel only.

**Room & shop editor** (teacher: Students → Room & shop):

- **Shop list** (every change is saved straight away): items grouped by section; rename, change price and level, move to another section, choose the starting item for each spot, set a title’s cover colour, **Hide** (off sale) or **Delete**, and reorder by dragging ⠿ or with the ↑ ↓ buttons. **Hidden** and **Deleted** show those items; deleted ones can be restored. Sections can be added, renamed, reordered, and deleted when empty.
- **Uploads:** upload a sprite sheet or a single picture (PNG, WebP, GIF or JPEG, up to 1.5 MB). The pieces are found automatically in your browser; click one (or use the whole picture), name it, choose what it is, its section, price and level, and add it to the shop. For a show or movie the whole picture can become its DVD spine; a picture can also be set as the spine of an existing title.
- **Rules:** levels, XP per level, coins per level, starting coins, and XP, daily limits, minimum words and “only once” for each activity. Saved with **Save rules**.

In a student’s teacher view you can also give or take XP and coins, and reset their game.

**About the art.** The room currently uses simple placeholder drawings (`public/game/placeholders.png`, made by `scripts/placeholders.py`; the empty bookshelves and the blank DVD in `public/game/dvd/`, made by `scripts/dvd-placeholders.py`). The licence of the 0_mem0ry furniture packs asks that they not be used with AI tools, so they were not processed here: upload them yourself in Room & shop → Uploads and make the pieces you want into shop items or starting items. The shop is decorated with the DeadWood Cafe pack by ODDBLOT (free to use, not for resale), shrunk to `public/game/shop/*.webp`.

## Accounts

- **Teacher.** One shared login from the environment variables `TEACHER_LOGIN` and `TEACHER_PASSWORD`. The older names `DEV_LOGIN` and `DEV_PASSWORD` still work, so an existing deployment needs no changes. The teacher sees the Students page instead of a personal cabinet, and an **Edit** switch on episodes.
- **Students.** Created by the teacher on the Students page; there is no self-signup. Passwords are stored as salted scrypt hashes. Changing a password or deleting a student signs that account out everywhere.
- **Demo student (optional).** If `USER_LOGIN` and `USER_PASSWORD` are set, they work as one built-in English-only student.

Everything a student does (marks, training results, photo, activity) is saved to their account, so it is the same on every device.

## Deploy or update

The repository top level must contain `vercel.json`, `package.json`, `api/`, `public/` and the other folders directly, not inside another folder.

**First deploy:** import the repository in Vercel, add the environment variables below, deploy, then add storage (next section) and redeploy.

**Updating an existing deployment:** on GitHub, open the repository’s main page, choose **Add file → Upload files**, drag in the *contents* of the new folder, and commit. Files with the same names are replaced and new ones added. Uploading never deletes files: see the release notes you received for files that are safe to remove.

| Variable | Value |
|---|---|
| `TEACHER_LOGIN` (or `DEV_LOGIN`) | the teacher’s login |
| `TEACHER_PASSWORD` (or `DEV_PASSWORD`) | the teacher’s password |
| `SESSION_SECRET` | 32 or more random characters; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `USER_LOGIN`, `USER_PASSWORD` | optional demo student |

### Storage

Student accounts and everything students do need a private Vercel Blob store. In the project: **Storage → Create → Blob**, access **Private**, connect it to the project, then **Deployments → ⋯ → Redeploy**. Without storage, only the teacher can sign in, and nothing can be saved.

### Shop database

The shop’s items, sections and uploaded pictures’ details live in a Postgres database (Neon, from the Vercel Marketplace); the picture files themselves live in Blob. In the project: **Storage → Marketplace → Neon**, connect it to the project. The site reads `DATABASE_URL`, or `NARUTO_STORAGE_DATABASE_URL` when the integration was connected with the `NARUTO_STORAGE` prefix. Each deploy’s build creates or updates the tables.

The database starts empty. Fill it once with the built-in shop (and anything the teacher had changed before), from a computer with this repository:

1. In `.env.local`, put the database’s real connection string (Vercel → Storage → the database → `.env.local` tab, **Show secret**) as `DATABASE_URL`, and Blob access: `BLOB_READ_WRITE_TOKEN`, or `BLOB_STORE_ID` with a fresh `VERCEL_OIDC_TOKEN` from `vercel env pull`. The seed refuses to run against a real database while pictures would go to a local folder.
2. Run `npm run seed-catalog`. It only adds what is missing, so running it again is safe and never undoes the teacher’s changes.

Without the database the site answers “The shop database is not connected yet” for the room and the shop.

**Where the data lives.** Vercel Blob stores data outside Russia. Russian law requires Russian citizens’ personal data to be stored in Russia, so use this deployment with test accounts only, and move to hosting in Russia before adding real students. The storage code sits behind one small interface in `lib/store.js` (`read` and `write` with versions), so it can be pointed at another store.

## Teacher guide

- **Add a student:** Students → **Add student**: name, login, level, and whether they may open Japanese. A password is generated; copy the details and send them to the student.
- **Reminders:** **Remind** on a student, or **Remind everyone**: class, homework, test or message, with an optional date and time. They appear in the notification centre of the student’s cabinet (inside the site only).
- **Classes:** **Log class** records an attended class. It counts as a study day for the streak and the activity map.
- **A student’s progress:** click the name to see their cabinet as they see it, their marks per episode, and to delete reminders.
- **Editing episodes:** open an episode, switch on **Edit**, then:
  - select part of a line and choose **＋ Word** or **＋ Grammar**;
  - click an existing word or note to change or delete it;
  - use **Edit line** to fix the text or the translation.

  Every save is checked before it is stored. If two tabs edit the same episode, the second save is refused and the page loads the newer version.
- **Naruto** keeps its own tools (Russian interface): editing, and **Данные** for downloading the single-file site for Claude and uploading the result.

## Streaks and study days

- A day counts as studied when the student trains words, marks words or grammar in an episode, or attends a logged class.
- The streak counts studied days in a row. Today never breaks it while the day is still going.
- **Free skip:** one missed day is covered automatically, and the skip comes back 7 days after it was used.
- The activity map shows the last 12 months; darker squares mean more study that day.

## Adding content

- **English episodes:** put the episode’s HTML file, in the Desperate Housewives format (a `const DATA = {...};` block), into `content/en/<name>.html`, with an optional `content/en/<name>.meta.json` for the title and hero text (see the Desperate Housewives one). It appears at `/en/<name>` after the next deploy. To show it in the Vocabulary library as a series card, add it to `SERIES` at the top of `public/js/platform.js`.
- **Naruto episodes:** as before, through the Naruto page’s **Данные** menu, or as `data/episodes/epNN.json` files.
- **Grammar topics:** `public/js/grammar-data.js`. Topic ids that match the episode data (such as `present_simple`) make the grammar notes in episodes link to those pages.

## Local preview

```bash
npm install
cp .env.example .env.local      # fill in the teacher login and SESSION_SECRET
npm run seed-catalog            # once: fills the local shop database
npm run dev                     # http://localhost:3000, data is kept in .local-store/
npm test                        # the tests (Node's test runner)
```

`npm run dev` runs the same API code as Vercel and applies the same page addresses and security headers. Without `DATABASE_URL` the shop database is PGlite, a real Postgres running inside Node, kept in `.pglite/` (delete the folder to start over); `npm run dev` and `npm run migrate` create or update its tables. Don’t point a local `.env.local` at the production database by accident: the pulled production variables (`vercel env pull`) include `VERCEL=1` and placeholders for secrets.

## Security

- No page shows any data before signing in. Episodes, accounts and student data are served only by the API, to a signed-in session, and each request checks the role (teacher or student) and the student’s languages.
- Sessions are HttpOnly, SameSite=Lax, Secure cookies signed with `SESSION_SECRET`, valid for 30 days.
- Changes are accepted only from the site’s own pages (custom request header and an Origin check).
- Failed logins are slowed down; use long passwords.

## Project layout

```
api/                Vercel Functions
  auth.js             sign in, sign out
  me.js               the signed-in user: profile, photo, marks, activity, notifications
  students.js         teacher: students, reminders, classes
  english.js          English episodes: read (students need to own them), save (teacher)
  game.js             the room game: progress, awards, buying, placing, teacher grants, rules, uploads
  data.js, episode.js, template.js   Naruto (unchanged roles: reading needs Japanese, saving needs the teacher)
  content.js          retired, answers 404; can be deleted
lib/
  auth.js             credentials, password hashing, signed sessions
  session.js          who is calling: role and language checks
  accounts.js         student accounts (one private document)
  users.js            per-user documents: state (activity, notifications), marks, photo, game
  game.js             room game logic: XP awards with limits, purchases, spots, uploaded pictures,
                      the teacher's shop actions
  catalog.js          the shop catalog in Postgres: items and sections, with validation
  assets.js           uploaded pictures: files in the store, details in Postgres
  db.js, migrate.js   the database (Neon, or PGlite locally) and its migrations
  seed-catalog.js     fills the catalog from db/seed/catalog.json (npm run seed-catalog)
  store.js            the store (Vercel Blob or a local folder) and the bundled content
  http.js             responses and request checks
  seed-data.js        generated on each deploy from data/ and content/
db/
  migrations/         SQL migrations, applied in order (never edit an applied one)
  seed/catalog.json   the built-in shop items and sections
content/en/         English episodes
data/               Naruto episodes, topics, speakers, known words
public/
  index.html          the platform (login, cabinet, tabs)
  english.html        English episode page
  naruto.html         Naruto page
  js/                 platform.js (router), shell.js (top bar), cabinet.js, teacher.js, grammar.js,
                      grammar-data.js, training.js, trainer.js, stats.js (streaks), english.js,
                      english-editor.js, english-model.js, app.js + editor.js + model.js (Naruto),
                      game-model.js (room spots, rules, DVD layout), room.js, shelf.js (DVD shelf),
                      shop.js, game-editor.js, rewards.js
  game/               placeholders.png + placeholders.js (room art), dvd/ (empty shelves, blank DVD),
                      shop/ (DeadWood Cafe art)
  css/                tokens.css (palette), shell.css, platform.css, english.css, app.css (Naruto)
scripts/
  build-seed.mjs      bundles data/ and content/ (Vercel’s build command)
  placeholders.py     draws the placeholder room art (python3 scripts/placeholders.py)
  dvd-placeholders.py draws the empty bookshelves and the blank DVD
  migrate.mjs         npm run migrate
  seed-catalog.mjs    npm run seed-catalog
  dev-server.mjs      local preview
test/               npm test
```

## Troubleshooting

- **The login page says “The site is not set up yet”.** A variable is missing or `SESSION_SECRET` is shorter than 32 characters. Add it and redeploy.
- **“Storage is not connected”.** Connect a Private Blob store and redeploy.
- **“The shop database is not connected yet”, or the shop is empty.** Connect the Neon database and redeploy, then run `npm run seed-catalog` against it (see Shop database).
- **A page shows `404: NOT_FOUND`.** The files are inside a subfolder of the repository; move them to the top level, or set Settings → Build and Deployment → Root Directory to that folder.
- **“This episode was changed in another tab”.** Someone saved first; the page loaded the newer version. Repeat your change.
- **Costs and plans.** Vercel’s free Hobby plan is for non-commercial use; a paid school needs the Pro plan.
