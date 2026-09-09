# distance-city-finder

A small GitHub Pages app that finds cities in a distance ring around a user-supplied location.

## How it works

- Enter a location as a city name, an optional city + country code, or as `latitude,longitude`
- Enter a desired distance in miles
- Optionally adjust the margin of error, which defaults to 20 miles
- The app finds cities whose distances fall within `distance ± margin`
- Results are shown in descending population order

## Data source

City data comes from the MIT-licensed [`all-the-cities`](https://www.npmjs.com/package/all-the-cities) dataset and includes cities with population data and coordinates. See [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES) for required third-party license notices.

## Local usage

Because the app loads a JSON file in the browser, serve the repository with a simple static server instead of opening `index.html` directly.

For example:

```bash
cd /path/to/distance-city-finder
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.
