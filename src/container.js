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
			this._beans.set(name, { bean: creator.value });

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
		return (await this._resolveBeanNamed(name, new Set())).bean;
	}

	async _resolveBeanNamed(name, ancestors) {
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
					const bean = await this._resolveBeanNamed(name.slice(0, lastDot), ancestors);

					return {
						parent: bean.bean,
						bean: bean.bean[name.slice(lastDot + 1)]
					};
				} catch (e) {
					if (!(e instanceof BeanError)) {
						throw e;
					}

					/* fall through */
				}
			}

			throw new BeanError(`no bean registered with name '${name}'`);
		}

		const promise = this._createBeanNamed(name, ancestors);

		this._pending.set(name, promise);
		this._registrations.delete(name);

		const bean = await promise;

		this._beans.set(name, bean);
		this._pending.delete(name);

		return bean;
	}

	async _createBeanNamed(name, ancestors) {
		const registration = this._registrations.get(name);

		try {
			const dependencyAncestors = new Set(ancestors).add(name);

			const resolvedDependencies =
					await Promise.all(this._dependencyNamesFor(registration)
					.map(dependency => this._resolveBeanNamed(dependency, dependencyAncestors)));

			return await this._createBeanFor(registration, resolvedDependencies);
		} catch (e) {
			if (e instanceof BeanError) {
				throw new BeanError(`while creating bean '${name}':\n${e.message}`);
			}

			throw new Error(`while creating bean '${name}':\n${e.message}`);
		}
	}

	_dependencyNamesFor(registration) {
		const dependencyNames = registration.dependencies;

		if (typeof registration.Constructor === 'string') {
			dependencyNames.push(registration.Constructor);
		}
		if (typeof registration.factory === 'string') {
			dependencyNames.push(registration.factory);
		}

		return dependencyNames;
	}

	async _createBeanFor(registration, resolvedDependencies) {
		let fn = registration.Constructor || registration.factory;

		if (typeof fn === 'string') {
			const resolvedFn = resolvedDependencies.pop();
			fn = resolvedFn.bean;
			if (registration.factory && resolvedFn.parent) {
				fn = fn.bind(resolvedFn.parent)
			}
		}

		const dependencies = resolvedDependencies.map(dependency => dependency.bean);

		if (registration.Constructor) {
			return { bean: new fn(...dependencies) };
		}
		if (registration.factory) {
			return { bean: await fn(...dependencies) };
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
