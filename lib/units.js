export const DISTANCE_UNITS = {
  mi: { key: 'mi', name: 'miles', perMile: 1 },
  km: { key: 'km', name: 'kilometers', perMile: 1.609344 },
};

export const DEFAULT_UNIT = 'mi';

export function isDistanceUnit(value) {
  // Object.hasOwn would be neater but breaks the page in browsers from before 2022.
  return Object.prototype.hasOwnProperty.call(DISTANCE_UNITS, value);
}

export function toMiles(value, unit) {
  return value / DISTANCE_UNITS[unit].perMile;
}

export function fromMiles(miles, unit) {
  return miles * DISTANCE_UNITS[unit].perMile;
}

export function convertDistance(value, fromUnit, toUnit) {
  return fromMiles(toMiles(value, fromUnit), toUnit);
}

// Rounds a distance to one decimal place for display in a form field.
export function roundDistance(value) {
  return Math.round(value * 10) / 10;
}
