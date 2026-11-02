// Cloudflare Worker for public CS2HLTV snapshots.
// Bind a KV namespace named MATCH_KV and add secret SYNC_SECRET.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/stats" && request.method === "GET") {
      const value = await env.MATCH_KV.get("latest", "text");
      let snapshot = value ? JSON.parse(value) : { connected: false, players: [], kill_feed: [] };
      // Mark the match offline when the local publisher has stopped sending updates.
      const updated = Number(snapshot.updated || 0);
      if (!updated || (Date.now() / 1000 - updated) > 15) snapshot.connected = false;
      return new Response(JSON.stringify(snapshot), {
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/publish" && request.method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      if (!env.SYNC_SECRET || auth !== `Bearer ${env.SYNC_SECRET}`) {
        return new Response("Unauthorized", { status: 401, headers: cors });
      }
      let data;
      try { data = await request.json(); }
      catch { return new Response("Invalid JSON", { status: 400, headers: cors }); }
      if (!data || typeof data !== "object" || !Array.isArray(data.players)) {
        return new Response("Invalid snapshot", { status: 400, headers: cors });
      }
      await env.MATCH_KV.put("latest", JSON.stringify(data), { expirationTtl: 86400 });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};
