import React from "react";
import { motion } from "motion/react";

interface ChatMessage {
  id: string;
  sender: "user" | "zoro";
  text: string;
}

interface MessageItemProps {
  msg: ChatMessage;
}

const MessageItem = React.memo(({ msg }: MessageItemProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`max-w-[85%] rounded-2xl p-3 text-sm border border-white/10 will-change-transform shadow-xl ${
        msg.sender === "user"
          ? "self-end bg-violet-600/30 border-violet-500/30 text-violet-100"
          : "self-start bg-zinc-900/80 text-white/90"
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest opacity-40 mb-1">
        {msg.sender === "user" ? "Manohar" : "Zoro"}
      </div>
      {msg.text}
    </motion.div>
  );
});

MessageItem.displayName = "MessageItem";

export default MessageItem;
