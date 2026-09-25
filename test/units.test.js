import assert from 'node:assert/strict';
import { test } from 'node:test';

import { convertDistance, fromMiles, isDistanceUnit, roundDistance, toMiles } from '../lib/units.js';

test('miles and kilometers convert both ways', () => {
  assert.equal(toMiles(1.609344, 'km'), 1);
  assert.equal(fromMiles(1, 'km'), 1.609344);
  assert.equal(toMiles(500, 'mi'), 500);
});

test('convertDistance is exact and round-trips', () => {
  assert.equal(convertDistance(500, 'mi', 'km'), 804.672);
  assert.ok(Math.abs(convertDistance(convertDistance(621.4, 'mi', 'km'), 'km', 'mi') - 621.4) < 1e-9);
  assert.equal(convertDistance(20, 'mi', 'mi'), 20);
});

test('roundDistance rounds to one decimal place for display', () => {
  assert.equal(roundDistance(804.672), 804.7);
  assert.equal(roundDistance(32.18688), 32.2);
});

test('isDistanceUnit only accepts known units', () => {
  assert.equal(isDistanceUnit('km'), true);
  assert.equal(isDistanceUnit('toString'), false);
  assert.equal(isDistanceUnit('ft'), false);
});
