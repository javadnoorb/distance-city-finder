import assert from 'node:assert/strict';
import { test } from 'node:test';

import { searchFromQueryString, searchToQueryString } from '../lib/query.js';

test('a search round-trips through the query string', () => {
  const search = { location: 'Paris, FR', distance: '300', margin: '20', minPopulation: '10000', unit: 'km' };
  const queryString = searchToQueryString(search);
  assert.equal(queryString, 'from=Paris%2C+FR&d=300&m=20&pop=10000&unit=km');
  assert.deepEqual(searchFromQueryString(`?${queryString}`), search);
});

test('empty fields are left out of the query string', () => {
  assert.equal(searchToQueryString({ location: 'Chicago', distance: '500', margin: '', unit: 'mi' }), 'from=Chicago&d=500&unit=mi');
});

test('a query string without a location or valid distance is ignored', () => {
  assert.equal(searchFromQueryString(''), null);
  assert.equal(searchFromQueryString('?from=Chicago'), null);
  assert.equal(searchFromQueryString('?from=Chicago&d=far'), null);
  assert.equal(searchFromQueryString('?d=500'), null);
});

test('invalid optional values are dropped', () => {
  assert.deepEqual(searchFromQueryString('?from=Chicago&d=500&m=-5&pop=lots&unit=ft'), {
    location: 'Chicago',
    distance: '500',
    margin: '',
    minPopulation: '',
    unit: '',
  });
});
