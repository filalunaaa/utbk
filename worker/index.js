const API_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300"
};

const FEEDS = [
  "https://news.google.com/rss/search?q=" +
    encodeURIComponent('UTBK OR SNBT OR SNPMB OR TKA OR "Tes Kemampuan Akademik"') +
    "&hl=id&gl=ID&ceid=ID:id",
  "https://www.bing.com/news/search?q=" +
    encodeURIComponent('UTBK OR SNBT OR SNPMB OR "Tes Kemampuan Akademik"') +
    "&format=rss"
];

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
    new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i")
  );
  return match ? decodeXml(match[1]) : "";
}

function parseFeed(xml) {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => {
      const block = match[1];
      let judul = readTag("title", block);
      const sumber = readTag("source", block) || readTag("news:source", block);
      if (sumber && judul.endsWith(" - " + sumber)) {
        judul = judul.slice(0, -(sumber.length + 3));
      }
      return {
        judul,
        sumber,
        tanggal: readTag("pubDate", block),
        link: readTag("link", block)
      };
    })
    .filter((item) => item.judul && item.link);

  const unik = new Map();
  items.forEach((item) => {
    const key = item.link || item.judul;
    if (!unik.has(key)) unik.set(key, item);
  });
  return [...unik.values()].slice(0, 15);
}

async function ambilDariFeed(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PytagoNews/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml, */*"
    },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error("Feed returned HTTP " + response.status);

  const xml = await response.text();
  const items = parseFeed(xml);
  if (!items.length) throw new Error("Feed tidak berisi berita yang dapat dibaca");
  return items;
}


async function ambilDariApiVercel() {
  const response = await fetch("https://nalarin-id.vercel.app/api/berita", {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("API Vercel returned HTTP " + response.status);

  const data = await response.json();
  if (!Array.isArray(data) || !data.length) {
    throw new Error("API Vercel tidak mengembalikan daftar berita");
  }

  const items = data
    .filter((item) => item && item.judul && item.link)
    .slice(0, 15);

  if (!items.length) throw new Error("Format berita dari API Vercel tidak valid");
  return items;
}

async function berita() {
  const hasil = await Promise.any([ambilDariApiVercel(), ...FEEDS.map((url) => ambilDariFeed(url))]);
  return Response.json(hasil, { headers: API_HEADERS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Social preview: both legacy .jpg and canonical .png URLs map to the JPEG asset.
    if (url.pathname === "/og-image.jpg" || url.pathname === "/og-image.png") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/og-image.png";
      const assetRequest = new Request(assetUrl, {
        method: request.method,
        headers: request.headers
      });
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      if (!assetResponse.ok) return assetResponse;
      const headers = new Headers(assetResponse.headers);
      headers.set("Content-Type", "image/jpeg");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers
      });
    }

    // Ensure social crawlers receive current Open Graph metadata from the root document.
    if (url.pathname === "/" && request.method === "GET") {
      const page = await env.ASSETS.fetch(request);
      if (!page.ok) return page;
      let html = await page.text();
      const imageUrl = "https://id.nalarine.workers.dev/og-image.png?v=4";
      html = html.split("https://id.nalarine.workers.dev/og-image.jpg?v=2").join(imageUrl);
      html = html.split("https://id.nalarine.workers.dev/og-image.png?v=3").join(imageUrl);
      if (!html.includes('property="og:image"')) {
        const socialTags =
          '<meta property="og:image" content="' + imageUrl + '">' +
          '<meta property="og:image:secure_url" content="' + imageUrl + '">' +
          '<meta property="og:image:type" content="image/jpeg">' +
          '<meta property="og:image:width" content="1376">' +
          '<meta property="og:image:height" content="768">' +
          '<meta name="twitter:card" content="summary_large_image">' +
          '<meta name="twitter:image" content="' + imageUrl + '">';
        html = html.replace("</head>", socialTags + "</head>");
      }
      const headers = new Headers(page.headers);
      headers.delete("Content-Length");
      headers.delete("Content-Encoding");
      headers.delete("ETag");
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return new Response(html, {
        status: page.status,
        statusText: page.statusText,
        headers
      });
    }

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
      } catch (error) {
        console.error("Gagal mengambil feed berita:", error);
        return Response.json(
          { error: "Sumber berita sedang tidak dapat dijangkau" },
          {
            status: 502,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "Cache-Control": "no-store"
            }
          }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
