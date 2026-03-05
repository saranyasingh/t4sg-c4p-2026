"use client";

import { ThemeProvider } from "next-themes";
import "./i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
