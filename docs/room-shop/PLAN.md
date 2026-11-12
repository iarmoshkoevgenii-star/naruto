# Room & shop rework: step-by-step plan for successive agents

This file is the single source of truth for this project. The work is done **one step per session**:
an agent opens this file, does the next unfinished step, records what it did in the **Handoff log** at the
bottom, commits, and stops. The next session starts from this file alone, so anything the next agent
needs to know must be written down here.

---

## 0. Rules for every agent (read first, every time)

1. **Read this whole file**, then read the newest entry in the Handoff log (section 6). That entry can
   override details in the step descriptions: it records what actually happened.
2. Run `git status` and `git log --oneline -10`. If the tree is dirty or the last commit doesn't match the
   log, stop and tell the user what you see before doing anything else.
3. **Do exactly one step**: the first one in section 5 whose status is not `DONE`. If it is
   `IN PROGRESS`, read its log entry and finish it. Don't start the next step in the same session, even if
   there's time left. Small fixes to earlier steps that your step needs are fine; note them in the log.
4. Before writing code for a step, tell the user in 3–5 lines what you're going to do and wait for a
   go-ahead **only if** the step says `Needs user`. Otherwise proceed.
5. Work on the **currently checked-out branch** (the user chose this). Don't create branches, don't push,
   don't deploy, don't change Vercel settings or env vars unless the user tells you to in that session.
6. Tests: `npm test` must pass before you finish (step 1 adds it). Add tests for the logic you add. For UI
   steps, also check the page in the browser on `npm run dev` (see section 3).
7. **Finish the step this way, in this order:**
   1. Set the step's status in section 5 to `DONE` (or `IN PROGRESS` if you have to stop early).
   2. Add a Handoff log entry (template in section 6). Be concrete: file paths, function names, commands,
      env vars, anything surprising, what you didn't do and why, what the next step should watch out for.
   3. If you changed a decision, a file name or an interface that later steps mention, **edit those later
      steps** so they stay correct. Don't leave the next agent following stale instructions.
   4. Commit everything (code, tests, this file) in one commit: `room-shop step N: <summary>`.
   5. Tell the user the step is done, what the next step is, and that a new session should pick it up.
8. Never put secrets (tokens, passwords, connection strings) in this file, in code, or in commits.

---

## 1. What we're building (agreed with the user, 2026-11-12)

| # | Requirement | Decision |
|---|---|---|
| 1 | Item assets come from a separate database | **Neon Postgres** (via Vercel Marketplace) holds the catalog: items, sections, asset metadata. **Image files** live in private **Vercel Blob** as real files, served through `/api/game?asset=<id>`. The hard-coded catalog in `public/js/game-model.js` (`BUILTIN_ITEMS`) is migrated into the DB once and then removed from code. |
| 2 | Admin can upload new assets that become available to all users (e.g. a new carpet) | Admin = existing `teacher` role. Upload image → choose type (e.g. `rug`), name, price, level, section → saved to DB → every student sees it in the shop. |
| 3 | Admin can hide/delete items | `status` = `active` / `hidden` / `deleted`. Both hidden and deleted leave the shop. **Students who own the item keep it** (still rendered in their room and shelf). Deleted items leave the admin list and appear under a "Deleted" filter with Restore. |
| 4 | Admin can change prices | Inline price (and level) edits, saved per item. |
| 5 | Admin can change the arrangement of the shop | Reorder items **within a section** (drag, plus up/down buttons for keyboard), **move items between sections**, and create/rename/reorder/delete sections (delete only when empty). Room spot positions are **not** in scope. |
| 6 | Bookshelf becomes a DVD cabinet | The room's **bookshelf object** (slot `bookshelf`) starts **empty**. Every owned **show** or **movie** (new item type `movie`) adds one **blank DVD** sprite on the shelf, in purchase order, row by row. On top of each blank DVD goes that title's texture: an **uploaded spine** if the admin set one, otherwise the blank DVD **tinted with the item's cover colour**. Shelf shows up to its capacity, then a **"+N" badge**; the click panel lists all titles. Books don't add DVDs (panel only). |

Out of scope: room spot coordinates, real (non-placeholder) art, payments, anything outside the room/shop.

