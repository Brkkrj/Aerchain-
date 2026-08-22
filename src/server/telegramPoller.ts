// Long-polling loop for local dev — keeps calling Telegram's getUpdates so vendor replies flow
// in without needing a public webhook URL. Guarded so it only ever starts once per process,
// even with Next.js dev's module hot-reloading.
import * as tg from "@/lib/telegram";
import { handleTelegramUpdate } from "./store";

const g = globalThis as unknown as { __aeraTgPollerStarted?: boolean };

export function startTelegramPollingOnce() {
  if (g.__aeraTgPollerStarted) return;
  if (!tg.isConfigured()) return;
  // Webhook and long-polling are mutually exclusive on Telegram's side.
  tg.deleteWebhook().catch(() => {});
  g.__aeraTgPollerStarted = true;

  let offset = 0;
  async function loop() {
    while (true) {
      try {
        const updates = await tg.getUpdates(offset, 25);
        for (const u of updates) {
          offset = u.update_id + 1;
          await handleTelegramUpdate(u).catch((err) => console.error("telegram update error", err));
        }
      } catch (err) {
        console.error("telegram poll error", err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  loop();
  console.log("[telegram] long-polling started");
}
