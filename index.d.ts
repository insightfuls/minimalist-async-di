declare namespace minimalistAsyncDI {
	type Specifier = BeanSpecifier | string;
	type Creator = BeanCreator | string;
	type Dependency = BeanInjector | string;
	type BeanSpecifier = { specifier: true };
	type BeanCreator = { creator: true };
	type BeanInjector = { injector: true };
	const bean: (name: string) => string;
	const collection: (
		name: string,
		getter: (this: any, name: string) => any,
		setter: (this: any, name: string, value: any) => any
	) => BeanSpecifier;
	const replacement: (specifier: Specifier, retainedName?: string) => BeanSpecifier;
	const value: (value: any) => BeanCreator & BeanInjector;
	const promise: ((promise: Promise<any>) => BeanCreator) &
		((name: string) => BeanInjector);
	const constructor: (ctor: { new(...args: any): any }) => BeanCreator;
	const factory: (factory: function) => BeanCreator;
	const bound: (name: string) => BeanInjector;
	const promiser: (name: string) => BeanInjector;
	const seeker: (name: string) => BeanInjector;
	class BeanError extends Error {}
	class Container {
		get: (name: string) => Promise<any>;
		register: (
			specifier: Specifier,
			creator: Creator,
			...dependencies: Dependency[]
		) => undefined;
		bean = bean;
		collection = collection;
		replacement = replacement;
		value = value;
		promise = promise;
		['constructor'] = constructor;
		factory = factory;
		bound = bound;
		promiser = promiser;
		seeker = seeker;
		BeanError = BeanError;
	}
}

export = minimalistAsyncDI;
