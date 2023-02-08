# minimalist-async-di

Asynchronous IoC/dependency injection container with a minimalist API, but which packs a punch.

* [Tutorial](#tutorial)
	* [Import](#import)
	* [Create a container](#create-a-container)
	* [Getting beans](#getting-beans)
	* [Registering pre-created beans](#registering-pre-created-beans)
	* [Promising beans](#promising-beans)
	* [Registering constructors/classes](#registering-constructors/classes)
	* [Registering factory functions](#registering-factory-functions)
	* [Getting beans using dot or bracket notation](#getting-beans-using-dot-or-bracket-notation)
	* [Registering beans using dot or bracket notation](#registering-beans-using-dot-or-bracket-notation)
	* [Custom collections](#custom-collections)
	* [Using beans to create other beans](#using-beans-to-create-other-beans)
	* [Bound injection](#bound-injection)
	* [Explicit injection](#explicit-injection)
	* [Asynchronous injection (Lazy evaluation)](#asynchronous-injection)
	* [Seeker injection](#seeker-injection)
	* [All beans are singletons](#all-beans-are-singletons)
	* [Repeated creation](#repeated-creation)
	* [Scope creation](#scope-creation)
	* [Replacing registrations](#replacing-registrations)
* [API](#api)
	* [Container](#container)
	* [Specifiers](#specifiers)
	* [Creators](#creators)
	* [Injectors](#injectors)
* [Version history](#version-history)

## Tutorial

### Import

Here's everything you might need (you are likely to need only about half of it, most of the time).

```javascript
const {
	Container,
	bean,
	collection,
	replacement,
	value,
	promise,
	constructor,
	factory,
	bound,
	promiser,
	seeker
} = require("minimalist-async-di");
```

If you have been passed a `Container` instance, say `container`, you can instead access everything from it, even its `register` and `get` methods:

```javascript
const {
	Container,
	register,
	get,
	bean,
	collection,
	replacement,
	value,
	promise,
	constructor,
	factory,
	bound,
	promiser,
	seeker
} = container;
```

This avoids problems when two different versions of `minimalist-async-di` are installed and the one you `require` was not used to create the container instance, so they do not interoperate.

### Create a container

Creating a container is super simple.

```javascript
const container = new Container();
```

### Getting beans

Getting beans is always asynchronous (returns a Promise). Suppose we have registered a bean called "pudding". We can retrieve it and serve it as follows.

```javascript
container.get("pudding")
.then(pudding => pudding.serveTo("Ben"));
```

We will actually register this bean [later](#asynchronous-injection). (In reality, of course, it needs to be registered before it is retrieved.)

Because beans are always retrieved asynchronously, they, and their dependencies, can always be instantiated asynchronously, too. This minimises the impact of "async creep", a phenomenon where you have a lot of synchronous code, and then discover that deep within it you need an asynchronous operation, so you have to propagate the asynchrony through the codebase, which is a large refactoring effort. Such refactoring is now limited to within a single bean.

### Registering pre-created beans

Sometimes you just want to put an existing value into the container as a bean. Use the `register` method with the `value` creator for this.

Here we have a local store, which might be exported from some module, and contains some of the ingredients we need.

```javascript
const localStore = {
	flour: "self-raising flour"
};
```

We just register it as is, in a bean named "store".

```javascript
container.register("store", value(localStore));
```

### Promising beans

You can also register promises to beans using the `register` method with the `promise` creator.

We can use this to promise pasteurized cream-top milk. Because `pasteurize()` is an `async` function, it returns a promise.

```javascript
class CreamTopMilk {
	constructor() {
		this.state = "cream-top milk";
		this.cream = "";
		this.milkWithoutCream = "";
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
	async getCream() {
		await this.separate();
		return this.cream;
	}
	async getMilk() {
		await this.separate();
		return this.milkWithoutCream;
	}
}
```

```javascript
container.register("creamTopMilk", promise((new CreamTopMilk()).pasteurize()));
```

### Registering constructors/classes

You can register constructor functions (or ES6 classes) using the `register` method with the `constructor` creator.

Here is a `Mixer` class which might be exported from some module; it requires various ingredients to be supplied to its constructor:

```javascript
class Mixer {
	constructor(butter, sugar, egg, milk, flour) {
		Object.assign(this, { butter, sugar, egg, milk, flour });
	}
	async getMixture() {
		return `mixture of ${this.butter}, ${this.sugar}, ${this.egg}, ${this.milk}, and ${this.flour}`;
	}
}
```

Here we register a bean named "mixer", which is created using the `Mixer` constructor, and has a number of other named beans as dependencies. The dependencies will be registered later (which is fine to do, even in real code).

```javascript
container.register("mixer", constructor(Mixer), "butter", "sugar", "eggForMixture", "milk", "flour");
```

### Registering factory functions

Factory functions, which can be either synchronous or asynchronous (returning a promise or using the `async`/`await` syntax sugar), are registered using the `register` method with the `factory` creator.

Here is a synchronous one:

```javascript
function createFlour(store) {
	return sift(store.flour);
}

function sift(ingredient) {
	return `sifted ${ingredient}`;
}
```

```javascript
container.register("flour", factory(createFlour), "store");
```

And an asynchronous one:

```javascript
function createButter(creamTopMilk) {
	return creamTopMilk.getCream()
	.then(cream => `butter churned from ${cream}`);
}
```

```javascript
container.register("butter", factory(createButter), "creamTopMilk");
```

### Getting beans using dot or bracket notation

You can get properties of beans, or specify them as dependencies, using dot or bracket notation. If there is no bean which actually contains the dot/bracket in its name, the container will get the property on the parent bean (if the parent bean has been registered by the time the property on it is needed).

This registers a `sugar` bean which is created using the `sift` function (defined [earlier](#registering-factory-functions)) as a factory. It receives a dependency which is the `sugar` property from the `store` bean.

```javascript
container.register("sugar", factory(sift), "store[sugar]");
```

(The sugar will be added to the store [shortly](#registering-beans-using-dot-or-bracket-notation).)

### Registering beans using dot or bracket notation

When a bean is *registered* which contains a dot or bracket in its name, if the parent bean **has already been registered**, the new bean will be added as a property on the parent bean.

If the parent bean has already been created when the property is registered, the property will be created immediately (though asynchronously), mutating the parent bean; if an error occurs, you will not find out about it until and unless you retrieve the parent bean again. If the parent bean has not been created (only registered), the property will be registered as its own bean until/unless the parent is retrieved, at which point all its property beans will be created and added to it.

Note that the order of registration matters for this to work. **The parent bean must be registered first.**

Here we stock the `store` with `sugar`.

```javascript
const castorSugar = "castor sugar";
```

```javascript
container.register("store[sugar]", value(castorSugar));
```

### Custom collections

You can use custom getters and setters for bean properties using the `collection` specifier when registering a bean, which may be asynchronous.

By default, the container will:

* recognise `Map` objects and use their `get` and `set` methods
* recognise `Container` objects and use their `get` and `register` (with `value()`) methods
* otherwise just access object properties normally (which also works for array indexes)

So, as far as the container is concerned, we could have created the `store` bean as a `Map`:

```javascript
const localStore = new Map();
localStore.set("flour", "self-raising flour");
```

Or as a `Container`:

```javascript
const localStore = new Container();
localStore.register("flour", value("self-raising flour"));
```

For both of these (and the plain object used originally), we just need to do:

```javascript
container.register("store", value(localStore));
```

Or we can use either of the `bean` or `collection` specifiers if we prefer:

```javascript
container.register(bean("store"), value(localStore));
container.register(collection("store"), value(localStore));
```

It is **not recommended**, however, if we do need something customised, we can do it. Just use `collection`, providing the bean name, getter, and setter. The getters and setters can be synchronous or asynchronous, and will be called with `this` set to the parent bean.

```javascript
class Store {
	constructor() {
		this.items = {};
	}
	purchase(name) {
		return this.items[name];
	}
	stock(name, item) {
		this.items[name] = item;
	}
}

const localStore = new Store();
localStore.stock("flour", "self-raising flour");
```

```javascript
container.register(collection("store", Store.prototype.purchase, Store.prototype.stock), value(localStore));
```

In *all* of these cases, getting and registering properties of the store are unchanged.

```javascript
container.register("store[sugar]", value(castorSugar));
```

```javascript
container.register("sugar", factory(sift), "store[sugar]");
```

### Using beans to create other beans

You can use a bean (or property of a bean using dot or bracket notation) as a value, constructor or factory to create another bean.

To use a bean itself as the value of another bean, essentially making the second bean an alias of the first, just give the bean name as the creator, or for greater clarity, wrap the name in `bean()`.

To use a bean as a constructor or factory, just give the name of the bean to the `constructor()` or `factory()` creator. If you prefer, wrap the name in `bean()` for clarity.

For the `factory()` case, if you use a property of a bean (using dot or bracket notation) then the function will be called as a method, with `this` set to the bean.

Here we register:
 * a `hen` bean, which is just an alias for the `chicken` bean,
 * a `milk` bean, which is created using the `getMilk` method on the `creamTopMilk` bean,
 * a `mixture` bean which is created using the `getMixture` method on the `mixer` bean.

```javascript
container.register("hen", bean("chicken"));
container.register("milk", factory("creamTopMilk.getMilk"));
container.register("mixture", factory(bean("mixer.getMixture")));
```

### Bound injection

Ordinarily when you inject a property of a bean into another bean, the property value is simply injected. If it is a function, when it is called, `this` will be set (or be unset) according to the context of the call. The caller is also free to use `.call()` or `.apply()` to set `this`.

However, that isn't always what you want. Sometimes, just like when you use a property of a bean as a factory, you want to treat it as a method, with `this` set to the bean containing the property. Use the `bound` injector for this. It calls `.bind()` to lock the value of `this` for all calls.

This `JamFactory` can be used to demonstrate this:

```javascript
class JamFactory {
	constructor() {
		this.jam = "jam";
	}
	async getJam() {
		return this.jam;
	}
}
```

```javascript
container.register("jamFactory", constructor(JamFactory));
```

Here's a `Toast` class which uses it.

```javascript
class Toast {
	constructor(getJam) {
		this.getJam = getJam;
	}
	make() {
		return `toast with ${this.getJam()}`;
	}
}
```

```javascript
container.register("toast", constructor(Toast), bound("jamFactory.getJam"));
```

Without using `bound`, the call to `this.getJam()` in the `make()` method would result in `this` being set to the `toast` bean, because `getJam` has been installed as a method on that bean in the `Toast` constructor. However, because `bound` was used, `getJam` has `this` locked to the `jamFactory` bean, and it works as expected.

### Explicit injection

Sometimes you don't want to inject another bean, but just want to explicitly inject a specific value. You can do this using the `value` injector for a dependency.

We inject the type of oven this way. The string `"moderate"` is passed to the constructor, not a bean named `moderate`.

```javascript
class Oven {
	constructor(type) {
		this.type = type;
	}
	async preheat() {
		return `preheated ${this.type} oven`;
	}
}
```

```javascript
container.register("oven", constructor(Oven), value("moderate"));
```

### Asynchronous injection (Lazy Evaluation)

Usually constructors and factories receive their dependencies synchronously.

However, it is possible to provide a promise for the dependency using `promise`, or an asynchronous factory function for the dependency using `promiser`. Some use cases for this are:

* It gives you a tool to use to avoid cyclic dependencies (which, as much as we try to avoid them, sometimes do seem like the right solution). As long as there is an asynchronous injection somewhere in the cycle, and the promise doesn't block the creation of the bean it is injected into (but can settle later), the beans will be able to be created.
* Since the dependency is received asynchronously, you can begin other processing while waiting for it to arrive.
* For `promiser`, you only call the factory if you need to use the dependency (lazy evaluation). If you don't need it, it is never retrieved (perhaps never even created) so it can be used for dependencies which might not be needed in practice.

This `Pudding` class uses both kinds of asynchronous injection. It receives the mixture asynchronously so that the oven can be preheated while the mixture is being prepared, and it only gets meringue if the user actually wants it (calls the `addToppings()` method).

```javascript
class Pudding {
	constructor(oven, promisedMixture, getMeringue, getJam) {
		this.product = Promise.all([promisedMixture, oven.preheat()]).then(([mixture, oven]) => {
			return `${mixture}, baked in ${oven}`;
		});
		this.getMeringue = getMeringue;
		this.getJam = getJam;
		this.eater = null;
	}
	addToppings() {
		const baseProduct = this.product;
		this.product = Promise.all([this.getMeringue(), this.getJam()])
		.then(([meringue, jam]) => {
			return baseProduct.then(product => `${product}, topped with ${meringue}, and ${jam}`);
		});
		return this;
	}
	async serveTo(person) {
		if (this.eater) throw new Error(`already eaten by ${this.eater}`);
		this.eater = person;
		return (await this.product) + `, eaten by ${person}`;
	}
}
```

```javascript
container.register("pudding", constructor(Pudding), bean("oven"), promise("mixture"), promiser("meringue"), bound("jamFactory.getJam"));
```

The `bean` injector was also used above, for clarity; it's exactly the same as just giving the bean name. Also note the use of the `bound` injector so that `getJam` executes with `this` set correctly (to the `jamFactory`, not to the `pudding`).

### Seeker injection

Seeker injection injects a synchronous factory function which can be called to obtain a dependency. Because the injected factory function is synchronous, but bean creation is asynchronous, **it is not guaranteed to succeed**. In fact, it will only succeed if the bean **has already been created when the factory function is called**. Even if the bean *could* be created synchronously, unless it *has* been created, the factory function will return `undefined`. That is why it is called seeker injection: it seeks the bean, but it might not find it.

Using seeker injection is **not recommended**, in fact **highly discouraged**, however it is provided for completeness. It can be used with existing components which expect to be provided with a synchronous factory function. Like `promiser` injection, it can also be used to break dependency cycles; hopefully the dependency has been created by the time you call the factory function (you might need to put in some effort to ensure this).

Here is a chicken and egg example that explicitly handles the `undefined` case:

```javascript
class Chicken {
	constructor(maybeGetCreateEgg) {
		this.origin = maybeGetCreateEgg() ? "an egg" : "nothing";
	}
	async lay() {
		return `egg laid by chicken created from ${this.origin}`;
	}
}
```

```javascript
container.register("chicken", constructor(Chicken), seeker("createEgg"));
```

### All beans are singletons

All beans in the container are singletons, meaning they are created the first time they are retrieved, but later retrievals return the previously created bean.

So if you get the pudding a second time, you will get the one you prepared earlier, and be told that it's already eaten.

```javascript
container.get("pudding")
.then(pudding => pudding.addToppings().serveTo("Trillian"))
.then(console.log, console.error)

container.get("pudding")
.then(pudding => pudding.serveTo("Zaphod"))
.then(console.log, console.error);
```

```
Error: already eaten by Trillian
    at ...
mixture of butter churned from cream separated from pasteurized cream-top milk, sifted castor sugar, egg laid by chicken created from nothing, milk separated from pasteurized cream-top milk, and sifted self-raising flour, baked in preheated moderate oven, topped with meringue made from whipped white of egg laid by chicken created from nothing, and castor sugar, and jam, eaten by Trillian
```

Notice how due to the asynchronous processing, we actually receive the error that the pudding has been eaten before the pudding is, in fact, eaten. That's because it's flagged as eaten before the cooking and topping with meringue have completed.

### Repeated creation

If you need to create new instances repeatedly, use a bean which is itself a factory.

This could be a factory function like this `createEgg` function. Note how a "meta-factory" is used to create the factory.

```javascript
function createCreateEgg(hen) {
	return async function createEgg() {
		return hen.lay();
	}
}
```

```javascript
container.register("createEgg", factory(createCreateEgg), "hen");
```

Alternatively, it could be a class-style factory, like this `MeringueFactory`.

```javascript
class MeringueFactory {
	constructor(createEgg, sugar) {
		this.createEgg = createEgg;
		this.sugar = sugar;
	}
	async create() {
		return `meringue made from whipped white of ${await this.createEgg()}, and ${this.sugar}`;
	}
}
```

```javascript
container.register("meringueFactory", constructor(MeringueFactory), "createEgg", "store[sugar]");
```

Note how the `MeringueFactory` itself has a factory injected (`createEgg`) to assist it to create new instances.

You can also use factory beans to create other beans:

```javascript
container.register("eggForMixture", factory("createEgg"));
container.register("meringue", factory("meringueFactory.create"));
```

### Scope creation

If you need to repeatedly create scopes with managed beans, use a bean which is a factory which produces containers. It can be convenient to provide the parent container as a dependency to such a factory so it can register it and alias beans from the parent container in the child container.

Suppose the `store`, `chicken`, `createEgg` and `meringueFactory` beans are "global", registered in the parent container. You could register a factory which creates child containers and registers beans like below. Notice how the `store`, `meringueFactory` and `jamFactory` beans are aliases for beans on the parent container (which is registered as a `parent` bean); these will be created on demand. Contrastingly, we get the parent's `createEgg` bean when we instantiate the scope so it is inserted pre-created into the child container.

```javascript
container.register("createCookingScope", factory(createCreateCookingScope), value(container));

function createCreateCookingScope(parent) {
	return async function createCookingScope() {
		const child = new Container();

		child.register("parent", value(parent));
		child.register("store", "parent.store");
		child.register("meringueFactory", bean("parent.meringueFactory"));
		child.register("jamFactory", bean("parent.jamFactory"));
		child.register("parentCreateEgg", value(await parent.get("createEgg")));
		child.register("mixer", constructor(Mixer), "butter", "sugar", "eggForMixture", "milk", "flour");
		child.register("flour", factory(createFlour), "store");
		child.register("creamTopMilk", promise((new CreamTopMilk()).pasteurize());
		child.register("butter", factory(createButter), "creamTopMilk");
		child.register("milk", factory("creamTopMilk.getMilk"));
		child.register("mixture", factory(bean("mixer.getMixture")));
		child.register("sugar", factory(sift), "store[sugar]");
		child.register("oven", constructor(Oven), value("moderate"));
		child.register("pudding", constructor(Pudding), bean("oven"), promise("mixture"), promiser("meringue"), bound("jamFactory.getJam"));
		child.register("chicken", constructor(Chicken), seeker("parentCreateEgg"));
		child.register("hen", bean("chicken"));
		child.register("createEgg", factory(createCreateEgg), "hen");
		child.register("eggForMixture", factory("createEgg"));
		child.register("meringue", factory("meringueFactory.create"));

		return child;
	};
}
```

You can create and use the scope like this:

```javascript
container.get("createCookingScope")
.then(create => create())
.then(scope => scope.get("pudding"))
.then(pudding => pudding.serveTo("Ben"))
.then(console.log, console.error);
```

```
mixture of butter churned from cream separated from pasteurized cream-top milk, sifted castor sugar, egg laid by chicken created from an egg, milk separated from pasteurized cream-top milk, and sifted self-raising flour, baked in preheated moderate oven, eaten by Ben
```

### Replacing registrations

Sometimes you want to replace already-registered beans, for example to inject stubs or mocks for testing. You can use the `replacement` specifier for this.

Note that it will only work if the bean has not already been created. Also, collections will 'lose' any children registered with dot or bracket notation (only children registered after the new parent registration will be added to the new parent).

Here's an example where we replace the `meringueFactory` with a fake one.

```javascript
container.register(replacement("meringueFactory"), value({
	create() {
		return "fake meringue";
	}
}));
```

```javascript
container.get("pudding")
.then(pudding => pudding.addToppings().serveTo("Trillian"))
.then(console.log, console.error)
```

```
mixture of butter churned from cream separated from pasteurized cream-top milk, sifted castor sugar, egg laid by chicken created from nothing, milk separated from pasteurized cream-top milk, and sifted self-raising flour, baked in preheated moderate oven, topped with fake meringue, and jam, eaten by Trillian
```

You can optionally keep the existing registration with a different name, allowing you to decorate it:

```javascript
container.register(replacement("meringueFactory", "realMeringueFactory"), factory((realMeringueFactory) => ({
	async create() {
		return `fake meringue instead of ${await realMeringueFactory.create()}`;
	}
})), "realMeringueFactory");
```

```javascript
container.get("pudding")
.then(pudding => pudding.addToppings().serveTo("Trillian"))
.then(console.log, console.error)
```

```
mixture of butter churned from cream separated from pasteurized cream-top milk, sifted castor sugar, egg laid by chicken created from nothing, milk separated from pasteurized cream-top milk, and sifted self-raising flour, baked in preheated moderate oven, topped with fake meringue instead of meringue made from whipped white of egg laid by chicken created from nothing, and castor sugar, and jam, eaten by Trillian
```

## API

### Container

`new Container()`
* Creates a container

`container.register(specifier, creator, dependency1, ...)`
* Registers a bean
* The `specifier` is the name of bean to register (which could be a property on another already-registered bean, using dot notation), or a special specifier (see [Specifiers](#specifiers) below)
* The `creator` (see [Creators](#creators) below) specifies how to create the bean
* The dependencies are bean names (or properties on other beans, using dot notation) or injectors (see [Injectors](#injectors) below)
* Can also be used to replace an existing registration (prior to the bean being created)

`container.get(name)`
* Gets the bean named `name` asynchronously (returns a promise to the bean)

### Specifiers

`bean(name)`
* Specifier which specifies a normal bean named `name`
* It can be a property on another already-registered bean, using dot notation
* You can just provide the `name` as the specifier without using `bean()` for the same effect

`collection(name, getter, setter)`
* Specifier that specifies a collection bean named `name`
* Properties are retrieved by calling the function `await getter(prop)` with `this` set to the parent bean
* Properties are set by calling the function `await setter(prop, val)` with `this` set to the parent bean
* The getters and setters work if they're synchronous or asynchronous
* If the bean is a `Map`, `Container` or plain object, you probably don't need to use this, as the container supports those kinds of beans natively

`replacement(specifier, retainedName)`
* Specifier that specifies a bean to replace an already-registered bean
* The `specifier` will usually just be a bean name, but it is possible to replace a collection
* The `retainedName` is optional, but if provided, will rename the existing registration to `retainedName`

### Creators

`value(val)`
* Creator which uses the value `val` itself as the bean

`promise(pmise)`
* Creator which expects the promise `pmise` to resolve to the bean

`constructor(Ctor)`
* Creator which creates the bean by calling `new Ctor(dependency1, ...)`
* If `Ctor` is a string, the bean with that name will be used as the constructor; you can use `constructor(bean(name))` for clarity if you prefer

`factory(ftory)`
* Creator which creates the bean by calling `await ftory(dependency1, ...)`
* This works for both synchronous and asynchronous factory functions
* If `ftory` is a string, the bean with that name will be used as the factory; you can use `factory(bean(name))` for clarity if you prefer

`bean(name)`
* Creator which uses the bean named `name` as the bean, i.e. it aliases one bean to another
* Alternatively, it could be a property on another bean, using dot notation
* You can just provide the `name` as the creator without using `bean()` for the same effect

### Injectors

`value(val)`
* Injector which injects the value `val` itself

`bean(name)`
* Injector which injects the bean named `name`
* Alternatively, it could be a property on another bean, using dot notation
* You can just provide the `name` as a dependency without using `bean()` for the same effect

`bound(property)`
* Injector which injects a method on another bean (specified using dot notation for `property`), bound to the bean; `bound("foo.bar")` injects `foo.bar.bind(foo)`

`promise(name)`
* Injector which injects a promise for the bean named `name`

`promiser(name)`
* Injector which injects an asynchronous factory function (which returns a promise) for the bean named `name`

`seeker(name)`
* Injector which injects a synchronous factory function for the bean named `name`, which will however return `undefined` if the bean does not exist when the function is called

## Version history

Major changes:

* `v5`: Removed syntax sugar for `register()` which had lost most of its value.
* `v4`: Made bean replacement explicit.
* `v3`: Added registration of beans with dot notation, capable of mutating parent beans.
* `v2`: Removed misguided `initializeWith()/init()` feature. Factory functions are equally effective and don't couple beans to the container.
* `v1`: Initial version.

For details on minor/patch changes, consult the commit history.
