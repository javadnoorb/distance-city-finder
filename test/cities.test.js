import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCitySearchIndex,
  findCitiesInRing,
  findCitySuggestions,
  findRankedCitySuggestions,
  looksLikeCoordinates,
  normalizeText,
  parseCoordinates,
} from '../lib/cities.js';

const CITIES = [
  ['Chicago', 'US', 2720546, 41.85003, -87.65005],
  ['Memphis', 'US', 655770, 35.14953, -90.04898],
  ['Rochester', 'US', 209802, 43.15478, -77.61556],
  ['Paris', 'FR', 2138551, 48.85341, 2.3488],
  ['Paris', 'US', 25171, 33.66094, -95.55551],
  ['Parisot', 'FR', 500, 44.26444, 1.85972],
  ['São Paulo', 'BR', 10021295, -23.5475, -46.63611],
  ['Tiny Town', 'US', 40, 35.2, -89.9],
];
const CHICAGO = { latitude: 41.85003, longitude: -87.65005 };

test('parseCoordinates reads latitude,longitude pairs', () => {
  assert.deepEqual(parseCoordinates('41.8781, -87.6298'), { latitude: 41.8781, longitude: -87.6298 });
  assert.equal(parseCoordinates('Chicago'), null);
  assert.throws(() => parseCoordinates('91,0'), /valid latitude and longitude/);
  assert.throws(() => parseCoordinates('0,181'), /valid latitude and longitude/);
});

test('looksLikeCoordinates accepts partially typed coordinates', () => {
  assert.equal(looksLikeCoordinates('41.8,'), true);
  assert.equal(looksLikeCoordinates('Paris, FR'), false);
});

test('normalizeText strips accents and case', () => {
  assert.equal(normalizeText('  São Paulo '), 'sao paulo');
});

test('findCitiesInRing filters by distance and population, largest first', () => {
  const matches = findCitiesInRing(CITIES, CHICAGO, 450, 550);
  assert.deepEqual(
    matches.map(({ city }) => city[0]),
    ['Memphis', 'Rochester', 'Tiny Town'],
  );
  for (const { distance } of matches) {
    assert.ok(distance >= 450 && distance <= 550);
  }

  const larger = findCitiesInRing(CITIES, CHICAGO, 450, 550, 10000);
  assert.deepEqual(
    larger.map(({ city }) => city[0]),
    ['Memphis', 'Rochester'],
  );
});

test('suggestions rank exact names first, then by population', () => {
  const index = buildCitySearchIndex(CITIES);
  assert.deepEqual(
    findCitySuggestions('Paris', index, 3).map((entry) => entry.label),
    ['Paris, FR', 'Paris, US', 'Parisot, FR'],
  );
});

test('a country code narrows suggestions', () => {
  const index = buildCitySearchIndex(CITIES);
  assert.deepEqual(
    findCitySuggestions('Paris, US', index, 3).map((entry) => entry.label),
    ['Paris, US'],
  );
});

test('matching ignores accents and reports exact matches with score <= 0', () => {
  const index = buildCitySearchIndex(CITIES);
  const [best] = findRankedCitySuggestions('sao paulo', index, 1);
  assert.equal(best.entry.label, 'São Paulo, BR');
  assert.ok(best.score <= 0);

  const [prefix] = findRankedCitySuggestions('Pari', index, 1);
  assert.ok(prefix.score > 0);
});
