const CITY_NAME_INDEX = 0;
const COUNTRY_INDEX = 1;
const POPULATION_INDEX = 2;
const LATITUDE_INDEX = 3;
const LONGITUDE_INDEX = 4;
const EARTH_RADIUS_MILES = 3958.7613;

const form = document.getElementById('search-form');
const locationInput = document.getElementById('location');
const detectLocationButton = document.getElementById('detect-location');
const locationSuggestions = document.getElementById('location-suggestions');
const distanceInput = document.getElementById('distance');
const marginInput = document.getElementById('margin');
const statusElement = document.getElementById('status');
const errorElement = document.getElementById('error');
const resultsPanel = document.getElementById('results-panel');
const resultsSummary = document.getElementById('results-summary');
const resultsMapSection = document.getElementById('results-map-section');
const resultsMapSummary = document.getElementById('results-map-summary');
const resultsMapElement = document.getElementById('results-map');
const resultsBody = document.getElementById('results-body');
const submitButton = form.querySelector('button[type="submit"]');

const populationFormatter = new Intl.NumberFormat('en-US');
const distanceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const MAX_CITY_SUGGESTIONS = 8;

let cityDataPromise;
let detectedLocation = null;
let citySearchIndexPromise;
let latestSuggestionRequest = 0;
let resultsMap;
let resultsMapLayers;

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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorElement.textContent = '';
  statusElement.textContent = 'Resolving location and loading city data...';
  resultsPanel.hidden = true;
  resultsBody.innerHTML = '';
  submitButton.disabled = true;

  try {
    const desiredDistance = parseNumber(distanceInput.value, 'Desired distance');
    const margin = parseNumber(marginInput.value, 'Margin of error');
    const [cities, citySearchIndex] = await Promise.all([loadCities(), loadCitySearchIndex()]);
    const useDetectedLocation = locationInput.dataset.useDetectedLocation === 'true' && detectedLocation;
    const resolvedOrigin = useDetectedLocation
      ? detectedLocation
      : await resolveLocation(locationInput.value.trim(), citySearchIndex);
    const lowerBound = Math.max(0, desiredDistance - margin);
    const upperBound = desiredDistance + margin;

    statusElement.textContent = 'Searching for matching cities...';

    const matches = [];
    for (const city of cities) {
      const distance = haversineMiles(
        resolvedOrigin.latitude,
        resolvedOrigin.longitude,
        city[LATITUDE_INDEX],
        city[LONGITUDE_INDEX],
      );
      if (distance >= lowerBound && distance <= upperBound) {
        matches.push({ city, distance });
      }
    }

    matches.sort((left, right) => right.city[POPULATION_INDEX] - left.city[POPULATION_INDEX]);
    renderResults(matches, resolvedOrigin, lowerBound, upperBound);
    statusElement.textContent = `Search complete. Found ${matches.length} matching ${matches.length === 1 ? 'city' : 'cities'}.`;
  } catch (error) {
    statusElement.textContent = '';
    resultsPanel.hidden = true;
    errorElement.textContent = error.message || 'Unable to complete the search.';
  } finally {
    submitButton.disabled = false;
  }
});

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

async function loadCities() {
  if (!cityDataPromise) {
    cityDataPromise = fetch('data/cities.json')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load city data.');
        }
        return response.json();
      })
      .catch((error) => {
        cityDataPromise = undefined;
        throw error;
      });
  }

  return cityDataPromise;
}

