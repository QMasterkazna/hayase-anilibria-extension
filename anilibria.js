const API = "https://api.anilibria.top/v1";
const BASE_VIDEO = "https://cache.libria.fun";

/**
 * Поиск аниме
 */
async function search(query) {
    try {
        const res = await fetch(`${API}/catalog?search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!data.items) return [];

        return data.items.map(a => ({
            id: a.id,
            title: a.names?.ru || a.names?.en || "Unknown",
            image: a.poster?.original || "",
            description: a.description || ""
        }));
    } catch (e) {
        console.error("Search error:", e);
        return [];
    }
}

/**
 * Детали аниме
 */
async function details(id) {
    try {
        const res = await fetch(`${API}/anime/${id}`);
        const data = await res.json();

        return {
            id: data.id,
            title: data.names?.ru || data.names?.en || "Unknown",
            image: data.poster?.original || "",
            description: data.description || "",
            status: data.status
        };
    } catch (e) {
        console.error("Details error:", e);
        return {};
    }
}

/**
 * Список эпизодов
 */
async function episodes(id) {
    try {
        const res = await fetch(`${API}/anime/${id}`);
        const data = await res.json();

        if (!data.player?.list) return [];

        return Object.keys(data.player.list).map(epNum => ({
            id: `${id}_${epNum}`,
            title: `Episode ${epNum}`,
            number: parseInt(epNum)
        })).sort((a, b) => a.number - b.number);
    } catch (e) {
        console.error("Episodes error:", e);
        return [];
    }
}

/**
 * Получение ссылки на поток
 */
async function stream(epId) {
    try {
        const [id, epNum] = epId.split("_");
        const res = await fetch(`${API}/anime/${id}`);
        const data = await res.json();

        const file = data.player?.list?.[epNum];
        if (!file) return [];

        const url = file.hls?.startsWith("http") ? file.hls : `${BASE_VIDEO}${file.hls}`;

        return [{
            quality: file.resolution || "720p",
            url
        }];
    } catch (e) {
        console.error("Stream error:", e);
        return [];
    }
}

module.exports = {
    search,
    details,
    episodes,
    stream
};