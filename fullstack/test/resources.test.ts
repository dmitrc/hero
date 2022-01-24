import { Helpers } from '@ulixee/hero-testing';
import { ITestKoaServer } from '@ulixee/hero-testing/helpers';
import Hero from '../index';

let koaServer: ITestKoaServer;
beforeAll(async () => {
  koaServer = await Helpers.runKoaServer();
  koaServer.get('/resources-test', ctx => {
    ctx.body = `<html>
<body>
<a onclick="clicker()" href="#nothing">Click me</a>
</body>
<script>
  let counter = 0;
  function clicker() {
    fetch('/ajax?counter=' + (counter++) );
    return false;
  }
</script>
</html>`;
  });
  koaServer.get('/ajax', ctx => {
    ctx.body = {
      hi: 'there',
    };
  });
});
afterAll(Helpers.afterAll);
afterEach(Helpers.afterEach);

describe('basic resource tests', () => {
  it('waits for a resource', async () => {
    const exampleUrl = `${koaServer.baseUrl}/resources-test`;
    const hero = new Hero();
    Helpers.needsClosing.push(hero);

    await hero.goto(exampleUrl);
    await hero.waitForPaintingStable();
    const elem = hero.document.querySelector('a');
    await hero.click(elem);

    const resources = await hero.waitForResource({ type: 'Fetch' });
    expect(resources).toHaveLength(1);
  });

  it('waits for resources by default since the previous command', async () => {
    const exampleUrl = `${koaServer.baseUrl}/resources-test`;
    const hero = new Hero();
    Helpers.needsClosing.push(hero);

    await hero.goto(exampleUrl);
    await hero.waitForPaintingStable();
    const elem = await hero.document.querySelector('a');
    const startCommandId = await hero.lastCommandId;
    await hero.click(elem);

    const resources = await hero.waitForResource({ type: 'Fetch' });
    expect(resources).toHaveLength(1);

    await hero.interact({ move: elem });
    await hero.click(elem);

    const resources2 = await hero.waitForResource({ type: 'Fetch' });
    expect(resources2).toHaveLength(1);

    let counter = 0;
    const allResources = await hero.waitForResource(
      {
        filterFn: (resource, done) => {
          if (resource.type === 'Fetch') {
            counter += 1;
            if (counter === 2) done();
            return true;
          }
          return false;
        },
      },
      { sinceCommandId: startCommandId },
    );
    expect(allResources).toHaveLength(2);
    await hero.close();
  });

  it('waits for a resource loaded since a previous command id', async () => {
    const exampleUrl = `${koaServer.baseUrl}/resources-test`;
    const hero = new Hero();
    Helpers.needsClosing.push(hero);

    await hero.goto(exampleUrl);
    await hero.waitForPaintingStable();
    let lastCommandId: number;
    for (let i = 0; i <= 4; i += 1) {
      const elem = hero.document.querySelector('a');
      await hero.click(elem);
      const resources = await hero.waitForResource(
        { type: 'Fetch' },
        { sinceCommandId: lastCommandId },
      );
      lastCommandId = await hero.lastCommandId;
      expect(resources).toHaveLength(1);
      expect(resources[0].url).toContain(`counter=${i}`);
    }
  });

  it('cancels a pending resource on hero close', async () => {
    const exampleUrl = `${koaServer.baseUrl}/resources-test`;
    const hero = new Hero();
    Helpers.needsClosing.push(hero);

    await hero.goto(exampleUrl);

    const waitForResource = hero.waitForResource({ type: 'Fetch' });
    // eslint-disable-next-line jest/valid-expect
    const waitError = expect(waitForResource).rejects.toThrowError('disconnected');
    await hero.close();
    await waitError;
  });

  it('collects resources for extraction', async () => {
    const hero = new Hero();
    const sessionId1 = await hero.sessionId;
    Helpers.needsClosing.push(hero);
    {
      await hero.goto(`${koaServer.baseUrl}/resources-test`);
      await hero.waitForPaintingStable();
      const elem = hero.document.querySelector('a');
      await hero.click(elem);

      const resources = await hero.waitForResource({ type: 'Fetch' });
      expect(resources).toHaveLength(1);
      await resources[0].$collect('xhr');

      const collected = await hero.getCollectedResources(sessionId1, 'xhr');
      expect(collected).toHaveLength(1);
      expect(collected[0].response.json).toEqual({ hi: 'there' });
      await hero.close();
    }

    // Test that we can load a previous session too
    {
      const hero2 = new Hero();
      Helpers.needsClosing.push(hero2);

      await hero2.goto(`${koaServer.baseUrl}`);
      await hero2.waitForPaintingStable();
      const collected2 = await hero2.getCollectedResources(sessionId1, 'xhr');
      expect(collected2).toHaveLength(1);
      expect(collected2[0].url).toBe(`${koaServer.baseUrl}/ajax?counter=0`);
      // should prefetch the body
      expect(collected2[0].response.buffer).toBeTruthy();
    }
  });
});
