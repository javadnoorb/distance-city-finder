# distance-city-finder

A small GitHub Pages app that finds cities in a distance ring around a user-supplied location.

## How it works

- Enter a location as a city name, an optional city + country code, or as `latitude,longitude`
- Or use the **Use current location** button to auto-fill your coordinates from your browser
- City suggestions appear while you type a name
- Enter a desired distance in miles or kilometers (the unit choice is remembered)
- Optionally adjust the margin of error, which defaults to 20
- Optionally adjust the minimum population, which defaults to 10,000; lower it to include smaller places
- The app finds cities whose distances fall within `distance ± margin`
- Results are shown in descending population order, with the top five matches plotted on an interactive map that also shades the search distance ring
- The results table shows the largest 100 matches first, with a **Show more** button for the rest; click a column heading to sort by it
- Each search is saved in the page address (e.g. `?from=Chicago&d=500&m=20&pop=10000&unit=mi`), so it can be bookmarked or shared with **Copy link**
- The page follows the system light or dark setting

## Data source

City data comes from the MIT-licensed [`all-the-cities`](https://www.npmjs.com/package/all-the-cities) dataset and includes cities with population data and coordinates. The results map uses a bundled copy of [Leaflet](https://leafletjs.com/) (`vendor/leaflet`) with map tiles from [OpenStreetMap](https://www.openstreetmap.org/copyright), so it needs a network connection to show the background map.

The app loads `data/cities-large.json` (places with at least 10,000 people, about 1.4 MB) by default and only fetches the full `data/cities.json` (about 5.3 MB) when a search includes smaller places or a location name isn't found among the larger cities. After changing `data/cities.json`, regenerate the smaller file with:

```bash
node scripts/build-large-cities.mjs
```

See [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES) for required third-party license notices.

## Local usage

Because the app loads a JSON file in the browser, serve the repository with a simple static server instead of opening `index.html` directly.

For example:

```bash
cd /path/to/distance-city-finder
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Tests

The distance, search, unit, and link helpers live in `lib/` and have unit tests in `test/` that use Node's built-in test runner (Node 20 or newer, no dependencies):

```bash
npm test
```

GitHub Actions runs these tests, a syntax check, and a check that `data/cities-large.json` is up to date on every pull request and push to `main`.
