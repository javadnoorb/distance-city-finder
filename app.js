import {
  CITY_NAME_INDEX,
  COUNTRY_INDEX,
  POPULATION_INDEX,
  LATITUDE_INDEX,
  LONGITUDE_INDEX,
  buildCitySearchIndex,
  compareRankedSuggestions,
  findCitiesInRing,
  findCitySuggestions,
  findRankedCitySuggestions,
  looksLikeCoordinates,
  parseCoordinates,
} from './lib/cities.js';
import { buildDistanceRing, ringEnclosesPole, unwrapLongitude } from './lib/geo.js';
import { searchFromQueryString, searchToQueryString } from './lib/query.js';
import { DEFAULT_UNIT, DISTANCE_UNITS, convertDistance, fromMiles, isDistanceUnit, toMiles } from './lib/units.js';

const form = document.getElementById('search-form');
const locationInput = document.getElementById('location');
const detectLocationButton = document.getElementById('detect-location');
const locationSuggestions = document.getElementById('location-suggestions');
const unitSelect = document.getElementById('unit');
const distanceInput = document.getElementById('distance');
const marginInput = document.getElementById('margin');
const minPopulationInput = document.getElementById('min-population');
const statusElement = document.getElementById('status');
const errorElement = document.getElementById('error');
const resultsPanel = document.getElementById('results-panel');
const resultsSummary = document.getElementById('results-summary');
const resultsMapSection = document.getElementById('results-map-section');
const resultsMapSummary = document.getElementById('results-map-summary');
const resultsMapElement = document.getElementById('results-map');
const resultsBody = document.getElementById('results-body');
const showMoreButton = document.getElementById('show-more');
const copyLinkButton = document.getElementById('copy-link');
const submitButton = form.querySelector('button[type="submit"]');

const populationFormatter = new Intl.NumberFormat('en-US');
const distanceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const MAX_CITY_SUGGESTIONS = 8;
const RESULTS_PAGE_SIZE = 100;
const UNIT_STORAGE_KEY = 'distance-city-finder:unit';
// Keep in sync with scripts/build-large-cities.mjs.
const LARGE_CITY_MIN_POPULATION = 10000;
const CITY_DATA_URLS = {
  large: 'data/cities-large.json',
  all: 'data/cities.json',
};

const cityDataPromises = {};
const citySearchIndexPromises = {};
let detectedLocation = null;
let currentResults = null;
let latestSuggestionRequest = 0;
let resultsMap = null;
let currentUnit = DEFAULT_UNIT;

setUnit(loadSavedUnit());

unitSelect.addEventListener('change', () => {
  const previousUnit = currentUnit;
  setUnit(unitSelect.value);
  saveUnit(currentUnit);
  // Convert what's already typed so the search itself doesn't change.
  for (const input of [distanceInput, marginInput]) {
    const value = Number.parseFloat(input.value);
    if (Number.isFinite(value)) {
      input.value = String(convertDistance(value, previousUnit, currentUnit));
    }
  }
  if (currentResults) {
    rerenderResults();
  }
});

locationInput.addEventListener('focus', () => {
  void updateLocationSuggestions();
});

locationInput.addEventListener('input', () => {
  handleLocationInputChange();
});

locationInput.addEventListener('change', () => {
  handleLocationInputChange();
});

function handleLocationInputChange() {
  if (locationInput.dataset.useDetectedLocation === 'true') {
    clearDetectedLocation();
  }
  void updateLocationSuggestions();
}

