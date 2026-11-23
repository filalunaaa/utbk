const FEED =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('UTBK OR SNBT OR SNPMB OR TKA OR "Tes Kemampuan Akademik"') +
  '&hl=id&gl=ID&ceid=ID:id';

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function ambil(tag, blok) {
  const m = blok.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? decode(m[1]) : '';
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(FEED, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('status ' + r.status);
    const xml = await r.text();

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 15)
      .map((m) => {
        const b = m[1];
        let judul = ambil('title', b);
        const sumber = ambil('source', b);
        if (sumber && judul.endsWith(' - ' + sumber)) {
          judul = judul.slice(0, -(sumber.length + 3));
        }
        return { judul, sumber, tanggal: ambil('pubDate', b), link: ambil('link', b) };
      });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
    res.status(200).json(items);
  } catch (e) {
    res.status(500).json({ error: 'Berita belum bisa dimuat' });
  }
};
