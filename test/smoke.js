const { clean, validateURL } = require("../dist/src/index.js");

const result = clean("https://example.com?utm_source=test&utm_medium=link");
if (!result.url.includes("utm_source") && result.info.removed.length >= 1) {
	console.log("clean-url smoke test: ok");
} else {
	console.error("clean-url smoke test: failed", result);
	process.exit(1);
}

if (validateURL("https://example.com") && !validateURL("not a url")) {
	console.log("validateURL smoke test: ok");
} else {
	console.error("validateURL smoke test: failed");
	process.exit(1);
}
