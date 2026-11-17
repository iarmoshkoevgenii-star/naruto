/* The DVD shelf (docs/room-shop/PLAN.md, step 8): the student's shows and movies stand on the room's
   bookshelf as DVDs. Positions come from dvdLayout (game-model.js), in the bookshelf sprite's pixels, so
   the DVDs are drawn inside the bookshelf's own element and move (and zoom on hover) with it.
   Each DVD is the blank DVD picture with, on top, either the title's uploaded spine (scaled to the DVD)
   or the blank DVD again, tinted with the title's cover colour (multiply, masked to the DVD's pixels). */
import { esc } from "./api.js";
import { dvdLayout, itemById, DEFAULT_COVER } from "./game-model.js";

const assetUrl = id => "/api/game?asset=" + encodeURIComponent(id);

/* The student's DVD titles, in the order the server gave (summary.dvds = purchase order). */
export const dvdTitles = (config, ids) => (ids || []).map(id => itemById(config, id)).filter(Boolean);

/* HTML for inside the bookshelf element: the DVDs, then a "+N" badge when they don't all fit.
   Nothing when the bookshelf has no shelf layout (a teacher's own bookshelf picture). */
export function shelfHtml(shelf, titles) {
  const L = shelf && shelf.shelfLayout;
  if (!L || !L.dvd || !L.dvd.asset) return "";
  const { placed, hidden } = dvdLayout(titles, L);
  const blank = assetUrl(L.dvd.asset), size = "width:" + L.dvd.w + "px;height:" + L.dvd.h + "px;";
  return placed.map(p => {
    const top = p.spine
      ? '<i class="dvd-spine" style="background-image:url(' + assetUrl(p.spine) + ')"></i>'
      : '<i class="dvd-tint" style="background-color:' + esc(p.tint || DEFAULT_COVER) + ";-webkit-mask-image:url(" + blank + ");mask-image:url(" + blank + ')"></i>';
    return '<i class="dvd" style="left:' + p.x + "px;top:" + p.y + "px;" + size + "background-image:url(" + blank + ')">' + top + "</i>";
  }).join("") + (hidden > 0 ? '<b class="dvd-more">+' + hidden + "</b>" : "");
}

/* A title as a DVD case for the bookshelf panel: the cover colour, with the uploaded spine down the left. */
export function dvdThumb(item) {
  const spine = item.spine ? '<i style="background-image:url(' + assetUrl(item.spine.asset) + ')"></i>' : "";
  return '<span class="thumb-dvd' + (spine ? " has-spine" : "") + '" style="--cover:' + esc(item.cover || DEFAULT_COVER) + '">' + spine + "<b>" + esc(item.name) + "</b><small>DVD</small></span>";
}
