# Naruto dialogue study site — Vercel edition

The same study site as `naruto_study_site.html`, hosted on Vercel behind a login, with two roles:

- **Reader** (`USER_LOGIN` / `USER_PASSWORD`): the site exactly as before — episodes, furigana, hidden translations, the grammar plan and Anki cards.
- **Developer** (`DEV_LOGIN` / `DEV_PASSWORD`): everything a reader has, plus an edit mode for marking words and grammar in the lines, and a data panel for downloading and uploading the whole site as one file.

## Deploy

### 1. Put the files in a Git repository

Create a new GitHub repository and upload the contents of this folder (keep the folder structure). `vercel.json`, `package.json`, `api/` and `public/` must sit at the top of the repository, not inside another folder; otherwise Vercel deploys an empty site and every page shows `404: NOT_FOUND`. If your files are already inside a subfolder, set **Settings → Build and Deployment → Root Directory** to that folder's name instead, and redeploy. `node_modules/`, `.env.local` and `.local-store/` are ignored on purpose.

### 2. Import the repository into Vercel

1. On vercel.com choose **Add New → Project** and import the repository.
2. Leave the build settings as they are. `vercel.json` already selects the "Other" preset, no build command, and `public/` as the output directory.
3. Before clicking **Deploy**, open **Environment Variables** and add the five variables below.
4. Click **Deploy**.

| Variable | What it is |
|---|---|
| `USER_LOGIN` | Reader login, for example `student` |
| `USER_PASSWORD` | Reader password |
| `DEV_LOGIN` | Developer login, for example `jenya` |
| `DEV_PASSWORD` | Developer password, different from the reader's |
| `SESSION_SECRET` | 32 or more random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

Logins are not case-sensitive; passwords are. Changing a role's password signs out everyone using that role; changing `SESSION_SECRET` signs out everyone.

### 3. Connect storage for edits

Without storage the site works for reading, but developer edits cannot be saved (edit mode shows a warning).

1. In the project, open **Storage → Create → Blob**.
2. Set access to **Private** and create the store. The site stores everything as private files, so a store created as Public will not work, and the access type cannot be changed later.
3. Connect it to the project for Production (and Preview if you use preview deployments).
4. Open **Deployments**, and on the latest deployment choose **⋯ → Redeploy**. Variables added by the connection only reach new deployments.

The connection adds `BLOB_STORE_ID` (and `BLOB_READ_WRITE_TOKEN`) to the project. Do not set them by hand.

### Deploying from the command line instead

```bash
npm i -g vercel
cd naruto-study-site
vercel link                                   # create or pick the project
vercel env add USER_LOGIN production          # repeat for the other four variables
vercel blob create-store naruto-data --access private --yes
vercel --prod
```

## Using developer mode

Sign in with the developer login and switch on **Правка** in the toolbar.

- **Mark a word for translation.** Select part of a Japanese line and press **＋ Слово** in the bar that appears. The word and its reading are filled in from the selection and its furigana; change them to the dictionary form if needed (倒せない → 倒す), add 2–4 translations separated by «; », and press **Добавить слово**. The result is the same chip readers click to build Anki cards, with the same six card fields.
- **Mark grammar.** Select the form and press **＋ Грамматика**. Pick a topic from the list (the search box filters it; a topic is suggested when the same form is already explained elsewhere), or create one with **Новая тема…**, write a one- or two-sentence explanation, and press **Добавить разбор**. The result is the same tickable note that builds the review plan.
- **Without selecting text.** Every line has **＋ Слово**, **＋ Грамматика** and **Изменить** buttons in edit mode. **Изменить** edits the Japanese text (with furigana as `漢字[かんじ]`) and the Russian translation.
- **Change or delete a mark.** In edit mode, click a word chip or a grammar note.
- **See it as a reader.** Switch **Правка** off: the page behaves exactly like the reader's.

Each save is checked with the same rules as the study-site skill's `site_tool.py`, so the data stays compatible with it. If two tabs edit the same episode, the second save is refused and the page loads the newer version, so nothing is overwritten silently.

## Adding new episodes with Claude

