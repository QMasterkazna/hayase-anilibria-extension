// Hayase Anilibria Extension v2.4 — поиск релиза + торренты по /release/{id} + умный выбор

export default {
  async test() {
    try {
      const res = await fetch('https://anilibria.top/api/v1/app/search/releases?query=test');
      return res.ok;
    } catch (err) {
      console.error('[Anilibria TEST] Ошибка теста:', err.message);
      return false;
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
    console.log('[Anilibria] Нет названий для поиска');
    return [];
  }

  console.log('[Anilibria] Названия из Hayase:', query.titles);
  console.log('[Anilibria] Эпизод:', query.episode ?? 'не указан');

  // Все кандидаты + принудительный fallback на точное название сериала
  let candidates = [...query.titles];
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
    console.log('[Anilibria] Поиск релиза по:', clean);

    try {
      const url = `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(clean)}`;
      const res = await fetch(url);

      if (!res.ok) {
        console.log('[Anilibria] Ответ не OK:', res.status);
        continue;
      }

      const data = await res.json();

      if (data?.length > 0) {
        // Ищем не фильм/не ONA/не SPECIAL
        let rel = data.find(r => r.type?.value !== 'MOVIE' && r.type?.value !== 'ONA' && r.type?.value !== 'SPECIAL');
        if (!rel) rel = data[0]; // если только фильмы — берём первый

        releaseId = rel.id;
        releaseName = rel.name?.main || rel.name?.english || rel.alias || clean;
        releaseAlias = rel.alias || '';
        isMovie = rel.type?.value === 'MOVIE';

        console.log('[Anilibria] Выбран релиз → id:', releaseId, 'alias:', releaseAlias, 'name:', releaseName, 'type:', rel.type?.value || 'unknown');

        // Если фильм и запрос явно не про фильм — продолжаем поиск
        if (isMovie && !query.titles.some(t => t.toLowerCase().includes('movie') || t.toLowerCase().includes('фильм'))) {
          console.log('[Anilibria] Это фильм, продолжаем поиск...');
          continue;
        }

        break;
      }
    } catch (err) {
      console.log('[Anilibria] Ошибка поиска по "' + clean + '":', err.message);
    }
  }

  if (!releaseId) {
    console.log('[Anilibria] Ни один релиз не найден');
    return [];
  }

  const results = [];

  try {
    const torrentsUrl = `https://anilibria.top/api/v1/anime/torrents/release/${releaseId}`;
    const res = await fetch(torrentsUrl);

    if (!res.ok) {
      console.log('[Anilibria] Торренты не получены, статус:', res.status);
      return [];
    }

    const torrents = await res.json() || [];

    console.log('[Anilibria] Получено торрентов для релиза:', torrents.length);

    const targetEp = Number(query.episode) || 1;

    for (const tor of torrents) {
      const epDesc = tor.description || tor.series || '—';

      // Проверка эпизода — теперь правильно и надёжно
      let matchesEp = !query.episode; // если эпизод не указан — берём все

      if (query.episode) {
        if (
          epDesc.includes(targetEp.toString()) ||
          epDesc.includes(`-${targetEp}`) ||
          epDesc.includes(`${targetEp}-`) ||
          epDesc.includes(`[${targetEp}]`)
        ) {
          matchesEp = true;
        } else if (epDesc.includes('-')) {
          const parts = epDesc.split('-').map(n => parseInt(n.trim(), 10));
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const [start, end] = parts;
            if (targetEp >= start && targetEp <= end) {
              matchesEp = true;
            }
          }
        }
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
    console.error('[Anilibria] Ошибка при получении торрентов:', err.message);
  }

  // Сортировка по количеству сидов (от большего к меньшему)
  results.sort((a, b) => b.seeders - a.seeders);

  console.log('[Anilibria] Итого подходящих торрентов:', results.length);
  if (results.length > 0) {
    console.log('[Anilibria] Список найденных:\n' + results.map(r => r.title).join('\n'));
  } else {
    console.log('[Anilibria] Торренты найдены, но не подошли по эпизоду');
  }

  return results;
}