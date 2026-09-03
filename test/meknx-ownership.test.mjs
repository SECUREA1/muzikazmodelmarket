import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMeknxOwnership } from '../meknx-ownership.mjs';

const wallet = '0x1111111111111111111111111111111111111111';
const contract = '0xef74118d5fb730e9b2729c7303dc29980b4771f0';
const response = (result) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });

test('server independently verifies a MEKNX balance before granting access', async () => {
  const methods = [];
  const proof = await verifyMeknxOwnership(wallet, contract, { rpcUrl: 'https://rpc.example', fetchImpl: async (_url, options) => {
    const request = JSON.parse(options.body); methods.push(request.method);
    return response(request.method === 'eth_getCode' ? '0x6001' : '0x2');
  } });
  assert.equal(proof.balance, '2');
  assert.deepEqual(methods, ['eth_getCode', 'eth_call']);
});

test('server rejects wallets without a MEKNX token and unavailable verification', async () => {
  await assert.rejects(verifyMeknxOwnership(wallet, contract, { rpcUrl: 'https://rpc.example', fetchImpl: async (_url, options) => response(JSON.parse(options.body).method === 'eth_getCode' ? '0x6001' : '0x0') }), (error) => error.statusCode === 403);
  await assert.rejects(verifyMeknxOwnership(wallet, contract, { rpcUrl: '' }), (error) => error.statusCode === 503);
});
