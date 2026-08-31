export const MZK_SWAP_BACK_RATE = 0.6;
export const MZK_PER_USD = 100;
export const MINIMUM_SWAP_BACK_MZK = 100;

export function swapBackQuote(mzk) {
  const amountMzk = Math.floor(Number(mzk));
  if (!Number.isFinite(amountMzk) || amountMzk < MINIMUM_SWAP_BACK_MZK) throw new Error(`Swap back at least ${MINIMUM_SWAP_BACK_MZK.toLocaleString()} MZK.`);
  return { amountMzk, usd: (amountMzk / MZK_PER_USD) * MZK_SWAP_BACK_RATE };
}
