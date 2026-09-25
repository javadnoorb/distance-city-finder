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
  sortMatches,
} from '../lib/cities.js';

const CITIES = [
  ['Paris', 'FR', 900, 45.0, 1.0],
  ['Chicago', 'US', 2720546, 41.85003, -87.65005],
  ['Memphis', 'US', 655770, 35.14953, -90.04898],
  ['Rochester', 'US', 209802, 43.15478, -77.61556],
  ['Paris', 'FR', 2138551, 48.85341, 2.3488],
  ['Paris', 'US', 25171, 33.66094, -95.55551],
  ['Parisot', 'FR', 500, 44.26444, 1.85972],
  ['São Paulo', 'BR', 10021295, -23.5475, -46.63611],
  ['Tiny Town', 'US', 40, 35.2, -89.9],
  ['Paris', 'FR', 1200, 46.0, 2.0],
  ['Alphaville', 'BR', 5000, -23.5, -46.8],
  ['Alphaton', 'BR', 5000, -23.6, -46.9],
];
const CHICAGO = { latitude: 41.85003, longitude: -87.65005 };

test('parseCoordinates reads latitude,longitude pairs', () => {
  assert.deepEqual(parseCoordinates('41.8781, -87.6298'), { latitude: 41.8781, longitude: -87.6298 });
  assert.deepEqual(parseCoordinates('-90,180'), { latitude: -90, longitude: 180 });
  assert.equal(parseCoordinates('Chicago'), null);
  assert.throws(() => parseCoordinates('91,0'), /valid latitude and longitude/);
  assert.throws(() => parseCoordinates('0,181'), /valid latitude and longitude/);
});

test('looksLikeCoordinates accepts partially typed coordinates', () => {
  assert.equal(looksLikeCoordinates('41.8,'), true);
  assert.equal(looksLikeCoordinates('-33.9,'), true);
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

test('findCitiesInRing includes both bounds', () => {
  const [memphis] = findCitiesInRing(CITIES, CHICAGO, 450, 550, 655770);
  assert.equal(memphis.city[0], 'Memphis');
  // A lower bound of 1 mile leaves out Chicago itself (0 miles away).
  assert.equal(findCitiesInRing(CITIES, CHICAGO, 1, memphis.distance, 655770).length, 1);
  assert.equal(findCitiesInRing(CITIES, CHICAGO, memphis.distance, 1000, 655770).length, 1);
  assert.equal(findCitiesInRing(CITIES, CHICAGO, 450, 550, 655771).length, 0);
});

test('the search index keeps the largest city for a repeated name', () => {
  const index = buildCitySearchIndex(CITIES);
  const [paris] = findCitySuggestions('Paris, FR', index, 1);
  assert.equal(paris.population, 2138551);
  assert.equal(paris.latitude, 48.85341);
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
  // A partial country code still matches, ranked after exact codes.
  assert.deepEqual(
    findCitySuggestions('Paris, F', index, 3).map((entry) => entry.label),
    ['Paris, FR', 'Parisot, FR'],
  );
});

test('an exact country code outranks a larger city elsewhere', () => {
  const index = buildCitySearchIndex(CITIES);
  const [best] = findRankedCitySuggestions('Paris, US', index, 1);
  assert.equal(best.entry.label, 'Paris, US');
  assert.equal(best.score, -0.5);
});

test('suggestions respect the limit and match later words in a name', () => {
  const index = buildCitySearchIndex(CITIES);
  assert.equal(findCitySuggestions('Paris', index, 1).length, 1);
  assert.deepEqual(
    findCitySuggestions('town', index, 5).map((entry) => entry.label),
    ['Tiny Town, US'],
  );
});

test('equal scores and populations fall back to alphabetical order', () => {
  const index = buildCitySearchIndex(CITIES);
  assert.deepEqual(
    findCitySuggestions('Alpha', index, 2).map((entry) => entry.label),
    ['Alphaton, BR', 'Alphaville, BR'],
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

test('sortMatches sorts by each column in either direction without mutating', () => {
  const matches = findCitiesInRing(CITIES, CHICAGO, 0, 12000);
  const names = (sorted) => sorted.map(({ city }) => `${city[0]}, ${city[1]}`);
  const originalOrder = names(matches);

  assert.deepEqual(names(sortMatches(matches, 'name', 'ascending')).slice(0, 3), ['Alphaton, BR', 'Alphaville, BR', 'Chicago, US']);
  assert.deepEqual(names(sortMatches(matches, 'population', 'ascending')).slice(0, 2), ['Tiny Town, US', 'Parisot, FR']);

  const byDistance = sortMatches(matches, 'distance', 'descending');
  for (let index = 1; index < byDistance.length; index += 1) {
    assert.ok(byDistance[index - 1].distance >= byDistance[index].distance);
  }

  sortMatches(matches, 'name', 'descending');
  assert.deepEqual(names(matches), originalOrder);
});

test('sortMatches breaks ties by largest population first', () => {
  const matches = findCitiesInRing(CITIES, CHICAGO, 0, 12000);
  // Reverse the input so a stable sort alone would put smaller cities first.
  const byCountry = sortMatches([...matches].reverse(), 'country', 'ascending');
  assert.deepEqual(
    byCountry.filter(({ city }) => city[1] === 'FR').map(({ city }) => city[2]),
    [2138551, 1200, 900, 500],
  );
});
