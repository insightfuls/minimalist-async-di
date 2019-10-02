# minimalist-async-di

Minimalist asynchronous IoC/dependency injection container.

## Tutorial

### Import

Here's everything you might need.

```
const { Container, value, constructor, factory } = require("minimalist-async-di");
```

### Create a container

Creating a container is super simple.

```
const container = new Container();
```

### Getting beans

Getting beans is always asynchronous (returns a Promise). Suppose we have registered a bean called "pudding". We can retrieve it and cook it as follows.

```
container
.get("pudding")
.then((pudding) => pudding.cook());
```

We will actually register this bean in a moment. (In reality, of course, it needs to be registered before it is retrieved.)

Because beans are always retrieved asynchronously, they, and their dependencies, can always be instantiated asynchronously, too. This minimises the impact of "async creep", a phenomenon where you have a lot of synchronous code, and then discover that deep within it you need an asynchronous operation, so you have to propagate the asynchrony through the codebase, which is a large refactoring effort. Such refactoring is now limited to within a single bean.

### Registering pre-created beans

Sometimes you just want to put an existing value into the container as a bean. Use the `register` method with the `value` creator for this.

Here we have a local store, which might be exported from some module, and contains some of the ingredients we need.

```
const localStore = {
	sugar: "sugar",
	flour: "flour"
};
```

We just register it as is, in a bean named "store".

```
container.register("store", value(localStore));
```

`registerValue` and `registerBean` are syntax sugar for `register` with `value`, so either of these works too if you prefer:

* `container.registerValue("store", localStore);`
* `container.registerBean("store", localStore);`

### Registering constructors/classes

We can register constructor functions (or ES6 classes) using the `register` method with the `constructor` creator.

Here is a `Pudding` class which might be exported from some module; it requires various ingredients to be supplied to its constructor:

```
class Pudding {
	constructor(butter, sugar, milk, flour) {
		Object.assign(this, { butter, sugar, milk, flour });
		this.cooked = false;
	}
	cook() {
		if (this.cooked) throw new Error("already cooked");
		this.cooked = true;
		return `baked ${this.getMixture()}`;
	}
	getMixture() {
		return `mixture of ${this.butter}, ${this.sugar}, ${this.milk}, and ${this.flour}`
	}
}
```

Here we register a bean named "pudding", which is created using the `Pudding` constructor, and has a number of other named beans as dependencies. The dependencies will be registered later (which is fine to do, even in real code).

```
container.register("pudding", constructor(Pudding), "butter", "sugar", "milk", "flour");
```

`registerClass` and `registerConstructor` are syntax sugar for `register` with `constructor`, so we could have used either of these if we preferred:

* `container.registerConstructor("pudding", Pudding, "butter", "sugar", "milk", "flour");`
* `container.registerClass("pudding", Pudding, "butter", "sugar", "milk", "flour");`

### Registering factory functions

Factory functions, which can be either synchronous or asynchronous (returning a promise or using the `async`/`await` syntax sugar), are registered using the `register` method with the `factory` creator.

Here is a synchronous one:

```
function createFlour(store) {
	return sift(store.flour);
}

function sift(ingredient) {
	return `sifted ${ingredient}`;
}
```

```
container.register("flour", factory(createFlour), "store");
```

And some asynchronous ones:

```
class CreamTopMilk {
	constructor() {
		this.state = "cream-top milk";
		this.cream = "";
		this.milkWithoutCream = "";
	}
	async getCream() {
		await this.separate();
		return this.cream;
	}
	async getMilk() {
		await this.separate();
		return this.milkWithoutCream;
	}
	async pasteurize() {
		this.state = `pasteurized ${this.state}`;
		return this;
	}
	async separate() {
		this.cream = `cream separated from ${this.state}`;
		this.milkWithoutCream = `milk separated from ${this.state}`;
		return this;
	}
}

function createPasteurizedCreamTopMilk() {
	// this returns a promise because `pasteurize()` is async
	return (new CreamTopMilk()).pasteurize();
}

function createButter(creamTopMilk) {
	return creamTopMilk.getCream()
	.then(cream => `butter churned from ${cream}`);
}

async function createMilk(creamTopMilk) {
	return await creamTopMilk.getMilk();
}
```

```
container.register("creamTopMilk", factory(createPasteurizedCreamTopMilk));
container.register("butter", factory(createButter), "creamTopMilk");
container.register("milk", factory(createMilk), "creamTopMilk");
```

`registerFactory` is syntax sugar for `register` with `factory`, so we could have used this if we preferred:

```
container.registerFactory("creamTopMilk", createPasteurizedCreamTopMilk);
container.registerFactory("butter", createButter, "creamTopMilk");
container.registerFactory("milk", createMilk, "creamTopMilk");
```

### Getting beans using dot notation

You can get properties of beans, or specify them as dependencies, using dot notation. If there is no bean which actually contains the dot in its name, the container will get the property on the "parent bean".

This registers a `sugar` bean which is created using the `sift` function ()defined earlier) as a factory. It receives a dependency which is the `sugar` property from the `store` bean.

```
container.register("sugar", factory(sift), "store.sugar");
```

### All beans are singletons

All beans are singletons.

If you get the pudding a second time, you will get the one you prepared earlier, and be told that it's already cooked.

```
container
.get("pudding")
.then((pudding) => pudding.cook())
.then(console.log, console.error)
.then(() => container.get("pudding"))
.then((pudding) => pudding.cook())
.then(console.log, console.error);
```

```
baked mixture of butter churned from cream separated from pasteurized cream-top milk, sifted sugar, milk separated from pasteurized cream-top milk, and sifted flour
Error: already cooked
```

* If you need to generate new instances repeatedly, use a bean which is itself a factory.

* If you need to repeatedly create scopes with managed beans, use a bean which is a factory which produces containers.

## API

### Container

* `new Container()`
	* creates a container

* `container.register(name, creator, dependency1, ...)`
	* registers a bean
	* the bean is named `name`
	* the `creator` (see Creators below) specifies how to create the bean
	* the dependencies are names

* `container.registerValue(name, val)`
	* syntax sugar for `container.register(name, value(val))`

* `container.registerBean(name, val)`
	* syntax sugar for `container.register(name, value(val))`

* `container.registerConstructor(name, Ctor, dependency1, ...)`
	* syntax sugar for `container.register(name, constructor(Ctor), dependency1, ...)`

* `container.registerClass(name, Ctor, dependency1, ...)`
	* syntax sugar for `container.register(name, constructor(Ctor), dependency1, ...)`

* `container.registerFactory(name, ftory, dependency1, ...)`
	* syntax sugar for `container.register(name, factory(ftory), dependency1, ...)`

* `container.get(name)`
	* gets a bean asynchronously (returns a promise to the bean)

### Creators

* `value(val)`
	* Creator which uses the value `val` itself as the bean

* `constructor(Ctor)`
	* Creator which constructs the bean by calling `new Ctor(dependency1, ...)`

* `factory(ftory)`
	* Creator which constructs the bean by calling `await ftory(dependency1, ...)`
	* This works for both synchronous and asynchronous factory functions

## Version history

Major changes:

* `v2`: Removed misguided `initializeWith()/init()` feature. Factory functions are equally effective and don't couple beans to the container.
* `v1`: Initial version.

For details on minor/patch changes, consult the commit history.
