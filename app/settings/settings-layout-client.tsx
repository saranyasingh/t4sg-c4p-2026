"use client";

import { SidebarNav } from "@/components/global/sidebar-nav";
import { Separator } from "@/components/ui/separator";
import { PageHeader1, PageSubHeader1 } from "@/components/ui/typography";
import { useTranslation } from "react-i18next";

interface SettingsLayoutClientProps {
  children: React.ReactNode;
}

export default function SettingsLayoutClient({ children }: SettingsLayoutClientProps) {
  const { t } = useTranslation();

  const sidebarNavItems = [
    { title: t("settings.navGeneral"), href: "/settings/general" },
    { title: t("settings.navProfile"), href: "/settings/profile" },
  ];

  return (
    <>
      <div className="space-y-0.5">
        <PageHeader1>{t("settings.heading")}</PageHeader1>
        <PageSubHeader1>{t("settings.description")}</PageSubHeader1>
      </div>
      <Separator className="my-6" />
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-4 lg:w-1/5">
          <SidebarNav items={sidebarNavItems} />
        </aside>
        <div className="flex-1 lg:max-w-2xl">{children}</div>
      </div>
    </>
  );
}
