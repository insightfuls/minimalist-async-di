exports.Container = class {

	constructor() {
		this._registrations = new Map();
		this._pending = new Map();
		this._beans = new Map();
		this._init = null;
	}

	registerClass(name, Constructor, ...dependencies) {
		this._registrations.set(name, { Constructor, dependencies });
	}

	registerFactory(name, factory, ...dependencies) {
		this._registrations.set(name, { factory, dependencies });
	}

	registerBean(name, bean) {
		this._beans.set(name, bean);
	}

	initializeWith(method) {
		this._init = method;
	}

	async get(name) {
		return this._get(new Set(), name);
	}

	async _get(ancestors, name) {
		if (ancestors.has(name)) {
			throw new Error(`dependency '${name}' creates a cycle`);
		}

		if (this._beans.has(name)) {
			return this._beans.get(name);
		}

		if (this._pending.has(name)) {
			return await this._pending.get(name);
		}

		if (!this._registrations.has(name)) {
			throw new Error(`no bean registered with name '${name}'`);
		}

		const promise = this._instantiate(ancestors, name);

		this._pending.set(name, promise);
		this._registrations.delete(name);

		const bean = await promise;

		this._beans.set(name, bean);
		this._pending.delete(name);

		return bean;
	}

	async _instantiate(ancestors, name) {
		const registration = this._registrations.get(name);

		try {
			const dependencies = await Promise.all(registration.dependencies.map(
					dependency => this._get(new Set(ancestors).add(name), dependency)));

			let bean;
			if (registration.Constructor) {
				bean = new registration.Constructor(...dependencies);
			}
			if (registration.factory) {
				bean = await registration.factory(...dependencies);
			}

			if (this._init) {
				if (typeof (bean[this._init]) === "function") {
					await bean[this._init]();
				}
			}

			return bean;
		} catch (e) {
			throw new Error(`while instantiating bean '${name}':\n${e.message}`);
		}
	}

};
