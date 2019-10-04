"use strict";

const expect = require("chai").expect;

const { Container, value, constructor, factory, bean, promise, promiser, seeker, BeanError } =
		require("../src/container");

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
				container.register("foo", "bar");
			}).to.throw(BeanError);
		});

		it('throws registering with injector as creator', function () {
			expect(() => {
				container.register("foo", promise("bar"));
			}).to.throw(BeanError);
		});

		it('registers pre-created bean', async function () {
			container.register("foo", value("bar"));

			expect(await container.get("foo")).to.equal("bar");
		});

		it('throws registering pre-created bean with dependencies', function () {
			expect(() => {
				container.register("foo", value("bar"), "baz");
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

	});

	describe('registration syntax sugar', function () {

		it('registers pre-created bean with registerValue', async function () {
			container.registerValue("foo", "bar");

			expect(await container.get("foo")).to.equal("bar");
		});

		it('registers pre-created bean with registerBean', async function () {
			container.registerBean("foo", "bar");

			expect(await container.get("foo")).to.equal("bar");
		});

		it('registers bean class with registerConstructor', async function () {
			container.registerConstructor("foo", ContainerTestBean);

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('registers bean class with registerClass', async function () {
			container.registerClass("foo", ContainerTestBean);

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
		});

		it('registers factory function with registerFactory', async function () {
			container.registerFactory("foo", () => new ContainerTestBean());

			expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
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

		it('gets property of bean', async function () {
			container.register("foo", value({ bar: "baz" }));

			expect(await container.get("foo.bar")).to.equal("baz");
		});

		it('does not bind function of bean', async function () {
			container.register("foo", value({ bar: function() { return this; } }));

			expect((await container.get("foo.bar"))()).to.be.undefined;
		});

		it('gets nested property of bean', async function () {
			container.register("foo", value({ bar: { baz: "qux" }}));

			expect(await container.get("foo.bar.baz")).to.equal("qux");
		});

		it('gets property of bean with dot in name', async function () {
			container.register("foo.bar", value({ baz: "qux" }));

			expect(await container.get("foo.bar.baz")).to.equal("qux");
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

		it('rejects injecting beans with cyclic dependency', async function () {
			container.register("foo", constructor(ContainerTestBean), "bar");
			container.register("bar", constructor(ContainerTestBean), "baz");
			container.register("baz", constructor(ContainerTestBean), "foo");

			await container.get("foo").then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error).to.be.an.instanceOf(BeanError); }
			);
		});

		it('injected promise rejects with cyclic dependency', async function () {
			container.register("foo", constructor(ContainerTestBean), promise("bar"));
			container.register("bar", constructor(ContainerTestBean), promise("baz"));
			container.register("baz", constructor(ContainerTestBean), promise("foo"));

			const foo = await container.get("foo");
			const bar = await container.get("bar");
			const baz = await container.get("baz");

			// The order of retrieval determines which promise will reject
			expect(await foo.args[0]).to.equal(bar);
			expect(await bar.args[0]).to.equal(baz);
			await baz.args[0].then(
					() => { throw new Error("promise resolved but expecting rejection"); },
					(error) => { expect(error).to.be.an.instanceOf(BeanError); }
			);
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
			expect((await container.get("bar")).args[0]()).to.equal(foo);
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
			container.register("foo", constructor(ContainerTestBean));

			await container.get("foo");

			expect(ContainerTestBean.numberOfBeans).to.equal(1);
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
