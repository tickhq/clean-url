import { describe, it, expect } from "vitest";
import {
	validateURL,
	decodeBase64,
	isJSON,
	urlHasParams,
	getLinkDiff,
	regexExtract,
	decodeURL,
	extractDomainKey,
	Encoding,
} from "../src/utils";
import type { Rule } from "../src/utils";

// ============================================================
// validateURL
// ============================================================

describe("validateURL", () => {
	it("accepts https", () => expect(validateURL("https://example.com")).toBe(true));
	it("accepts http", () => expect(validateURL("http://example.com")).toBe(true));
	it("rejects ftp", () => expect(validateURL("ftp://example.com")).toBe(false));
	it("rejects javascript:", () => expect(validateURL("javascript:alert(1)")).toBe(false));
	it("rejects empty", () => expect(validateURL("")).toBe(false));
	it("rejects random text", () => expect(validateURL("hello world")).toBe(false));
});

// ============================================================
// decodeBase64
// ============================================================

describe("decodeBase64", () => {
	it("decodes valid base64", () => {
		const encoded = Buffer.from("https://example.com").toString("base64");
		expect(decodeBase64(encoded)).toBe("https://example.com");
	});

	it("returns original on invalid input", () => {
		expect(decodeBase64("not-valid-b64!!!")).toBe("not-valid-b64!!!");
	});
});

// ============================================================
// isJSON
// ============================================================

describe("isJSON", () => {
	it("returns true for valid JSON objects", () => {
		expect(isJSON('{"key":"value"}')).toBe(true);
	});
	it("returns true for JSON arrays", () => {
		expect(isJSON("[1,2,3]")).toBe(true);
	});
	it("returns false for plain strings", () => {
		expect(isJSON('"hello"')).toBe(false);
	});
	it("returns false for numbers", () => {
		expect(isJSON("42")).toBe(false);
	});
	it("returns false for invalid JSON", () => {
		expect(isJSON("{not json}")).toBe(false);
	});
});

// ============================================================
// urlHasParams
// ============================================================

describe("urlHasParams", () => {
	it("returns true when params exist", () => {
		expect(urlHasParams("https://example.com?q=test")).toBe(true);
	});
	it("returns false when no params", () => {
		expect(urlHasParams("https://example.com/path")).toBe(false);
	});
	it("returns false for invalid URL", () => {
		expect(urlHasParams("not a url")).toBe(false);
	});
});

// ============================================================
// getLinkDiff
// ============================================================

describe("getLinkDiff", () => {
	it("calculates positive reduction", () => {
		const diff = getLinkDiff(
			"https://example.com",
			"https://example.com?utm_source=test",
		);
		expect(diff.reduction).toBeGreaterThan(0);
		expect(diff.difference).toBeGreaterThan(0);
	});

	it("detects new host", () => {
		const diff = getLinkDiff(
			"https://other.com",
			"https://example.com",
		);
		expect(diff.isNewHost).toBe(true);
	});

	it("detects same host", () => {
		const diff = getLinkDiff(
			"https://example.com/a",
			"https://example.com/b",
		);
		expect(diff.isNewHost).toBe(false);
	});
});

// ============================================================
// regexExtract
// ============================================================

describe("regexExtract", () => {
	it("extracts capture groups", () => {
		const result = regexExtract(/hello (\w+)/g, "hello world");
		expect(result[1]).toBe("world");
	});

	it("returns empty array on no match", () => {
		const result = regexExtract(/xyz/g, "hello");
		expect(result).toEqual([]);
	});
});

// ============================================================
// decodeURL
// ============================================================

describe("decodeURL", () => {
	it("decodes base64", () => {
		const encoded = Buffer.from("https://example.com").toString("base64");
		const result = decodeURL(encoded, Encoding.base64);
		expect(result).toBe("https://example.com");
	});

	it("decodes URL encoding", () => {
		const result = decodeURL("https%3A%2F%2Fexample.com", Encoding.urlc);
		expect(result).toBe("https://example.com");
	});

	it("decodes hex", () => {
		const hex = Buffer.from("hello").toString("hex");
		const result = decodeURL(hex, Encoding.hex);
		expect(result).toBe("hello");
	});

	it("returns original on failure", () => {
		const result = decodeURL("%ZZ%XX%bad", Encoding.urlc);
		expect(result).toBe("%ZZ%XX%bad");
	});
});

// ============================================================
// extractDomainKey
// ============================================================

describe("extractDomainKey", () => {
	function makeRule(match: RegExp, match_href = false): Rule {
		return { name: "test", match, match_href } as Rule;
	}

	it("extracts from .*\\.? pattern", () => {
		expect(extractDomainKey(makeRule(/.*\.?booking\.com/i))).toBe("booking.com");
	});

	it("extracts from .*\\.? pattern with subdomain", () => {
		expect(extractDomainKey(makeRule(/.*\.?open\.spotify\.com/i))).toBe(
			"open.spotify.com",
		);
	});

	it("extracts from anchored pattern", () => {
		expect(extractDomainKey(makeRule(/^www\.baidu\.com/i))).toBe(
			"www.baidu.com",
		);
	});

	it("extracts from unescaped tidy-url pattern", () => {
		expect(extractDomainKey(makeRule(/www\.audible\.com/i))).toBe(
			"www.audible.com",
		);
	});

	it("returns null for wildcard TLD patterns", () => {
		expect(extractDomainKey(makeRule(/.*\.?adguard\./i))).toBeNull();
	});

	it("returns null for alternation patterns", () => {
		expect(
			extractDomainKey(makeRule(/.*\.?indeed\.(com|co\.\w+)/i)),
		).toBeNull();
	});

	it("returns null for match_href rules", () => {
		expect(
			extractDomainKey(makeRule(/www\.twitch\.tv\/r\/e/i, true)),
		).toBeNull();
	});

	it("returns null for catch-all", () => {
		expect(extractDomainKey(makeRule(/.*/i))).toBeNull();
	});

	it("extracts from fully escaped domain", () => {
		expect(extractDomainKey(makeRule(/amp\.scmp\.com/i))).toBe("amp.scmp.com");
	});
});