---

## 2. The codebase as it was before step 1 (facts, so you don't have to rediscover them)

- **No framework, no build step.** Vanilla ES modules in the browser (`public/js/*.js`), Vercel Functions in
  `api/*.js` (each exports `GET`/`POST` taking a `Request`). Node ≥ 20, `"type": "module"`.
  `vercel.json` has the build command `node scripts/build-seed.mjs` and the rewrites for SPA routes.
- **Shared model:** `public/js/game-model.js` is imported by both the browser and the server (`lib/game.js`,
  `api/game.js`). Keep it free of Node-only imports. It holds `DEFAULT_RULES`, `SLOTS` (room spots,
  room is 192×136 "room pixels"), `SLOT_TYPES`, `BUILTIN_ITEMS`, `effectiveConfig(overrides)`,
  `configErrors`, `progress`, `owned`, `furnished`, `canBuy`.
- **Teacher overrides today:** one JSON doc `school/game/config.json` in Blob:
  `{v, rules, items: {id: partial-or-custom-item}, removed: [ids], assets: [{id,name,w,h,at}]}`.
  `lib/game.js` `loadConfig()` merges it over `BUILTIN_ITEMS`. **Rules stay in this doc** after the rework;
  only `items`, `removed` and `assets` move to Postgres.
- **Uploads today:** `storeAsset()` in `lib/game.js` saves base64 data URLs as JSON at
  `school/game/assets/<sha256-32>.json`; served by `GET /api/game?asset=<id>`. Sprites reference
  `{sheet: "placeholders", rect: [x,y,w,h]}` (the sheet `public/game/placeholders.png`, rects in
  `public/game/placeholders.js`) or `{asset: <id>, rect}`.
- **Student game data:** per-user doc `game` via `lib/users.js` (`readUser`/`updateUser`):
  `{v, events, grants, purchases: [{item, price, at}], equipped: {slotId: itemId|null}}`. This stays in
  Blob. Item ids must not change during migration, or purchases break.
- **Storage layer:** `lib/store.js`: Vercel Blob (private) when `BLOB_READ_WRITE_TOKEN`/`BLOB_STORE_ID` is
  set, otherwise a local folder (`LOCAL_STORE_DIR`, default `.local-store` under `npm run dev`).
  Optimistic concurrency with etags (`updateDoc`).
- **UI pieces:** `public/js/shop.js` (shop page, sections hard-coded in `SECTIONS`),
  `public/js/room.js` (room renderer, `itemThumb`, `spriteUrl`, `libraryPanel` = the bookshelf panel at
  ~line 128), `public/js/game-editor.js` (teacher "Room & shop": Shop list / Uploads with sprite slicer /
  Rules), `public/js/cabinet.js` (personal cabinet cards; it is **not** the DVD cabinet).
- **Security headers** (`vercel.json`): CSP `img-src 'self' data:`, so **images must be served from our own
  origin** (hence the `/api/game?asset=` proxy, not public Blob URLs). `connect-src 'self'`.
- **Roles:** `lib/session.js` `requireSession(request, role)`; teacher login from env `TEACHER_LOGIN` /
  `TEACHER_PASSWORD`; a `demo` student exists (see `lib/auth.js`).
- **Only content item today:** `en/desperate-housewives` (type `show`). Owning it unlocks the episode page
  (`contentAccess()` in `lib/game.js`).
- **No tests and no `.gitignore`** existed before this plan. Vercel CLI was not installed on the user's
  machine at planning time.

---

## 3. How to run things

```bash
npm install
npm run dev            # http://localhost:3000; reads .env.local; data in .local-store/
npm test               # added in step 1: node --test
```

- `.env.local` needs `TEACHER_LOGIN`, `TEACHER_PASSWORD`, `SESSION_SECRET` (see README). Never print or
  commit their values. If you need to sign in during a browser check and don't have credentials, ask the
  user to sign in in the browser pane.
- After step 1, local dev and tests use **PGlite** (in-process Postgres, no server) when `DATABASE_URL` is
  not set, and Neon when it is. Dev data lives in `.pglite/` (delete the folder to start over);
  `npm run dev` and `npm run migrate` apply migrations. New migrations: add `db/migrations/NNN_name.sql`
  (never edit an applied one).
