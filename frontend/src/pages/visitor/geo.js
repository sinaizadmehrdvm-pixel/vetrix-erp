// Shared geo helpers for the Visitor module - haversine distance and a
// best-effort current-position getter, used by both the customer list
// (distance sorting) and the check-in/check-out flow (geofence display).

export function haversineMeters(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) {
    return null;
  }
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// `n` is the shared number formatter from useLanguage() (Intl.NumberFormat
// under the hood) - passed in rather than a bare `language` string so this
// renders through the exact same locale/digit convention as every other
// number in the app (Persian digits for fa, the app's established
// convention for ar, Latin for tr/en) instead of a hand-rolled regex that
// only ever handled the fa case.
export function formatDistance(meters, n) {
  if (meters === null || meters === undefined) return null;
  if (meters < 1000) {
    return `${n(Math.round(meters))} m`;
  }
  return `${n(meters / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function getCurrentPosition(options = { enableHighAccuracy: true, timeout: 10000 }) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      options
    );
  });
}
