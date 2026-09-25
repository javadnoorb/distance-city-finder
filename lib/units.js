export const DISTANCE_UNITS = {
  mi: { key: 'mi', name: 'miles', perMile: 1 },
  km: { key: 'km', name: 'kilometers', perMile: 1.609344 },
};

export const DEFAULT_UNIT = 'mi';

export function isDistanceUnit(value) {
  return Object.hasOwn(DISTANCE_UNITS, value);
}

export function toMiles(value, unit) {
  return value / DISTANCE_UNITS[unit].perMile;
}

export function fromMiles(miles, unit) {
  return miles * DISTANCE_UNITS[unit].perMile;
}

// Converts a distance typed in one unit to another, rounded to one decimal place.
export function convertDistance(value, fromUnit, toUnit) {
  return Math.round(fromMiles(toMiles(value, fromUnit), toUnit) * 10) / 10;
}