- Tests: `npm test` runs `NODE_ENV=test node --test test/`. Every DB test file must call
  `beforeEach(() => useMemoryDb())` and `after(() => closeDb())` from `lib/db.js`, then `migrate()`.
- Without `.env.local` the API answers "The site is not set up yet" (500) for everything behind a
  session. That's expected, not a regression. For browser checks the user has to provide `.env.local`.
- Placeholder DVD art: `python3 scripts/dvd-placeholders.py` (needs Pillow; install into a temp dir with
  `pip install --target <dir> pillow` and run with `PYTHONPATH=<dir>`).

---

## 4. Target architecture (what "done" looks like)

```
Postgres (Neon; PGlite locally/tests)          Vercel Blob (private; .local-store locally)
  assets(id, kind, blob_key, mime, w, h,          school/game/files/<assetId>.<ext>   real image bytes
         name, created_at)                        school/game/config.json             rules only
  shop_sections(id, label, position)              users/<id>/game                     purchases, equipped
  items(id, name, sub, type, section_id,
        position, price, min_level, is_default,
        status, sprite_asset_id, sprite_rect,
        surface jsonb, cover_color,
        spine_asset_id, shelf_layout jsonb,
        created_at, updated_at)

lib/db.js          query(sql, params): Neon serverless driver if DATABASE_URL, else PGlite
lib/migrate.js     runs db/migrations/*.sql in order, records them in schema_migrations
lib/assets.js      putAsset(bytes, mime, meta) / getAsset(id) / legacy fallback for old base64 docs
lib/catalog.js     listItems({includeHidden, includeDeleted}), getItem(id), createItem, updateItem,
                   reorder(sectionId, ids), moveItem, sections CRUD
lib/game.js        uses lib/catalog.js instead of BUILTIN_ITEMS + overrides
public/js/game-model.js   rules + pure functions only (progress, owned, furnished, canBuy, dvdLayout)
public/js/shelf.js        draws the DVD shelf (used by room.js)
```

Asset kinds: `sheet` (whole sprite sheet; items point at it with a rect), `sprite`, `spine`, `dvd-blank`,
`shelf-empty`.

---

## 5. Steps

Status values: `TODO`, `IN PROGRESS`, `DONE`.

