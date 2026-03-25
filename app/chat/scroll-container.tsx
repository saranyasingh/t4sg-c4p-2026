"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ScrollContainerProps {
  children: React.ReactNode;
}

export const ScrollContainer = ({ children }: ScrollContainerProps) => {
  const { t } = useTranslation();
  const outerDiv = useRef<HTMLDivElement>(null);
  const innerDiv = useRef<HTMLDivElement>(null);

  const prevInnerDivHeight = useRef<number | null>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

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
    } else {
      setShowScrollButton(true);
    }

    prevInnerDivHeight.current = innerDivHeight;
  }, [children]);

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

  return (
    <div className="relative h-full">
      <div ref={outerDiv} className="relative h-full overflow-y-auto">
        <div ref={innerDiv} className="relative">
          <div className="interactable space-y-4 rounded-lg border bg-background p-4">{children}</div>
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
