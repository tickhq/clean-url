import {
	decodeURL,
	getLinkDiff,
	isJSON,
	validateURL,
	extractDomainKey,
	Encoding,
	type Rule,
	type Data,
	type Handler,
	type Config,
} from "./utils";
import { handlers as defaultHandlers } from "./handlers";
import { CleanerConfig } from "./config";
import defaultRules from "../lib/rules";

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
	config?: Partial<Config>;
};

export class Cleaner {
	public rules: Rule[] = [];
	public config: CleanerConfig = new CleanerConfig();
	private handlers: Record<string, Handler> = defaultHandlers;

	// Pre-computed index structures
	private _expandedRulesCache: Rule[] | null = null;
	private _globalRule: Rule | null = null;
	private _domainIndex: Map<string, Rule[]> = new Map();
	private _regexFallbackRules: Rule[] = [];
	private _indexed = false;

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
		this.buildIndex();
	}

	/**
	 * Build a domain-based index for O(1) hostname lookups.
	 * Rules that can't be indexed by domain fall back to regex scanning.
	 */
	private buildIndex(): void {
		this._domainIndex.clear();
		this._regexFallbackRules = [];
		this._globalRule = null;
		this._indexed = true;

		for (const rule of this.expandedRules) {
			// Global catch-all rule
			if (rule.match.source === ".*" && !rule.match_href) {
				this._globalRule = rule;
				continue;
			}

			const domainKey = extractDomainKey(rule);
			if (domainKey) {
				let list = this._domainIndex.get(domainKey);
				if (!list) {
					list = [];
					this._domainIndex.set(domainKey, list);
				}
				list.push(rule);
			} else {
				this._regexFallbackRules.push(rule);
			}
		}
	}

	/**
	 * Find all rules matching a given parsed URL.
	 * Uses the domain index for fast lookup, then falls back to regex for complex patterns.
	 */
	private matchRules(parsed: URL): Rule[] {
		if (!this._indexed) this.buildIndex();

		const matched: Rule[] = [];

		// Global rule always matches
		if (this._globalRule) matched.push(this._globalRule);

		// Domain index: check all hostname suffixes
		const hostname = parsed.hostname.toLowerCase();
		const parts = hostname.split(".");
		for (let i = 0; i < parts.length; i++) {
			const suffix = parts.slice(i).join(".");
			const rules = this._domainIndex.get(suffix);
			if (rules) matched.push(...rules);
		}

		// Regex fallback for complex patterns
		for (const rule of this._regexFallbackRules) {
			const target = rule.match_href ? parsed.href : parsed.hostname;
			rule.match.lastIndex = 0;
			if (rule.match.exec(target) !== null) {
				matched.push(rule);
			}
		}

		return matched;
	}

	/**
	 * Clean a URL by removing tracking parameters, handling redirects,
	 * de-AMPing, and decoding obfuscated links.
	 */
	public clean(_url: string, allowReclean = true, _depth = 0): Data {
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
				isNewHost: false,
				fullClean: false,
			},
		};

		if (_depth > MAX_REDIRECT_DEPTH) return data;

		// Parse once, reuse throughout
		let parsed: URL;
		try {
			parsed = new URL(_url);
		} catch {
			return data;
		}

		const proto = parsed.protocol.toLowerCase();
		if (proto !== "http:" && proto !== "https:") {
			return data;
		}

		// Rebuild to normalize
		const url =
			parsed.protocol +
			"//" +
			parsed.host +
			parsed.pathname +
			parsed.search +
			parsed.hash;
		data.url = url;

		const cleaner = parsed.searchParams;
		let pathname = parsed.pathname;

		// Capture re-encoded baseline before any deletions (URLSearchParams
		// re-encodes chars like !, ', ~ which inflates length — comparing against
		// the same encoding avoids false sanity-check reverts).
		const baselineSearch = cleaner.toString();

		// Case-insensitive copy for redirect lookup
		const cleanerCI = new URLSearchParams();
		cleaner.forEach((v, k) => cleanerCI.append(k.toLowerCase(), v));

		// Match rules using the domain index
		const matchedRules = this.matchRules(parsed);
		data.info.match = matchedRules;

		// Check exclusion rules first -- abort before doing any work
		for (const rule of matchedRules) {
			if (!rule.exclude) continue;
			for (const reg of rule.exclude) {
				reg.lastIndex = 0;
				if (reg.exec(url) !== null) {
					data.url = data.info.original;
					return data;
				}
			}
		}

		// Collect params to remove: separate string literals from regex patterns
		const literalParams = new Set<string>();
		const regexParams: RegExp[] = [];

		for (const rule of matchedRules) {
			if (rule.rules) {
				for (const r of rule.rules) {
					if (typeof r === "string") literalParams.add(r);
					else regexParams.push(r);
				}
			}
			if (rule.replace?.length) data.info.replace.push(...rule.replace);
		}

		// Delete matching literal parameters
		for (const key of literalParams) {
			if (cleaner.has(key)) {
				data.info.removed.push({ key, value: cleaner.get(key) as string });
				cleaner.delete(key);
			}
		}

		// Delete parameters matching regex patterns
		if (regexParams.length > 0) {
			const keys = [...cleaner.keys()];
			for (const key of keys) {
				for (const regex of regexParams) {
					regex.lastIndex = 0;
					if (regex.test(key)) {
						data.info.removed.push({
							key,
							value: cleaner.get(key) as string,
						});
						cleaner.delete(key);
						break;
					}
				}
			}
		}

		// Pathname replacement
		for (const re of data.info.replace) {
			const changed = pathname.replace(re, "");
			if (changed !== pathname) pathname = changed;
		}

		// Rebuild URL with cleaned params
		const qs = cleaner.toString();
		data.url =
			parsed.protocol +
			"//" +
			parsed.host +
			pathname +
			(qs ? "?" + qs : "") +
			parsed.hash;

		// Redirect handling
		if (this.config.allowRedirects) {
			for (const rule of matchedRules) {
				if (!rule.redirect) continue;
				const target = rule.redirect;
				if (!cleanerCI.has(target)) continue;

				let value = cleanerCI.get(target) as string;

				// Decode if URL-encoded
				const decoded = decodeURL(value, Encoding.urlc);
				if (decoded !== value && validateURL(decoded)) value = decoded;

				if (validateURL(value)) {
					data.url = value + parsed.hash;
					if (allowReclean) {
						data.url = this.clean(data.url, false, _depth + 1).url;
					}
				}
			}
		}

		// De-AMP handling
		if (!this.config.allowAMP) {
			for (const rule of matchedRules) {
				try {
					if (
						!rule.amp ||
						!(rule.amp.regex || rule.amp.replace || rule.amp.sliceTrailing)
					)
						continue;

					if (rule.amp.replace) {
						data.info.handler = rule.name;
						data.url = data.url.replace(
							rule.amp.replace.text,
							rule.amp.replace.with ?? "",
						);
					}

					if (rule.amp.regex) {
						rule.amp.regex.lastIndex = 0;
						const result = rule.amp.regex.exec(data.url);

						if (result?.[1]) {
							data.info.handler = rule.name;
							let target = decodeURIComponent(result[1]);
							if (!/^https?:\/\//i.test(target))
								target = "https://" + target;
							if (validateURL(target)) {
								data.url = allowReclean
									? this.clean(target, false, _depth + 1).url
									: target;
							}
						}
					}

					if (rule.amp.sliceTrailing && data.url.endsWith(rule.amp.sliceTrailing)) {
						data.url = data.url.slice(0, -rule.amp.sliceTrailing.length);
					}

					if (data.url.endsWith("%3Famp"))
						data.url = data.url.slice(0, -6);
					if (data.url.endsWith("amp/"))
						data.url = data.url.slice(0, -4);
				} catch {}
			}
		}

		// Decode handler
		for (const rule of matchedRules) {
			try {
				if (!rule.decode) continue;
				if (
					!cleaner.has(rule.decode.param ?? "") &&
					rule.decode.targetPath !== true
				)
					continue;
				if (!this.config.allowRedirects) continue;
				if (!this.config.allowCustomHandlers && rule.decode.handler) continue;

				const encoding = rule.decode.encoding ?? Encoding.base64;
				let lastPath = pathname.split("/").pop() ?? "";
				const param = cleaner.get(rule.decode.param ?? "");
				let encodedString: string;

				if (param === null) encodedString = lastPath;
				else if (param) encodedString = param;
				else continue;

				let decoded = decodeURL(encodedString, encoding);
				let target = "";
				let recleanData: string | null = null;

				if (isJSON(decoded)) {
					const json = JSON.parse(decoded);
					target = json[rule.decode.lookFor!];
					data.info.decoded = json;
				} else if (this.config.allowCustomHandlers && rule.decode.handler) {
					const handler = this.handlers[rule.decode.handler];
					if (handler) {
						data.info.handler = rule.decode.handler;
						const result = handler.exec(data.url, {
							decoded,
							lastPath,
							urlParams: new URL(data.url).searchParams,
							fullPath: pathname,
							originalURL: data.url,
						});

						if (
							result.error ||
							!validateURL(result.url) ||
							result.url.trim() === ""
						) {
							continue;
						}
						recleanData = result.url;
					}
				} else {
					target = decoded;
				}

				target = allowReclean
					? this.clean(recleanData ?? target, false, _depth + 1).url
					: (recleanData ?? target);

				if (target && target !== "" && validateURL(target)) {
					data.url = target + parsed.hash;
				}
			} catch {}
		}

		// Preserve trailing hash
		if (_url.endsWith("#") && !data.url.endsWith("#")) {
			data.url += "#";
		}

		// Remove empty values when requested (rev rules)
		for (const rule of matchedRules) {
			if (rule.rev) data.url = data.url.replace(/=(?=&|$)/gm, "");
		}

		// Calculate diff (compare against re-encoded baseline so URLSearchParams
		// encoding inflation doesn't trigger a false revert)
		const baselineUrl =
			parsed.protocol +
			"//" +
			parsed.host +
			parsed.pathname +
			(baselineSearch ? "?" + baselineSearch : "") +
			parsed.hash;
		const diff = getLinkDiff(data.url, baselineUrl);
		data.info.isNewHost = diff.isNewHost;
		data.info.difference = diff.difference;
		data.info.reduction = diff.reduction;

		// Sanity check: cleaned URL should not be longer
		if (data.info.reduction < 0) {
			data.url = data.info.original;
		}

		data.info.fullClean = true;

		// No change -> return original (safety)
		if (data.info.difference === 0 && data.info.reduction === 0) {
			data.url = data.info.original;
		}

		return data;
	}
}

export const CleanURL = new Cleaner();
export const clean = (url: string) => CleanURL.clean(url);
export { validateURL } from "./utils";
