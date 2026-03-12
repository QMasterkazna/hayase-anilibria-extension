// Hayase Anilibria Extension v1.3 — 2026, фокус на v1 + русское название + диагностика

export default {
  async test() {
    try {
      const res = await fetch('https://api.anilibria.top/v1/title/random');
      console.log('[Anilibria TEST] Status:', res.status);
      return res.ok;
    } catch (err) {
      console.error('[Anilibria TEST] Ошибка:', err.message);
      throw err;
    }
  },

  async single(query) { return await searchTorrents(query, false); },
  async batch(query)  { return await searchTorrents(query, true);  },
  async movie(query)  { return await searchTorrents(query, false); },

  async query() { return undefined; }
};

async function searchTorrents(query, isBatch = false) {
  const fetch = query.fetch;

  if (!query.titles?.length) {
    console.log('[Anilibria] Нет названий');
    return [];
  }

  console.log('[Anilibria] Названия:', query.titles);
  console.log('[Anilibria] Эпизод:', query.episode ?? 'не указан');

  // Только русское название (первое с кириллицей)
  let searchTerm = query.titles.find(t => /[\u0400-\u04FFёЁ]/.test(t)) || query.titles[0] || '';
  if (!searchTerm.trim()) {
    console.log('[Anilibria] Нет подходящего термина');
    return [];
  }

  console.log('[Anilibria] Основной поиск по (русскому):', searchTerm);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 сек таймаут

    const url = `https://api.anilibria.top/v1/title/search?search=${encodeURIComponent(searchTerm)}&limit=5`;
    const res = await fetch(url, { signal: controller.signal });

    clearTimeout(timeoutId);

    console.log('[Anilibria] Ответ статус:', res.status);

    if (!res.ok) {
      const text = await res.text().catch(() => '—');
      console.log('[Anilibria] Ошибка API:', res.status, text.substring(0, 200));
      return [];
    }

    const data = await res.json();
    console.log('[Anilibria] Ответ (первые 200 символов):', JSON.stringify(data).substring(0, 200));

    if (!data?.list?.length) {
      console.log('[Anilibria] list пустой или отсутствует');
      return [];
    }

    const anime = data.list[0];
    console.log('[Anilibria] Нашёл:', anime?.names?.ru || anime?.names?.en || anime?.code || 'без имени');

    const results = [];
    const targetEp = Number(query.episode) || 1;

    for (const tor of anime.torrents?.list || []) {
      const epStr = tor.series || tor.episodes?.string || tor.episodes_range || tor.ep || '';
      const epFrom = tor.episodes?.first ?? 0;
      const epTo = tor.episodes?.last ?? epFrom;

      const matches = !query.episode ||
        (targetEp >= epFrom && targetEp <= epTo) ||
        epStr.includes(targetEp.toString()) ||
        (isBatch && epTo > epFrom);

      if (matches) {
        const link = tor.magnet || (tor.url ? `https://anilibria.top${tor.url}` : null);
        if (!link) continue;

        results.push({
          title: `${anime.names?.ru || anime.code || '—'} | ${tor.quality?.string || '?'} | ${epStr || '—'}`,
          link,
          id: tor.id || tor.hash,
          seeders: tor.seeders || 0,
          leechers: tor.leechers || 0,
          accuracy: 'medium',
          hash: tor.hash,
          size: tor.total_size || tor.size || 0,
          date: tor.time ? new Date(tor.time * 1000) : null,
          type: isBatch ? 'batch' : ''
        });
      }
    }

    console.log('[Anilibria] Торрентов найдено:', results.length);
    return results;

  } catch (err) {
    console.error('[Anilibria] Критическая ошибка:', err.name, err.message);
    if (err.name === 'AbortError') console.log('[Anilibria] Таймаут запроса');
    return [];
  }
}