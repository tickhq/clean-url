import {
	decodeURL,
	getLinkDiff,
	isJSON,
	urlHasParams,
	validateURL,
	Encoding,
	type Rule,
	type Data,
	type Handler,
} from "./utils";
import { handlers as defaultHandlers } from "./handlers";
import { CleanerConfig } from "./config";
import defaultRules from "../lib/rules";

const $github = "https://github.com/tickhq/clean-url";
const MAX_REDIRECT_DEPTH = 5;
const RULE_DEFAULTS: Partial<Rule> = {
	rules: [],
	replace: [],
	exclude: [],
	redirect: "",
	amp: undefined,
	decode: undefined,
};

export type CleanerOptions = {
	rules?: Rule[];
	handlers?: Record<string, Handler>;
	config?: Partial<import("./utils").Config>;
};

export class Cleaner {
	public rules: Rule[] = [];
	public config: CleanerConfig = new CleanerConfig();
	public loglines: { type: string; message: string }[] = [];
	private handlers: Record<string, Handler> = defaultHandlers;
	private _expandedRulesCache: Rule[] | null = null;

	get expandedRules(): Rule[] {
		if (this._expandedRulesCache) return this._expandedRulesCache;
		this._expandedRulesCache = this.rules.map(
			(rule) => Object.assign({}, RULE_DEFAULTS, rule) as Rule,
		);
		return this._expandedRulesCache;
	}

	constructor(options?: CleanerOptions) {
		this.rules = (options?.rules ?? defaultRules) as Rule[];
		if (options?.handlers) this.handlers = options.handlers;
		if (options?.config) this.config.setMany(options.config);
	}

	private log(str: string, type: "all" | "error" | "info" | "warn" | "debug") {
		this.loglines.push({ type, message: str });
		if (!this.config.silent) console.log(`[${type}] ${str}`);
	}

	public rebuild(url: string): string {
		const original = new URL(url);
		return (
			original.protocol +
			"//" +
			original.host +
			original.pathname +
			original.search +
			original.hash
		);
	}

