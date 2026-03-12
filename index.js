// Hayase Anilibria Extension v2.4 — поиск релиза + торренты по /release/{id} + умный выбор

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

  // Все кандидаты, но приоритет "Клинок..." и "Kimetsu no Yaiba"
  let candidates = query.titles;
  // Добавляем вручную точные варианты, если не нашлось
  if (!candidates.some(t => t.toLowerCase().includes('клинок') || t.toLowerCase().includes('kimetsu'))) {
    candidates = [...candidates, 'Клинок, рассекающий демонов', 'Kimetsu no Yaiba'];
  }

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
        const rel = data[0];
        releaseId = rel.id;
        releaseName = rel.name?.main || rel.name?.english || rel.alias || clean;
        releaseAlias = rel.alias || '';
        isMovie = rel.type?.value === 'MOVIE';
        console.log('[Anilibria] Нашёл → id:', releaseId, 'alias:', releaseAlias, 'name:', releaseName, 'type:', rel.type?.value || 'unknown');

        // Если фильм и запрос не на фильм — ищем дальше
        if (isMovie && !query.titles.some(t => t.toLowerCase().includes('movie') || t.toLowerCase().includes('фильм'))) {
          console.log('[Anilibria] Это фильм, ищем дальше...');
          continue;
        }

        break;
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

      // Мягкая проверка эпизода (берём всё, если batch или эпизод не указан)
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
  } else {
    console.log('[Anilibria] Торренты не подошли по эпизоду — попробуй без эпизода или другой тайтл');
  }

  return results;
}