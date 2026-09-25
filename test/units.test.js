import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convertDistance, fromMiles, isDistanceUnit, toMiles } from '../lib/units.js';

test('miles and kilometers convert both ways', () => {
  assert.equal(toMiles(1.609344, 'km'), 1);
  assert.equal(fromMiles(1, 'km'), 1.609344);
  assert.equal(toMiles(500, 'mi'), 500);
});

test('convertDistance rounds to one decimal place', () => {
  assert.equal(convertDistance(500, 'mi', 'km'), 804.7);
  assert.equal(convertDistance(804.7, 'km', 'mi'), 500);
  assert.equal(convertDistance(20, 'mi', 'mi'), 20);
});

test('isDistanceUnit only accepts known units', () => {
  assert.equal(isDistanceUnit('km'), true);
  assert.equal(isDistanceUnit('toString'), false);
  assert.equal(isDistanceUnit('ft'), false);
});
