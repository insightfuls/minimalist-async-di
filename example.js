const { Container } = require(".");

const container = new Container();

/*
 * Register a Pudding class to allow us to cook a pudding. The dependencies will be defined
 * later. This is a vanilla ES6 class. Note that the 'sugar' dependency is injected using
 * dot notation.
 */

class Pudding {
	constructor(butter, sugar, milk, flour) {
		Object.assign(this, { butter, sugar, milk, flour });
	}
	cook() {
		return `bake ${this.getMixture()}`;
	}
	getMixture() {
		return `mixture of ${this.butter}, ${this.sugar}, ${this.milk}, and ${this.flour}`
	}
}

container.registerClass("pudding", Pudding, "butter", "store.sugar", "milk", "flour");

/*
 * Register cream-top-milk which we can separate.
 */

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

async function createPasteurizedCreamTopMilk() {
	return await (new CreamTopMilk()).pasteurize();
}

container.registerFactory("creamTopMilk", createPasteurizedCreamTopMilk);

/*
 * Register asynchronous factory functions.
 */

async function createButter(creamTopMilk) {
	const cream = await creamTopMilk.getCream();
	return `butter churned from ${cream}`;
}

async function milk(creamTopMilk) {
	return await creamTopMilk.getMilk();
}

container.registerFactory("butter", createButter, "creamTopMilk");
container.registerFactory("milk", milk, "creamTopMilk");

/*
 * Register a synchronous factory function.
 */

function createFlour(store) {
	return sift(store.flour);
}

function sift(ingredient) {
	return `sifted ${ingredient}`;
}

container.registerFactory("flour", createFlour, "store");

/*
 * Register a pre-constructed bean.
 */

const store = {
	sugar: "sugar",
	flour: "flour"
};

container.registerBean("store", store);

/*
 * Get the pudding from the container and cook it!
 */

container
	.get("pudding")
	.then((pudding) => pudding.cook())
	.then(console.log);
