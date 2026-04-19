"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const BOTTOM_THRESHOLD_PX = 100;

interface ScrollContainerProps {
  children: React.ReactNode;
}

export const ScrollContainer = ({ children }: ScrollContainerProps) => {
  const { t } = useTranslation();
  const outerDiv = useRef<HTMLDivElement>(null);
  const innerDiv = useRef<HTMLDivElement>(null);

  /** When true, content growth (streaming, new messages) keeps the viewport pinned to the bottom. */
  const stickToBottomRef = useRef(true);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const isNearBottom = useCallback(() => {
    if (!outerDiv.current) return true;
    const outer = outerDiv.current;
    const distanceFromBottom = outer.scrollHeight - outer.clientHeight - outer.scrollTop;
    return distanceFromBottom <= BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollOuterToBottom = useCallback(() => {
    if (!outerDiv.current) return;
    const outer = outerDiv.current;
    outer.scrollTop = outer.scrollHeight - outer.clientHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const near = isNearBottom();
    stickToBottomRef.current = near;
    setShowScrollButton(!near);
  }, [isNearBottom]);

  /** After layout (new messages, hydration), stay pinned when the user was already at the bottom. */
  useLayoutEffect(() => {
    if (!outerDiv.current) return;
    if (stickToBottomRef.current) {
      scrollOuterToBottom();
    }
  }, [children, scrollOuterToBottom]);

  /** Streaming and async layout: follow the bottom while stuck; if the user scrolled up, show the jump button. */
  useEffect(() => {
    const inner = innerDiv.current;
    if (!inner || !outerDiv.current) return;

    const ro = new ResizeObserver(() => {
      if (!outerDiv.current) return;
      if (stickToBottomRef.current) {
        outerDiv.current.scrollTop = outerDiv.current.scrollHeight - outerDiv.current.clientHeight;
        setShowScrollButton(false);
      } else if (!isNearBottom()) {
        setShowScrollButton(true);
      }
    });

    ro.observe(inner);
    return () => ro.disconnect();
  }, [isNearBottom]);

  const handleScrollButtonClick = useCallback(() => {
    stickToBottomRef.current = true;
    scrollOuterToBottom();
    setShowScrollButton(false);
  }, [scrollOuterToBottom]);

  return (
    <div className="interactable relative h-full">
      <div ref={outerDiv} className="interactable relative h-full overflow-y-auto" onScroll={handleScroll}>
        <div ref={innerDiv} className="interactable flex min-h-full w-full flex-col justify-end">
          <div className="interactable w-full space-y-4 rounded-lg border border-white/20 bg-[hsl(var(--foreground)/0.55)] p-4">
            {children}
          </div>
        </div>
      </div>
      <Button
        type="button"
        className="interactable absolute bottom-4 left-1/2 z-10 -translate-x-1/2 shadow-md transition-opacity"
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
