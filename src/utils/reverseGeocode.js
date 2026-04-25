/**
 * Resolve a short address line from coordinates (OpenStreetMap Nominatim).
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocodeLatLng(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(la))}&lon=${encodeURIComponent(String(lo))}&format=json`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) return '';
    const data = await res.json();
    const addr = data?.address;
    if (addr && typeof addr === 'object') {
      const road = typeof addr.road === 'string' ? addr.road : '';
      const suburb = typeof addr.suburb === 'string' ? addr.suburb : '';
      const city =
        typeof addr.city === 'string'
          ? addr.city
          : typeof addr.town === 'string'
            ? addr.town
            : typeof addr.village === 'string'
              ? addr.village
              : '';
      const state = typeof addr.state === 'string' ? addr.state : '';
      const parts = [road, suburb || city, state].filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    if (typeof data?.display_name === 'string' && data.display_name.trim()) {
      const dn = data.display_name.trim();
      return dn.length > 120 ? `${dn.slice(0, 117)}…` : dn;
    }
    return '';
  } catch {
    return '';
  }
}
