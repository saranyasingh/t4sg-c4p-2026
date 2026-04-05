"use client";

import { LanguageSelector } from "../language-selector";
import { Chat } from "./chat";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 justify-end px-6 pt-6">
        <LanguageSelector />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Chat showHeader />
      </div>
    </div>
  );
}
