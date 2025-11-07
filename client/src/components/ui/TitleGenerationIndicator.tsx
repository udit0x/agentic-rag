import { motion } from "framer-motion";
import { Sparkles, Check } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TitleGenerationIndicatorProps {
  isGenerating: boolean;
  onComplete?: () => void;
  className?: string;
}

function AnimatedText({ text, isActive, className }: { text: string; isActive: boolean; className?: string }) {
  const [displayText, setDisplayText] = useState(text);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isActive && !isAnimating) {
      setIsAnimating(true);
      let iteration = 0;
      const maxIterations = 15;
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+";
      
      intervalRef.current = setInterval(() => {
        setDisplayText(prevText => 
          text.split('').map((char, index) => {
            if (char === ' ') return ' ';
            if (iteration > index) return text[index];
            return chars[Math.floor(Math.random() * chars.length)];
          }).join('')
        );
        
        iteration += 0.3;
        
        if (iteration >= text.length + 5) {
          clearInterval(intervalRef.current);
          setDisplayText(text);
          setIsAnimating(false);
        }
      }, 100);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, text, isAnimating]);

  return <span className={className}>{displayText}</span>;
}

export function TitleGenerationIndicator({ 
  isGenerating, 
  onComplete, 
  className 
}: TitleGenerationIndicatorProps) {
  const [showComplete, setShowComplete] = useState(false);
  const [triggerAnimation, setTriggerAnimation] = useState(false);

  useEffect(() => {
    if (!isGenerating && showComplete) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isGenerating, showComplete, onComplete]);

  useEffect(() => {
    if (!isGenerating) {
      setShowComplete(true);
    }
  }, [isGenerating]);

  // Trigger animation after a short delay to ensure component is visible
  useEffect(() => {
    const timer = setTimeout(() => {
      setTriggerAnimation(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isGenerating && !showComplete) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full",
        "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800",
        "text-blue-700 dark:text-blue-300 text-xs font-medium",
        className
      )}
    >
      {isGenerating ? (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="h-3 w-3" />
          </motion.div>
          <AnimatedText
            text="Generating smart title..."
            isActive={triggerAnimation}
            className="text-blue-700 dark:text-blue-300"
          />
        </>
      ) : showComplete ? (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 15, stiffness: 300 }}
          >
            <Check className="h-3 w-3 text-green-600" />
          </motion.div>
          <AnimatedText
            text="Title generated!"
            isActive={showComplete}
            className="text-green-600 dark:text-green-400"
          />
        </>
      ) : null}
    </motion.div>
  );
}