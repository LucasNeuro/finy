"use client";

import React from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";

// emoji-mart v5+ exporta o Picker como default
const Picker = dynamic(
  () => import("@emoji-mart/react").then((mod) => mod.default as React.ComponentType<any>),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-6 text-[#64748B] text-sm">
        Carregando…
      </div>
    ),
  }
);

/**
 * Picker de emojis para reações em mensagens (emoji-mart).
 */
export function EmojiReactionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}) {
  return (
    <div className="emoji-reaction-picker-wrapper min-h-[320px] w-[352px] max-w-[80vw]">
      <Picker
        data={data}
        theme="light"
        locale="pt"
        onEmojiSelect={(emoji: { native?: string }) => {
          const native = emoji?.native ?? "";
          if (native) onSelect(native);
          onClose?.();
        }}
        onClickOutside={onClose}
        previewPosition="none"
        maxFrequentRows={0}
      />
    </div>
  );
}
