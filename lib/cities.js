import { haversineMiles } from './geo.js';

export const CITY_NAME_INDEX = 0;
export const COUNTRY_INDEX = 1;
export const POPULATION_INDEX = 2;
export const LATITUDE_INDEX = 3;
export const LONGITUDE_INDEX = 4;

// Returns every city within [lowerBound, upperBound] miles of the origin with at least
// minPopulation people, largest first.
export function findCitiesInRing(cities, origin, lowerBound, upperBound, minPopulation = 0) {
  const matches = [];
  for (const city of cities) {
    if (city[POPULATION_INDEX] < minPopulation) {
      continue;
    }
    const distance = haversineMiles(origin.latitude, origin.longitude, city[LATITUDE_INDEX], city[LONGITUDE_INDEX]);
    if (distance >= lowerBound && distance <= upperBound) {
      matches.push({ city, distance });
    }
  }

  matches.sort((left, right) => right.city[POPULATION_INDEX] - left.city[POPULATION_INDEX]);
  return matches;
}

export function parseCoordinates(input) {
  const match = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    return null;
  }

  const latitude = Number.parseFloat(match[1]);
  const longitude = Number.parseFloat(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Coordinates must be within valid latitude and longitude ranges.');
  }

  return { latitude, longitude };
}

export function looksLikeCoordinates(input) {
  return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d*(?:\.\d+)?\s*$/.test(input);
}

export function buildCitySearchIndex(cities) {
  const entriesByLabel = new Map();

  for (const city of cities) {
    const cityName = city[CITY_NAME_INDEX];
    const countryCode = city[COUNTRY_INDEX];
    const label = `${cityName}, ${countryCode}`;
    const entry = entriesByLabel.get(label);

    if (entry && entry.population >= city[POPULATION_INDEX]) {
      continue;
    }

    entriesByLabel.set(label, {
      label,
      population: city[POPULATION_INDEX],
      latitude: city[LATITUDE_INDEX],
      longitude: city[LONGITUDE_INDEX],
      normalizedCityName: normalizeText(cityName),
      normalizedCountry: normalizeText(countryCode),
      normalizedLabel: normalizeText(label),
    });
  }

  const entries = Array.from(entriesByLabel.values());
  const buckets = new Map();

  for (const entry of entries) {
    const prefixes = collectSearchPrefixes(entry);
    for (const prefix of prefixes) {
      const bucket = buckets.get(prefix);
      if (bucket) {
        bucket.push(entry);
      } else {
        buckets.set(prefix, [entry]);
      }
    }
  }

  return { entries, buckets };
}

export function collectSearchPrefixes(entry) {
  const prefixes = new Set();
  const addPrefixes = (value) => {
    for (let length = 1; length <= Math.min(3, value.length); length += 1) {
      prefixes.add(value.slice(0, length));
    }
  };

  addPrefixes(entry.normalizedCityName);
  addPrefixes(entry.normalizedCountry);

  for (const token of entry.normalizedCityName.split(/\s+/)) {
    addPrefixes(token);
  }

  return prefixes;
}

export function findCitySuggestions(input, citySearchIndex, limit = 1) {
  return findRankedCitySuggestions(input, citySearchIndex, limit).map((suggestion) => suggestion.entry);
}

export function findRankedCitySuggestions(input, citySearchIndex, limit) {
  const { normalizedQuery, normalizedCountry } = parseLocationQuery(input);
  if (!normalizedQuery) {
    return [];
  }

  const bucketKey = normalizedQuery.slice(0, Math.min(3, normalizedQuery.length));
  const candidates = citySearchIndex.buckets.get(bucketKey) || citySearchIndex.entries;
  const suggestions = [];

  for (const entry of candidates) {
    const score = scoreCityMatch(entry, normalizedQuery, normalizedCountry);
    if (!Number.isFinite(score)) {
      continue;
    }

    insertRankedSuggestion(suggestions, entry, score, limit);
  }

  return suggestions;
}

export function parseLocationQuery(input) {
  const [namePart, ...countryParts] = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    normalizedQuery: normalizeText(namePart || input),
    normalizedCountry: normalizeText(countryParts.join(' ')),
  };
}

export function scoreCityMatch(entry, normalizedQuery, normalizedCountry) {
  let score = Number.POSITIVE_INFINITY;

  if (entry.normalizedCityName === normalizedQuery) {
    score = 0;
  } else if (entry.normalizedLabel === normalizeText(`${normalizedQuery}, ${normalizedCountry}`)) {
    score = 0;
  } else if (entry.normalizedCityName.startsWith(normalizedQuery)) {
    score = 1;
  } else if (entry.normalizedCityName.includes(` ${normalizedQuery}`)) {
    score = 2;
  } else if (entry.normalizedLabel.startsWith(normalizedQuery)) {
    score = 3;
  } else if (
    entry.normalizedLabel.includes(` ${normalizedQuery}`) ||
    entry.normalizedLabel.includes(`, ${normalizedQuery}`)
  ) {
    score = 4;
  }

  if (!Number.isFinite(score)) {
    return score;
  }

  if (!normalizedCountry) {
    return score;
  }

  if (entry.normalizedCountry === normalizedCountry) {
    return score - 0.5;
  }

  if (entry.normalizedCountry.startsWith(normalizedCountry)) {
    return score + 0.25;
  }

  return Number.POSITIVE_INFINITY;
}

export function insertRankedSuggestion(suggestions, entry, score, limit) {
  const candidate = { entry, score };
  let index = suggestions.findIndex((suggestion) => compareRankedSuggestions(candidate, suggestion) < 0);

  if (index === -1) {
    index = suggestions.length;
  }

  suggestions.splice(index, 0, candidate);

  if (suggestions.length > limit) {
    suggestions.length = limit;
  }
}

export function compareRankedSuggestions(left, right) {
  if (left.score !== right.score) {
    return left.score - right.score;
  }

  if (left.entry.population !== right.entry.population) {
    return right.entry.population - left.entry.population;
  }

  return left.entry.label.localeCompare(right.entry.label);
}

export function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
