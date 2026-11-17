-- The shop catalog (docs/room-shop/PLAN.md, section 4). Image bytes live in Blob; this holds metadata.

CREATE TABLE assets (
  id          text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  kind        text NOT NULL CHECK (kind IN ('sheet', 'sprite', 'spine', 'dvd-blank', 'shelf-empty')),
  blob_key    text NOT NULL,
  mime        text NOT NULL CHECK (mime IN ('image/png', 'image/webp', 'image/gif', 'image/jpeg')),
  w           integer NOT NULL DEFAULT 0 CHECK (w >= 0),
  h           integer NOT NULL DEFAULT 0 CHECK (h >= 0),
  name        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop_sections (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,40}$'),
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  position    integer NOT NULL,
  CONSTRAINT shop_sections_position_key UNIQUE (position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE items (
  id              text PRIMARY KEY CHECK (id ~ '^[a-z0-9/_-]{1,80}$'),
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  sub             text,
  type            text NOT NULL,
  section_id      text NOT NULL REFERENCES shop_sections (id) ON DELETE RESTRICT,
  position        integer NOT NULL,
  price           integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  min_level       integer NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  is_default      boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deleted')),
  sprite_asset_id text REFERENCES assets (id),
  sprite_rect     integer[] CHECK (sprite_rect IS NULL OR cardinality(sprite_rect) = 4),
  surface         jsonb,
  cover_color     text CHECK (cover_color IS NULL OR cover_color ~ '^#[0-9a-fA-F]{6}$'),
  spine_asset_id  text REFERENCES assets (id),
  shelf_layout    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_section_position_key UNIQUE (section_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX items_status_idx ON items (status);
