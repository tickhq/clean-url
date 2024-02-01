import type { Config } from "./utils";

export class CleanerConfig implements Config {
	public allowAMP: boolean = false;
	public allowCustomHandlers: boolean = true;
	public allowRedirects: boolean = true;
	public silent: boolean = true;

	copy(): Config {
		return {
			allowAMP: this.allowAMP,
			allowCustomHandlers: this.allowCustomHandlers,
			allowRedirects: this.allowRedirects,
			silent: this.silent,
		};
	}

	get<K extends keyof Config>(key: K): Config[K] {
		return this[key];
	}

	set<K extends keyof Config>(key: K, value: Config[K]): void {
		this[key] = value;
	}

	setMany(obj: Partial<Config>): void {
		for (const key of Object.keys(obj) as (keyof Config)[]) {
			const val = obj[key];
			if (val !== undefined) this.set(key, val);
		}
	}
}
