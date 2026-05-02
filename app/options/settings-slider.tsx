"use client";

import { TypographyP, TypographySmall } from "@/components/ui/typography";

interface SettingsSliderProps {
  heading: string;
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  marks?: string[];
}

export function SettingsSlider({ heading, ariaLabel, min, max, step, value, onChange, marks }: SettingsSliderProps) {
  return (
    <div className="space-y-3">
      <TypographyP className="font-semibold text-white">{heading}</TypographyP>
      <div className="space-y-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="text-size-slider w-full"
          aria-label={ariaLabel}
        />
        {marks?.length ? (
          <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${marks.length}, minmax(0, 1fr))` }}>
            {marks.map((mark) => (
              <TypographySmall key={mark} className="font-normal text-white/75">
                {mark}
              </TypographySmall>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
