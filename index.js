// Hayase Anilibria Extension v1.7 — точный матч названий, приоритет eng/romaji, без ложных "демон"

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

  if (!query.titles?.length) return [];

  console.log('[Anilibria] Названия из Hayase:', query.titles);
  console.log('[Anilibria] Эпизод:', query.episode ?? 'не указан');

  // Кандидаты на поиск: русское первыми, потом eng/romaji
  const candidates = [
    ...query.titles.filter(t => /[\u0400-\u04FFёЁ]/.test(t)).map(t => t.toLowerCase().trim().replace(/[:?!\.,]/g, '')),
    ...query.titles.map(t => t.toLowerCase().trim().replace(/[:?!\.,]/g, ''))
  ];

  const results = [];
  const maxPages = 8;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://anilibria.top/api/v1/anime/torrents?page=${page}`;
      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const items = data?.data || [];

      for (const item of items) {
        const release = item.release || {};
        const names = release.name || {};
        const mainLower = (names.main || '').toLowerCase().replace(/[:?!\.,]/g, '');
        const engLower = (names.english || '').toLowerCase().replace(/[:?!\.,]/g, '');
        const aliasLower = (release.alias || '').toLowerCase();

        let bestMatchScore = 0;
        let matchedTerm = '';

        for (const term of candidates) {
          if (term.length < 5) continue; // игнорим короткие

          // Точное совпадение или начало слова
          let score = 0;
          if (mainLower === term || engLower === term || aliasLower === term) score = 10;
          else if (mainLower.startsWith(term) || engLower.startsWith(term)) score = 8;
          else if (mainLower.includes(term) || engLower.includes(term)) score = 5;
          else if (term.includes('демон') && (mainLower.includes('демон') || engLower.includes('demon'))) score = 3; // слабый для Demon Slayer вариаций
          else if (aliasLower.includes(term.replace(/ /g, '-'))) score = 4;

          if (score > bestMatchScore) {
            bestMatchScore = score;
            matchedTerm = term;
          }
        }

        if (bestMatchScore < 5) continue; // слишком слабый матч — пропускаем

        console.log('[Anilibria] Совпадение (score ' + bestMatchScore + ') на странице', page, ':', names.main || names.english || release.alias, 'по термину:', matchedTerm);

        const targetEp = Number(query.episode) || 1;
        const epDesc = item.description || '';

        const matchesEp = !query.episode ||
          epDesc.includes(targetEp.toString()) ||
          epDesc.includes(`-${targetEp}`) ||
          epDesc.includes(`${targetEp}-`) ||
          (isBatch && epDesc.includes('-') && epDesc.split('-').length > 1);

        if (matchesEp && (item.seeders || 0) >= 5) {
          const magnet = item.magnet;
          if (!magnet) continue;

          results.push({
            title: `${names.main || names.english || release.alias || '—'} | ${item.quality?.value || '?'} | ${epDesc || '—'} (seeders: ${item.seeders || 0})`,
            link: magnet,
            id: item.id || item.hash,
            seeders: item.seeders || 0,
            leechers: item.leechers || 0,
            downloads: item.completed_times || 0,
            accuracy: 'medium',
            hash: item.hash,
            size: item.size || 0,
            date: item.created_at ? new Date(item.created_at) : null,
            type: isBatch ? 'batch' : '',
            score: bestMatchScore  // для внутренней сортировки
          });
        }
      }

      if (items.length < 25) break;
    } catch (err) {
      break;
    }
  }

  // Сортировка: сначала по score descending, потом по seeders descending
  results.sort((a, b) => b.score - a.score || b.seeders - a.seeders);

  console.log('[Anilibria] Итого подходящих (с seeders >=5):', results.length);
  return results;
}