	/**
	 * Clean a URL.
	 * @param _url URL to clean
	 * @param allowReclean Whether to recursively clean redirect/decode results (respects depth limit)
	 * @param _depth Internal: recursion depth for redirect/decode (max 5)
	 */
	public clean(_url: string, allowReclean = true, _depth = 0): Data {
		if (!allowReclean && _depth === 0) this.loglines = [];

		// Default values
		const data: Data = {
			url: _url,
			info: {
				original: _url,
				reduction: 0,
				difference: 0,
				replace: [],
				removed: [],
				handler: null,
				match: [],
				decoded: null,
				is_new_host: false,
				isNewHost: false,
				full_clean: false,
				fullClean: false,
			},
		};

		if (_depth > MAX_REDIRECT_DEPTH) return data;

		// Make sure the URL is valid before we try to clean it
		if (!validateURL(_url)) {
			if (_url !== "undefined" && _url.length > 0) {
				this.log("Invalid URL: " + _url, "error");
			}
			return data;
		}

		// If there's no params, we can skip the rest of the process
		if (this.config.allowAMP && urlHasParams(_url) === false) {
			data.url = data.info.original;
			return data;
		}

		// Rebuild to ensure trailing slashes or encoded characters match
		let url = this.rebuild(_url);
		data.url = url;

		// List of parmeters that will be deleted if found
		let to_remove: string[] = [];

		const original = new URL(url);
		const cleaner = original.searchParams;
		const cleaner_ci = new URLSearchParams();

		let pathname = original.pathname;

		// Case insensitive cleaner for the redirect rule
		cleaner.forEach((v, k) => cleaner_ci.append(k.toLowerCase(), v));

		// Loop through the rules and match them to the host name
		for (const rule of this.expandedRules) {
			// Match the host or the full URL
			let match_s = original.host;
			if (rule.match_href === true) match_s = original.href;
			// Reset lastIndex
			rule.match.lastIndex = 0;
			if (rule.match.exec(match_s) !== null) {
				// Loop through the rules and add to to_remove
				to_remove = [...to_remove, ...(rule.rules || [])];
				data.info.replace = [...data.info.replace, ...(rule.replace || [])];
				data.info.match.push(rule);
			}
		}

		// Stop cleaning if any exclude rule matches
		let ex_pass = true;
		for (const rule of data.info.match) {
			for (const reg of rule.exclude) {
				reg.lastIndex = 0;
				if (reg.exec(url) !== null) ex_pass = false;
			}
		}

		if (!ex_pass) {
			data.url = data.info.original;
			return data;
		}

		// Check if the match has any amp rules, if not we can redirect
		const hasAmpRule = data.info.match.find((item) => item.amp);
		if (this.config.allowAMP === true && hasAmpRule === undefined) {
			// Make sure there are no parameters before resetting
			if (!urlHasParams(url)) {
				data.url = data.info.original;
				return data;
			}
		}

		// Delete any matching parameters
		for (const key of to_remove) {
			if (cleaner.has(key)) {
				data.info.removed.push({ key, value: cleaner.get(key) as string });
				cleaner.delete(key);
			}
		}

		// Update the pathname if needed
		for (const key of data.info.replace) {
			const changed = pathname.replace(key, "");
			if (changed !== pathname) pathname = changed;
		}

		// Rebuild URL
		data.url =
			original.protocol +
			"//" +
			original.host +
			pathname +
			original.search +
			original.hash;

		// Redirect if the redirect parameter exists
		if (this.config.allowRedirects) {
			for (const rule of data.info.match) {
				if (!rule.redirect) continue;

				const target = rule.redirect;
				let value = cleaner_ci.get(target) as string;

				// Sometimes the parameter is encoded
				const isEncoded = decodeURL(value, Encoding.urlc);
				if (isEncoded !== value && validateURL(isEncoded)) value = isEncoded;

				if (target.length && cleaner_ci.has(target)) {
					if (validateURL(value)) {
						data.url = `${value}` + original.hash;
						if (allowReclean)
							data.url = this.clean(data.url, false, _depth + 1).url;
					} else {
						this.log("Failed to redirect: " + value, "error");
					}
				}
			}
		}

		// De-amp the URL
		if (this.config.allowAMP === false) {
			for (const rule of data.info.match) {
				try {
					// Ensure at least one rule exists
					if (
						rule.amp &&
						(rule.amp.regex || rule.amp.replace || rule.amp.sliceTrailing)
					) {
						// Handle replacing text in the URL
						if (rule.amp.replace) {
							data.info.handler = rule.name;
							this.log("AMP Replace: " + rule.amp.replace.text, "info");
							const toReplace = rule.amp.replace.text;
							const toReplaceWith = rule.amp.replace.with ?? "";
							data.url = data.url.replace(toReplace, toReplaceWith);
						}

						// Use RegEx capture groups
						if (rule.amp.regex && data.url.match(rule.amp.regex)) {
							data.info.handler = rule.name;
							this.log("AMP RegEx: " + rule.amp.regex, "info");

							rule.amp.regex.lastIndex = 0;
							const result = rule.amp.regex.exec(data.url);

							// If there is a result, replace the URL
							if (result && result[1]) {
								let target = decodeURIComponent(result[1]);
								// Add the protocol when it's missing
								if (!target.startsWith("https")) target = "https://" + target;
								// Valiate the URL to make sure it's still good
								if (validateURL(target)) {
									data.url = allowReclean
										? this.clean(target, false, _depth + 1).url
										: target;
								}
							} else {
								this.log(
									"AMP RegEx failed to get a result for " + rule.name,
									"error",
								);
							}
						}

						// TODO: Apply to existing rules
						if (rule.amp.sliceTrailing) {
							if (data.url.endsWith(rule.amp.sliceTrailing)) {
								data.url = data.url.slice(0, -rule.amp.sliceTrailing.length);
							}
						}

						// Remove trailing amp/ or /amp
						if (data.url.endsWith("%3Famp")) data.url = data.url.slice(0, -6);
						if (data.url.endsWith("amp/")) data.url = data.url.slice(0, -4);
					}
				} catch (error) {
					this.log(`${error}`, "error");
				}
			}
		}

		// Decode handler
		for (const rule of data.info.match) {
			try {
				this.log(`Processing decode rule (${rule.name})`, "debug");
				if (!rule.decode) continue;
				// Make sure the target parameter exists
				if (!cleaner.has(rule.decode.param) && rule.decode.targetPath !== true)
					continue;
				// These will almost always be clickjacking links, so use the allowRedirects rule if enabled
				if (!this.config.allowRedirects) continue;
				// Don't process the decode handler if it's disabled
				if (this.config.allowCustomHandlers === false && rule.decode.handler)
					continue;
				// Decode the string using selected encoding
				const encoding = rule.decode.encoding || "base64";
				// Sometimes the website path is what we need to decode
				let lastPath = pathname.split("/").pop();
				// This will be null if the param doesn't exist
				const param = cleaner.get(rule.decode.param);
				// Use a default string
				let encodedString: string = "";

				if (lastPath === undefined) lastPath = "";

				// Decide what we are decoding
				if (param === null) encodedString = lastPath;
				else if (param) encodedString = param;
				else continue;

				if (typeof encodedString !== "string") {
					this.log(`Expected ${encodedString} to be a string`, "error");
					continue;
				}

				let decoded = decodeURL(encodedString, encoding);
				let target = "";
				let recleanData: string | null = null;

				// If the response is JSON, decode and look for a key
				if (isJSON(decoded)) {
					const json = JSON.parse(decoded);
					target = json[rule.decode.lookFor];
					// Add to the info response
					data.info.decoded = json;
				} else if (
					this.config.allowCustomHandlers === true &&
					rule.decode.handler
				) {
					// Run custom URL handlers for websites
					const handler = this.handlers[rule.decode.handler];

					if (typeof handler === "undefined") {
						this.log(
							"Handler was not found for " + rule.decode.handler,
							"error",
						);
					}

					if (rule.decode.handler && handler) {
						data.info.handler = rule.decode.handler;

						// Pass the handler a bunch of information it can use
						const result = handler.exec(data.url, {
							decoded,
							lastPath,
							urlParams: new URL(data.url).searchParams,
							fullPath: pathname,
							originalURL: data.url,
						});

						// If the handler threw an error or the URL is invalid
						if (
							result.error ||
							validateURL(result.url) === false ||
							result.url.trim() === ""
						) {
							if (result.error) this.log(result.error, "error");
							else
								this.log(
									"Unknown error with decode handler, empty response returned",
									"error",
								);
						}

						// result.url will always by the original URL when an error is thrown
						recleanData = result.url;
					}
				} else {
					// If the response is a string we can continue
					target = decoded;
				}

				// Re-clean the URL after handler result
				target = allowReclean
					? this.clean(recleanData ?? target, false, _depth + 1).url
					: (recleanData ?? target);

				// If the key we want exists and is a valid url then update the data url
				if (target && target !== "" && validateURL(target)) {
					data.url = `${target}` + original.hash;
				}
			} catch (error) {
				this.log(`${error}`, "error");
			}
		}

		// Handle empty hash / anchors
		if (_url.endsWith("#")) {
			data.url += "#";
			url += "#";
		}

		// Remove empty values when requested
		for (const rule of data.info.match) {
			if (rule.rev) data.url = data.url.replace(/=(?=&|$)/gm, "");
		}

		const diff = getLinkDiff(data.url, url);
		data.info = Object.assign(data.info, diff);

		// If the link is longer then we have an issue
		if (data.info.reduction < 0) {
			this.log(
				`Reduction is ${data.info.reduction}. Please report this link on GitHub: ${$github}/issues\n${data.info.original}`,
				"error",
			);
			data.url = data.info.original;
		}

		data.info.fullClean = true;
		data.info.full_clean = true;

		// Reset the original URL if there is no change, just to be safe
		if (data.info.difference === 0 && data.info.reduction === 0) {
			data.url = data.info.original;
		}

		return data;
	}
}

export const CleanURL = new Cleaner();
export const clean = (url: string) => CleanURL.clean(url);
export { validateURL } from "./utils";
