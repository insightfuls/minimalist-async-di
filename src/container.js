exports.Container = class Container {

	constructor() {
		this._registrations = new Map();
		this._pending = new Map();
		this._beans = new Map();
	}

	register(name, creator, ...dependencies) {
		if (!(creator instanceof BeanConfig) || !creator.creator) {
			throw new BeanError("second argument to Container#register must be a bean creator; " +
					"use constructor(), factory() or value()");
		}

		if (creator instanceof BeanValue) {
			this._beans.set(name, creator.value);

			return;
		}

		this._registrations.set(name, { ...creator, dependencies });
	}

	registerValue(name, bean) {
		this.register(name, new BeanValue(bean));
	}

	registerBean(name, bean) {
		this.register(name, new BeanValue(bean));
	}

	registerConstructor(name, Constructor, ...dependencies) {
		this.register(name, new BeanConstructor(Constructor), ...dependencies);
	}

	registerClass(name, Constructor, ...dependencies) {
		this.register(name, new BeanConstructor(Constructor), ...dependencies);
	}

	registerFactory(name, factory, ...dependencies) {
		this.register(name, new BeanFactory(factory), ...dependencies);
	}

	async get(name) {
		return this._get(new Set(), name);
	}

	async _get(ancestors, name) {
		if (ancestors.has(name)) {
			throw new BeanError(`dependency '${name}' creates a cycle`);
		}

		if (this._beans.has(name)) {
			return this._beans.get(name);
		}

		if (this._pending.has(name)) {
			return await this._pending.get(name);
		}

		if (!this._registrations.has(name)) {
			const lastDot = name.lastIndexOf(".");

			if (lastDot !== -1) {
				try {
					const bean = await this._get(ancestors, name.slice(0, lastDot));

					return bean[name.slice(lastDot + 1)];
				} catch (e) {
					if (!(e instanceof BeanError)) {
						throw e;
					}

					/* fall through */
				}
			}

			throw new BeanError(`no bean registered with name '${name}'`);
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

			return bean;
		} catch (e) {
			if (e instanceof BeanError) {
				throw new BeanError(`while instantiating bean '${name}':\n${e.message}`);
			}

			throw new Error(`while instantiating bean '${name}':\n${e.message}`);
		}
	}

};

class BeanConfig {
}
BeanConfig.prototype.creator = false;

class BeanValue extends BeanConfig {
	constructor(value) {
		super();
		this.value = value;
	}
}
BeanValue.prototype.creator = true;
exports.value = (value) => new BeanValue(value);

class BeanConstructor extends BeanConfig {
	constructor(Constructor) {
		super();
		this.Constructor = Constructor;
	}
}
BeanConstructor.prototype.creator = true;
exports.constructor = (Constructor) => new BeanConstructor(Constructor);

class BeanFactory extends BeanConfig {
	constructor(factory) {
		super();
		this.factory = factory;
	}
}
BeanFactory.prototype.creator = true;
exports.factory = (factory) => new BeanFactory(factory);

function BeanError(message) {
	this.message = message;
	this.stack = (new Error()).stack;
}
BeanError.prototype = Object.create(Error.prototype);
BeanError.prototype.constructor = BeanError;

exports.BeanError = BeanError;
