/**
 * Forward geocoding via Photon (OSM data, browser-friendly CORS).
 * @see https://photon.komoot.io
 */

/**
 * @param {string} query
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{ id: string, lat: number, lng: number, label: string }>>}
 */
export async function searchPlaces(query, signal) {
  const q = String(query ?? '').trim();
  if (q.length < 2) {
    return [];
  }

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error('Search failed. Try again.');
  }
  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];

  return features.map((f, i) => {
    const coords = f.geometry?.coordinates;
    const lng = coords?.[0];
    const lat = coords?.[1];
    const p = f.properties ?? {};
    const label = formatPhotonLabel(p, lat, lng);
    return {
      id: `ph-${i}-${p.osm_id ?? 'x'}-${lat}-${lng}`,
      lat,
      lng,
      label,
    };
  }).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}

function formatPhotonLabel(p, lat, lng) {
  const parts = [
    p.name,
    p.street && p.housenumber ? `${p.housenumber} ${p.street}` : p.street,
    p.district,
    p.city || p.town || p.village || p.locality,
    p.state,
    p.country,
  ].filter(Boolean);
  if (parts.length) {
    return [...new Set(parts)].join(', ');
  }
  if (p.name) {
    return p.name;
  }
  return typeof lat === 'number' && typeof lng === 'number'
    ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    : '';
}

const reverseCache = new Map();

/**
 * Reverse geocode lat/lng to a short place label (city / locality) via Photon.
 * Results are cached in-memory per session.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export async function reverseGeocodeLatLng(lat, lng, signal) {
  const lt = Number(lat);
  const lg = Number(lng);
  if (!Number.isFinite(lt) || !Number.isFinite(lg)) {
    return '';
  }
  const key = `${lt.toFixed(5)},${lg.toFixed(5)}`;
  const hit = reverseCache.get(key);
  if (hit) return hit;

  const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lt)}&lon=${encodeURIComponent(lg)}&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    return '';
  }
  const data = await res.json();
  const f = data?.features?.[0];
  const p = f?.properties ?? {};
  const label = formatPhotonLabel(p, lt, lg);
  const short = shortenPlaceLabel(label);
  const out = short || label || '';
  if (out) reverseCache.set(key, out);
  return out;
}

function shortenPlaceLabel(label) {
  const s = String(label ?? '').trim();
  if (!s) return '';
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }
  return parts[0] ?? s;
}
