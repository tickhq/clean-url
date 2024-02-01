# @tickhq/clean-url

Strip tracking and clutter from URLs, making them shorter and easier to read.

## Install

```bash
pnpm add @tickhq/clean-url
```

## Usage

```js
import { clean, validateURL, Cleaner } from "@tickhq/clean-url";

// One-off clean (uses default rules)
const result = clean(
	"https://open.spotify.com/track/1hhZQVLXpg10ySFQFxGbih?si=-k8RwDQwTCK923jxZuy07w&utm_source=copy-link",
);
console.log(result.url);
// https://open.spotify.com/track/1hhZQVLXpg10ySFQFxGbih

// Validate a URL
validateURL("https://example.com"); // true
validateURL("not a url"); // false

// Custom config
const cleaner = new Cleaner({
	config: { allowAMP: false, allowRedirects: true, silent: true },
});
const { url, info } = cleaner.clean("https://...");
console.log(info.removed); // params that were stripped
```

### Options

- **`Cleaner(options?)`** – `options.rules`, `options.handlers`, `options.config` (partial) to override defaults.
- **`cleaner.config`** – `allowAMP`, `allowCustomHandlers`, `allowRedirects`, `silent`. Use `config.setMany({ ... })` to set multiple.

## Build & test

```bash
pnpm run build
pnpm test   # run after build
```