### Step 0: Design and placeholder art · `DONE`
Done in the planning session (see log). Produced this file, `scripts/dvd-placeholders.py` and
`public/game/dvd/`: `bookshelf-wood-empty.png`, `bookshelf-white-empty.png` (28×40), `dvd-blank.png` (3×8,
light gray so tinting works), `shelf-layout.json` (3 rows × 5 DVDs = capacity 15), and `preview.png`
(8× preview of 0/4/9/20 DVDs, for humans only; don't ship it as an asset).

### Step 1: Tooling, database layer, schema · `DONE` (Neon still to be connected by the user)
- Add `.gitignore` (`node_modules/`, `.local-store/`, `.env*.local`, `.pglite/`, `.vercel/`).
- Add `"test": "node --test"` to `package.json`; tests live in `test/*.test.js`.
- Dependencies: `@neondatabase/serverless`, `@electric-sql/pglite` (pin exact versions).
- `lib/db.js`: `query(text, params) → rows`, `tx(fn)`. Neon when `DATABASE_URL` is set; otherwise PGlite
  (persistent at `.pglite/` for dev, in-memory when `NODE_ENV=test` or when a test calls `useMemoryDb()`).
- `db/migrations/001_catalog.sql`: the three tables from section 4, plus `schema_migrations`. Constraints:
  `price >= 0`, `min_level >= 1`, `status IN (...)`, unique `(section_id, position)` deferrable, FK to
  assets and sections.
- `lib/migrate.js` + `scripts/migrate.mjs` (`npm run migrate`): applies pending migrations; idempotent.
  Run it from `npm run dev` startup and from `scripts/build-seed.mjs` (the Vercel build) when
  `DATABASE_URL` is set.
- **Needs user:** ask the user to create a Neon database from the Vercel dashboard
  (Storage → Marketplace → Neon, connect to the project), or to install the Vercel CLI and authorize, so
  `DATABASE_URL` exists for Preview/Production. Don't block on it: finish the step with PGlite and record
  in the log whether Neon is connected.
- Tests: migrations apply on a fresh DB and are idempotent; `query` round-trips.
- Done when: `npm test` passes; `npm run dev` starts and creates the schema in `.pglite/`.

### Step 2: Asset store · `TODO`
- `lib/assets.js`: `putAsset({bytes, mime, name, kind, w, h})` → content-hash id (sha256, 32 hex, same
  scheme as today) → bytes to `school/game/files/<id>.<ext>` through `lib/store.js` (add a binary
  read/write to the store backends if needed) → row in `assets`. `getAsset(id)` → `{bytes, mime}`.
  Allowed: png, webp, gif, jpeg; max 1.5 MB; check magic bytes, not just the declared type.
- **Legacy fallback:** if no row exists, try the old `school/game/assets/<id>.json` base64 doc so existing
  uploads keep working until step 3 migrates them.
- `GET /api/game?asset=<id>` uses `getAsset`. Keep the immutable cache header.
- Upload API accepts the same data-URL body as today (the client doesn't change yet) and stores via
  `putAsset`.
- Tests: put/get round-trip, dedupe by hash, rejects wrong type or size, legacy fallback.

### Step 3: Catalog module and one-time seed · `TODO`
- `lib/catalog.js` as in section 4. `listItems` returns the same item shape the client uses today
  (`{id, name, sub, type, price, minLevel, default, active, sprite: {asset, rect} | surface, cover}`),
  plus `status`, `sectionId`, `position`, `spine`. Keep `active` derived (`status === 'active'`) so
  existing client code keeps working until step 4.
- `scripts/seed-catalog.mjs` (`npm run seed-catalog`), **idempotent** (upsert by id, never duplicates):
  1. Upload `public/game/placeholders.png` as asset kind `sheet`; built-in items get
     `sprite_asset_id = <sheet id>`, `sprite_rect = ATLAS[id]`.
  2. Create sections from today's `SECTIONS` in `shop.js` (`shows` "Shows & movies", `furniture`,
     `walls`, `decor`) and assign each item by its type, keeping today's order as `position`.
  3. Insert every `BUILTIN_ITEMS` entry with the **same id**.
  4. Apply `school/game/config.json` overrides: changed fields, custom items (`u-...` ids), `removed` →
     `status = 'deleted'`, `active: false` → `status = 'hidden'`; migrate each legacy base64 asset doc
     into `assets` + a file.
  5. Upload the step 0 DVD art as assets (`shelf-empty` ×2, `dvd-blank` ×1) and set the bookshelf items'
     `shelf_layout` from `public/game/dvd/shelf-layout.json`. (Swapping the bookshelf sprite to the empty
     one happens in step 7, not here.)
- Tests: seeding a fresh DB yields every built-in id; running it twice changes nothing; overrides applied
  (fixture `config.json`).

### Step 4: Switch the game to the catalog (no visible change) · `TODO`
- ⚠ From this step on, the production site needs Neon: on Vercel without `DATABASE_URL`, `lib/db.js`
  throws a 503 ("shop database is not connected"). Check the log for whether Neon is connected; if not,
  remind the user that this commit must not be deployed until Neon is connected and seeded (step 9 order).
- `lib/game.js`: `loadConfig()` reads rules from `config.json` and items from `lib/catalog.js`.
  `saveOverrides` only saves rules now. `buy`, `equip`, `contentAccess` use catalog lookups.
- **Ownership fix:** a student's owned/equipped items must resolve even if hidden or deleted. Give
  `owned`/`furnished` the full item list (including hidden/deleted), and have the shop filter to active
  ones. `canBuy` must refuse non-active items.
- `public/js/game-model.js`: remove `BUILTIN_ITEMS`, `effectiveConfig`, and the item part of
  `configErrors`; keep the pure functions. `room.js` `spriteUrl` handles `{asset, rect}` only (the sheet
  is an asset now).
- `public/js/shop.js`: render sections from `config.sections` (ordered) and items by `position`.
- `api/game.js` `publicConfig` adds `sections`; students get active items plus the ones they own.
- Tests: owner keeps a hidden or deleted item in `furnished`; non-owner can't buy it; shop list excludes
  it; DH ownership still unlocks the episode.
- Browser check: room, shop and bookshelf panel look exactly as before (compare with `git stash` or
  screenshots).

### Step 5: Admin API · `TODO`
- Teacher-only actions (in `api/game.js` or a new `api/catalog.js`; mind Vercel's function count). All
  validated server-side:
  - `item.create` `{name, type, sectionId, price, minLevel, sprite:{asset,rect} | surface, cover?, spine?}`
  - `item.update` `{id, ...fields}` (name, sub, price, minLevel, sectionId, cover, spine, isDefault)
  - `item.hide`, `item.unhide`, `item.delete`, `item.restore`
  - `item.reorder` `{sectionId, ids: [...]}` (the full new order of that section)
  - `section.create|rename|reorder|delete` (delete fails with a clear 422 if not empty)
- Moving an item to another section appends it at the end of that section.
- Tests for each action, including permissions (student → 403) and validation errors.

### Step 6: Admin UI ("Room & shop") · `TODO`
- Rework the Shop list tab of `public/js/game-editor.js`: grouped by section; per row thumbnail, name,
  inline price and level, section dropdown, Hide/Unhide, Delete; filter All / Hidden / Deleted (Restore);
  drag handle plus ↑/↓ buttons; section management (add, rename, reorder, delete-when-empty). Each change
  saves immediately with a toast; errors from the API are shown.
- Uploads tab: upload → slicer (existing) or "use whole picture" → form with type, name, price, level,
  section, cover colour (show/movie), "use as DVD spine for…" → creates the item via `item.create`.
- Browser check of the carpet example: upload a rug image as teacher → it shows in the shop for the
  `demo` student → buy → it's in the room. Then hide it: gone from the shop, still in the student's room.

### Step 7: Movie type, DVD data and layout logic · `TODO`
- Add `movie` to the item types; shop section "Shows & movies" holds `show`, `book`, `movie`. The library
  panel labels movies as "Movie".
- Switch both bookshelf items' sprite to the `shelf-empty` assets (catalog update in a new migration or
  seed step, idempotent).
- Pure function in `game-model.js`:
  `dvdLayout(titles, shelfLayout, dvd) → {placed: [{id, x, y, tint, spine}], hidden: n}`, where `titles` =
  the student's owned `show`/`movie` items **sorted by purchase time** (the DVD counter).
- Tests: 0 titles → empty; 4 → first row; 15 → full; 20 → 15 placed and `hidden: 5`; order follows
  purchases; books ignored; hidden or deleted titles still count.

### Step 8: DVD rendering · `TODO`
- `public/js/shelf.js`: given the bookshelf slot's position and `dvdLayout`, draws the blank DVD sprite
  for each title at `x, y` inside the shelf, then the spine on top: the uploaded spine image if set
  (scaled to 3×8), otherwise the blank DVD tinted with `cover` (CSS `mix-blend-mode: multiply` or a
  pre-tinted canvas `data:` URL; both are allowed by the CSP). "+N" badge when `hidden > 0`.
- Hook it into `room.js` where the bookshelf slot is drawn. The read-only teacher view of a student's room
  shows it too.
- `libraryPanel` lists all titles as DVDs (spine/cover thumbnail), with books under their own heading.
- Admin: spine upload / cover colour on show and movie items (if step 6 didn't fully cover it).
- Browser check: new student → empty shelf; buy DH → 1 DVD; seed 16+ titles in a test account → "+N".

### Step 9: Cleanup, docs, release prep · `TODO` · Needs user (deploy)
- Remove dead code (old overrides-items paths, legacy asset fallback **only if** step 3's migration ran
  in production; otherwise keep it and say so in the log).
- Update `README.md` (room game, Room & shop editor, new env var `DATABASE_URL`, `npm run migrate`,
  `npm run seed-catalog`).
- Run the full test suite and a full browser pass of the flows from steps 4, 6 and 8.
- Ask the user before any deploy; give them the exact order: set `DATABASE_URL` → deploy preview (the
  build runs migrations) → `npm run seed-catalog` against that database → check → production.

---

## 6. Handoff log

Newest entry last. Copy this template:

```
### Step N · <date> · <DONE | IN PROGRESS>
- Did: <what was built; key files and functions>
- Decisions/changes vs plan: <anything that differs from section 5, and which later steps you edited>
- How to verify: <commands run and their result, e.g. "npm test: 23 passing">
- Env/infra state: <e.g. Neon connected? DATABASE_URL in .env.local? migrations applied where?>
- Not done / known issues: <...>
- Next agent: <the first thing to do, and traps to avoid>
- Commit: <short hash>
```

### Step 0 · 2026-11-12 · DONE
- Did: explored the codebase (facts in section 2), agreed the decisions in section 1 with the user, wrote
  this plan. Added `scripts/dvd-placeholders.py` and generated `public/game/dvd/*`. The existing
  `bookshelf-*` sprites in `placeholders.png` have books and DVDs painted in, so empty versions were drawn
  with the same palette and geometry (rows at y = 3/14/25, free width x = 3..24).
- Decisions/changes vs plan: none yet. User chose to work on the currently checked-out branch (`main`).
- How to verify: `public/game/dvd/preview.png` shows empty, 4, 9 and 20 DVDs (15 visible + overflow badge).
- Env/infra state: no database yet; Vercel CLI not installed; no `node_modules`.
- Not done / known issues: nothing is wired into the app yet. `scripts/placeholders.py` still draws the
  old filled bookshelves (fine: step 7 switches the items to the empty assets).
- Next agent: start step 1. Ask the user about Neon early (it's the only blocker), but build on PGlite
  meanwhile.
- Commit: fab5db9

### Step 1 · 2026-11-12 · DONE
- Did: `.gitignore` (node_modules, .local-store, .pglite, .env*, .vercel). `package.json`: scripts `test`
  (`NODE_ENV=test node --test test/`) and `migrate`; dependency `@neondatabase/serverless@1.2.0`,
  devDependency `@electric-sql/pglite@0.5.13` (dev/test only, loaded with a dynamic import, so it never
  runs in production). `lib/db.js`: `query(text, params) → rows`, `tx(async t => { t.query; t.exec })`,
  `dbKind()`, `useMemoryDb()`, `closeDb()`. Neon uses HTTP for queries and a per-transaction WebSocket
  Pool. `db/migrations/001_catalog.sql`: `assets`, `shop_sections`, `items` exactly as section 4, with
  CHECKs on ids, price, level, status, kind, mime and colour, and **deferrable** unique `(section_id,
  position)` and `shop_sections(position)`, so reorders can swap positions inside one `tx`.
  `lib/migrate.js` (advisory lock, one transaction per file, `schema_migrations`), `scripts/migrate.mjs`
  (reads .env.local). `npm run dev` migrates on startup; `scripts/build-seed.mjs` (the Vercel build)
  migrates only when `DATABASE_URL` is set.
- Decisions/changes vs plan: item `type` has **no** DB CHECK (the app validates it, so adding `movie` in
  step 7 needs no migration). Asset `kind` and `mime` **are** CHECKed. Added notes to section 3 and a
  warning to step 4.
- How to verify: `npm test` (7 passing: fresh migrate, idempotent, round-trip of int[]/jsonb,
  constraints, deferred position swap, rollback). `rm -rf .pglite && npm run migrate` twice gives
  "applied 001_catalog.sql", then "up to date". `npm run dev` logs "Catalog database (pglite): …" and
  serves `/` with 200.
- Env/infra state: **Neon not connected yet.** The user chose to add it later in the Vercel dashboard
  (Storage → Marketplace → Neon → connect to the project, which sets `DATABASE_URL`). No `.env.local` in
  the repo folder, so session APIs answer "not set up" locally.
- Not done / known issues: `npm audit` reports advisories in existing dependencies (not investigated, out
  of scope). PGlite's first start takes ~0.5 s per in-memory DB, so tests take ~4 s.
- Next agent: step 2. `lib/store.js` only reads and writes text/JSON today, so you'll need a binary
  read/write for image files (Blob `put` with a Buffer; local backend `writeFile`). Ask the user again
  whether Neon is connected yet.
- Commit: see `git log` ("room-shop step 1")