The naruto-study-site skill keeps working unchanged; it just receives the file from the site.

1. **Данные → Скачать файл сайта.** This downloads `naruto_study_site.html` with every episode and all your edits, in the same format as before. It also opens offline and doubles as a backup.
2. Give Claude that file and the episode's `.ass` subtitles, as before.
3. **Данные → Загрузить файл сайта** with the file Claude returns. New episodes are ticked; episodes that differ from the site are unticked by default, because they may contain edits you made on the site after downloading; unchanged ones are skipped. Topics, speakers and known words from the file are merged in.

## Where the data lives

- `data/` in the repository holds the episodes the site was deployed with, plus topics, speakers and the known-words list. On every deploy, `scripts/build-seed.mjs` bundles it into `lib/seed-data.js`, which the functions import; edit the files in `data/`, never `seed-data.js`. Episode 18 currently contains only its first five minutes.
- The private Blob store holds every episode edited or uploaded in developer mode, plus added topics, speakers and known words. For the same episode, the stored version wins.
- Practical consequence: after you start editing on the site, bring in changes through **Загрузить файл сайта**, not by editing `data/` in the repository, because an episode saved in the store hides its copy in `data/`. Brand-new episode files added to `data/episodes/` and redeployed do appear.
- Readers may see an edit up to about a minute later (Vercel's cache in front of the store); the developer view always reads the latest version.
- Ticks and cards are kept only in the open page, as in the original: export the plan or the cards before closing it.

## Local preview

```bash
npm install
cp .env.example .env.local      # fill in the logins and SESSION_SECRET
npm run dev                     # http://localhost:3000, edits are saved in .local-store/
```

`npm run dev` runs the same API code as Vercel. To test against your real Blob store instead, copy `BLOB_READ_WRITE_TOKEN` from the store's settings into `.env.local` and delete the `LOCAL_STORE_DIR` line.

## Security

- Episodes and all other data are served only by the API, and only to a signed-in session. The page's HTML, CSS and JavaScript are public but contain no data.
- Every change requires a developer session and is checked on the server; a reader who calls the API directly gets a 403.
- The session is an HttpOnly, SameSite=Lax, Secure cookie, signed with `SESSION_SECRET`, valid for 30 days.
- Changes are accepted only from the site's own pages (custom request header plus an Origin check).
- Failed logins are slowed down, but there is no lockout: use long passwords.

## Project layout

```
api/            Vercel Functions
  auth.js         sign in, sign out, current role
  data.js         topics, speakers, known words, episode list; add topics; merge on upload
  episode.js      read and save one episode
  template.js     the single-file engine used by "Скачать файл сайта"
lib/
  auth.js         credentials and the signed session cookie
  http.js         responses and request checks
  store.js        data/ plus the private Blob store (or a local folder for npm run dev)
  standalone-template.html
  seed-data.js    generated from data/ on each deploy
data/           the episodes and catalogs the site was deployed with
public/         the page: index.html, css/app.css, js/app.js, js/editor.js, js/model.js
scripts/
  build-seed.mjs  bundles data/ for the functions (Vercel's build command)
  dev-server.mjs  local preview without the Vercel CLI
vercel.json     build command, static folder, security headers
```

`public/js/model.js` is shared by the page and the API: furigana handling, the validator and the single-file format.

## Troubleshooting

- **The login page says "Сайт не настроен…".** A variable is missing or `SESSION_SECRET` is shorter than 32 characters. Add it and redeploy.
- **Edit mode says "Хранилище не подключено".** Connect a Private Blob store (step 3) and redeploy.
- **"Хранилище Vercel Blob вернуло ошибку…".** The store is Public, or it is not connected to this environment (Production or Preview). Create a Private store and connect it.
- **"Этот эпизод уже изменили в другой вкладке…".** Another tab or device saved this episode first. The page has loaded the newer version; repeat your change.
- **Costs.** On the free Hobby plan, Blob includes 1 GB of storage and a monthly allowance of reads and writes; a personal study site stays well within it. Each developer page load reads stored episodes uncached, so they are always current.
