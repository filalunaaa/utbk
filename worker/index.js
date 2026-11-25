const API_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300"
};

const FEED =
  "https://news.google.com/rss/search?q=" +
  encodeURIComponent('UTBK OR SNBT OR SNPMB OR TKA OR "Tes Kemampuan Akademik"') +
  "&hl=id&gl=ID&ceid=ID:id";

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function readTag(tag, block) {
  const match = block.match(
    new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">")
  );
  return match ? decodeXml(match[1]) : "";
}

async function berita() {
  const response = await fetch(FEED, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!response.ok) throw new Error("News feed returned " + response.status);

  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 15)
    .map((match) => {
      const block = match[1];
      let judul = readTag("title", block);
      const sumber = readTag("source", block);
      if (sumber && judul.endsWith(" - " + sumber)) {
        judul = judul.slice(0, -(sumber.length + 3));
      }
      return {
        judul,
        sumber,
        tanggal: readTag("pubDate", block),
        link: readTag("link", block)
      };
    });

  return Response.json(items, {
    headers: API_HEADERS
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/berita") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: API_HEADERS });
      }
      if (request.method !== "GET") {
        return Response.json(
          { error: "Method tidak diizinkan" },
          { status: 405, headers: API_HEADERS }
        );
      }
      try {
        return await berita();
      } catch {
        return Response.json(
          { error: "Berita belum bisa dimuat" },
          { status: 500, headers: API_HEADERS }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
