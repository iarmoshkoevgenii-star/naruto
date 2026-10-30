/* Retired. Series pages moved to /en/<slug> (english.html + api/english.js).
   This file replaces the previous version so that an old copy left in the repository
   cannot serve anything. It can be deleted. */
export function GET() {
  return new Response(JSON.stringify({ error: "Not found." }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
