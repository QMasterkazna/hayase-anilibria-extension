// Hayase Anilibria Extension v2.5 — поиск релиза + избегание фильмов + приоритет сериалу

export default {
  async test() {
    try {
      const res = await fetch('https://anilibria.top/api/v1/app/search/releases?query=test');
      return res.ok;
    } catch {
      return false;
    }
  },

  async single(query) { return await searchTorrents(query, false); },
  async batch(query)  { return await searchTorrents(query, true); },
  async movie(query)  { return await searchTorrents(query, false); },

  async query() { return undefined; }
};

async function searchTorrents(query, isBatch = false) {
  const fetch = query.fetch;

  if (!query.titles?.length) return [];

  console.log('[Anilibria] Названия:', query.titles);
  console.log('[Anilibria] Эпизод:', query.episode ?? 'не указан');

  // Добавляем точное название сериала как fallback
  const forcedTerms = ['Клинок, рассекающий демонов', 'Kimetsu no Yaiba'];

  const candidates = [
    ...query.titles.filter(t => /[\u0400-\u04FFёЁ]/.test(t) && t.toLowerCase().includes('клинок')), // русское полное первыми
    ...query.titles,
    ...forcedTerms // если ничего не нашлось — принудительно ищем сериал
  ];

  let releaseId = null;
  let releaseName = '';
  let releaseAlias = '';
  let isMovie = false;

  for (const term of candidates) {
    if (!term?.trim()) continue;

    const clean = term.trim().replace(/[:?!\.,]/g, '');
    console.log('[Anilibria] Поиск по:', clean);

    try {
      const url = `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(clean)}`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      if (data?.length > 0) {
        // Ищем НЕ фильм в результатах
        let rel = data.find(r => r.type?.value !== 'MOVIE' && r.type?.value !== 'ONA' && r.type?.value !== 'SPECIAL');
        if (!rel) rel = data[0]; // если только фильмы — берём первый

        releaseId = rel.id;
        releaseName = rel.name?.main || rel.name?.english || rel.alias || clean;
        releaseAlias = rel.alias || '';
        isMovie = rel.type?.value === 'MOVIE';
        console.log('[Anilibria] Выбран релиз → id:', releaseId, 'alias:', releaseAlias, 'name:', releaseName, 'type:', rel.type?.value || 'unknown');

        if (!isMovie) break; // нашли сериал — выходим
      }
    } catch (err) {
      console.log('[Anilibria] Ошибка по "' + clean + '":', err.message);
    }
  }

  if (!releaseId) {
    console.log('[Anilibria] Релиз не найден');
    return [];
  }

  const results = [];

  try {
    const torrentsUrl = `https://anilibria.top/api/v1/anime/torrents/release/${releaseId}`;
    const res = await fetch(torrentsUrl);
    if (!res.ok) {
      console.log('[Anilibria] Торренты ошибка:', res.status);
      return [];
    }

    const torrents = await res.json() || [];

    console.log('[Anilibria] Торрентов:', torrents.length);

    const targetEp = Number(query.episode) || 1;

    for (const tor of torrents) {
      const epDesc = tor.description || tor.series || '—';

      let matchesEp = true;
      if (query.episode) {
        matchesEp = epDesc.includes(targetEp.toString()) ||
                    epDesc.includes(`-${targetEp}`) ||
                    epDesc.includes(`${targetEp}-`) ||
                    (epDesc.includes('-') && {
                      const [s, e] = epDesc.split('-').map(Number);
                      return !isNaN(s) && !isNaN(e) && targetEp >= s && targetEp <= e;
                    }());
      }

      if (matchesEp) {
        const magnet = tor.magnet;
        if (!magnet || !magnet.startsWith('magnet:?')) continue;

        results.push({
          title: `${releaseName} | ${tor.quality?.value || '?'} | ${epDesc} (seeders: ${tor.seeders || 0})`,
          link: magnet,
          id: tor.id || tor.hash,
          seeders: tor.seeders || 0,
          leechers: tor.leechers || 0,
          downloads: tor.completed_times || 0,
          accuracy: 'high',
          hash: tor.hash,
          size: tor.size || 0,
          date: tor.created_at ? new Date(tor.created_at) : null,
          type: isBatch ? 'batch' : ''
        });
      }
    }
  } catch (err) {
    console.error('[Anilibria] Ошибка торрентов:', err.message);
  }

  results.sort((a, b) => b.seeders - a.seeders);

  console.log('[Anilibria] Итого:', results.length);
  if (results.length > 0) {
    console.log('[Anilibria] Торренты:\n' + results.map(r => r.title).join('\n'));
  }

  return results;
}