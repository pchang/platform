// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { withSeed } from './node';
import { createGatewayServer } from './http';

let close: (() => void) | undefined;
afterEach(() => close?.());

async function start(developmentMode = true) {
  const server = createGatewayServer(withSeed(), { developmentMode });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  close = () => server.close();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  return (path: string, as?: [string, string], init: RequestInit = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(as ? { 'x-lsh-person': as[0], 'x-lsh-role': as[1] } : {}) },
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

const elena: [string, string] = ['person-elena', 'QualityLead'];

describe('HTTP transport', () => {
  it('refuses every request outside development mode, until an identity provider exists', async () => {
    const api = await start(false);
    expect(await api('/objects/B-002', elena)).toEqual({ status: 401, body: { reasons: ['Authentication is required. No identity provider is connected yet.'] } });
  });

  it('asks for a principal in development mode', async () => {
    const api = await start();
    expect((await api('/objects/B-002')).status).toBe(401);
  });

  it('reads, offers methods and commits, with reasons when blocked', async () => {
    const api = await start();
    expect((await api('/objects/B-002', elena)).body.state.Quality).toBe('pending');
    const methods = (await api('/objects/B-002/methods', elena)).body as { label: string; available: boolean }[];
    expect(methods.find((m) => m.label === 'Release batch')?.available).toBe(false);

    const blocked = await api('/objects/B-002/methods/ReleaseBatch', elena, { method: 'POST', body: JSON.stringify({ inputs: { reviewer: 'person-elena' } }) });
    expect(blocked).toEqual({ status: 400, body: { reasons: ['An open quality event is raised on this batch'] } });

    const done = await api('/objects/B-002/methods/QuarantineBatch', elena, { method: 'POST', body: JSON.stringify({ inputs: { reason: 'Deviation' } }) });
    expect(done.status).toBe(201);
    expect((await api('/objects/B-002', elena)).body.state.Quality).toBe('quarantined');
    expect((await api('/commits', elena)).body).toHaveLength(1);
  });

  it('finds objects by type and state, with short names', async () => {
    const api = await start();
    const open = await api('/objects?type=DataQuery&dataQueryStatus=DataQueryStatus-open', ['person-ben', 'ClinicalDataManager']);
    expect(open.body.map((o: { identifier: string }) => o.identifier)).toEqual(['Q-01', 'Q-02', 'Q-03', 'Q-04']);
  });

  it('answers 403 and 404 with reasons', async () => {
    const api = await start();
    expect((await api('/objects/PT-03', ['person-ada', 'ComputationalChemist'])).status).toBe(403);
    expect((await api('/objects/NOPE', elena)).body).toEqual({ reasons: ['No object NOPE'] });
  });
});
