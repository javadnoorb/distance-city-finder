// Writes data/cities-large.json: the subset of data/cities.json with at least
// LARGE_CITY_MIN_POPULATION people. The app loads this smaller file by default
// and only fetches the full dataset when a search needs smaller places.
//
// Usage: node scripts/build-large-cities.mjs
import { readFileSync, writeFileSync } from 'node:fs';

import { LARGE_CITY_MIN_POPULATION, POPULATION_INDEX } from '../lib/cities.js';

const cities = JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
const largeCities = cities.filter((city) => city[POPULATION_INDEX] >= LARGE_CITY_MIN_POPULATION);
writeFileSync(new URL('../data/cities-large.json', import.meta.url), JSON.stringify(largeCities));
console.log(`Wrote ${largeCities.length} of ${cities.length} cities to data/cities-large.json`);
