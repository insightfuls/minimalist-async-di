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

class Pudding {
  constructor(butter, sugar, milk, flour) {
  }
  cook() {
  }
}

class CreamTopMilk {
  async init() {
    await this.pasteurize();
  }
  async getCream() {
    await this.separate();
    return this.cream;
  }
  async getMilk() {
    await this.separate();
    return await this.homogenize(this.milkWithoutCream);
  }
}

async function createButter(creamTopMilk) {
  const cream = await creamTopMilk.getCream();
  return await cream.churn();
}

async function milk(creamTopMilk) {
  return await creamTopMilk.getMilk();
}

function createFlour(store) {
  return sift(store.flour);
}

const store = {
  sugar: {},
  flour: {}
};

const container = new Container();

container.initializeWith("init");

container.registerClass("pudding", Pudding, "butter", "store.sugar", "milk", "flour");
container.registerClass("creamTopMilk", CreamTopMilk);
container.registerFactory("butter", createButter, "creamTopMilk");
container.registerFactory("milk", milk, "creamTopMilk");
container.registerFactory("flour", createFlour, "store");
container.registerBean("store", store);

container
  .get("pudding")
  .then((pudding) => pudding.cook());
```
