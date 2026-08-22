export async function register() {
  // Long-polling only makes sense on a persistent local dev server. On Vercel the app relies
  // on the /api/telegram/webhook route instead (serverless functions don't stay running).
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startTelegramPollingOnce } = await import("./server/telegramPoller");
    startTelegramPollingOnce();
  }
}
