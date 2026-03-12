// Hayase Anilibria Extension v1.5 — цикл по страницам /anime/torrents + точный клиентский поиск

export default {
  async test() {
    try {
      const res = await fetch('https://anilibria.top/api/v1/anime/torrents?page=1');
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

  // Русское название в lowercase для поиска
  const rusTitle = query.titles.find(t => /[\u0400-\u04FFёЁ]/.test(t)) || query.titles[0] || '';
  const searchLower = rusTitle.toLowerCase().trim().replace(/[:?!\.,]/g, ''); // убираем пунктуацию

  console.log('[Anilibria] Ищем по (очищенному русскому):', searchLower);

  const results = [];
  const maxPages = 5; // 5 страниц × 25 = 125 элементов — для теста; можно увеличить до 10–20

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://anilibria.top/api/v1/anime/torrents?page=${page}`;
      const res = await fetch(url);

      if (!res.ok) {
        console.log('[Anilibria] Страница', page, 'не OK:', res.status);
        break;
      }

      const data = await res.json();
      const items = data?.data || [];

      console.log('[Anilibria] Страница', page, 'элементов:', items.length);

      for (const item of items) {
        const release = item.release || {};
        const names = release.name || {};
        const main = (names.main || '').toLowerCase().replace(/[:?!\.,]/g, '');
        const eng = (names.english || '').toLowerCase().replace(/[:?!\.,]/g, '');
        const alias = (release.alias || '').toLowerCase();

        // Матч: если хотя бы часть названия совпадает
        const matches = main.includes(searchLower) ||
                        eng.includes(searchLower) ||
                        searchLower.includes(main) ||
                        alias.includes(searchLower.replace(/ /g, '-')) ||
                        main.includes('демонов') && searchLower.includes('демон'); // для Demon Slayer вариаций

        if (!matches) continue;

        console.log('[Anilibria] Совпадение на странице', page, ':', names.main || names.english || alias);

        const targetEp = Number(query.episode) || 1;
        const epDesc = item.description || ''; // "1-9", "12" и т.д.

        const matchesEp = !query.episode ||
          epDesc.includes(targetEp.toString()) ||
          epDesc.includes(`-${targetEp}`) ||
          epDesc.includes(`${targetEp}-`) ||
          epDesc.includes(`[${targetEp}]`) ||
          (isBatch && epDesc.includes('-') && epDesc.split('-')[1] > epDesc.split('-')[0]);

        if (matchesEp) {
          const magnet = item.magnet;
          if (!magnet) continue;

          results.push({
            title: `${names.main || names.english || release.alias || '—'} | ${item.quality?.value || '?'} | ${epDesc || '—'}`,
            link: magnet,
            id: item.id || item.hash,
            seeders: item.seeders || 0,
            leechers: item.leechers || 0,
            downloads: item.completed_times || 0,
            accuracy: 'medium',
            hash: item.hash,
            size: item.size || 0,
            date: item.created_at ? new Date(item.created_at) : null,
            type: isBatch ? 'batch' : ''
          });
        }
      }

      if (items.length < 25) break; // последняя страница
    } catch (err) {
      console.error('[Anilibria] Ошибка на странице', page, ':', err.message);
      break;
    }
  }

  console.log('[Anilibria] Итого подходящих торрентов:', results.length);
  return results;
}