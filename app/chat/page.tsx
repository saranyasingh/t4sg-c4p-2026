"use client";

import { Chat } from "./chat";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat showHeader />
      </div>
    </div>
  );
}
