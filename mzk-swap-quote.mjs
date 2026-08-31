export const MZK_PER_USD = 100;
export const SWAP_BACK_RATE = 0.5;
export const LOCKED_LIQUIDITY_RATE = 0.5;
export const MINIMUM_SWAP_BACK_MZK = 1_000;

export function swapBackUsd(mzk) {
  const amount = Number(mzk);
  if (!Number.isFinite(amount) || amount < MINIMUM_SWAP_BACK_MZK) {
    throw new Error(`Minimum swap back is ${MINIMUM_SWAP_BACK_MZK.toLocaleString()} MZK.`);
  }
  return Math.round((amount / MZK_PER_USD) * SWAP_BACK_RATE * 100) / 100;
}

export function swapBackQuote(mzk) {
  const payoutUsd = swapBackUsd(mzk);
  const storeUsd = Math.round((Number(mzk) / MZK_PER_USD) * 100) / 100;
  return { mzk: Number(mzk), storeUsd, payoutUsd, lockedLiquidityUsd: Math.round((storeUsd - payoutUsd) * 100) / 100, payoutRate: SWAP_BACK_RATE, lockedLiquidityRate: LOCKED_LIQUIDITY_RATE };
}
