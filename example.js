"use strict";

const { Container, value, promise, constructor, factory, bean, bound, promiser, seeker } =
		require(".");

/*
 * Components, which would ordinarily be exported from other modules.
 */

const localStore = {
	flour: "self-raising flour"
};

const castorSugar = "castor sugar";

class Mixer {
	constructor(butter, sugar, egg, milk, flour) {
		Object.assign(this, { butter, sugar, egg, milk, flour });
	}
	async getMixture() {
		return `mixture of ${this.butter}, ${this.sugar}, ${this.egg}, ${this.milk}, and ${this.flour}`;
	}
}

function createFlour(store) {
	return sift(store.flour);
}

function sift(ingredient) {
	return `sifted ${ingredient}`;
}

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

function createButter(creamTopMilk) {
	return creamTopMilk.getCream()
	.then(cream => `butter churned from ${cream}`);
}

class JamFactory {
	constructor() {
		this.jam = "jam";
	}
	async getJam() {
		return this.jam;
	}
}

class Oven {
	constructor(type) {
		this.type = type;
	}
	async preheat() {
		return `preheated ${this.type} oven`;
	}
}

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

class Chicken {
	constructor(maybeGetCreateEgg) {
		this.origin = maybeGetCreateEgg() ? "an egg" : "nothing";
	}
	async lay() {
		return `egg laid by chicken created from ${this.origin}`;
	}
}

function createCreateEgg(chicken) {
	return async function createEgg() {
		return chicken.lay();
	}
}

class MeringueFactory {
	constructor(createEgg, sugar) {
		this.createEgg = createEgg;
		this.sugar = sugar;
	}
	async create() {
		return `meringue made from whipped white of ${await this.createEgg()}, and ${this.sugar}`;
	}
}

/*
 * The container.
 */

const container = new Container();

container.register("store", value(localStore));
container.register("store[sugar]", value(castorSugar));
container.register("chicken", constructor(Chicken), seeker("createEgg"));
container.register("createEgg", factory(createCreateEgg), "chicken");
container.register("meringueFactory", constructor(MeringueFactory), "createEgg", "store[sugar]");
container.register("jamFactory", constructor(JamFactory));
container.register("createCookingScope", factory(createCreateCookingScope), value(container));

function createCreateCookingScope(parent) {
	return async function createCookingScope() {
		const reuseFromParent = factory(parent.get.bind(parent));
		const parentBean = value;

		const child = new Container();

		child.register("store", reuseFromParent, parentBean("store"));
		child.register("meringueFactory", reuseFromParent, parentBean("meringueFactory"));
		child.register("jamFactory", reuseFromParent, parentBean("jamFactory"));
		child.register("parentCreateEgg", value(await parent.get("createEgg")));
		child.register("mixer", constructor(Mixer), "butter", "sugar", "eggForMixture", "milk", "flour");
		child.register("flour", factory(createFlour), "store");
		child.register("creamTopMilk", promise((new CreamTopMilk()).pasteurize()));
		child.register("butter", factory(createButter), "creamTopMilk");
		child.register("milk", factory("creamTopMilk.getMilk"));
		child.register("mixture", factory(bean("mixer.getMixture")));
		child.register("sugar", factory(sift), "store[sugar]");
		child.register("oven", constructor(Oven), value("moderate"));
		child.register("pudding", constructor(Pudding),
				bean("oven"), promise("mixture"), promiser("meringue"), bound("jamFactory.getJam"));
		child.register("chicken", constructor(Chicken), seeker("parentCreateEgg"));
		child.register("createEgg", factory(createCreateEgg), "chicken");
		child.register("eggForMixture", factory("createEgg"));
		child.register("meringue", factory("meringueFactory.create"));

		return child;
	};
}

/*
 * Use it.
 */

// Try to serve the same pudding twice (from the same scope)

const promisedScope = container.get("createCookingScope").then(create => create());

promisedScope.then(scope => scope.get("pudding"))
.then(pudding => pudding.addToppings().serveTo("Trillian"))
.then(console.log, console.error);

promisedScope.then(scope => scope.get("pudding"))
.then(pudding => pudding.serveTo("Zaphod"))
.then(console.log, console.error);

// Create a different scope to bake another pudding

container.get("createCookingScope")
.then(create => create())
.then(scope => scope.get("pudding"))
.then(pudding => pudding.serveTo("Ben"))
.then(console.log, console.error);
