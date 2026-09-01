import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function checker() {
  const source = await readFile(new URL('../contract-ownership.js', import.meta.url), 'utf8');
  const context = { window: {} }; vm.runInNewContext(source, context); return context.window.MuzikazContractOwnership;
}

test('verifies the configured MEKNX-style ERC-721 contract with balanceOf(address)', async () => {
  const ownership = await checker(); const contract = '0xef74118d5fb730e9b2729c7303dc29980b4771f0';
  const calls = []; const wallet = { request: async ({ method, params }) => {
    calls.push({ method, params });
    if (method === 'eth_getCode') return '0x60016000';
    const data = params[0].data;
    if (data.startsWith('0x01ffc9a7')) return data.includes('80ac58cd') ? '0x1' : '0x0';
    if (data.startsWith('0x70a08231')) return '0x1';
    if (data.startsWith('0x2f745c59')) return '0x2a';
    throw new Error('unexpected call');
  } };
  const result = await ownership.verify({ wallet, address: '0x1111111111111111111111111111111111111111', contracts: [contract], requiredContract: contract });
  assert.equal(result.standard, 'ERC-721'); assert.equal(result.balance, 1n); assert.deepEqual([...result.tokenIds], ['42']);
  assert.ok(calls.some((call) => call.method === 'eth_getCode'));
});

test('supports an explicitly configured ERC-1155 token id set', async () => {
  const ownership = await checker(); const contract = '0x2222222222222222222222222222222222222222';
  const wallet = { request: async ({ method, params }) => {
    if (method === 'eth_getCode') return '0x60016000';
    const data = params[0].data;
    if (data.startsWith('0x01ffc9a7')) return data.includes('d9b67a26') ? '0x1' : '0x0';
    if (data.startsWith('0x00fdd58e')) return data.endsWith('2a'.padStart(64, '0')) ? '0x2' : '0x0';
    throw new Error('unexpected call');
  } };
  const result = await ownership.verify({ wallet, address: '0x3333333333333333333333333333333333333333', contracts: [contract], tokenIdsByContract: { [contract]: ['41', '42'] } });
  assert.equal(result.standard, 'ERC-1155'); assert.equal(result.balance, 2n); assert.deepEqual([...result.tokenIds], ['42']);
});