detectLocationButton.addEventListener('click', async () => {
  errorElement.textContent = '';
  statusElement.textContent = 'Detecting your current location...';
  detectLocationButton.disabled = true;
  submitButton.disabled = true;

  try {
    const origin = await detectCurrentLocation();
    detectedLocation = origin;
    locationInput.dataset.useDetectedLocation = 'true';
    locationInput.value = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}`;
    clearLocationSuggestions();
    statusElement.textContent = 'Current location detected. Ready to search.';
  } catch (error) {
    statusElement.textContent = '';
    errorElement.textContent = error.message || 'Unable to detect current location.';
  } finally {
    detectLocationButton.disabled = false;
    submitButton.disabled = false;
  }
});

copyLinkButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    statusElement.textContent = 'Link to this search copied.';
  } catch {
    statusElement.textContent = 'Copy the link from the address bar to share this search.';
  }
});

showMoreButton.addEventListener('click', () => {
  if (currentResults) {
    showMoreResults();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';
  statusElement.textContent = 'Resolving location and loading city data...';
  resultsPanel.hidden = true;
  resultsBody.innerHTML = '';
  submitButton.disabled = true;

  try {
    const desiredDistance = toMiles(parseNumber(distanceInput.value, 'Desired distance'), currentUnit);
    const margin = toMiles(parseNumber(marginInput.value, 'Margin of error'), currentUnit);
    const minPopulation = parseNumber(minPopulationInput.value || '0', 'Minimum population');
    // The smaller dataset already holds every city a search above its threshold can return.
    const cities = await loadCities(minPopulation >= LARGE_CITY_MIN_POPULATION ? 'large' : 'all');
    const useDetectedLocation = locationInput.dataset.useDetectedLocation === 'true' && detectedLocation;
    const resolvedOrigin = useDetectedLocation
      ? detectedLocation
      : await resolveLocation(locationInput.value.trim());
    const lowerBound = Math.max(0, desiredDistance - margin);
    const upperBound = desiredDistance + margin;

    statusElement.textContent = 'Searching for matching cities...';

    const matches = findCitiesInRing(cities, resolvedOrigin, lowerBound, upperBound, minPopulation);
    renderResults(matches, resolvedOrigin, lowerBound, upperBound);
    saveSearchToUrl();
    statusElement.textContent = `Search complete. Found ${matches.length} matching ${matches.length === 1 ? 'city' : 'cities'}.`;
  } catch (error) {
    statusElement.textContent = '';
    resultsPanel.hidden = true;
    errorElement.textContent = error.message || 'Unable to complete the search.';
  } finally {
    submitButton.disabled = false;
  }
});

// Keeps the current search in the address bar so it can be bookmarked or shared.
function saveSearchToUrl() {
  const queryString = searchToQueryString({
    location: locationInput.value,
    distance: distanceInput.value,
    margin: marginInput.value,
    minPopulation: minPopulationInput.value,
    unit: currentUnit,
  });
  window.history.replaceState(null, '', `${window.location.pathname}?${queryString}`);
}

function runSearchFromUrl() {
  const search = searchFromQueryString(window.location.search);
  if (!search) {
    return;
  }

  if (search.unit) {
    setUnit(search.unit);
  }
  locationInput.value = search.location;
  distanceInput.value = search.distance;
  if (search.margin) {
    marginInput.value = search.margin;
  }
  if (search.minPopulation) {
    minPopulationInput.value = search.minPopulation;
  }
  form.requestSubmit();
}

function clearDetectedLocation() {
  detectedLocation = null;
  delete locationInput.dataset.useDetectedLocation;
}

async function detectCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser.');
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    });
  }).catch((error) => {
    if (error && typeof error.code === 'number') {
      if (error.code === 1) {
        throw new Error('Location access was denied. Allow access and try again.');
      }
      if (error.code === 2) {
        throw new Error('Current location is unavailable right now.');
      }
      if (error.code === 3) {
        throw new Error('Location request timed out. Try again.');
      }
    }
    throw new Error('Unable to detect current location.');
  });

  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Detected location coordinates are invalid.');
  }

  return {
    label: 'your current location',
    latitude,
    longitude,
  };
}

async function loadCities(dataset = 'large') {
  if (!cityDataPromises[dataset]) {
    cityDataPromises[dataset] = fetch(CITY_DATA_URLS[dataset])
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load city data.');
        }
        return response.json();
      })
      .catch((error) => {
        delete cityDataPromises[dataset];
        throw error;
      });
  }

  return cityDataPromises[dataset];
}

async function loadCitySearchIndex(dataset = 'large') {
  if (!citySearchIndexPromises[dataset]) {
    citySearchIndexPromises[dataset] = loadCities(dataset)
      .then((cities) => buildCitySearchIndex(cities))
      .catch((error) => {
        delete citySearchIndexPromises[dataset];
        throw error;
      });
  }

  return citySearchIndexPromises[dataset];
}

function parseNumber(value, label) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

async function updateLocationSuggestions() {
  const requestId = ++latestSuggestionRequest;
  const input = locationInput.value.trim();

  if (!input || looksLikeCoordinates(input)) {
    clearLocationSuggestions();
    return;
  }

  try {
    const citySearchIndex = await loadCitySearchIndex();
    if (requestId !== latestSuggestionRequest) {
      return;
    }

    renderLocationSuggestions(findCitySuggestions(input, citySearchIndex, MAX_CITY_SUGGESTIONS));
  } catch {
    if (requestId === latestSuggestionRequest) {
      clearLocationSuggestions();
    }
  }
}

function renderLocationSuggestions(suggestions) {
  locationSuggestions.innerHTML = suggestions
    .map((suggestion) => `<option value="${escapeHtml(suggestion.label)}"></option>`)
    .join('');
}

function clearLocationSuggestions() {
  locationSuggestions.innerHTML = '';
}

async function resolveLocation(input) {
  if (!input) {
    throw new Error('Location is required.');
  }

  const coordinates = parseCoordinates(input);
  if (coordinates) {
    return {
      label: input,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    };
  }

  const localMatch = await findLocalCityMatch(input);
  if (localMatch) {
    return localMatch;
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', input);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Location lookup failed. Try entering latitude and longitude instead.');
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Location not found. Try a more specific place or coordinates.');
  }

  const match = results[0];
  const latitude = Number.parseFloat(match.lat);
  const longitude = Number.parseFloat(match.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Location lookup returned invalid coordinates.');
  }

  return {
    label: match.display_name || input,
    latitude,
    longitude,
  };
}

// Looks in the large-city index first and only loads the full dataset when that finds no exact name match.
async function findLocalCityMatch(input) {
  let [best] = findRankedCitySuggestions(input, await loadCitySearchIndex('large'), 1);
  if (!best || best.score > 0) {
    const [fullBest] = findRankedCitySuggestions(input, await loadCitySearchIndex('all'), 1);
    if (fullBest && (!best || compareRankedSuggestions(fullBest, best) < 0)) {
      best = fullBest;
    }
  }

  if (!best) {
    return null;
  }

  return {
    label: best.entry.label,
    latitude: best.entry.latitude,
    longitude: best.entry.longitude,
  };
}

function renderResults(matches, origin, lowerBound, upperBound) {
  resultsPanel.hidden = false;
  currentResults = { matches, origin, lowerBound, upperBound, shown: 0 };
  resultsBody.innerHTML = '';

  if (matches.length === 0) {
    updateResultsSummary();
    resultsBody.innerHTML = '<tr><td colspan="4">No cities found for that distance ring.</td></tr>';
    showMoreButton.hidden = true;
    hideResultsMap();
    return;
  }

  showMoreResults();
  renderResultsMap(matches.slice(0, 5), origin, lowerBound, upperBound);
}

// Redraws the visible results, e.g. after the distance unit changes.
function rerenderResults() {
  const { matches, origin, lowerBound, upperBound, shown } = currentResults;
  updateResultsSummary();
  if (matches.length === 0) {
    return;
  }

  resultsBody.innerHTML = buildResultRows(matches.slice(0, shown));
  renderResultsMap(matches.slice(0, 5), origin, lowerBound, upperBound);
}

// Appends the next page of rows so very large result sets stay responsive.
function showMoreResults() {
  const { matches, shown } = currentResults;
  const nextPage = matches.slice(shown, shown + RESULTS_PAGE_SIZE);

  resultsBody.insertAdjacentHTML('beforeend', buildResultRows(nextPage));
  currentResults.shown += nextPage.length;

  const remaining = matches.length - currentResults.shown;
  showMoreButton.hidden = remaining === 0;
  showMoreButton.textContent = `Show ${populationFormatter.format(Math.min(RESULTS_PAGE_SIZE, remaining))} more`;
  updateResultsSummary();
}

function buildResultRows(matches) {
  return matches
    .map(({ city, distance }) => `
      <tr>
        <td>${escapeHtml(city[CITY_NAME_INDEX])}</td>
        <td>${escapeHtml(city[COUNTRY_INDEX])}</td>
        <td>${populationFormatter.format(city[POPULATION_INDEX])}</td>
        <td>${formatDistanceValue(distance)}</td>
      </tr>
    `)
    .join('');
}

function updateResultsSummary() {
  const { matches, origin, lowerBound, upperBound, shown } = currentResults;
  const count = `${populationFormatter.format(matches.length)} ${matches.length === 1 ? 'city' : 'cities'}`;
  const partial = shown < matches.length ? ` Showing the largest ${populationFormatter.format(shown)}.` : '';
  resultsSummary.textContent = `${count} between ${formatDistanceValue(lowerBound)} and ${formatDistanceValue(upperBound)} ${DISTANCE_UNITS[currentUnit].name} from ${origin.label}.${partial}`;
}

function formatDistanceValue(miles) {
  return distanceFormatter.format(fromMiles(miles, currentUnit));
}

function formatDistance(miles) {
  return `${formatDistanceValue(miles)} ${currentUnit}`;
}

function setUnit(unit) {
  currentUnit = isDistanceUnit(unit) ? unit : DEFAULT_UNIT;
  unitSelect.value = currentUnit;
  document.querySelectorAll('.unit-name').forEach((element) => {
    element.textContent = DISTANCE_UNITS[currentUnit].name;
  });
  document.querySelectorAll('.unit-label').forEach((element) => {
    element.textContent = currentUnit;
  });
}

function loadSavedUnit() {
  try {
    return localStorage.getItem(UNIT_STORAGE_KEY) || DEFAULT_UNIT;
  } catch {
    return DEFAULT_UNIT;
  }
}

function saveUnit(unit) {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, unit);
  } catch {
    // Storage can be unavailable (e.g. private browsing); the choice just won't persist.
  }
}

function renderResultsMap(topMatches, origin, lowerBound, upperBound) {
  if (topMatches.length === 0) {
    hideResultsMap();
    return;
  }

  destroyResultsMap();
  resultsMapSection.hidden = false;
  resultsMapSummary.textContent = `Showing the ${topMatches.length} largest ${topMatches.length === 1 ? 'city' : 'cities'} from these results.`;

  const legendItems = [
    `
      <li class="map-legend-item map-legend-origin">
        <span class="map-legend-swatch" aria-hidden="true"></span>
        <span>${escapeHtml(origin.label)}</span>
      </li>
    `,
    ...topMatches.map(({ city, distance }, index) => `
      <li class="map-legend-item">
        <span class="map-legend-rank" aria-hidden="true">${index + 1}</span>
        <span>${escapeHtml(city[CITY_NAME_INDEX])}, ${escapeHtml(city[COUNTRY_INDEX])} · Pop. ${populationFormatter.format(city[POPULATION_INDEX])} · ${formatDistance(distance)}</span>
      </li>
    `),
  ];

  resultsMapElement.innerHTML = `
    <div class="results-map-canvas"></div>
    <ul class="map-legend" aria-label="Top matching cities">${legendItems.join('')}</ul>
  `;
  const canvas = resultsMapElement.querySelector('.results-map-canvas');

  if (typeof L === 'undefined') {
    canvas.classList.add('results-map-unavailable');
    canvas.textContent = 'The map could not be loaded.';
    return;
  }

  resultsMap = L.map(canvas, { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(resultsMap);

  drawDistanceRing(origin, lowerBound, upperBound);

  const originLatLng = [origin.latitude, origin.longitude];
  L.marker(originLatLng, {
    icon: L.divIcon({ className: 'map-marker map-marker-origin', iconSize: [22, 22] }),
    title: 'Origin',
    zIndexOffset: -100,
  })
    .bindPopup(`<strong>Origin</strong><br />${escapeHtml(origin.label)}`)
    .addTo(resultsMap);

  const markerLatLngs = [originLatLng];
  topMatches.forEach(({ city, distance }, index) => {
    const rank = index + 1;
    // Keep every longitude within 180° of the origin so results across the antimeridian stay nearby.
    const latLng = [city[LATITUDE_INDEX], unwrapLongitude(city[LONGITUDE_INDEX], origin.longitude)];
    markerLatLngs.push(latLng);
    L.marker(latLng, {
      icon: L.divIcon({ className: 'map-marker map-marker-city', html: String(rank), iconSize: [24, 24] }),
      title: `#${rank} ${city[CITY_NAME_INDEX]}, ${city[COUNTRY_INDEX]}`,
      zIndexOffset: (topMatches.length - rank) * 10,
    })
      .bindPopup(`
        <strong>#${rank} ${escapeHtml(city[CITY_NAME_INDEX])}, ${escapeHtml(city[COUNTRY_INDEX])}</strong><br />
        Population ${populationFormatter.format(city[POPULATION_INDEX])}<br />
        ${formatDistanceValue(distance)} ${DISTANCE_UNITS[currentUnit].name} away
      `)
      .addTo(resultsMap);
  });

  resultsMap.fitBounds(L.latLngBounds(markerLatLngs).pad(0.2), { maxZoom: 10 });
}

// Shades the band between the lower and upper search distances, following great circles.
function drawDistanceRing(origin, lowerBound, upperBound) {
  const ringStyle = { color: '#1d4ed8', weight: 1.5, dashArray: '6 6', fillColor: '#60a5fa', fillOpacity: 0.12 };
  const outerRing = buildDistanceRing(origin, upperBound);
  const innerRing = lowerBound > 0 ? buildDistanceRing(origin, lowerBound) : null;

  if (!ringEnclosesPole(origin, upperBound)) {
    L.polygon(innerRing ? [outerRing, innerRing] : outerRing, ringStyle).addTo(resultsMap);
    return;
  }

  // A ring that encloses a pole cannot be drawn as a closed polygon on a flat map, so outline it instead.
  [outerRing, innerRing].filter(Boolean).forEach((ring) => {
    L.polyline(ring, { ...ringStyle, fill: false }).addTo(resultsMap);
  });
}

function destroyResultsMap() {
  if (resultsMap) {
    resultsMap.remove();
    resultsMap = null;
  }
}

function hideResultsMap() {
  destroyResultsMap();
  resultsMapSection.hidden = true;
  resultsMapSummary.textContent = '';
  resultsMapElement.innerHTML = '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

runSearchFromUrl();
