const expect = require("chai").expect;

const { Container } = require("../src/container");

describe('Container', function () {
	/* Instantiated here just to help JetBrains figure out the type. */
	let container = new Container();

	beforeEach(function () {
		ContainerTestBean.numberOfBeans = 0;
		ContainerTestBean.whenInitCalled = async function() {};

		container = new Container();
	});

	it('rejects when no bean', async function () {
		await container.get("foo").then(
            () => { throw new Error("promise resolved but expecting rejection"); },
			() => { /* convert rejection to resolution */ }
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

	it('calls init when configured', async function () {
		container.initializeWith("init");
		container.registerClass("foo", ContainerTestBean);

		let init = false;

		ContainerTestBean.whenInitCalled = async () => { init = true; };

		await container.get("foo");

		expect(init).to.be.true;
	});

	it('does not call init when not configured', async function () {
		container.registerClass("foo", ContainerTestBean);

		let init = false;

		ContainerTestBean.whenInitCalled = async () => { init = true; };

		await container.get("foo");

		expect(init).to.be.false;
	});

	it('creates beans once only', async function () {
		container.registerClass("foo", ContainerTestBean);

		await container.get("foo");
		await container.get("foo");

		expect(ContainerTestBean.numberOfBeans).to.equal(1);
	})

	it('creates beans once only while pending', async function () {
		container.initializeWith("init");
		container.registerClass("foo", ContainerTestBean);

		await new Promise(resolve => {
			const getBeanWhilePending = () => {
				container.get("foo").then(resolve);
			};
			ContainerTestBean.whenInitCalled = async () => {
				getBeanWhilePending();
			};

			container.get("foo");
		});

		expect(ContainerTestBean.numberOfBeans).to.equal(1);
	})

	it('rejects when cyclic dependency', async function () {
		container.registerClass("foo", ContainerTestBean, "bar");
		container.registerClass("bar", ContainerTestBean, "baz");
		container.registerClass("baz", ContainerTestBean, "foo");

		await container.get("foo").then(
			() => { throw new Error("promise resolved but expecting rejection"); },
			() => { /* convert rejection to resolution */ }
		);
	});

});

class ContainerTestBean {
	constructor(...args) {
		this.args = args;
		ContainerTestBean.numberOfBeans++;
	}
	async init() {
		await ContainerTestBean.whenInitCalled();
	}
}
ContainerTestBean.beans = 0;
ContainerTestBean.whenInitCalled = async function() {};
