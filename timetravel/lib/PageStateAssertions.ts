import { IAssertionAndResult } from '@ulixee/hero-interfaces/IPageStateAssertionBatch';

export default class PageStateAssertions {
  private assertsBySessionId: { [sessionId: string]: IFrameAssertions } = {};

  public iterateSessionAssertionsByFrameId(
    sessionId: string,
  ): [frameId: string, assertion: IAssertionAndResultByQuery][] {
    this.assertsBySessionId[sessionId] ??= {};
    const assertions = this.assertsBySessionId[sessionId];
    return Object.entries(assertions);
  }

  public sessionAssertionsCount(sessionId: string): number {
    let counter = 0;
    if (!this.assertsBySessionId[sessionId]) return counter;
    for (const assertions of Object.entries(this.assertsBySessionId[sessionId])) {
      counter += assertions.length;
    }
    return counter;
  }

  public getSessionAssertionWithQuery(
    sessionId: string,
    frameId: number,
    query: string,
  ): IAssertionAndResult {
    if (!this.assertsBySessionId[sessionId]) return;
    const frameAssertions = this.assertsBySessionId[sessionId][frameId];
    if (frameAssertions) return frameAssertions[query];
  }

  public recordAssertion(
    sessionId: string,
    frameId: number,
    assert: Omit<IAssertionAndResult, 'key'>,
  ): void {
    this.assertsBySessionId[sessionId] ??= {};
    this.assertsBySessionId[sessionId][frameId] ??= {};
    const assertion = assert as IAssertionAndResult;
    assertion.key ??= PageStateAssertions.generateKey(assertion.type, assertion.args);
    this.assertsBySessionId[sessionId][frameId][assertion.key] = assertion;
  }

  public getCommonSessionAssertions(
    sessionIds: Set<string>,
    startingAssertions: IFrameAssertions,
  ): IFrameAssertions {
    // clone starting point
    let state = clone(startingAssertions);
    for (const sessionId of sessionIds) {
      // need a starting place
      if (!state) {
        state = clone(this.assertsBySessionId[sessionId]);
        continue;
      }

      const sessionAssertionsByFrameId = this.assertsBySessionId[sessionId] ?? {};
      // now compare other sessions to "starting state"
      // TODO: match frames better than just "id" (check frame loaded url/name/id/dom path)
      for (const [frameId, sessionAssertions] of Object.entries(sessionAssertionsByFrameId)) {
        for (const [key, sessionAssert] of Object.entries(sessionAssertions)) {
          if (!state[frameId]) continue;
          const sharedAssertion = state[frameId][key];
          if (!sharedAssertion) continue;

          if (sharedAssertion.result === sessionAssert.result) {
            continue;
          }
          if (
            typeof sharedAssertion.result === 'number' &&
            typeof sessionAssert.result === 'number'
          ) {
            sharedAssertion.result = Math.min(sharedAssertion.result, sessionAssert.result);
            sharedAssertion.comparison = '>=';
            continue;
          }
          delete state[frameId][key];
        }
      }

      // remove anything in the shared state that's not in this run
      for (const [frameId, sharedAssertions] of Object.entries(state)) {
        for (const key of Object.keys(sharedAssertions)) {
          if (!sessionAssertionsByFrameId[frameId]) continue;
          const sessionFrameAssertions = sessionAssertionsByFrameId[frameId];
          if (!sessionFrameAssertions[key]) {
            delete state[frameId][key];
          }
        }
      }
    }
    return state;
  }

  public static generateKey(type: IAssertionAndResult['type'], args: any[]): string {
    return [type, args ? JSON.stringify(args) : ''].join(':');
  }

  public static removeAssertsSharedBetweenStates(states: IFrameAssertions[]): void {
    for (const state of states) {
      for (const [frameId, asserts] of Object.entries(state)) {
        for (const path of Object.keys(asserts)) {
          for (const otherState of states) {
            if (otherState === state) continue;

            // TODO: match frames better than just "id" (check frame loaded url/name/id/dom path)
            const otherAsserts = otherState[frameId];
            if (!otherAsserts) {
              break;
            }
            // if path and result is same, delete
            if (otherAsserts[path] && asserts[path].result === otherAsserts[path].result) {
              delete otherAsserts[path];
              delete asserts[path];
            }
          }
        }
      }
    }
  }
}

function clone<T>(obj: T): T {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

export interface IFrameAssertions {
  [frameId: string]: IAssertionAndResultByQuery;
}

interface IAssertionAndResultByQuery {
  [query: string]: IAssertionAndResult;
}
