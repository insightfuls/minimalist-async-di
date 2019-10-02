"use strict";

const { Container, value, constructor, factory } = require(".");

/*
 * Components, which would ordinarily be exported from other modules.
 */

const localStore = {
	sugar: "sugar",
	flour: "flour"
};

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

/*
 * The container.
 */

const container = new Container();

container.register("store", value(localStore));
container.register("pudding", constructor(Pudding), "butter", "sugar", "milk", "flour");
container.register("flour", factory(createFlour), "store");
container.register("creamTopMilk", factory(createPasteurizedCreamTopMilk));
container.register("butter", factory(createButter), "creamTopMilk");
container.register("milk", factory("creamTopMilk.getMilk"));
container.register("sugar", factory(sift), "store.sugar");

container
.get("pudding")
.then((pudding) => pudding.cook())
.then(console.log, console.error)
.then(() => container.get("pudding"))
.then((pudding) => pudding.cook())
.then(console.log, console.error);
