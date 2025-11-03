import { Bot } from "lucide-react";
import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex gap-3" 
      data-testid="typing-indicator"
    >
      <div className="flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Assistant</span>
          <motion.span 
            className="text-xs text-muted-foreground"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            thinking...
          </motion.span>
        </div>

        <div className="rounded-2xl bg-card border border-card-border px-4 py-3">
          <div className="flex items-center gap-1">
            <motion.div 
              className="h-2 w-2 rounded-full bg-muted-foreground"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 1,
                repeat: Infinity,
                delay: 0
              }}
            />
            <motion.div 
              className="h-2 w-2 rounded-full bg-muted-foreground"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 1,
                repeat: Infinity,
                delay: 0.2
              }}
            />
            <motion.div 
              className="h-2 w-2 rounded-full bg-muted-foreground"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 1,
                repeat: Infinity,
                delay: 0.4
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
