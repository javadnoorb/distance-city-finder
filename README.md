# distance-city-finder

A small GitHub Pages app that finds cities in a distance ring around a user-supplied location.

## How it works

- Enter a location as a city name, an optional city + country code, or as `latitude,longitude`
- Or use the **Use current location** button to auto-fill your coordinates from your browser
- City suggestions appear while you type a name
- Enter a desired distance in miles
- Optionally adjust the margin of error, which defaults to 20 miles
- Optionally adjust the minimum population, which defaults to 10,000; lower it to include smaller places
- The app finds cities whose distances fall within `distance ± margin`
- Results are shown in descending population order, with the top five matches plotted on an interactive map that also shades the search distance ring
- The results table shows the largest 100 matches first, with a **Show more** button for the rest

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
