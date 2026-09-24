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
  if (topMatches.length === 0) {
    hideResultsMap();
    return;
  }

  resultsMapSection.hidden = false;
  resultsMapSummary.textContent = `Showing the ${topMatches.length} largest ${topMatches.length === 1 ? 'city' : 'cities'} from these results.`;
  const points = [
    {
      kind: 'origin',
      label: origin.label,
      latitude: origin.latitude,
      longitude: origin.longitude,
    },
    ...topMatches.map(({ city, distance }, index) => ({
      kind: 'city',
      rank: index + 1,
      label: city[CITY_NAME_INDEX],
      country: city[COUNTRY_INDEX],
      population: city[POPULATION_INDEX],
      distance,
      latitude: city[LATITUDE_INDEX],
      longitude: city[LONGITUDE_INDEX],
    })),
  ];

  // Keep every longitude within 180° of the origin so results across the antimeridian stay nearby.
  points.forEach((point) => {
    point.mapLongitude = unwrapLongitude(point.longitude, origin.longitude);
  });

  const { minLatitude, maxLatitude, minLongitude, maxLongitude } = calculateMapBounds(points);
  const gridSteps = 4;
  const gridLines = [];
  const axisLabels = [];
  const pointMarkers = [];
  const legendItems = [];

  for (let step = 0; step <= gridSteps; step += 1) {
    const position = (step / gridSteps) * 100;
    const longitude = minLongitude + ((maxLongitude - minLongitude) * step) / gridSteps;
    const latitude = maxLatitude - ((maxLatitude - minLatitude) * step) / gridSteps;
    const longitudeAlignment = step === 0 ? 'start' : step === gridSteps ? 'end' : 'center';

    gridLines.push(`
      <line x1="${position}" y1="0" x2="${position}" y2="100"></line>
      <line x1="0" y1="${position}" x2="100" y2="${position}"></line>
    `);
    axisLabels.push(`
      <span class="map-axis-label map-axis-longitude map-axis-${longitudeAlignment}" style="left: ${position}%">${formatCoordinate(longitude, 'longitude')}</span>
    `);
    // The bottom latitude label would collide with the longitude labels, so it is skipped.
    if (step < gridSteps) {
      axisLabels.push(`
        <span class="map-axis-label map-axis-latitude" style="top: ${position}%">${formatCoordinate(latitude, 'latitude')}</span>
      `);
    }
  }

  points.forEach((point) => {
    const x = projectLongitude(point.mapLongitude, minLongitude, maxLongitude);
    const y = projectLatitude(point.latitude, minLatitude, maxLatitude);

    if (point.kind === 'origin') {
      pointMarkers.push(`
        <div class="map-marker map-marker-origin" style="left: ${x}%; top: ${y}%" data-x="${x}" data-y="${y}">
          <span class="map-marker-label">Origin</span>
        </div>
      `);
      legendItems.push(`
        <li class="map-legend-item map-legend-origin">
          <span class="map-legend-swatch" aria-hidden="true"></span>
          <span>${escapeHtml(point.label)}</span>
        </li>
      `);
      return;
    }

    pointMarkers.push(`
      <div
        class="map-marker map-marker-city"
        style="left: ${x}%; top: ${y}%"
        data-x="${x}"
        data-y="${y}"
        title="#${point.rank} ${escapeHtml(point.label)}, ${escapeHtml(point.country)} — Population ${populationFormatter.format(point.population)} — ${distanceFormatter.format(point.distance)} miles away"
      >${point.rank}</div>
    `);
    legendItems.push(`
      <li class="map-legend-item">
        <span class="map-legend-rank" aria-hidden="true">${point.rank}</span>
        <span>${escapeHtml(point.label)}, ${escapeHtml(point.country)} · Pop. ${populationFormatter.format(point.population)} · ${distanceFormatter.format(point.distance)} mi</span>
      </li>
    `);
  });

  resultsMapElement.innerHTML = `
    <div class="results-map-canvas">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g class="map-grid">${gridLines.join('')}</g>
      </svg>
      <div class="map-overlay" aria-hidden="true">
        ${axisLabels.join('')}
        ${pointMarkers.join('')}
      </div>
    </div>
    <ul class="map-legend" aria-label="Top matching cities">${legendItems.join('')}</ul>
  `;

  spreadOverlappingMarkers(resultsMapElement.querySelector('.results-map-canvas'));
}

