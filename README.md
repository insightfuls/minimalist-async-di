# minimalist-async-di

Minimalist asynchronous IoC/dependency injection container.

 * Register constructors (classes) along with names of dependencies to provide as arguments.
 * Register synchronous or asynchronous (returning a Promise) factory functions along with names of dependencies to provide as arguments.
 * Register pre-constructed beans (e.g. to provide configuration values).
 * Optionally call an asynchronous init() method (returning a Promise) immediately after construction or obtaining a bean from a factory.
 * Getting beans is asynchronous (returns a Promise).
 * Use dot notation to get (or specify as a dependency) a property of a bean instead of the bean itself.
 * All beans are singletons.
   * Use a bean which is itself a factory if you need to generate new instances repeatedly.
   * Use a bean which is itself a factory producing containers if you need to repeatedly create scopes with managed beans.

## Example

```
const { Container } = require("minimalist-async-di");

const container = new Container();

/*
 * Set the name of the init() method to use.
 */
container.initializeWith("init");

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
 * Register cream-top-milk which we can separate. This has an asynchronous init() method.
 */

class CreamTopMilk {
  async init() {
    this.state = "cream-top milk";
    this.cream = "";
    this.milkWithoutCream = "";
    await this.pasteurize();
  }
  async getCream() {
    await this.separate();
    return this.cream;
  }
  async getMilk() {
    await this.separate();
    return await homogenize(this.milkWithoutCream);
  }
  async pasteurize() {
    this.state = `pasteurized ${this.state}`;
  }
  async separate() {
    this.cream = `cream separated from ${this.state}`;
    this.milkWithoutCream = `milk separated from ${this.state}`;
  }
}

async function homogenize(ingredient) {
  return `homogenized ${ingredient}`;
}

container.registerClass("creamTopMilk", CreamTopMilk);

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
```
