// Wetter für die Wand über Open-Meteo (kostenlos, ohne API-Schlüssel).
let cached = { key: null, at: 0, data: null };

export async function getWeather(place) {
  if (!place || typeof place.lat !== 'number' || typeof place.lon !== 'number') return null;
  const key = `${place.lat},${place.lon}`;
  if (cached.key === key && Date.now() - cached.at < 20 * 60000) return cached.data;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: place.lat, longitude: place.lon, timezone: 'auto', forecast_days: '5',
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Wetterdienst antwortet mit ${res.status}`);
  const j = await res.json();
  const data = {
    place: place.name,
    now: { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, isDay: !!j.current.is_day },
    days: j.daily.time.map((d, i) => ({
      date: d, code: j.daily.weather_code[i],
      max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]),
      rain: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[i] : null,
    })),
  };
  cached = { key, at: Date.now(), data };
  return data;
}

export async function geocode(q) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: q, count: '6', language: 'de', format: 'json' }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Ortssuche antwortet mit ${res.status}`);
  const j = await res.json();
  return (j.results || []).map((r) => ({
    name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude,
  }));
}
