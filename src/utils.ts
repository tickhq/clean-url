export type Rule = {
	name: string; // website name
	match: RegExp; // regex to test against the host (or full URL if match_href is true)
	/** When true, run `match` against the full URL (href) instead of just the host. Use for path- or query-specific rules (e.g. twitch.tv/r/e, vi-control.net?source=...). */
	match_href?: boolean;
	/** Parameters to remove when this rule matches. */
	rules?: string[];
	/**
	 * Used in special cases where parts of the URL needs to be modified.
	 * See the amazon.com rule for an example.
	 */
	replace?: any[];
	/** When set, if any of these regexes match the URL this rule is skipped. */
	exclude?: RegExp[];
	/**
	 * Used to auto-redirect to a different URL based on the parameter.
	 * This is used to skip websites that track external links.
	 */
	redirect?: string;
	amp?: {
		/**
		 * Standard AMP handling using RegExp capture groups.
		 */
		regex?: RegExp;
		/**
		 * Replace text in the URL. If `with` is used the text will be
		 * replaced with what you set instead of removing it.
		 */
		replace?: {
			/** The text or RegEx you want to replace */
			text: string | RegExp;
			/** The text you want to replace it with. Optional */
			with?: string;
			/** Currently has no effect, this will change in another update */
			target?: "host" | "full";
		};
		/**
		 * Slice off a trailing string, these are usually "/amp" or "amp/"
		 * This setting should help prevent breaking any pages.
		 */
		sliceTrailing?: string;
	};
	/**
	 * Used to decode a parameter or path, then redirect based on the returned object
	 */
	decode?:
		| {
				param?: string;
				lookFor?: string;
				encoding?: Encoding;
				targetPath?: boolean;
				handler?: string;
		  }
		| undefined;
	/** Remove empty values */
	rev?: boolean;
};

