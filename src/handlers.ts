import type { Handler } from "./utils";
import { decodeBase64, regexExtract, validateURL } from "./utils";

/**
 * Custom handlers for sites that encode or obfuscate the real URL.
 * Keys match rule.decode.handler; values implement Handler.exec(url, args) -> { url, error? }.
 */
export const handlers: Record<string, Handler> = {};

handlers["patchbot.io"] = {
	exec: (_str, args) => {
		try {
			const dec = args.decoded.replace(/%3D/g, "=");
			return { url: decodeURIComponent(dec.split("|")[2]) };
		} catch (error) {
			if (`${error}`.startsWith("URIError")) {
				error = new Error(
					"Unable to decode URI component. The URL may be invalid",
				);
			}
			return { url: args.originalURL, error };
		}
	},
};

handlers["urldefense.proofpoint.com"] = {
	exec: (_str, args) => {
		try {
			const arg = args.urlParams.get("u");
			if (arg === null) throw new Error("Target parameter (u) was null");
			const url = decodeURIComponent(
				arg.replace(/-/g, "%").replace(/_/g, "/").replace(/%2F/g, "/"),
			);
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["stardockentertainment.info"] = {
	exec: (str, args) => {
		try {
			const target = str.split("/").pop();
			let url = "";
			if (typeof target === "undefined") throw new Error("Undefined target");
			url = decodeBase64(target);
			if (url.includes("watch>v=")) url = url.replace("watch>v=", "watch?v=");
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["steam.gs"] = {
	exec: (str, args) => {
		try {
			const target = str.split("%3Eutm_").shift();
			let url = "";
			if (target) url = target;
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["0yxjo.mjt.lu"] = {
	exec: (str, args) => {
		try {
			const target = str.split("/").pop();
			let url = "";
			if (typeof target === "undefined") throw new Error("Undefined target");
			url = decodeBase64(target);
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["click.redditmail.com"] = {
	exec: (str, args) => {
		try {
			const reg = /https:\/\/click\.redditmail\.com\/CL0\/(.*?)\//gi;
			const matches = regexExtract(reg, str);
			if (typeof matches[1] === "undefined")
				throw new Error("regexExtract failed to find a URL");
			const url = decodeURIComponent(matches[1]);
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["deals.dominos.co.nz"] = {
	exec: (str, args) => {
		try {
			const target = str.split("/").pop();
			let url = "";
			if (!target) throw new Error("Missing target");
			url = decodeBase64(target);
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["redirectingat.com"] = {
	exec(str, args) {
		try {
			let url = "";
			const [host, target, ..._other] = str.split("?id");
			if (host === "https://go.redirectingat.com/") {
				const decoded = decodeURIComponent(target);
				const corrected = new URL(`${host}?id=${decoded}`);
				const param = corrected.searchParams.get("url");
				if (param && validateURL(param)) {
					url = param;
				} else {
					throw new Error("Handler failed, result: " + (param ?? "No param"));
				}
			} else {
				url = args.originalURL;
			}
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};

handlers["twitch.tv-email"] = {
	note: "Used for Twitch email tracking links",
	exec(str, args) {
		try {
			const reg = /www\.twitch\.tv\/r\/e\/(.*?)\//;
			let url = "";
			const data = regexExtract(reg, str);
			const decode = decodeBase64(data[1]);
			const parse = JSON.parse(decode);
			if (parse["name"] === "twitch_favorite_up") {
				url = "https://www.twitch.tv/" + parse.channel;
			}
			return { url };
		} catch (error) {
			return { url: args.originalURL, error };
		}
	},
};
