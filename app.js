const CITY_NAME_INDEX = 0;
const COUNTRY_INDEX = 1;
const POPULATION_INDEX = 2;
const LATITUDE_INDEX = 3;
const LONGITUDE_INDEX = 4;
const EARTH_RADIUS_MILES = 3958.7613;

const form = document.getElementById('search-form');
const locationInput = document.getElementById('location');
const distanceInput = document.getElementById('distance');
const marginInput = document.getElementById('margin');
const statusElement = document.getElementById('status');
const errorElement = document.getElementById('error');
const resultsPanel = document.getElementById('results-panel');
const resultsSummary = document.getElementById('results-summary');
const resultsBody = document.getElementById('results-body');
const submitButton = form.querySelector('button[type="submit"]');

const populationFormatter = new Intl.NumberFormat('en-US');
const distanceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

let cityDataPromise;

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
    const cities = await loadCities();
    const origin = await resolveLocation(locationInput.value.trim(), cities);
    const lowerBound = Math.max(0, desiredDistance - margin);
    const upperBound = desiredDistance + margin;

    statusElement.textContent = 'Searching for matching cities...';

    const matches = [];
    for (const city of cities) {
      const distance = haversineMiles(origin.latitude, origin.longitude, city[LATITUDE_INDEX], city[LONGITUDE_INDEX]);
      if (distance >= lowerBound && distance <= upperBound) {
        matches.push({ city, distance });
      }
    }

    matches.sort((left, right) => right.city[POPULATION_INDEX] - left.city[POPULATION_INDEX]);
    renderResults(matches, origin.label, lowerBound, upperBound);
    statusElement.textContent = `Search complete. Found ${matches.length} matching ${matches.length === 1 ? 'city' : 'cities'}.`;
  } catch (error) {
    statusElement.textContent = '';
    resultsPanel.hidden = true;
    errorElement.textContent = error.message || 'Unable to complete the search.';
  } finally {
    submitButton.disabled = false;
  }
});

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

function parseNumber(value, label) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

async function resolveLocation(input, cities) {
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

  const localMatch = findCityMatch(input, cities);
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

function findCityMatch(input, cities) {
  const [namePart, countryPart] = input.split(',').map((part) => part.trim()).filter(Boolean);
  const normalizedQuery = normalizeText(namePart || input);
  const normalizedCountry = countryPart ? normalizeText(countryPart) : '';

  let fallbackMatch = null;

  for (const city of cities) {
    const cityName = city[CITY_NAME_INDEX];
    const countryCode = city[COUNTRY_INDEX];
    const normalizedCityName = normalizeText(cityName);
    const cityMatchesQuery =
      normalizedCityName === normalizedQuery ||
      normalizedCityName.startsWith(normalizedQuery) ||
      normalizedCityName.includes(` ${normalizedQuery}`);

    if (!cityMatchesQuery) {
      continue;
    }

    if (!fallbackMatch) {
      fallbackMatch = {
        label: `${cityName}, ${countryCode}`,
        latitude: city[LATITUDE_INDEX],
        longitude: city[LONGITUDE_INDEX],
      };
    }

    if (!normalizedCountry || normalizeText(countryCode) === normalizedCountry) {
      return {
        label: `${cityName}, ${countryCode}`,
        latitude: city[LATITUDE_INDEX],
        longitude: city[LONGITUDE_INDEX],
      };
    }
  }

  return fallbackMatch;
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

function renderResults(matches, originLabel, lowerBound, upperBound) {
  resultsPanel.hidden = false;
  resultsSummary.textContent = `${matches.length} ${matches.length === 1 ? 'city' : 'cities'} between ${distanceFormatter.format(lowerBound)} and ${distanceFormatter.format(upperBound)} miles from ${originLabel}.`;

  if (matches.length === 0) {
    resultsBody.innerHTML = '<tr><td colspan="4">No cities found for that distance ring.</td></tr>';
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
