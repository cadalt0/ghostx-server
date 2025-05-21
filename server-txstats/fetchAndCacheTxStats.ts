import fetch from 'node-fetch';
import express from 'express';

const PDA_ADDRESS = "2pf7Zx4PitoVB5rJZvGvm2jxKVH8A68uA5StujXdkiP3";
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
const HELIUS_RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

interface TxStats {
  totalTx: number;
  last24hTx: number;
  lastUpdated: number;
}

let cachedStats: TxStats = {
  totalTx: 0,
  last24hTx: 0,
  lastUpdated: 0,
};

async function fetchTxStats() {
  let allSignatures: { signature: string, blockTime: number }[] = [];
  let before: string | undefined = undefined;
  let keepFetching = true;
  while (keepFetching) {
    const sigRes = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: before ? [PDA_ADDRESS, { limit: 100, before }] : [PDA_ADDRESS, { limit: 100 }],
      }),
    });
    const sigData = await sigRes.json();
    const batch = sigData.result || [];
    allSignatures = allSignatures.concat(batch.map((s: any) => ({ signature: s.signature, blockTime: s.blockTime })));
    if (batch.length === 100) {
      before = batch[batch.length - 1].signature;
    } else {
      keepFetching = false;
    }
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const startOf24h = nowSec - 86400;
  const last24hTx = allSignatures.filter(s => s.blockTime && s.blockTime >= startOf24h).length;
  cachedStats = {
    totalTx: allSignatures.length,
    last24hTx,
    lastUpdated: Date.now(),
  };
}

// Initial fetch
fetchTxStats();
// Update every hour
setInterval(fetchTxStats, 60 * 60 * 1000);

export function getCachedTxStats() {
  return cachedStats;
}

// Express API
const app = express();
app.get('/api/tx-stats', (_req, res) => {
  res.json(getCachedTxStats());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tx stats API server running on port ${PORT}`);
}); 