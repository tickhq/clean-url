/** A param rule: literal string for exact match, or RegExp for pattern match (e.g. /^utm_/). */
export type ParamRule = string | RegExp;

export type Rule = {
	name: string;
	match: RegExp;
	/** When true, run `match` against the full URL (href) instead of just the host. */
	match_href?: boolean;
	/** Parameters to remove when this rule matches. Strings for exact, RegExp for pattern. */
	rules?: ParamRule[];
	/** Pathname regex replacements (e.g. Amazon ref path cleanup). */
	replace?: RegExp[];
	/** When set, if any of these regexes match the URL this rule is skipped. */
	exclude?: RegExp[];
	/** Redirect parameter name: extract this param's value and redirect to it. */
	redirect?: string;
	amp?: {
		regex?: RegExp;
		replace?: {
			text: string | RegExp;
			with?: string;
		};
		sliceTrailing?: string;
	};
	decode?: {
		param?: string;
		lookFor?: string;
		encoding?: Encoding;
		targetPath?: boolean;
		handler?: string;
	};
	/** Remove empty values from query string. */
	rev?: boolean;
};

export type Data = {
	url: string;
	info: {
		original: string;
		reduction: number;
		difference: number;
		replace: RegExp[];
		removed: { key: string; value: string }[];
		handler: string | null;
		match: Rule[];
		decoded: { [key: string]: any } | null;
		isNewHost: boolean;
		fullClean: boolean;
	};
};

export enum Encoding {
	base64 = "base64",
	base32 = "base32",
	base45 = "base45",
	url = "url",
	urlc = "urlc",
	binary = "binary",
	hex = "hex",
}

export type Config = {
	allowAMP: boolean;
	allowCustomHandlers: boolean;
	allowRedirects: boolean;
};

export type HandlerArgs = {
	decoded: string;
	lastPath: string;
	fullPath: string;
	urlParams: URLSearchParams;
	readonly originalURL: string;
};

export type Handler = {
	readonly note?: string;
	exec: (
		str: string,
		args: HandlerArgs,
	) => {
		url: string;
		error?: any;
	};
};

export type LinkDiff = {
	isNewHost: boolean;
	difference: number;
	reduction: number;
};

/**
 * Decode a base64 string. Uses `atob` in browsers, `Buffer` in Node.
 * Returns the original string on failure.
 */
export const decodeBase64 = (str: string): string => {
	try {
		if (typeof atob === "undefined") {
			return Buffer.from(str, "base64").toString("binary");
		}
		return atob(str);
	} catch {
		return str;
	}
};

export const isJSON = (data: string): boolean => {
	try {
		return typeof JSON.parse(data) === "object";
	} catch {
		return false;
	}
};

export const urlHasParams = (url: string): boolean => {
	try {
		return new URL(url).searchParams.toString().length > 0;
	} catch {
		return false;
	}
};

export const validateURL = (url: string): boolean => {
	try {
		const proto = new URL(url).protocol.toLowerCase();
		return proto === "http:" || proto === "https:";
	} catch {
		return false;
	}
};

export const getLinkDiff = (
	cleanedURL: string,
	originalURL: string,
): LinkDiff => {
	let isNewHost = false;
	try {
		isNewHost = new URL(cleanedURL).hostname !== new URL(originalURL).hostname;
	} catch {}
	return {
		isNewHost,
		difference: originalURL.length - cleanedURL.length,
		reduction: +(100 - (cleanedURL.length / originalURL.length) * 100).toFixed(
			2,
		),
	};
};

export const regexExtract = (regex: RegExp, str: string): string[] => {
	regex.lastIndex = 0;
	const matches = regex.exec(str);
	if (!matches) return [];
	return [...matches];
};

const _placeholder = (decoded: string) => decoded;
const decoders: Record<Encoding, (decoded: string) => string> = {
	[Encoding.url]: (s) => decodeURI(s),
	[Encoding.urlc]: (s) => decodeURIComponent(s),
	[Encoding.base32]: _placeholder,
	[Encoding.base45]: _placeholder,
	[Encoding.base64]: (s) => decodeBase64(s),
	[Encoding.binary]: _placeholder,
	[Encoding.hex]: (s) => {
		let out = "";
		for (let i = 0; i < s.length; i += 2) {
			out += String.fromCharCode(parseInt(s.substring(i, i + 2), 16));
		}
		return out;
	},
};

export const decodeURL = (
	str: string,
	encoding: Encoding = Encoding.base64,
): string => {
	try {
		return decoders[encoding](str);
	} catch {
		return str;
	}
};

/**
 * Extract a literal domain key from a rule's match regex for index-based lookup.
 * Returns null if the pattern is too complex to index (wildcards, alternation, etc.).
 */
export function extractDomainKey(rule: Rule): string | null {
	if (rule.match_href) return null;

	const src = rule.match.source;

	// Pattern: .*\.?domain\.tld (AdGuard-derived, fully escaped)
	let m = src.match(/^\.\*\\\.\?(.+)$/);
	if (m) {
		const rest = m[1];
		// All literal: alphanumeric/hyphens + escaped dots, no wildcards
		if (/^[a-z0-9-]+(\\\.[a-z0-9-]+)+$/i.test(rest)) {
			return rest.replace(/\\\./g, ".").toLowerCase();
		}
		// Wildcard TLD like .*\.?adguard\. or .*\.?yandex\..*
		return null;
	}

	// Anchored patterns: ^.*\.?domain.com or ^.*.domain.com (with wildcard prefix)
	// Bare ^domain.com (no .*) must NOT be indexed — the ^ anchor means exact
	// match only, but suffix lookup would also match subdomains.
	m = src.match(/^\^(\.\*\.?)?([a-z0-9][a-z0-9.\\\-]+)$/i);
	if (m) {
		if (!m[1]) return null; // ^domain.com → exact match, can't index by suffix
		const candidate = m[2].replace(/\\\./g, ".");
		if (/^[a-z0-9.-]+$/i.test(candidate) && candidate.includes(".")) {
			return candidate.toLowerCase();
		}
		return null;
	}

	// Unescaped patterns from original tidy-url: www.domain.com or .*.domain.com
	m = src.match(/^(?:\.\*\.?)?([a-z0-9][a-z0-9.-]+)$/i);
	if (m) {
		const candidate = m[1];
		if (candidate.includes(".") && /^[a-z0-9.-]+$/i.test(candidate)) {
			return candidate.toLowerCase();
		}
		return null;
	}

	// Fully escaped without .*\.? prefix: domain\.tld
	m = src.match(/^[a-z0-9-]+(\\\.([a-z0-9-]+))+$/i);
	if (m) {
		return src.replace(/\\\./g, ".").toLowerCase();
	}

	return null;
}
