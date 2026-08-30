import { createPublicClient, erc20Abi, formatEther, formatUnits, getAddress, http } from 'viem';
import { CHAIN, GREEN_TOKEN_ADDRESS, GREEN_TREASURY_ADDRESS, isConfiguredAddress } from './config';

const client = createPublicClient({
  transport: http(CHAIN.rpcUrl),
});

/**
 * Live total supply from the deployed GREEN token, in whole units.
 *
 * Returns null when the token is not configured yet or the RPC call fails, so
 * callers fall back to the TOTAL_SUPPLY constant rather than reporting zero.
 */
export async function onchainTotalSupply(): Promise<number | null> {
  if (!isConfiguredAddress(GREEN_TOKEN_ADDRESS)) return null;
  try {
    const token = getAddress(GREEN_TOKEN_ADDRESS);
    const [supply, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'totalSupply' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    return Number(formatUnits(supply, decimals));
  } catch (e) {
    console.error('[onchain] totalSupply unavailable', e);
    return null;
  }
}

/**
 * Live balances of the wallets that back the protocol.
 *
 * The emission reserve and every spend sit in one treasury wallet — there are
 * no game or vault contracts — so this is a single holder, reported in both GREEN
 * and ETH. The ETH figure matters as much as the GREEN one: payouts are signed
 * from this wallet, so if it runs dry on gas, claims stop working.
 */
export async function onchainReserves() {
  if (!isConfiguredAddress(GREEN_TOKEN_ADDRESS)) return [];

  const token = getAddress(GREEN_TOKEN_ADDRESS);
  const holders = [['Treasury', GREEN_TREASURY_ADDRESS]] as const;
  const configured = holders.filter((entry) => isConfiguredAddress(entry[1]));
  const [decimals, symbol, tokenBalances, ethBalances] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    // balanceOf is a call on the TOKEN, asking about the holder — not a call on
    // the holder address, which is an ordinary wallet with no code to run.
    Promise.all(
      configured.map(([, address]) =>
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [getAddress(address)],
        })
      )
    ),
    Promise.all(configured.map(([, address]) => client.getBalance({ address: getAddress(address) }))),
  ]);

  return configured.flatMap(([walletLabel, walletAddress], index) => [
    {
      walletLabel,
      walletAddress: getAddress(walletAddress),
      assetSymbol: symbol,
      balanceUi: Number(formatUnits(tokenBalances[index], decimals)),
    },
    {
      walletLabel,
      walletAddress: getAddress(walletAddress),
      assetSymbol: 'ETH',
      balanceUi: Number(formatEther(ethBalances[index])),
    },
  ]);
}
