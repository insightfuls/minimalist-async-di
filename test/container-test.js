const expect = require("chai").expect;

const { Container, BeanError } = require("../src/container");

describe('Container', function () {
	/* Instantiated here just to help JetBrains figure out the type. */
	let container = new Container();

	beforeEach(function () {
		ContainerTestBean.numberOfBeans = 0;

		container = new Container();
	});

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

	it('registers pre-constructed bean', async function () {
		container.registerBean("foo", "bar");

		expect(await container.get("foo")).to.equal("bar");
	});

	it('registers synchronous factory function', async function () {
		container.registerFactory("foo", () => new ContainerTestBean());

		expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
	});

	it('registers asynchronous factory function', async function () {
		container.registerFactory("foo", async () => new ContainerTestBean());

		expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
	});

	it('gets property of bean', async function () {
		container.registerBean("foo", { bar: "baz" });

		expect(await container.get("foo.bar")).to.equal("baz");
	});

	it('gets nested property of bean', async function () {
		container.registerBean("foo", { bar: { baz: "qux" }});

		expect(await container.get("foo.bar.baz")).to.equal("qux");
	});

	it('gets property of bean with dot in name', async function () {
		container.registerBean("foo.bar", { baz: "qux" });

		expect(await container.get("foo.bar.baz")).to.equal("qux");
	});

	it('does not report instantiation error as no bean', async function () {
		container.registerFactory("foo", () => { throw new Error("instantiation failure"); });

		await container.get("foo.bar").then(
			() => { throw new Error("promise resolved but expecting rejection"); },
			(error) => { expect(error).not.to.be.an.instanceOf(BeanError); }
		);
	});

	it('provides argument to factory function', async function () {
		container.registerFactory("foo", (arg) => new ContainerTestBean(arg), "bar");
		container.registerBean("bar", "baz");

		expect((await container.get("foo")).args).to.deep.equal(["baz"]);
	});

	it('registers bean class', async function () {
		container.registerClass("foo", ContainerTestBean);

		expect(await container.get("foo")).to.be.an.instanceOf(ContainerTestBean);
	});

	it('provides argument to constructor', async function () {
		container.registerClass("foo", ContainerTestBean, "bar");
		container.registerBean("bar", "baz");

		expect((await container.get("foo")).args).to.deep.equal(["baz"]);
	});

	it('creates beans once only', async function () {
		container.registerClass("foo", ContainerTestBean);

		await container.get("foo");
		await container.get("foo");

		expect(ContainerTestBean.numberOfBeans).to.equal(1);
	})

	it('creates beans once only while pending', async function () {
		container.registerClass("foo", ContainerTestBean);

		await container.get("foo");

		expect(ContainerTestBean.numberOfBeans).to.equal(1);
	})

	it('rejects when cyclic dependency', async function () {
		container.registerClass("foo", ContainerTestBean, "bar");
		container.registerClass("bar", ContainerTestBean, "baz");
		container.registerClass("baz", ContainerTestBean, "foo");

		await container.get("foo").then(
			() => { throw new Error("promise resolved but expecting rejection"); },
			(error) => { expect(error).to.be.an.instanceOf(BeanError); }
		);
	});

});

class ContainerTestBean {
	constructor(...args) {
		this.args = args;
		ContainerTestBean.numberOfBeans++;
	}
}
ContainerTestBean.beans = 0;
