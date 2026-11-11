import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeChat } from './chatRouter.mjs';
function setup() {
  const socket = id => ({ data: { playerId: id, username: id, roomId: 'room' }, readyState: 1, inbox: [], send(data) { this.inbox.push(JSON.parse(data)); } });
  const alice = socket('alice'), bob = socket('bob'), eve = socket('eve');
  const clients = new Map([alice, bob, eve].map(ws => [ws.data.playerId, ws]));
  const rooms = new Map([['room', {id:'room', host:alice, guest:bob}]]);
  const send = payload => routeChat({ws:alice, payload, clients, rooms, friendIds:['bob']});
  return {alice,bob,eve,clients,rooms,send};
}
test('global reaches everyone and uses authenticated sender identity', () => {
  const {alice,bob,eve,send} = setup();
  send({channel:'global',message:' Olá! ',senderId:'eve'});
  for (const ws of [alice,bob,eve]) {
    assert.equal(ws.inbox.length,1);
    assert.equal(ws.inbox[0].payload.senderId,'alice');
    assert.equal(ws.inbox[0].payload.message,'Olá!');
  }
});
test('room reaches only both participants', () => {
  const {alice,bob,eve,send} = setup(); send({channel:'room',roomId:'room',message:'jogada'});
  assert.equal(alice.inbox.length,1); assert.equal(bob.inbox.length,1); assert.equal(eve.inbox.length,0);
});
test('direct reaches only the friend and sender', () => {
  const {alice,bob,eve,send} = setup(); send({channel:'direct',recipientId:'bob',message:'privado'});
  assert.equal(alice.inbox[0].payload.recipientId,'bob'); assert.equal(bob.inbox.length,1); assert.equal(eve.inbox.length,0);
});
for (const [name,payload,alter] of [
  ['nonfriend', {channel:'direct',recipientId:'eve',message:'x'},()=>{}],
  ['offline friend', {channel:'direct',recipientId:'bob',message:'x'},s=>s.bob.readyState=3],
  ['wrong room', {channel:'room',roomId:'other',message:'x'},()=>{}],
  ['outsider', {channel:'room',roomId:'room',message:'x'},s=>s.rooms.get('room').host=s.eve],
  ['closed room', {channel:'room',roomId:'room',message:'x'},s=>s.rooms.clear()],
  ['solo room', {channel:'room',roomId:'room',message:'x'},s=>s.rooms.get('room').guest=undefined],
  ['empty message', {channel:'global',message:'   '},()=>{}],
  ['oversized message', {channel:'global',message:'x'.repeat(2001)},()=>{}],
  ['invalid channel', {channel:'invalid',message:'x'},()=>{}],
]) test(`rejects ${name} without leaking messages`, () => {
  const s=setup(); alter(s); s.send(payload);
  assert.equal(s.alice.inbox[0].type,'CHAT_ERROR'); assert.equal(s.bob.inbox.length,0); assert.equal(s.eve.inbox.length,0);
});
