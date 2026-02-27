// In-memory daily API spend tracker. Resets each calendar day.
// Cap is configurable via STARTBOX_DAILY_SPEND_CAP_USD (default $3).

let todayKey = "";
let todaySpend = 0;

function getDateKey(): string {
  return new Date().toISOString().slice(0, 10); // "2026-02-26"
}

function ensureToday() {
  const key = getDateKey();
  if (key !== todayKey) {
    todayKey = key;
    todaySpend = 0;
  }
}

export function getDailySpend(): number {
  ensureToday();
  return todaySpend;
}

export function getDailyCap(): number {
  return Number(process.env.STARTBOX_DAILY_SPEND_CAP_USD ?? 3);
}

export function canSpend(): boolean {
  ensureToday();
  return todaySpend < getDailyCap();
}

export function recordSpend(usd: number) {
  ensureToday();
  todaySpend += usd;
  console.log(`[cost] +$${usd.toFixed(4)} — daily total: $${todaySpend.toFixed(4)} / $${getDailyCap()} cap`);
}
