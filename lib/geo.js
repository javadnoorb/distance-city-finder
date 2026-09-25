export const EARTH_RADIUS_MILES = 3958.7613;
export const RING_SEGMENTS = 180;

export function haversineMiles(latitudeA, longitudeA, latitudeB, longitudeB) {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeARadians) * Math.cos(latitudeBRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function toDegrees(value) {
  return (value * 180) / Math.PI;
}

export function buildDistanceRing(origin, distanceMiles) {
  const angularDistance = distanceMiles / EARTH_RADIUS_MILES;
  const latitude = toRadians(origin.latitude);
  const longitude = toRadians(origin.longitude);
  const points = [];
  let previousLongitude = origin.longitude;

  for (let step = 0; step <= RING_SEGMENTS; step += 1) {
    const bearing = (step / RING_SEGMENTS) * 2 * Math.PI;
    const pointLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(pointLatitude),
      );
    // Unwrap each point relative to the previous one so the ring never jumps across the map.
    previousLongitude = unwrapLongitude(toDegrees(pointLongitude), previousLongitude);
    points.push([toDegrees(pointLatitude), previousLongitude]);
  }

  // A ring around a pole spans every longitude, so shift it by whole turns to center it on the origin.
  const meanLongitude = points.reduce((sum, [, pointLongitude]) => sum + pointLongitude, 0) / points.length;
  const shift = 360 * Math.round((origin.longitude - meanLongitude) / 360);
  return points.map(([pointLatitude, pointLongitude]) => [pointLatitude, pointLongitude + shift]);
}

export function unwrapLongitude(longitude, referenceLongitude) {
  return referenceLongitude + normalizeLongitude(longitude - referenceLongitude);
}

export function normalizeLongitude(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

// True when the circle of the given radius around the origin passes over a pole,
// which means it cannot be drawn as a closed polygon on a flat map.
export function ringEnclosesPole(origin, distanceMiles) {
  const milesToNorthPole = EARTH_RADIUS_MILES * toRadians(90 - origin.latitude);
  const milesToSouthPole = EARTH_RADIUS_MILES * toRadians(90 + origin.latitude);
  return distanceMiles >= Math.min(milesToNorthPole, milesToSouthPole);
}