export type Data = {
	/** Cleaned URL */
	url: string;
	/** Some debugging information about what was changed */
	info: {
		/** Original URL before cleaning */
		original: string;
		/** URL reduction as a percentage */
		reduction: number;
		/** Number of characters removed */
		difference: number;
		/** RegEx Replacements */
		replace: any[];
		/** Parameters that were removed */
		removed: { key: string; value: string }[];
		/** Handler used */
		handler: string | null;
		/** Rules matched */
		match: any[];
		/** The decoded object from the decode parameter (if it exists) */
		decoded: { [key: string]: any } | null;
		/** @deprecated Please use `isNewHost`. This will be removed in the next major update. */
		is_new_host: boolean;
		/** If the compared links have different hosts */
		isNewHost: boolean;
		/** @deprecated Please use `fullClean`. This will be removed in the next major update. */
		full_clean: boolean;
		/** If the code reached the end of the clean without error */
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
	/**
	 * There's a whole number of reasons why you don't want AMP links,
	 * too many to fit in this description.
	 * See this link for more info: https://redd.it/ehrq3z
	 */
	allowAMP: boolean;
	/**
	 * Custom handlers for specific websites that use tricky URLs
	 * that make it harder to "clean"
	 */
	allowCustomHandlers: boolean;
	/**
	 * Used to auto-redirect to a different URL based on the parameter.
	 * This is used to skip websites that track external links.
	 */
	allowRedirects: boolean;
	/** Nothing logged to console */
	silent: boolean;
};

export type HandlerArgs = {
	/** The attemp made at decoding the string, may be invalid */
	decoded: string;
	/** The last part of the URL path, split by a forward slash */
	lastPath: string;
	/** The full URL path excluding the host */
	fullPath: string;
	/** A fresh copy of URLSearchParams */
	urlParams: URLSearchParams;
	/** The original URL */
	readonly originalURL: string;
};

export type Handler = {
	readonly note?: string;
	exec: (
		/** The original URL */
		str: string,
		/** Various args that can be used when writing a handler */
		args: HandlerArgs,
	) => {
		/** The original URL */
		url: string;
		error?: any;
	};
};

export type LinkDiff = {
	/** @deprecated Please use isNewHost */
	is_new_host: boolean;
	/** If the compared links have different hosts */
	isNewHost: boolean;
	difference: number;
	reduction: number;
};

export type GuessEncoding = {
	base64: boolean;
	isJSON: boolean;
};

/**
 * Accepts any base64 string and attempts to decode it.
 * If run through the browser `atob` will be used, otherwise
 * the code will use `Buffer.from`.
 * If there's an error the original string will be returned.
 * @param str String to be decoded
 * @returns Decoded string
 */
export const decodeBase64 = (str: string): string => {
	try {
		let result = str;

		if (typeof atob === "undefined") {
			result = Buffer.from(str, "base64").toString("binary");
		} else {
			result = atob(str);
		}

		return result;
	} catch (error) {
		return str;
	}
};

/**
 * Checks if data is valid JSON. The result will be either `true` or `false`.
 * @param data Any string that might be JSON
 * @returns true or false
 */
export const isJSON = (data: string): boolean => {
	try {
		const sample = JSON.parse(data);
		if (typeof sample !== "object") return false;
		return true;
	} catch (error) {
		return false;
	}
};

/**
 * Check if a domain has any URL parameters
 * @param url Any valid URL
 * @returns true / false
 */
export const urlHasParams = (url: string): boolean => {
	try {
		return new URL(url).searchParams.toString().length > 0;
	} catch (error) {
		return false;
	}
};

/**
 * Determine if the input is a valid URL or not. This will only
 * accept http and https protocols.
 * @param url Any URL
 * @returns true / false
 */
export const validateURL = (url: string): boolean => {
	try {
		const pass = ["http:", "https:"];
		const test = new URL(url);
		const prot = test.protocol.toLowerCase();

		if (!pass.includes(prot)) {
			throw new Error("Not acceptable protocol: " + prot);
		}

		return true;
	} catch {
		return false;
	}
};

/**
 * Check if a string is b64. For now this should only be
 * used in testing.
 * @param str Any possible b64 string
 * @returns true/false
 */
export const isB64 = (str: string): boolean => {
	try {
		const regex =
			/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
		return regex.test(str);
	} catch (error) {
		return false; // Using try/catch to be safe
	}
};

/**
 * DO NOT USE THIS IN HANDLERS.
 * This is purely for use in testing to save time.
 * This is not reliable, there are many incorrect
 * matches and it will fail in a lot of cases.
 * Do not use it anywhere else.
 * @param str Any string
 * @returns An object with possible encodings
 */
export const guessEncoding = (str: string): GuessEncoding => {
	return {
		base64: isB64(str),
		isJSON: isJSON(str),
	};
};

/**
 * Calculates the difference between two links and returns an object of information.
 * @param firstURL Any valid URL
 * @param secondURL Any valid URL
 * @returns The difference between two links
 */
export const getLinkDiff = (firstURL: string, secondURL: string): LinkDiff => {
	const oldUrl = new URL(firstURL);
	const newUrl = new URL(secondURL);

	return {
		is_new_host: oldUrl.host !== newUrl.host,
		isNewHost: oldUrl.host !== newUrl.host,
		difference: secondURL.length - firstURL.length,
		reduction: +(100 - (firstURL.length / secondURL.length) * 100).toFixed(2),
	};
};

export const regexExtract = (regex: RegExp, str: string): string[] => {
	let matches: RegExpExecArray | null = null;
	let result: string[] = [];
	let i = 0;

	// Limit to 10 to avoid infinite loop
	if ((matches = regex.exec(str)) !== null && i !== 10) {
		i++;
		if (matches.index === regex.lastIndex) regex.lastIndex++;
		matches.forEach((v) => result.push(v));
	}

	return result;
};

/**
 * These are methods that have not been written yet,
 * the original string will be returned.
 */
const _placeholder = (decoded: string) => decoded;
const decoders: Record<Encoding, (decoded: string) => string> = {
	[Encoding.url]: (decoded: string) => decodeURI(decoded),
	[Encoding.urlc]: (decoded: string) => decodeURIComponent(decoded),
	[Encoding.base32]: _placeholder,
	[Encoding.base45]: _placeholder,
	[Encoding.base64]: (decoded: string) => decodeBase64(decoded),
	[Encoding.binary]: _placeholder,
	[Encoding.hex]: (decoded: string) => {
		let hex = decoded.toString();
		let out = "";
		for (var i = 0; i < hex.length; i += 2) {
			out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
		}
		return out;
	},
};

/**
 * Attempts to decode a URL or string using the selected method.
 * If the decoding fails the original string will be returned.
 * `encoding` is optional and will default to base64
 * @param str String to decode
 * @param encoding Encoding to use
 * @returns decoded string
 */
export const decodeURL = (
	str: string,
	encoding: Encoding = Encoding.base64,
): string => {
	try {
		return decoders[encoding](str);
	} catch (error) {
		return str;
	}
};
