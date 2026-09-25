import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EARTH_RADIUS_MILES,
  buildDistanceRing,
  haversineMiles,
  normalizeLongitude,
  ringEnclosesPole,
  toRadians,
  unwrapLongitude,
} from '../lib/geo.js';

const CHICAGO = { latitude: 41.8781, longitude: -87.6298 };
const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };

test('haversineMiles matches known city distances', () => {
  const distance = haversineMiles(CHICAGO.latitude, CHICAGO.longitude, NEW_YORK.latitude, NEW_YORK.longitude);
  assert.ok(Math.abs(distance - 711.03) < 0.05, `Chicago to New York was ${distance}`);
  assert.equal(haversineMiles(10, 20, 10, 20), 0);
});

test('haversineMiles measures short hops across the antimeridian', () => {
  assert.ok(haversineMiles(0, 179.5, 0, -179.5) < 70);
});

test('normalizeLongitude wraps into [-180, 180)', () => {
  assert.equal(normalizeLongitude(190), -170);
  assert.equal(normalizeLongitude(-190), 170);
  assert.equal(normalizeLongitude(540), -180);
  assert.equal(normalizeLongitude(45), 45);
});

test('unwrapLongitude keeps points within 180° of the reference', () => {
  assert.equal(unwrapLongitude(-175, 178), 185);
  assert.equal(unwrapLongitude(175, -178), -185);
  assert.equal(unwrapLongitude(10, 20), 10);
});

test('buildDistanceRing points sit at the requested distance', () => {
  const ring = buildDistanceRing(CHICAGO, 500);
  assert.ok(ring.length > 100);
  for (const [latitude, longitude] of ring) {
    const distance = haversineMiles(CHICAGO.latitude, CHICAGO.longitude, latitude, longitude);
    assert.ok(Math.abs(distance - 500) < 0.01, `ring point was ${distance} miles away`);
  }
});

test('buildDistanceRing never jumps across the map', () => {
  const fiji = { latitude: -18.1416, longitude: 178.4419 };
  const ring = buildDistanceRing(fiji, 800);
  for (let index = 1; index < ring.length; index += 1) {
    assert.ok(Math.abs(ring[index][1] - ring[index - 1][1]) < 30);
  }
});

test('a ring around a pole is centered on the origin longitude', () => {
  const reykjavik = { latitude: 64.1466, longitude: -21.9426 };
  assert.ok(ringEnclosesPole(reykjavik, 2000));
  const ring = buildDistanceRing(reykjavik, 2000);
  const southernmost = ring.reduce((lowest, point) => (point[0] < lowest[0] ? point : lowest));
  assert.ok(Math.abs(southernmost[1] - reykjavik.longitude) < 1);
});

test('ringEnclosesPole is false for ordinary rings and true exactly at the pole', () => {
  assert.equal(ringEnclosesPole(CHICAGO, 500), false);
  const milesToNorthPole = EARTH_RADIUS_MILES * toRadians(90 - CHICAGO.latitude);
  assert.equal(ringEnclosesPole(CHICAGO, milesToNorthPole), true);
});
