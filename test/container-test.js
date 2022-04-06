"use strict";

const expect = require("chai").expect;

const library = require("../src/container");

const {
	Container, bean, collection, replacement, value, promise, constructor, factory,
	bound, promiser, seeker, BeanError
} = library;

describe('Container', function () {

	/* Instantiated here just to help JetBrains figure out the type. */
	let container = new Container();

	beforeEach(function () {
		ContainerTestBean.numberOfBeans = 0;

		container = new Container();
	});

	describe('registration with different creators', function () {

		it('throws registering with invalid creator', function () {
			expect(() => {
				container.register("foo", () => "bar");
			}).to.throw(BeanError);
		});

		it('throws registering with injector as creator', function () {
			expect(() => {
				container.register("foo", promiser("bar"));
			}).to.throw(BeanError);
		});

		it('registers pre-created bean', async function () {
			container.register("foo", value("bar"));

			expect(await container.get("foo")).to.equal("bar");
		});

		it('registers falsy pre-created beans', async function () {
			container.register("foo", value(""));
			container.register("bar", value(null));
			container.register("baz", value(undefined));

			expect(await container.get("foo")).to.equal("");
			expect(await container.get("bar")).to.equal(null);
			expect(await container.get("baz")).to.equal(undefined);
		});

		it('registers using bean specifier', async function () {
			container.register(bean("foo"), value("bar"));

			expect(await container.get("foo")).to.equal("bar");
		});

		it('registers using collection specifier', async function () {
			container.register(collection("foo"), value({}));

			expect(await container.get("foo")).to.deep.equal({});
		});

		it('throws registering pre-created bean with dependencies', function () {
			expect(() => {
				container.register("foo", value("bar"), "baz");
			}).to.throw(BeanError);
		});

		it('registers promised bean', async function () {
			container.register("foo", promise(Promise.resolve("bar")));

			expect(await container.get("foo")).to.equal("bar");
		});

		it('throws registering promised bean with dependencies', function () {
			expect(() => {
				container.register("foo", promise(new Promise(resolve => resolve("bar"))), "baz");
			}).to.throw(BeanError);
		});

		it('throws using promise injector as creator', function () {
			expect(() => {
				container.register("foo", promise("bar"));
			}).to.throw(BeanError);
		});

		it('registers constructor', async function () {
			container.register("foo", constructor(ContainerTestBean));

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('registers bean as a constructor', async function () {
			container.register("foo", value(ContainerTestBean));
			container.register("bar", constructor("foo"));

			expect(await container.get("bar")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('throws registering invalid constructor', async function () {
			expect(() => {
				container.register("foo", constructor(null));
			}).to.throw(BeanError);
		});

		it('registers synchronous factory function', async function () {
			container.register("foo", factory(() => new ContainerTestBean()));

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('registers asynchronous factory function', async function () {
			container.register("foo", factory(async () => new ContainerTestBean()));

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('registers bean as a factory function', async function () {
			container.register("foo", value(async () => new ContainerTestBean()));
			container.register("bar", factory("foo"));

			expect(await container.get("bar")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('throws registering invalid factory function', async function () {
			expect(() => {
				container.register("foo", factory(null));
			}).to.throw(BeanError);
		});

		it('registers alias', async function () {
			container.register("foo", value("bar"));
			container.register("baz", "foo");

			expect(await container.get("baz")).to.equal("bar");
		});

		it('registers alias with bean creator', async function () {
			container.register("foo", value("bar"));
			container.register("baz", bean("foo"));

			expect(await container.get("baz")).to.equal("bar");
		});

		it('throws registering alias with dependencies', function () {
			expect(() => {
				container.register("foo", bean("bar"), "baz");
			}).to.throw(BeanError);
		});

		it('replaces bean', async function () {
			container.register("foo", value("foo"));
			container.register(replacement("foo"), value("bar"));

			expect(await container.get("foo")).to.equal("bar");
		});

		it('retains replaced bean', async function () {
			container.register("foo", value("foo"));
			container.register(replacement("foo", "original"),
					factory((original) => `${original}bar`),
					"original");

			expect(await container.get("original")).to.equal("foo");
			expect(await container.get("foo")).to.equal("foobar");
		});

		it('throws replacing non-existent bean', async function () {
			expect(() => {
				container.register(replacement("foo"), value("bar"));
			}).to.throw(BeanError);
		});

		it('throws replacing created bean', async function () {
			container.register("foo", value("foo"));

			expect(await container.get("foo")).to.equal("foo");

			expect(() => {
				container.register(replacement("foo"), value("bar"));
			}).to.throw(BeanError);
		});

		it('throws replacing pending bean', async function () {
			container.register("foo", factory(async () => {
				expect(() => {
					container.register(replacement("foo"), value("bar"));
				}).to.throw(BeanError);

				return "foo";
			}));

			expect(await container.get("foo")).to.equal("foo");
		});

		it('throws re-registering bean', async function () {
			container.register("foo", value("foo"));

			expect(() => {
				container.register("foo", value("bar"));
			}).to.throw(BeanError);
		});

		it('throws re-registering created bean', async function () {
			container.register("foo", value("foo"));

			expect(await container.get("foo")).to.equal("foo");

			expect(() => {
				container.register("foo", value("bar"));
			}).to.throw(BeanError);
		});

		it('throws re-registering pending bean', async function () {
			container.register("foo", factory(async () => {
				expect(() => {
					container.register("foo", value("bar"));
				}).to.throw(BeanError);

				return "foo";
			}));

			expect(await container.get("foo")).to.equal("foo");
		});

	});

	describe('getting beans', function () {

		it('rejects when no bean', async function () {
			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => {
						expect(error).to.be.an.instanceOf(BeanError);

						/* Also check that a BeanError is an Error. */
						expect(error).to.be.an.instanceOf(Error);
					}
			);
		});

		it('rejects when bean is retrieved if bean promise rejects', async function () {
			container.register("foo", promise(Promise.reject(new Error("bummer"))));

			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error.message).to.equal("bummer"); }
			);
		});

		it('gets property of bean with dot notation', async function () {
			container.register("foo", value({ bar: "baz" }));

			expect(await container.get("foo.bar")).to.equal("baz");
		});

		it('gets property of bean with bracket notation', async function () {
			container.register("foo", value({ bar: "baz" }));

			expect(await container.get("foo[bar]")).to.equal("baz");
		});

		it('rejects when bean property is retrieved if bean promise rejects', async function () {
			container.register("foo", promise(Promise.reject(new Error("bummer"))));

			await container.get("foo.bar").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error.message).to.equal("bummer"); }
			);
		});

		it('does not bind function of bean', async function () {
			container.register("foo", value({ bar: function() { return this; } }));

			expect((await container.get("foo.bar"))()).to.be.undefined;
		});

		it('gets nested dotted properties of bean', async function () {
			container.register("foo", value({ bar: { baz: "qux" }}));

			expect(await container.get("foo.bar.baz")).to.equal("qux");
		});

		it('gets nested bracketed properties of bean', async function () {
			container.register("foo", value({ bar: { baz: "qux" }}));

			expect(await container.get("foo[bar][baz]")).to.equal("qux");
		});

		it('gets property of bean with dot in name', async function () {
			container.register("foo.bar", value({ baz: "qux" }));

			expect(await container.get("foo.bar.baz")).to.equal("qux");
		});

		it('gets property of bean with bracket in name', async function () {
			container.register("foo[bar]", value({ baz: "qux" }));

			expect(await container.get("foo[bar][baz]")).to.equal("qux");
		});

		it('does not report instantiation error as no bean', async function () {
			container.register("foo", factory(() => { throw new Error("instantiation failure"); }));

			await container.get("foo.bar").then(
				() => { throw new Error("promise resolved but expecting rejection"); },
				(error) => { expect(error).not.to.be.an.instanceOf(BeanError); }
			);
		});

		it('uses property of bean as factory with this set correctly', async function () {
			const object = {
				bean: new ContainerTestBean(),
				create() {
					return this.bean;
				}
			};

			container.register("object", value(object));
			container.register("foo", factory("object.create"));

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('rejects when bean factory promise rejects', async function () {
			container.register("foo", promise(Promise.reject(new Error("bummer"))));
			container.register("bar", factory("foo"));

			await container.get("bar").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error.message).to.contain("bummer"); }
			);
		});

	});

	describe('dependency injection', function () {

		it('throws registering with creator as injector', function () {
			expect(() => {
				container.register("foo", factory(() => {}), factory("bar"));
			}).to.throw(BeanError);
		});

		it('provides bean to constructor', async function () {
			container.register("foo", constructor(ContainerTestBean), "bar");
			container.register("bar", value("baz"));

			expect((await container.get("foo")).args).to.deep.equal(["baz"]);
		});

		it('provides bean to factory function', async function () {
			container.register("foo", factory((arg) => new ContainerTestBean(arg)), "bar");
			container.register("bar", value("baz"));

			expect((await container.get("foo")).args).to.deep.equal(["baz"]);
		});

		it('provides bean using bean injector', async function () {
			container.register("foo", constructor(ContainerTestBean), bean("bar"));
			container.register("bar", value("baz"));

			expect((await container.get("foo")).args).to.deep.equal(["baz"]);
		});

		it('rejects when bean is injected if bean promise rejects', async function () {
			container.register("foo", promise(Promise.reject(new Error("bummer"))));
			container.register("bar", factory(bean => bean), "foo");

			await container.get("bar").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error.message).to.contain("bummer"); }
			);
		});

		it('does not bind function ordinarily', async function () {
			container.register("bar", value({ baz: function() { return this; } }));

			container.register("foo", constructor(ContainerTestBean), "bar.baz");

			const fn = (await container.get("foo")).args[0]
			expect(fn()).to.be.undefined;
		});

		it('provides bound function (method) using bound injector', async function () {
			container.register("bar", value({ baz: function() { return this; } }));

			container.register("foo", constructor(ContainerTestBean), bound("bar.baz"));

			const fn = (await container.get("foo")).args[0]
			expect(fn()).to.not.be.undefined;
		});

		it('provides value using value injector', async function () {
			container.register("foo", constructor(ContainerTestBean), value("bar"));

			expect((await container.get("foo")).args).to.deep.equal(["bar"]);
		});

		it('provides promise using promise injector', async function () {
			container.register("foo", constructor(ContainerTestBean), promise("bar"));
			container.register("bar", value("baz"));

			const args = (await container.get("foo")).args;
			expect(args.length).to.equal(1);
			expect(await args[0]).to.equal("baz");
		});

		it('throws using promise creator as injector', function () {
			expect(() => {
				container.register("foo", constructor(ContainerTestBean),
						promise(Promise.resolve("bar")));
			}).to.throw(BeanError);
		});

		it('provides asynchronous factory using promiser injector', async function () {
			container.register("foo", constructor(ContainerTestBean), promiser("bar"));
			container.register("bar", value("baz"));

			const args = (await container.get("foo")).args;
			expect(args.length).to.equal(1);
			expect(await args[0]()).to.equal("baz");
		});

		it('provides synchronous factory using seeker injector', async function () {
			container.register("foo", constructor(ContainerTestBean), seeker("bar"));
			container.register("bar", value("baz"));

			await container.get("bar");

			const args = (await container.get("foo")).args;
			expect(args.length).to.equal(1);
			expect(args[0]()).to.equal("baz");
		});

		it('seeker returns undefined when bean not created', async function () {
			container.register("foo", constructor(ContainerTestBean), seeker("bar"));
			container.register("bar", factory(() => "baz"));

			const args = (await container.get("foo")).args;
			expect(args.length).to.equal(1);
			expect(args[0]()).to.be.undefined;
		});

	});

	describe('cyclic dependencies', function () {

		it('rejects injecting itself', async function () {
			container.register("foo", constructor(ContainerTestBean), "foo");

			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error).to.be.an.instanceOf(BeanError); }
			);
		});

		it('rejects injecting beans with cyclic dependency', async function () {
			container.register("foo", constructor(ContainerTestBean), "bar");
			container.register("bar", constructor(ContainerTestBean), "baz");
			container.register("baz", constructor(ContainerTestBean), "foo");

			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error).to.be.an.instanceOf(BeanError); }
			);
		});

		it('succeeds with cyclic dependency with promise first', async function () {
			container.register("foo", constructor(ContainerTestBean), promise("bar"));
			container.register("bar", constructor(ContainerTestBean), bean("foo"));

			const foo = await container.get("foo");
			const barInFoo = await foo.args[0];
			expect(barInFoo).to.not.be.undefined;

			const bar = await container.get("bar");
			expect(barInFoo).to.equal(bar);
		});

		it('succeeds with cyclic dependency with promise second', async function () {
			container.register("foo", constructor(ContainerTestBean), bean("bar"));
			container.register("bar", constructor(ContainerTestBean), promise("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			expect((await bar.args[0])).to.equal(foo);
		});

		it('succeeds with cyclic dependency with symmetrical promises', async function () {
			container.register("foo", constructor(ContainerTestBean), promise("bar"));
			container.register("bar", constructor(ContainerTestBean), promise("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			expect((await bar.args[0])).to.equal(foo);
			expect((await foo.args[0])).to.equal(bar);
		});

		it('succeeds with cyclic dependency with promiser first', async function () {
			container.register("foo", constructor(ContainerTestBean), promiser("bar"));
			container.register("bar", constructor(ContainerTestBean), bean("foo"));

			const foo = await container.get("foo");
			const barInFoo = await foo.args[0]();
			expect(barInFoo).to.not.be.undefined;

			const bar = await container.get("bar");
			expect(barInFoo).to.equal(bar);
		});

		it('succeeds with cyclic dependency with promiser second', async function () {
			container.register("foo", constructor(ContainerTestBean), bean("bar"));
			container.register("bar", constructor(ContainerTestBean), promiser("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			expect((await bar.args[0]())).to.equal(foo);
		});

		it('succeeds with cyclic dependency with symmetrical promisers', async function () {
			container.register("foo", constructor(ContainerTestBean), promiser("bar"));
			container.register("bar", constructor(ContainerTestBean), promiser("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			expect((await bar.args[0]())).to.equal(foo);
			expect((await foo.args[0]())).to.equal(bar);
		});

		it('succeeds with cyclic dependency with seeker first', async function () {
			container.register("foo", constructor(ContainerTestBean), seeker("bar"));
			container.register("bar", constructor(ContainerTestBean), bean("foo"));

			const foo = await container.get("foo");
			expect(foo.args[0]()).to.be.undefined;

			const bar = await container.get("bar");
			expect(foo.args[0]()).to.equal(bar);
		});

		it('succeeds with cyclic dependency with seeker second', async function () {
			container.register("foo", constructor(ContainerTestBean), bean("bar"));
			container.register("bar", constructor(ContainerTestBean), seeker("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			expect(bar.args[0]()).to.equal(foo);
		});

		it('succeeds with cyclic dependency with symmetrical seekers', async function () {
			container.register("foo", constructor(ContainerTestBean), seeker("bar"));
			container.register("bar", constructor(ContainerTestBean), seeker("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			expect(bar.args[0]()).to.equal(foo);
			expect(foo.args[0]()).to.equal(bar);
		});

		it('rejects cyclic dependency in retained replaced bean', async function () {
			container.register("foo", constructor(ContainerTestBean), "bar");
			container.register(replacement("foo", "bar"), value("baz"));

			await container.get("bar").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error).to.be.an.instanceOf(BeanError); }
			);
		});

	});

	describe('beans are singletons', function () {

		it('creates beans once only', async function () {
			container.register("foo", constructor(ContainerTestBean));

			await container.get("foo");
			await container.get("foo");

			expect(ContainerTestBean.numberOfBeans).to.equal(1);
		});

		it('creates beans once only while pending', async function () {
			let promise;

			container.register("foo", factory(() => {
				// Retrieve a second time while creating the bean
				promise = container.get("foo");

				return new ContainerTestBean();
			}));

			await container.get("foo");
			await promise;

			expect(ContainerTestBean.numberOfBeans).to.equal(1);
		});

	});

	describe("collections", function () {

		it('throws registering with invalid specifier', function () {
			expect(() => {
				container.register(factory("foo"), value("bar"));
			}).to.throw(BeanError);
		});

		it("adds property to created collection with dot notation", async function () {
			container.register("foo", value({}));

			await container.get("foo");

			container.register("foo.bar", value("baz"));

			const bean = await container.get("foo");
			expect(bean.bar).to.equal("baz");
		});

		it("adds property to pending collection with dot notation", async function () {
			let promise1;
			let promise2;

			container.register("foo", factory(() => {
				// Get "foo" again; this one still won't have the "bar" property because
				// "foo" is still not fully created.
				promise1 = container.get("foo");

				// Register "foo.bar" while "foo" is being created.
				container.register("foo.bar", factory(async () => {
					expect((await promise1).bar).to.be.undefined;

					return "baz";
				}));

				// Get "foo" yet again; this one should have the "bar" property.
				promise2 = container.get("foo");

				return {};
			}));

			// We don't expect this one to have the "bar" property because it was retrieved
			// before "foo" was created.
			expect((await container.get("foo")).bar).to.be.undefined;
			expect((await promise2).bar).to.equal("baz");
		});

		it("adds property to uncreated collection with dot notation", async function () {
			container.register("foo", factory(() => ({})));
			container.register("foo.bar", value("baz"));

			expect((await container.get("foo")).bar).to.equal("baz");
		});

		it("adds property to created collection with bracket notation", async function () {
			container.register("foo", value({}));

			await container.get("foo");

			container.register("foo[bar]", value("baz"));

			const bean = await container.get("foo");
			expect(bean.bar).to.equal("baz");
		});

		it("adds property to pending collection with bracket notation", async function () {
			let promise1;
			let promise2;

			container.register("foo", factory(() => {
				// Get "foo" again; this one still won't have the "bar" property because
				// "foo" is still not fully created.
				promise1 = container.get("foo");

				// Register "foo.bar" while "foo" is being created.
				container.register("foo[bar]", factory(async () => {
					expect((await promise1).bar).to.be.undefined;

					return "baz";
				}));

				// Get "foo" yet again; this one should have the "bar" property.
				promise2 = container.get("foo");

				return {};
			}));

			// We don't expect this one to have the "bar" property because it was retrieved
			// before "foo" was created.
			expect((await container.get("foo")).bar).to.be.undefined;
			expect((await promise2).bar).to.equal("baz");
		});

		it("adds property to uncreated collection with bracket notation", async function () {
			container.register("foo", factory(() => ({})));
			container.register("foo[bar]", value("baz"));

			expect((await container.get("foo")).bar).to.equal("baz");
		});

		it("does not add property to unknown collection", async function () {
			container.register("foo.bar", value("baz"));
			container.register("foo", value({}));

			expect((await container.get("foo")).bar).to.be.undefined;
		});

		it("rejects when created collection is retrieved again on property error",
				async function () {
			container.register("foo", value({}));

			await container.get("foo");

			container.register("foo.bar", factory(() => { throw new Error("bummer"); }));

			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error.message).to.contain("bummer"); }
			);
		});

		it("rejects when uncreated collection is created on property error",
				async function () {
			container.register("foo", factory(() => ({})));
			container.register("foo.bar", factory(() => { throw new Error("bummer"); }));

			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error.message).to.contain("bummer"); }
			);
		});

		it('retains replaced collection', async function () {
			container.register("foo", value({}));
			container.register("foo.bar", value("baz"));
			container.register(replacement("foo", "original"), value("new"));

			expect((await container.get("original")).bar).to.equal("baz");
			expect(await container.get("foo")).to.equal("new");
		});

		it('retains replaced bean in a collection', async function () {
			container.register("foo", value({}));
			container.register("original", value({}));
			container.register("foo.bar", value("baz"));
			container.register(replacement("foo.bar", "original.bar"), value("qux"));

			expect((await container.get("original")).bar).to.equal("baz");
			expect((await container.get("foo")).bar).to.equal("qux");
		});

		it("sets into a Map", async function () {
			container.register("foo", value(new Map()));
			container.register("foo.bar", value("baz"));

			expect((await container.get("foo")).get("bar")).to.equal("baz");
		});

		it("gets from a Map", async function () {
			const map = new Map();
			map.set("bar", "baz");

			container.register("foo", value(map));

			expect((await container.get("foo.bar"))).to.equal("baz");
		});

		it("sets into a Container", async function () {
			container.register("foo", value(new Container()));
			container.register("foo.bar", value("baz"));

			const subcontainer = await container.get("foo");
			expect(await subcontainer.get("bar")).to.equal("baz");
		});

		it("gets from a Container", async function () {
			const subcontainer = new Container();
			subcontainer.register("bar", value("baz"));

			container.register("foo", value(subcontainer));

			expect(await container.get("foo.bar")).to.equal("baz");
		});

	});

	describe("custom collections", function () {

		class SynchronousCollection {
			constructor() {
				this.store = {};
			}
			retrieve(name) {
				return this.store[name];
			}
			put(name, val) {
				this.store[name] = val;
			}
		}

		const synchronousCollectionSpecfier = collection("foo",
				SynchronousCollection.prototype.retrieve,
				SynchronousCollection.prototype.put);

		class AsynchronousCollection {
			constructor() {
				this.store = {};
			}
			async retrieve(name) {
				return this.store[name];
			}
			async put(name, val) {
				this.store[name] = val;
			}
		}

		const asynchronousCollectionSpecfier = collection("foo",
				AsynchronousCollection.prototype.retrieve,
				AsynchronousCollection.prototype.put);

		it("sets synchronously into a custom collection", async function () {
			container.register(synchronousCollectionSpecfier, value(new SynchronousCollection()));
			container.register("foo.bar", value("baz"));

			expect((await container.get("foo")).retrieve("bar")).to.equal("baz");
		});

		it("gets synchronously from a custom collection", async function () {
			const myCollection = new SynchronousCollection();
			myCollection.put("bar", "baz");

			container.register(synchronousCollectionSpecfier, value(myCollection));

			expect((await container.get("foo.bar"))).to.equal("baz");
		});

		it("sets asynchronously into a custom collection", async function () {
			container.register(asynchronousCollectionSpecfier, value(new AsynchronousCollection()));
			container.register("foo.bar", value("baz"));

			const myCollection = await container.get("foo");
			expect(await myCollection.retrieve("bar")).to.equal("baz");
		});

		it("gets asynchronously from a custom collection", async function () {
			const myCollection = new AsynchronousCollection();
			await myCollection.put("bar", "baz");

			container.register(asynchronousCollectionSpecfier, value(myCollection));

			expect(await container.get("foo.bar")).to.equal("baz");
		});

		it('replaces with a custom collection', async function () {
			container.register("foo", value("bar"));
			container.register(replacement(asynchronousCollectionSpecfier),
					value(new AsynchronousCollection()));
			container.register("foo.bar", value("baz"));

			const myCollection = await container.get("foo");
			expect(await myCollection.retrieve("bar")).to.equal("baz");
		});

	});

	describe("references on instances", function () {

		Object.entries({
			"Container": "constructor",
			"collection": "specifier",
			"replacement": "specifier",
			"bean": "specifier/creator/injector",
			"value": "creator/injector",
			"promise": "creator/injector",
			"constructor": "creator",
			"factory": "creator",
			"bound": "injector",
			"promiser": "injector",
			"seeker": "injector",
			"BeanError": "class"
		}).forEach(([ name, kind ]) => {
			it(`has reference to ${name} ${kind} on container instance`, function () {
				const container = new Container();

				expect(container[name]).to.equal(library[name]);
			});
		});

		it(`can destructure container instance to register and get`, async function () {
			const container = new Container();

			const { register, get, value } = container;

			register("foo", value('bar'));

			expect(await get("foo")).to.equal("bar");
			expect(await container.get("foo")).to.equal("bar");
		});

	});

});

class ContainerTestBean {
	constructor(...args) {
		this.args = args;
		ContainerTestBean.numberOfBeans++;
	}
}
ContainerTestBean.beans = 0;
