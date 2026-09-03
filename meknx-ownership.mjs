const ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;
const BALANCE_OF_SELECTOR = '70a08231';

const word = (address) => address.replace(/^0x/, '').padStart(64, '0');

export async function verifyMeknxOwnership(wallet, contract, {
  rpcUrl = process.env.MUZIKAZ_ETH_RPC_URL,
  fetchImpl = fetch
} = {}) {
  const owner = String(wallet || '').trim().toLowerCase();
  const collection = String(contract || '').trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(owner) || !ADDRESS_PATTERN.test(collection)) {
    throw Object.assign(new Error('A valid MEKNX wallet and contract are required.'), { statusCode: 400 });
  }
  if (!rpcUrl) throw Object.assign(new Error('MEKNX verification is temporarily unavailable.'), { statusCode: 503 });

  const call = async (method, params) => {
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!response.ok) throw new Error(`Ethereum RPC returned ${response.status}.`);
    const result = await response.json();
    if (result.error || result.result == null) throw new Error(result.error?.message || 'Ethereum RPC returned no result.');
    return result.result;
  };

  try {
    const code = await call('eth_getCode', [collection, 'latest']);
    if (!code || code === '0x') throw new Error('The configured MEKNX address is not a contract.');
    const rawBalance = await call('eth_call', [{ to: collection, data: `0x${BALANCE_OF_SELECTOR}${word(owner)}` }, 'latest']);
    const balance = BigInt(rawBalance);
    if (balance < 1n) throw Object.assign(new Error('This wallet does not hold a MEKNX access token.'), { statusCode: 403 });
    return { owner, contract: collection, balance: balance.toString(), verifiedAt: new Date().toISOString() };
  } catch (error) {
    if (error.statusCode) throw error;
    throw Object.assign(new Error('MEKNX ownership could not be verified on Ethereum.'), { statusCode: 503, cause: error });
  }
}
