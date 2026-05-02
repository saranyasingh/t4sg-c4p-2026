import type { TFunction } from "i18next";

/** Client-detectable failures (e.g. fetch) where the server never returned a structured hint. */
export function clientSideRecoveryHint(message: string, t: TFunction): string | undefined {
  const m = message.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
    return t("chat.errorRecoveryNetwork");
  }
  return undefined;
}