async function loadCitySearchIndex() {
  if (!citySearchIndexPromise) {
    citySearchIndexPromise = loadCities()
      .then((cities) => buildCitySearchIndex(cities))
      .catch((error) => {
        citySearchIndexPromise = undefined;
        throw error;
      });
  }

  return citySearchIndexPromise;
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

async function resolveLocation(input, citySearchIndex) {
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

  const localMatch = findCityMatch(input, citySearchIndex);
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

function parseCoordinates(input) {
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

function looksLikeCoordinates(input) {
  return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d*(?:\.\d+)?\s*$/.test(input);
}

function buildCitySearchIndex(cities) {
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

function collectSearchPrefixes(entry) {
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

function findCitySuggestions(input, citySearchIndex, limit = 1) {
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

  return suggestions.map((suggestion) => suggestion.entry);
}

function findCityMatch(input, citySearchIndex) {
  const [match] = findCitySuggestions(input, citySearchIndex, 1);
  if (!match) {
    return null;
  }

  return {
    label: match.label,
    latitude: match.latitude,
    longitude: match.longitude,
  };
}

function parseLocationQuery(input) {
  const [namePart, ...countryParts] = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    normalizedQuery: normalizeText(namePart || input),
    normalizedCountry: normalizeText(countryParts.join(' ')),
  };
}

function scoreCityMatch(entry, normalizedQuery, normalizedCountry) {
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

function insertRankedSuggestion(suggestions, entry, score, limit) {
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

function compareRankedSuggestions(left, right) {
  if (left.score !== right.score) {
    return left.score - right.score;
  }

  if (left.entry.population !== right.entry.population) {
    return right.entry.population - left.entry.population;
  }

  return left.entry.label.localeCompare(right.entry.label);
}

function haversineMiles(latitudeA, longitudeA, latitudeB, longitudeB) {
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const latitudeARadians = toRadians(latitudeA);
  const latitudeBRadians = toRadians(latitudeB);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeARadians) * Math.cos(latitudeBRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function renderResults(matches, origin, lowerBound, upperBound) {
  resultsPanel.hidden = false;
  resultsSummary.textContent = `${matches.length} ${matches.length === 1 ? 'city' : 'cities'} between ${distanceFormatter.format(lowerBound)} and ${distanceFormatter.format(upperBound)} miles from ${origin.label}.`;

  if (matches.length === 0) {
    resultsBody.innerHTML = '<tr><td colspan="4">No cities found for that distance ring.</td></tr>';
    hideResultsMap();
    return;
  }

  const rows = matches.map(({ city, distance }) => `
    <tr>
      <td>${escapeHtml(city[CITY_NAME_INDEX])}</td>
      <td>${escapeHtml(city[COUNTRY_INDEX])}</td>
      <td>${populationFormatter.format(city[POPULATION_INDEX])}</td>
      <td>${distanceFormatter.format(distance)}</td>
    </tr>
  `);

  resultsBody.innerHTML = rows.join('');
  renderResultsMap(matches.slice(0, 5), origin);
}

function renderResultsMap(topMatches, origin) {
  if (!window.L || topMatches.length === 0) {
    hideResultsMap();
    return;
  }

  resultsMapSection.hidden = false;
  resultsMapSummary.textContent = `Showing the ${topMatches.length} largest ${topMatches.length === 1 ? 'city' : 'cities'} from these results.`;

  if (!resultsMap) {
    resultsMap = L.map(resultsMapElement, {
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(resultsMap);

    resultsMapLayers = L.layerGroup().addTo(resultsMap);
  }

  resultsMapLayers.clearLayers();

  const bounds = [];
  L.circleMarker([origin.latitude, origin.longitude], {
    radius: 7,
    weight: 2,
    color: '#1d4ed8',
    fillColor: '#60a5fa',
    fillOpacity: 0.95,
  })
    .bindPopup(`<strong>Origin</strong><br />${escapeHtml(origin.label)}`)
    .addTo(resultsMapLayers);
  bounds.push([origin.latitude, origin.longitude]);

  topMatches.forEach(({ city, distance }, index) => {
    const latitude = city[LATITUDE_INDEX];
    const longitude = city[LONGITUDE_INDEX];
    bounds.push([latitude, longitude]);

    L.marker([latitude, longitude])
      .bindPopup(
        `<strong>#${index + 1} ${escapeHtml(city[CITY_NAME_INDEX])}</strong><br />${escapeHtml(city[COUNTRY_INDEX])}<br />Population: ${populationFormatter.format(city[POPULATION_INDEX])}<br />Distance: ${distanceFormatter.format(distance)} miles`,
      )
      .addTo(resultsMapLayers);
  });

  requestAnimationFrame(() => {
    resultsMap.invalidateSize();

    if (bounds.length === 1) {
      resultsMap.setView(bounds[0], 6);
      return;
    }

    resultsMap.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 6,
    });
  });
}

function hideResultsMap() {
  resultsMapSection.hidden = true;
  resultsMapSummary.textContent = '';

  if (resultsMapLayers) {
    resultsMapLayers.clearLayers();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
