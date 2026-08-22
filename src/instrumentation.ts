export async function register() {
  // Long-polling only makes sense on a persistent local dev server, and it actively DELETES the
  // production webhook on start (Telegram only allows one delivery mode per bot token) — since
  // local dev shares the same bot token as production, an ordinary `npm run dev` would silently
  // break the live app's Telegram delivery. Opt-in only, via TELEGRAM_LOCAL_POLLING=1, so this
  // never happens by accident. On Vercel the app always uses /api/telegram/webhook instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL && process.env.TELEGRAM_LOCAL_POLLING === "1") {
    const { startTelegramPollingOnce } = await import("./server/telegramPoller");
    startTelegramPollingOnce();
  }
}
