import { isDistanceUnit } from './units.js';

// Short URL parameter names for each search field.
const PARAMS = {
  location: 'from',
  distance: 'd',
  margin: 'm',
  minPopulation: 'pop',
  unit: 'unit',
};

export function searchToQueryString(search) {
  const params = new URLSearchParams();
  for (const [field, param] of Object.entries(PARAMS)) {
    const value = String(search[field] ?? '').trim();
    if (value) {
      params.set(param, value);
    }
  }
  return params.toString();
}

// Reads a search back from a query string. Returns null unless it has at least a
// location and a distance; values are checked but left as strings for the form.
export function searchFromQueryString(queryString) {
  const params = new URLSearchParams(queryString);
  const search = {};
  for (const [field, param] of Object.entries(PARAMS)) {
    search[field] = (params.get(param) || '').trim();
  }

  if (!search.location || !isNonNegativeNumber(search.distance)) {
    return null;
  }
  for (const field of ['margin', 'minPopulation']) {
    if (search[field] && !isNonNegativeNumber(search[field])) {
      search[field] = '';
    }
  }
  if (!isDistanceUnit(search.unit)) {
    search.unit = '';
  }

  return search;
}

function isNonNegativeNumber(value) {
  const number = Number(value);
  return value !== '' && Number.isFinite(number) && number >= 0;
}
