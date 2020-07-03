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

	register(specifier, creator, ...dependencies) {
		if (typeof specifier === 'string') {
			specifier = new BeanCollection(specifier);
		}

		if (!(specifier instanceof BeanConfig) || !specifier.specifier) {
			throw new BeanError("first argument to Container#register must be a bean specifier; " +
					"use a string, bean(), collection(), or replacement()");
		}

		if (typeof creator !== 'string' &&
				(!(creator instanceof BeanConfig) || !creator.creator)) {
			throw new BeanError("second argument to Container#register must be a bean creator; " +
					"use a string, bean(), constructor(), factory(), or value()");
		}

		if (typeof creator === 'string') {
			if (dependencies.length) {
				throw new BeanError("aliases cannot have dependencies");
			}

			dependencies = [ creator ];
			creator = { factory: (bean) => bean };
		}

		if (creator instanceof BeanValue) {
			if (dependencies.length) {
				throw new BeanError("pre-created beans cannot have dependencies");
			}
		}

		if (creator instanceof BeanPromise) {
			if (dependencies.length) {
				throw new BeanError("promised beans cannot have dependencies");
			}

			const catchingPromise = creator.promise.then(bean => ({ bean }), error => ({ error }));

			creator = { promise: catchingPromise };
		}

		dependencies.forEach(dependency => {
			if (typeof dependency !== 'string' &&
					(!(dependency instanceof BeanConfig) || !dependency.injector)) {
				throw new BeanError("dependencies must be bean names or injectors; " +
						"use strings, bean(), promise(), promiser(), or seeker()");
			}
		});

		if (specifier instanceof BeanReplacement) {
			this._replace(specifier, creator, dependencies);
		} else {
			this._register(specifier, creator, dependencies);
		}
	}

	async get(name) {
		const bean = (await this._resolveBeanNamed(name, new Set()));
		if (bean.error) throw bean.error;
		return bean.bean;
	}

	_replace(specifier, creator, dependencies) {
		const replacement = specifier.specifier;

		if (this._beans.has(replacement.name) || this._pending.has(replacement.name)) {
			throw new BeanError(`cannot replace already-created bean '${replacement.name}'`);
		}

		if (!this._registrations.has(replacement.name)) {
			throw new BeanError(`bean '${replacement.name}' to replace does not exist`);
		}

		if (specifier.retainedName) {
			const retainedRegistration = this._registrations.get(replacement.name);
			retainedRegistration.name = specifier.retainedName;

			this._registrations.set(specifier.retainedName, retainedRegistration);

			this._maybeRegisterInParentBean(specifier.retainedName);
		}

		this._registrations.set(replacement.name, {
			...replacement,
			...creator,
			dependencies,
			children: []
		});
	}

	_register(specifier, creator, dependencies) {
		if (this._registrations.has(specifier.name) || this._beans.has(specifier.name) ||
				this._pending.has(specifier.name)) {
			throw new BeanError(`'${specifier.name}' already registered`);
		}

		this._registrations.set(specifier.name, {
			...specifier,
			...creator,
			dependencies,
			children: []
		});

		this._maybeRegisterInParentBean(specifier.name);
	}

	_maybeRegisterInParentBean(name) {
		const [parentName, propertyName] = this._identifyParentAndProperty(name);

		if (!parentName || !propertyName) return;

		if (this._beans.has(parentName)) {
			const createdBean = this._beans.get(parentName);
			if (!createdBean.bean || createdBean.error) return;
			this._beans.delete(parentName);
			this._pending.set(parentName, Promise.resolve(createdBean));
		}

		if (this._pending.has(parentName)) {
			const pendingBean = this._pending.get(parentName);
			const promisedChildBean = this.get(name);
			const pendingWithProperty = pendingBean.then(resolvedBean => {
				if (resolvedBean.bean && !resolvedBean.error) {
					return promisedChildBean.then(async childBean => {
						await this._setChild(resolvedBean, propertyName, childBean);
						return resolvedBean;
					}, error => {
						resolvedBean.error = error;
						return resolvedBean;
					});
				}
				return resolvedBean;
			});
			this._pending.set(parentName, pendingWithProperty);
			return;
		}

		if (this._registrations.has(parentName)) {
			const registration = this._registrations.get(parentName);
			registration.children.push(name);
		}
	}

	async _setChild(resolvedParent, childName, childBean) {
		const setter = resolvedParent.setter ? resolvedParent.setter : defaultSetter;
		setter.call(resolvedParent.bean, childName, childBean);
	}

	async _resolveBeanNamed(name, dependants) {
		if (dependants.has(name)) {
			throw new BeanError(`dependency '${name}' creates a cycle`);
		}

		if (this._beans.has(name)) {
			return this._beans.get(name);
		}

		if (this._pending.has(name)) {
			return await this._pending.get(name);
		}

		if (this._registrations.has(name)) {
			const { promise, resolve, reject } = this._createPromise();
			this._pending.set(name, promise);

			const registration = this._registrations.get(name);
			this._registrations.delete(name);

			this._createBeanForRegistration(registration, dependants).then(resolve, reject);
			const bean = await promise;
			this._beans.set(name, bean);

			this._pending.delete(name);

			return bean;
		}

		const propertyOfParentBean = await this._maybeResolvePropertyOfParentBean(name, dependants);

		if (propertyOfParentBean instanceof Error) {
			const e = propertyOfParentBean;

			const messagePrefix = `no bean registered with name '${name}' ` +
					`and while resolving parent:\n`;
			const message = `${messagePrefix}${e.name}: ${e.message}`;

			const toThrow = new BeanError(message);
			toThrow.stack = `${toThrow.name}: ${messagePrefix}${e.stack}`;

			throw toThrow;
		}

		if (propertyOfParentBean) return propertyOfParentBean;

		throw new BeanError(`no bean registered with name '${name}'`);
	}

	_createPromise() {
		let resolve, reject;
		const promise = new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	}

	async _maybeResolvePropertyOfParentBean(name, dependants) {
		const [parentName, propertyName] = this._identifyParentAndProperty(name);

		if (!parentName || !propertyName) return;

		try {
			const parent = await this._resolveBeanNamed(parentName, dependants);

			if (parent.error) throw parent.error;

			const getter = parent.getter ? parent.getter : defaultGetter;

			return {
				parent: parent.bean,
				bean: await getter.call(parent.bean, propertyName)
			};
		} catch (error) {
			if (!(error instanceof BeanError)) {
				throw error;
			}

			return error;
		}
	}

	async _createBeanForRegistration(registration, dependants) {
		try {
			const dependencyDependants = new Set(dependants).add(registration.name);

			const resolvedDependencies =
					await Promise.all(this._dependencyConfigsFor(registration)
					.map(config => this._resolveDependency(config, dependencyDependants)));

			const bean = await this._createBeanGivenDependencies(
					registration, resolvedDependencies);

			bean.getter = registration.getter;
			bean.setter = registration.setter;

			if (bean.bean && !bean.error && registration.children) {
				await Promise.all(registration.children.map(childName => {
					return this.get(childName).then(childBean => {
						if (bean.error) return;
						const [, propertyName] = this._identifyParentAndProperty(childName);
						return this._setChild(bean, propertyName, childBean);
					}, error => {
						if (bean.error) return;
						bean.error = error;
					});
				}));
			}

			return bean;
		} catch (e) {
			const messagePrefix = `while creating bean '${registration.name}':\n`;
			const message = `${messagePrefix}${e.name}: ${e.message}`;

			const toThrow = (e instanceof BeanError) ? new BeanError(message) : new Error(message);
			toThrow.stack = `${toThrow.name}: ${messagePrefix}${e.stack}`;

			throw toThrow;
		}
	}

	_dependencyConfigsFor(registration) {
		const dependencyConfigs = registration.dependencies;

		if (typeof registration.Constructor === 'string') {
			dependencyConfigs.push(registration.Constructor);
		}
		if (typeof registration.factory === 'string') {
			dependencyConfigs.push(new BeanBound(registration.factory));
		}

		return dependencyConfigs;
	}

	_resolveDependency(config, dependants) {
		if (typeof config === 'string') {
			return this._resolveBeanNamed(config, dependants);
		}

		if (config instanceof BeanBound) {
			return this._resolveBeanNamed(config.name, dependants).then(bean => {
				if (bean.error) return bean;
				return { bean: bean.bean.bind(bean.parent) };
			});
		}

		if (config instanceof BeanValue) {
			return { bean: config.value };
		}

		if (config instanceof BeanPromise) {
			return { bean: this._resolveBeanNamed(config.name, new Set()).then(bean => bean.bean) };
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

	async _createBeanGivenDependencies(registration, resolvedDependencies) {
		if (registration.value) {
			return { bean: registration.value };
		}

		if (registration.promise) {
			return await registration.promise;
		}

		let fn = registration.Constructor || registration.factory;

		if (typeof fn === 'string') {
			const resolvedFn = resolvedDependencies.pop();
			if (resolvedFn.error) throw resolvedFn.error;
			fn = resolvedFn.bean;
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

	_identifyParentAndProperty(name) {
		if (name.slice(-1) === "]") {
			return this._identifyParentAndBracketProperty(name);
		}

		return this._identifyParentAndDotProperty(name);
	}

	_identifyParentAndBracketProperty(name) {
		const openingBracket = name.lastIndexOf("[");

		if (openingBracket === -1) return [null, null];

		const parentName = name.slice(0, openingBracket);
		const propertyName = name.slice(openingBracket + 1, -1);

		return [parentName, propertyName];
	}

	_identifyParentAndDotProperty(name) {
		const lastDot = name.lastIndexOf(".");

		if (lastDot === -1) return [null, null];

		const parentName = name.slice(0, lastDot);
		const propertyName = name.slice(lastDot + 1);

		return [parentName, propertyName];
	}

};

function defaultGetter(name) {
	if (this instanceof Map || this instanceof exports.Container) {
		return this.get(name);
	}

	return this[name];
}

function defaultSetter(name, value) {
	if (this instanceof Map) {
		return this.set(name, value);
	}

	if (this instanceof exports.Container) {
		return this.register(name, this.value(value));
	}

	this[name] = value;
}

/*
 * BeanConfig base class and object.
 */

class BeanConfig {
}
BeanConfig.prototype.specifier = false;
BeanConfig.prototype.creator = false;
BeanConfig.prototype.injector = false;

const config = {};

/*
 * Specifiers
 */

class BeanCollection extends BeanConfig {
	constructor(name, getter, setter) {
		super();
		this.name = name;
		this.getter = getter;
		this.setter = setter;
	}
}
BeanCollection.prototype.specifier = true;
config.collection = (name, getter, setter) => new BeanCollection(name, getter, setter);

class BeanReplacement extends BeanConfig {
	constructor(specifier, retainedName) {
		super();

		if (typeof specifier === 'string') {
			specifier = new BeanCollection(specifier);
		}

		if (!(specifier instanceof BeanConfig) || !specifier.specifier ||
				specifier instanceof BeanReplacement) {
			throw new BeanError("first argument to replacement() must be a bean specifier; " +
					"use a string, bean(), or collection()");
		}

		this.specifier = specifier;
		this.name = specifier.name;
		this.retainedName = retainedName;
	}
}
BeanReplacement.prototype.specifier = true;
config.replacement = (specifier, retainedName) => new BeanReplacement(specifier, retainedName);

/*
 * bean() is a specifier, creator and injector that does nothing.
 */

config.bean = (name) => name;

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
config.value = (value) => new BeanValue(value);

class BeanPromise extends BeanConfig {
	constructor(nameOrPromise) {
		super();
		if (nameOrPromise.then && typeof nameOrPromise.then === 'function') {
			this.promise = nameOrPromise;
			this.creator = true;
		} else {
			this.name = nameOrPromise;
			this.injector = true;
		}
	}
}
config.promise = (nameOrPromise) => new BeanPromise(nameOrPromise);

/*
 * Other creators.
 */

class BeanConstructor extends BeanConfig {
	constructor(Constructor) {
		super();

		if (typeof Constructor !== 'string' && typeof Constructor !== 'function') {
			throw new BeanError("invalid constructor");
		}

		this.Constructor = Constructor;
	}
}
BeanConstructor.prototype.creator = true;
config.constructor = (Constructor) => new BeanConstructor(Constructor);

class BeanFactory extends BeanConfig {
	constructor(factory) {
		super();

		if (typeof factory !== 'string' && typeof factory !== 'function') {
			throw new BeanError("invalid factory");
		}

		this.factory = factory;
	}
}
BeanFactory.prototype.creator = true;
config.factory = (factory) => new BeanFactory(factory);

/*
 * Other injectors.
 */

class BeanBound extends BeanConfig {
	constructor(name) {
		super();
		this.name = name;
	}
}
BeanBound.prototype.injector = true;
config.bound = (name) => new BeanBound(name);

class BeanPromiser extends BeanConfig {
	constructor(name) {
		super();
		this.name = name;
	}
}
BeanPromiser.prototype.injector = true;
config.promiser = (name) => new BeanPromiser(name);

class BeanSeeker extends BeanConfig {
	constructor(name) {
		super();
		this.name = name;
	}
}
BeanSeeker.prototype.injector = true;
config.seeker = (name) => new BeanSeeker(name);

/*
 * Error class.
 */

const BeanError = config.BeanError = function BeanError(message) {
	this.message = message;

	const stackError = new Error(message);
	stackError.name = "BeanError";

	this.stack = stackError.stack;
};
BeanError.prototype = Object.create(Error.prototype);
BeanError.prototype.name = "BeanError";
BeanError.prototype.constructor = BeanError;

/*
 * Export config functions/error class, and put on instances.
 */

Object.assign(exports, config);
Object.assign(exports.Container.prototype, config);
