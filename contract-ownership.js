(function (root) {
  'use strict';

  const ERC721_INTERFACE = '80ac58cd';
  const ERC1155_INTERFACE = 'd9b67a26';
  const BALANCE_OF_ADDRESS = '0x70a08231';
  const BALANCE_OF_1155 = '0x00fdd58e';
  const TOKEN_OF_OWNER_BY_INDEX = '0x2f745c59';
  const SUPPORTS_INTERFACE = '0x01ffc9a7';
  const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

  const word = (value) => String(value).replace(/^0x/, '').padStart(64, '0');
  const interfaceWord = (value) => String(value).replace(/^0x/, '').padEnd(64, '0');
  const asBigInt = (value) => { try { return BigInt(value || '0x0'); } catch { return 0n; } };
  const call = (wallet, contract, data) => wallet.request({ method: 'eth_call', params: [{ to: contract, data }, 'latest'] });

  async function reliableCall(wallet, contract, data) {
    let lastError;
    // Injected RPCs occasionally fail the first request immediately after a
    // chain/account change. Never turn that transport failure into "not owned".
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await call(wallet, contract, data);
        if (typeof result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(result)) throw new Error('The wallet returned an invalid contract response.');
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function supports(wallet, contract, interfaceId) {
    try { return asBigInt(await call(wallet, contract, SUPPORTS_INTERFACE + interfaceWord(interfaceId))) === 1n; }
    catch { return false; }
  }

  async function erc721Balance(wallet, contract, owner) {
    return asBigInt(await reliableCall(wallet, contract, BALANCE_OF_ADDRESS + word(owner)));
  }

  async function erc1155Balance(wallet, contract, owner, tokenId) {
    return asBigInt(await call(wallet, contract, BALANCE_OF_1155 + word(owner) + word(BigInt(tokenId).toString(16))));
  }

  async function enumerableTokenIds(wallet, contract, owner, balance) {
    const tokenIds = [];
    for (let index = 0n; index < balance; index += 1n) {
      try { tokenIds.push(asBigInt(await call(wallet, contract, TOKEN_OF_OWNER_BY_INDEX + word(owner) + word(index.toString(16)))).toString()); }
      catch { break; }
    }
    return tokenIds;
  }

  async function verify({ wallet, address, contracts, requiredContract = '', tokenIdsByContract = {} }) {
    if (!wallet?.request) throw new Error('An EIP-1193 Ethereum wallet is required.');
    if (!ADDRESS_PATTERN.test(address)) throw new Error('A valid Ethereum wallet address is required.');
    const approved = [...new Set((contracts || []).map((item) => String(item).toLowerCase()))];
    const requested = String(requiredContract || '').toLowerCase();
    const targets = requested ? approved.filter((contract) => contract === requested) : approved;
    if (!targets.length) throw new Error('The requested access contract is not approved for this member vault.');

    for (const contract of targets) {
      if (!ADDRESS_PATTERN.test(contract)) continue;
      let balanceCallSucceeded = false;
      let balanceCallError;
      try {
        // Query the approved collection's balance directly before optional
        // discovery calls. Some injected MetaMask RPC endpoints restrict
        // eth_getCode or ERC-165 probes even though eth_call works normally;
        // treating that restriction as a zero balance hid valid NFTs.
        try {
          const balance = await erc721Balance(wallet, contract, address);
          balanceCallSucceeded = true;
          if (balance > 0n) {
            const is721 = await supports(wallet, contract, ERC721_INTERFACE);
            return { balance, contract, tokenIds: await enumerableTokenIds(wallet, contract, address, balance), standard: is721 ? 'ERC-721' : 'NFT balanceOf' };
          }
        } catch (error) { balanceCallError = error; /* The approved collection may be ERC-1155 instead. */ }

        const code = await wallet.request({ method: 'eth_getCode', params: [contract, 'latest'] });
        if (!code || code === '0x') continue;
        const is1155 = await supports(wallet, contract, ERC1155_INTERFACE);

        const configuredIds = tokenIdsByContract[contract] || tokenIdsByContract[contract.toLowerCase()] || [];
        if (is1155 && configuredIds.length) {
          const balances = await Promise.all(configuredIds.map((tokenId) => erc1155Balance(wallet, contract, address, tokenId)));
          const ownedIds = configuredIds.filter((_, index) => balances[index] > 0n).map(String);
          const balance = balances.reduce((total, value) => total + value, 0n);
          if (balance > 0n) return { balance, contract, tokenIds: ownedIds, standard: 'ERC-1155' };
        }
      } catch (error) { balanceCallError ||= error; /* One broken RPC/contract must not block the other approved contracts. */ }

      // A confirmed zero is a real non-owner result. An RPC failure is not:
      // surface it so the access gate asks the owner to retry rather than
      // incorrectly offering a mint for an NFT that is already in the wallet.
      if (!balanceCallSucceeded && balanceCallError) throw new Error(`The wallet could not read the approved NFT contract. ${balanceCallError.message || 'Try again.'}`);
    }
    throw new Error('This wallet does not own a token from the required approved contract.');
  }

  root.MuzikazContractOwnership = { verify, selectors: { BALANCE_OF_ADDRESS, BALANCE_OF_1155, SUPPORTS_INTERFACE } };
}(typeof window === 'undefined' ? globalThis : window));