// Nudges city markers that would cover an earlier marker, leaving a small dot at the true position.
function spreadOverlappingMarkers(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) {
    return;
  }

  const minimumGap = 28;
  const placed = [];
  canvas.querySelectorAll('.map-marker').forEach((marker) => {
    const x = (Number(marker.dataset.x) / 100) * width;
    const y = (Number(marker.dataset.y) / 100) * height;
    const overlaps = (candidate) =>
      placed.some((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < minimumGap);

    let position = { x, y };
    if (marker.classList.contains('map-marker-city') && overlaps(position)) {
      const candidates = [];
      for (let ring = 1; ring <= 3; ring += 1) {
        for (let index = 0; index < 8; index += 1) {
          const angle = (index / 8) * 2 * Math.PI;
          candidates.push({
            x: x + Math.cos(angle) * minimumGap * ring,
            y: y + Math.sin(angle) * minimumGap * ring,
          });
        }
      }
      position =
        candidates.find(
          (candidate) =>
            candidate.x > minimumGap / 2 &&
            candidate.x < width - minimumGap / 2 &&
            candidate.y > minimumGap / 2 &&
            candidate.y < height - minimumGap / 2 &&
            !overlaps(candidate),
        ) || position;

      if (position.x !== x || position.y !== y) {
        const anchor = document.createElement('span');
        anchor.className = 'map-marker-anchor';
        anchor.style.left = `${Number(marker.dataset.x)}%`;
        anchor.style.top = `${Number(marker.dataset.y)}%`;
        marker.before(anchor);
        marker.style.left = `${(position.x / width) * 100}%`;
        marker.style.top = `${(position.y / height) * 100}%`;
      }
    }

    placed.push(position);
  });
}

function hideResultsMap() {
  resultsMapSection.hidden = true;
  resultsMapSummary.textContent = '';
  resultsMapElement.innerHTML = '';
}

function calculateMapBounds(points) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.mapLongitude);
  const latitudePadding = Math.max(4, (Math.max(...latitudes) - Math.min(...latitudes)) * 0.2 || 4);
  const longitudePadding = Math.max(6, (Math.max(...longitudes) - Math.min(...longitudes)) * 0.2 || 6);

  return {
    minLatitude: clampLatitude(Math.min(...latitudes) - latitudePadding),
    maxLatitude: clampLatitude(Math.max(...latitudes) + latitudePadding),
    minLongitude: Math.min(...longitudes) - longitudePadding,
    maxLongitude: Math.max(...longitudes) + longitudePadding,
  };
}

function projectLongitude(longitude, minLongitude, maxLongitude) {
  return ((longitude - minLongitude) / (maxLongitude - minLongitude || 1)) * 100;
}

function projectLatitude(latitude, minLatitude, maxLatitude) {
  return ((maxLatitude - latitude) / (maxLatitude - minLatitude || 1)) * 100;
}

function clampLatitude(value) {
  return Math.min(90, Math.max(-90, value));
}

function unwrapLongitude(longitude, referenceLongitude) {
  return referenceLongitude + normalizeLongitude(longitude - referenceLongitude);
}

function normalizeLongitude(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function formatCoordinate(rawValue, axis) {
  const value = axis === 'longitude' ? normalizeLongitude(rawValue) : rawValue;
  const direction =
    axis === 'latitude'
      ? value >= 0
        ? 'N'
        : 'S'
      : value >= 0
        ? 'E'
        : 'W';
  return `${Math.abs(value).toFixed(1)}°${direction}`;
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
