"use strict";

/*
 * Container.
 */

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
			if (dependencies.length) {
				throw new BeanError("pre-created beans cannot have dependencies");
			}

			this._beans.set(name, { bean: creator.value });

			return;
		}

		if (creator instanceof BeanPromise) {
			if (dependencies.length) {
				throw new BeanError("promised beans cannot have dependencies");
			}

			const bean = creator.promise.then(bean => ({ bean }), error => ({ error }));

			this._pending.set(name, bean);
			bean.then(bean => {
				this._beans.set(name, bean);
				this._pending.delete(name);
			});

			return;
		}

		dependencies.forEach(dependency => {
			if (typeof dependency !== 'string' &&
					(!(dependency instanceof BeanConfig) || !dependency.injector )) {
				throw new BeanError("dependencies must be bean names or injectors; " +
						"use strings, bean(), promise(), promiser() or seeker()");
			}
		});

		this._registrations.set(name, { ...creator, dependencies });
	}

	registerValue(name, value) {
		this.register(name, new BeanValue(value));
	}

	registerBean(name, value) {
		this.register(name, new BeanValue(value));
	}

	registerPromise(name, promise) {
		this.register(name, new BeanPromise(promise));
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
		const bean = (await this._resolveBeanNamed(name, new Set()));
		if (bean.error) throw bean.error;
		return bean.bean;
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

		if (this._registrations.has(name)) {
			const promise = this._createBeanNamed(name, ancestors);

			this._pending.set(name, promise);
			this._registrations.delete(name);

			const bean = await promise;

			this._beans.set(name, bean);
			this._pending.delete(name);

			return bean;
		}

		const propertyOfParentBean = await this._maybeResolvePropertyOfParentBean(name, ancestors);

		if (propertyOfParentBean) return propertyOfParentBean;

		throw new BeanError(`no bean registered with name '${name}'`);
	}

	async _maybeResolvePropertyOfParentBean(name, ancestors) {
		const lastDot = name.lastIndexOf(".");

		if (lastDot !== -1) {
			try {
				const bean = await this._resolveBeanNamed(name.slice(0, lastDot), ancestors);

				if (bean.error) throw bean.error;

				return {
					parent: bean.bean,
					bean: bean.bean[name.slice(lastDot + 1)]
				};
			} catch (error) {
				if (!(error instanceof BeanError)) {
					throw error;
				}

				/* fall through */
			}
		}
	}

	async _createBeanNamed(name, ancestors) {
		const registration = this._registrations.get(name);

		try {
			const dependencyAncestors = new Set(ancestors).add(name);

			const resolvedDependencies =
					await Promise.all(this._dependencyConfigsFor(registration)
					.map(config => this._resolveDependency(config, dependencyAncestors)));

			return await this._createBeanFor(registration, resolvedDependencies);
		} catch (e) {
			if (e instanceof BeanError) {
				throw new BeanError(`while creating bean '${name}':\n${e.message}`);
			}

			throw new Error(`while creating bean '${name}':\n${e.message}`);
		}
	}

	_dependencyConfigsFor(registration) {
		const dependencyConfigs = registration.dependencies;

		if (typeof registration.Constructor === 'string') {
			dependencyConfigs.push(registration.Constructor);
		}
		if (typeof registration.factory === 'string') {
			dependencyConfigs.push(registration.factory);
		}

		return dependencyConfigs;
	}

	_resolveDependency(config, ancestors) {
		if (typeof config === 'string') {
			return this._resolveBeanNamed(config, ancestors);
		}

		if (config instanceof BeanValue) {
			return { bean: config.value };
		}

		if (config instanceof BeanPromise) {
			return { bean: this._resolveBeanNamed(config.name, ancestors).then(bean => bean.bean) };
		}

		if (config instanceof BeanPromiser) {
			return { bean: () => {
				return this._resolveBeanNamed(config.name, new Set()).then(bean => bean.bean);
			}};
		}

		if (config instanceof BeanSeeker) {
			return { bean: () => {
				const bean = this._beans.get(config.name);
				return bean ? bean.bean : undefined;
			}};
		}
	}

	async _createBeanFor(registration, resolvedDependencies) {
		let fn = registration.Constructor || registration.factory;

		if (typeof fn === 'string') {
			const resolvedFn = resolvedDependencies.pop();
			if (resolvedFn.error) throw resolvedFn.error;
			fn = resolvedFn.bean;
			if (registration.factory && resolvedFn.parent) {
				fn = fn.bind(resolvedFn.parent)
			}
		}

		const dependencies = resolvedDependencies.map(dependency => {
			if (dependency.error) throw dependency.error;
			return dependency.bean;
		});

		if (registration.Constructor) {
			return { bean: new fn(...dependencies) };
		}
		if (registration.factory) {
			return { bean: await fn(...dependencies) };
		}
	}

};

/*
 * BeanConfig base class.
 */

class BeanConfig {
}
BeanConfig.prototype.creator = false;
BeanConfig.prototype.injector = false;

/*
 * value() and promise() are both creators and injectors.
 */

class BeanValue extends BeanConfig {
	constructor(value) {
		super();
		this.value = value;
	}
}
BeanValue.prototype.creator = true;
BeanValue.prototype.injector = true;
exports.value = (value) => new BeanValue(value);

class BeanPromise extends BeanConfig {
	constructor(nameOrPromise) {
		super();
		if (nameOrPromise.then) {
			this.promise = nameOrPromise;
			this.creator = true;
		} else {
			this.name = nameOrPromise;
			this.injector = true;
		}
	}
}
exports.promise = (name) => new BeanPromise(name);

/*
 * Other creators.
 */

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

/*
 * Other injectors.
 */

exports.bean = (name) => name;

class BeanPromiser extends BeanConfig {
	constructor(name) {
		super();
		this.name = name;
	}
}
BeanPromiser.prototype.injector = true;
exports.promiser = (name) => new BeanPromiser(name);

class BeanSeeker extends BeanConfig {
	constructor(name) {
		super();
		this.name = name;
	}
}
BeanSeeker.prototype.injector = true;
exports.seeker = (name) => new BeanSeeker(name);

/*
 * Error class.
 */

const BeanError = exports.BeanError = function BeanError(message) {
	this.message = message;
	this.stack = (new Error()).stack;
};
BeanError.prototype = Object.create(Error.prototype);
BeanError.prototype.constructor = BeanError;
