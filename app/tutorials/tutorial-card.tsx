"use client";

import { Button } from "@/components/ui/button";

interface TutorialCardProps {
  title: string;
  ctaLabel: string;
  onClick: () => void;
}

export function TutorialCard({ title, ctaLabel, onClick }: TutorialCardProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="interactable flex h-auto min-h-36 flex-col items-start justify-between rounded-2xl border border-white/15 bg-white/5 p-5 text-left text-white transition-colors hover:border-white/30 hover:bg-white/10"
      onClick={onClick}
    >
      <div className="space-y-2">
        <div className="text-xl font-semibold leading-tight">{title}</div>
      </div>
      <div className="mt-6 text-sm text-white/75">{ctaLabel}</div>
    </Button>
  );
}
