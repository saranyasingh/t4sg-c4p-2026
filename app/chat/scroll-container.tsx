"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ScrollContainerProps {
  children: React.ReactNode;
  newMessageSignal?: number;
}

export const ScrollContainer = ({ children, newMessageSignal = 0 }: ScrollContainerProps) => {
  const { t } = useTranslation();
  const outerDiv = useRef<HTMLDivElement>(null);
  const innerDiv = useRef<HTMLDivElement>(null);

  const prevInnerDivHeight = useRef<number | null>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const isScrolledUpTooFar = useCallback(() => {
    if (!outerDiv.current) return false;
    const outer = outerDiv.current;
    const distanceFromBottom = outer.scrollHeight - outer.clientHeight - outer.scrollTop;
    return distanceFromBottom > 80;
  }, []);

  useEffect(() => {
    if (!outerDiv.current || !innerDiv.current) return;

    const outerDivHeight = outerDiv.current.clientHeight;
    const innerDivHeight = innerDiv.current.clientHeight;
    const outerDivScrollTop = outerDiv.current.scrollTop;

    if (!prevInnerDivHeight.current || outerDivScrollTop === prevInnerDivHeight.current - outerDivHeight) {
      outerDiv.current.scrollTo({
        top: innerDivHeight - outerDivHeight,
        left: 0,
        behavior: prevInnerDivHeight.current ? "smooth" : "auto",
      });
    }

    prevInnerDivHeight.current = innerDivHeight;
  }, [children]);

  useEffect(() => {
    if (!outerDiv.current) return;

    if (isScrolledUpTooFar()) {
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
      outerDiv.current.scrollTo({
        top: outerDiv.current.scrollHeight - outerDiv.current.clientHeight,
        left: 0,
        behavior: "smooth",
      });
    }
  }, [newMessageSignal, isScrolledUpTooFar]);

  const handleScrollButtonClick = useCallback(() => {
    if (!outerDiv.current || !innerDiv.current) return;

    const outerDivHeight = outerDiv.current.clientHeight;
    const innerDivHeight = innerDiv.current.clientHeight;

    outerDiv.current.scrollTo({
      top: innerDivHeight - outerDivHeight,
      left: 0,
      behavior: "smooth",
    });

    setShowScrollButton(false);
  }, []);

  const handleScroll = useCallback(() => {
    if (!showScrollButton) return;
    if (!isScrolledUpTooFar()) {
      setShowScrollButton(false);
    }
  }, [isScrolledUpTooFar, showScrollButton]);

  return (
    <div className="relative h-full">
      <div ref={outerDiv} className="relative h-full overflow-y-auto" onScroll={handleScroll}>
        <div ref={innerDiv} className="relative min-h-full">
          <div className="interactable h-full min-h-full space-y-4 rounded-lg border border-white/20 bg-[hsl(var(--foreground)/0.55)] p-4">{children}</div>
        </div>
      </div>
      <Button
        className="interactable absolute bottom-4 left-1/2 -translate-x-1/2 transition-opacity"
        style={{
          opacity: showScrollButton ? 1 : 0,
          pointerEvents: showScrollButton ? "auto" : "none",
        }}
        onClick={handleScrollButtonClick}
      >
        {t("chat.newMessage")}
      </Button>
    </div>
  );
};
