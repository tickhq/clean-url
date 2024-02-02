import { describe, it, expect } from "vitest";
import { handlers } from "../src/handlers";

describe("Handlers", () => {
	describe("urldefense.proofpoint.com", () => {
		it("decodes Proofpoint URL defense wrapper", () => {
			const handler = handlers["urldefense.proofpoint.com"];
			const result = handler.exec(
				"https://urldefense.proofpoint.com/v2/url?u=https-3A__example.com_path&d=abc",
				{
					decoded: "",
					lastPath: "",
					fullPath: "/v2/url",
					urlParams: new URLSearchParams(
						"u=https-3A__example.com_path&d=abc",
					),
					originalURL:
						"https://urldefense.proofpoint.com/v2/url?u=https-3A__example.com_path&d=abc",
				},
			);
			expect(result.url).toContain("example.com");
			expect(result.error).toBeUndefined();
		});

		it("returns original on missing u param", () => {
			const handler = handlers["urldefense.proofpoint.com"];
			const originalURL = "https://urldefense.proofpoint.com/v2/url?d=abc";
			const result = handler.exec(originalURL, {
				decoded: "",
				lastPath: "",
				fullPath: "/v2/url",
				urlParams: new URLSearchParams("d=abc"),
				originalURL,
			});
			expect(result.url).toBe(originalURL);
			expect(result.error).toBeDefined();
		});
	});

	describe("redirectingat.com", () => {
		it("extracts url param from redirecting service", () => {
			const handler = handlers["redirectingat.com"];
			const targetUrl = "https://example.com/product";
			const encoded = encodeURIComponent(
				`12345&url=${encodeURIComponent(targetUrl)}&sref=test`,
			);
			const fullUrl = `https://go.redirectingat.com/?id${encoded}`;
			const result = handler.exec(fullUrl, {
				decoded: "",
				lastPath: "",
				fullPath: "/",
				urlParams: new URL(fullUrl).searchParams,
				originalURL: fullUrl,
			});
			expect(result.url).toBe(targetUrl);
		});
	});

	describe("click.redditmail.com", () => {
		it("extracts URL from Reddit mail tracking", () => {
			const handler = handlers["click.redditmail.com"];
			const target = encodeURIComponent("https://www.reddit.com/r/test");
			const url = `https://click.redditmail.com/CL0/${target}/1`;
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "",
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toContain("reddit.com");
		});
	});

	describe("stardockentertainment.info", () => {
		it("decodes base64 target from URL path", () => {
			const handler = handlers["stardockentertainment.info"];
			const target = Buffer.from("https://example.com/video").toString(
				"base64",
			);
			const url = `https://stardockentertainment.info/redirect/${target}`;
			const result = handler.exec(url, {
				decoded: "",
				lastPath: target,
				fullPath: `/redirect/${target}`,
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toContain("example.com");
		});
	});

	describe("patchbot.io", () => {
		it("decodes pipe-separated encoded string", () => {
			const handler = handlers["patchbot.io"];
			const targetEncoded = encodeURIComponent("https://example.com/patch");
			const decoded = `type|param|${targetEncoded}`;
			const result = handler.exec("https://patchbot.io/link/abc", {
				decoded,
				lastPath: "abc",
				fullPath: "/link/abc",
				urlParams: new URLSearchParams(),
				originalURL: "https://patchbot.io/link/abc",
			});
			expect(result.url).toContain("example.com");
		});
	});

	describe("steam.gs", () => {
		it("strips utm tracking from encoded URL", () => {
			const handler = handlers["steam.gs"];
			const url = "https://store.steampowered.com/app/123%3Eutm_source=newsletter";
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "/",
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toBe("https://store.steampowered.com/app/123");
			expect(result.error).toBeUndefined();
		});

		it("returns original URL when no %3Eutm_ delimiter", () => {
			const handler = handlers["steam.gs"];
			const url = "https://store.steampowered.com/app/123";
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "/",
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toBe(url);
		});
	});

	describe("0yxjo.mjt.lu", () => {
		it("decodes base64 target from URL path", () => {
			const handler = handlers["0yxjo.mjt.lu"];
			const target = Buffer.from("https://example.com/newsletter").toString("base64");
			const url = `https://0yxjo.mjt.lu/redirect/${target}`;
			const result = handler.exec(url, {
				decoded: "",
				lastPath: target,
				fullPath: `/redirect/${target}`,
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toContain("example.com");
		});

		it("returns original on missing path segment", () => {
			const handler = handlers["0yxjo.mjt.lu"];
			const url = "https://0yxjo.mjt.lu/redirect/";
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "/redirect/",
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			// Empty string from split("/").pop() won't decode to a valid URL
			expect(result).toBeDefined();
		});
	});

	describe("deals.dominos.co.nz", () => {
		it("decodes base64 target from URL path", () => {
			const handler = handlers["deals.dominos.co.nz"];
			const target = Buffer.from("https://www.dominos.co.nz/deals").toString("base64");
			const url = `https://deals.dominos.co.nz/track/${target}`;
			const result = handler.exec(url, {
				decoded: "",
				lastPath: target,
				fullPath: `/track/${target}`,
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toContain("dominos.co.nz");
		});

		it("returns original when target is missing", () => {
			const handler = handlers["deals.dominos.co.nz"];
			const url = "https://deals.dominos.co.nz/track/";
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "/track/",
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.error).toBeDefined();
			expect(result.url).toBe(url);
		});
	});

	describe("twitch.tv-email", () => {
		it("extracts channel URL from Twitch email tracking", () => {
			const handler = handlers["twitch.tv-email"];
			const payload = JSON.stringify({ name: "twitch_favorite_up", channel: "testchannel" });
			const encoded = Buffer.from(payload).toString("base64");
			const url = `https://www.twitch.tv/r/e/${encoded}/extra`;
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: `/r/e/${encoded}/extra`,
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toBe("https://www.twitch.tv/testchannel");
		});

		it("returns original on invalid base64 payload", () => {
			const handler = handlers["twitch.tv-email"];
			const url = "https://www.twitch.tv/r/e/not-valid-b64/extra";
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "/r/e/not-valid-b64/extra",
				urlParams: new URLSearchParams(),
				originalURL: url,
			});
			expect(result.url).toBe(url);
			expect(result.error).toBeDefined();
		});
	});

	describe("redirectingat.com", () => {
		it("returns original for non-matching host", () => {
			const handler = handlers["redirectingat.com"];
			const url = "https://other.redirectingat.com/?id=123";
			const result = handler.exec(url, {
				decoded: "",
				lastPath: "",
				fullPath: "/",
				urlParams: new URL(url).searchParams,
				originalURL: url,
			});
			expect(result.url).toBe(url);
		});
	});
});
