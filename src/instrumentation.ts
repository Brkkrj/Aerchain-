export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramPollingOnce } = await import("./server/telegramPoller");
    startTelegramPollingOnce();
  }
}
