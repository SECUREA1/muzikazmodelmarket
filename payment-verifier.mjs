const minimumConfirmations = { ETH: 12, POL: 128, BNB: 15, SOL: 1, ADA: 15, BTC: 3, DOGE: 6 };

async function jsonRequest(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.MUZIKAZ_PAYMENT_PROVIDER_KEY ? { Authorization: `Bearer ${process.env.MUZIKAZ_PAYMENT_PROVIDER_KEY}` } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Payment provider returned HTTP ${response.status}.`);
  return response.json();
}

async function verifyEvm(order, rpcUrl) {
  const [receiptResponse, transactionResponse, blockResponse] = await Promise.all([
    jsonRequest(rpcUrl, { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [order.transactionHash] }),
    jsonRequest(rpcUrl, { jsonrpc: '2.0', id: 2, method: 'eth_getTransactionByHash', params: [order.transactionHash] }),
    jsonRequest(rpcUrl, { jsonrpc: '2.0', id: 3, method: 'eth_blockNumber', params: [] })
  ]);
  const receipt = receiptResponse.result; const transaction = transactionResponse.result;
  if (!receipt || !transaction) return { verified: false, confirmations: 0, amountReceived: 0 };
  if (String(transaction.to || '').toLowerCase() !== order.destinationAddress.toLowerCase()) return { failed: true, confirmations: 0, amountReceived: 0 };
  const amountReceived = Number(BigInt(transaction.value || '0x0')) / 1e18;
  const confirmations = Number(BigInt(blockResponse.result) - BigInt(receipt.blockNumber) + 1n);
  return { verified: receipt.status === '0x1' && confirmations >= minimumConfirmations[order.paymentAsset], confirmations, amountReceived };
}

export async function verifyPaymentTransaction(order) {
  const symbol = order.paymentAsset;
  if (['ETH', 'POL', 'BNB'].includes(symbol)) {
    const rpcUrl = process.env[`MUZIKAZ_${symbol}_RPC_URL`];
    if (!rpcUrl) return { verified: false, confirmations: 0, amountReceived: 0, providerRequired: true };
    return verifyEvm(order, rpcUrl);
  }
  const verifierUrl = process.env[`MUZIKAZ_${symbol}_VERIFIER_URL`];
  if (!verifierUrl) return { verified: false, confirmations: 0, amountReceived: 0, providerRequired: true };
  const result = await jsonRequest(verifierUrl, { transactionHash: order.transactionHash, destinationAddress: order.destinationAddress, expectedAmount: order.expectedAmount, paymentNetwork: order.paymentNetwork });
  const confirmations = Number(result.confirmations || 0); const amountReceived = Number(result.amountReceived || 0);
  return { verified: result.destinationAddress === order.destinationAddress && amountReceived >= order.expectedAmount && confirmations >= minimumConfirmations[symbol], confirmations, amountReceived, failed: result.failed === true };
}

export { minimumConfirmations };
