// Hayase Anilibria Extension v1.9 — seeders >=0, score >=7, больше логов seeders

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

  // Кандидаты: eng/romaji первыми
  const engRomaji = query.titles
    .filter(t => !/[\u0400-\u04FFёЁ]/.test(t) && t.length > 5)
    .map(t => t.toLowerCase().trim().replace(/[:?!\.,]/g, ''));

  const rus = query.titles
    .filter(t => /[\u0400-\u04FFёЁ]/.test(t))
    .map(t => t.toLowerCase().trim().replace(/[:?!\.,]/g, ''));

  const candidates = [...engRomaji, ...rus];

  console.log('[Anilibria] Кандидаты поиска (eng первыми):', candidates);

  const results = [];
  const maxPages = 8;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://anilibria.top/api/v1/anime/torrents?page=${page}`;
      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const items = data?.data || [];

      console.log('[Anilibria] Страница', page, 'элементов:', items.length);

      for (const item of items) {
        const release = item.release || {};
        const names = release.name || {};
        const mainLower = (names.main || '').toLowerCase().replace(/[:?!\.,]/g, '');
        const engLower = (names.english || '').toLowerCase().replace(/[:?!\.,]/g, '');
        const aliasLower = (release.alias || '').toLowerCase();

        let bestScore = 0;
        let matchedBy = '';

        for (const term of candidates) {
          if (term.length < 5) continue;

          let score = 0;
          if (mainLower === term || engLower === term || aliasLower === term) { score = 10; matchedBy = 'exact'; }
          else if (mainLower.startsWith(term) || engLower.startsWith(term)) { score = 9; matchedBy = 'startsWith'; }
          else if (mainLower.includes(term) || engLower.includes(term)) { score = 7; matchedBy = 'includes'; }
          else if (aliasLower.includes(term.replace(/ /g, '-'))) { score = 6; matchedBy = 'alias'; }

          if ((term.includes('kimetsu') || term.includes('yaiba') || term.includes('slayer') || term.includes('демон')) &&
              (mainLower.includes('kimetsu') || engLower.includes('kimetsu') || mainLower.includes('демон') || engLower.includes('demon'))) {
            score = Math.max(score, 8);
            matchedBy += ' + demon-slayer-boost';
          }

          if (score > bestScore) bestScore = score;
        }

        if (bestScore < 7) continue;

        const seed = item.seeders || 0;
        console.log('[Anilibria] Совпадение (score ' + bestScore + ', by ' + matchedBy + ') на стр. ' + page + ': ' + (names.main || names.english || release.alias) + ' | seeders: ' + seed + ' | magnet: ' + (item.magnet ? 'yes' : 'no'));

        const targetEp = Number(query.episode) || 1;
        const epDesc = item.description || '';

        const matchesEp = !query.episode ||
          epDesc.includes(targetEp.toString()) ||
          epDesc.includes(`-${targetEp}`) ||
          epDesc.includes(`${targetEp}-`) ||
          (isBatch && epDesc.includes('-') && epDesc.split('-').length > 1);

        if (matchesEp) {
          const magnet = item.magnet;
          if (!magnet || !magnet.startsWith('magnet:?')) continue;

          results.push({
            title: `${names.main || names.english || release.alias || '—'} | ${item.quality?.value || '?'} | ${epDesc || '—'} (seeders: ${seed})`,
            link: magnet,
            id: item.id || item.hash,
            seeders: seed,
            leechers: item.leechers || 0,
            downloads: item.completed_times || 0,
            accuracy: 'medium',
            hash: item.hash,
            size: item.size || 0,
            date: item.created_at ? new Date(item.created_at) : null,
            type: isBatch ? 'batch' : '',
            score: bestScore
          });
        }
      }

      if (items.length < 25) break;
    } catch (err) {
      console.error('[Anilibria] Ошибка стр. ' + page + ':', err.message);
      break;
    }
  }

  results.sort((a, b) => b.score - a.score || b.seeders - a.seeders);

  console.log('[Anilibria] Итого подходящих:', results.length);
  if (results.length > 0) {
    console.log('[Anilibria] Список найденных:', results.map(r => r.title + ' (score ' + r.score + ', seeders ' + r.seeders + ')').join('\n'));
  } else {
    console.log('[Anilibria] Ничего не нашлось — попробуй увеличить maxPages или проверить seeders в API');
  }

  return results;
}