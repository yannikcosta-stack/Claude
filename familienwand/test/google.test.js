import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as google from '../server/google.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { type: 'service_account', client_email: 'wand@projekt.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };

test('Dienstkonto-Schlüssel wird geprüft', () => {
  assert.equal(google.validateServiceAccount(sa), null);
  assert.match(google.validateServiceAccount({ type: 'authorized_user' }), /kein Dienstkonto/);
  assert.match(google.validateServiceAccount({ ...sa, private_key: 'kaputt' }), /ungültig/);
});

test('Anmeldung per JWT, Termine seitenweise lesen und anlegen (simuliertes Google)', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, opts });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (u.hostname === 'oauth2.googleapis.com') {
      const form = new URLSearchParams(opts.body);
      const [h, c] = form.get('assertion').split('.').slice(0, 2).map((x) => JSON.parse(Buffer.from(x, 'base64url').toString()));
      assert.equal(h.alg, 'RS256');
      assert.equal(c.iss, sa.client_email);
      assert.equal(c.scope, 'https://www.googleapis.com/auth/calendar');
      return json({ access_token: 'tok123', expires_in: 3600 });
    }
    assert.equal(opts.headers.authorization, 'Bearer tok123');
    if (opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      return json({ id: 'neu1', status: 'confirmed', summary: body.summary, start: body.start, end: body.end, extendedProperties: body.extendedProperties });
    }
    if (!u.searchParams.get('pageToken')) {
      return json({ items: [
        { id: 'a', status: 'confirmed', summary: 'Kinderturnen', start: { dateTime: '2026-11-05T16:30:00+01:00' }, end: { dateTime: '2026-11-05T17:30:00+01:00' }, recurringEventId: 'serie' },
        { id: 'b', status: 'cancelled', start: { date: '2026-11-06' } },
      ], nextPageToken: 'p2' });
    }
    return json({ items: [{ id: 'c', status: 'confirmed', summary: 'Ferien', start: { date: '2026-12-21' }, end: { date: '2027-01-05' } }] });
  };
  try {
    const evs = await google.listEvents(sa, 'familie@gmail.com', '2026-11-01T00:00:00Z', '2027-01-31T00:00:00Z');
    assert.deepEqual(evs.map((e) => e.id), ['a', 'c']);
    assert.equal(evs[0].start, '2026-11-05T15:30:00.000Z');
    assert.equal(evs[0].recurring, true);
    assert.deepEqual([evs[1].allDay, evs[1].start, evs[1].end], [true, '2026-12-21', '2027-01-05']);
    const listCall = calls.find((c) => c.url.pathname.includes('/events'));
    assert.equal(listCall.url.pathname, '/calendar/v3/calendars/familie%40gmail.com/events');
    assert.equal(listCall.url.searchParams.get('singleEvents'), 'true');

    const created = await google.insertEvent(sa, 'familie@gmail.com', {
      title: 'Zahnarzt', allDay: false, startNaive: '2026-11-04T15:00:00', endNaive: '2026-11-04T16:00:00', people: ['p_mama'], location: '', notes: '',
    }, 'Europe/Berlin');
    const post = calls[calls.length - 1];
    const sent = JSON.parse(post.opts.body);
    assert.deepEqual(sent.start, { dateTime: '2026-11-04T15:00:00', timeZone: 'Europe/Berlin' });
    assert.equal(sent.extendedProperties.private.fwPeople, 'p_mama');
    assert.deepEqual(created.people, ['p_mama']);
    // Token wird wiederverwendet
    assert.equal(calls.filter((c) => c.url.hostname === 'oauth2.googleapis.com').length, 1);
  } finally {
    globalThis.fetch = orig;
  }
});
