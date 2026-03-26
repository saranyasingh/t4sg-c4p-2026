"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function NavLinks({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { t } = useTranslation();

  return (
    <nav className={cn("flex items-center space-x-4 lg:space-x-6", className)} {...props}>
      <Link href="/" className="interactable text-sm font-medium transition-colors hover:text-primary">
        {t("nav.home")}
      </Link>
      <Link href="/chat" className="interactable text-sm font-medium transition-colors hover:text-primary">
        {t("nav.chat")}
      </Link>
      <Link href="/tutorials" className="interactable text-sm font-medium transition-colors hover:text-primary">
        {t("nav.tutorials")}
      </Link>
      <Link href="/dashboard" className="interactable text-sm font-medium transition-colors hover:text-primary">
        {t("nav.dashboard")}
      </Link>
    </nav>
  );
}
