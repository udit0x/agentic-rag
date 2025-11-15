import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import Lottie from "lottie-react";
import helpAnimation from "@/assets/animations/help.json";
import { useState } from "react";

interface HelpButtonProps {
  onClick: () => void;
  className?: string;
  isDialogOpen?: boolean;
}

export function HelpButton({ onClick, className, isDialogOpen = false }: HelpButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  // Pulse animation for first-time attention
  const pulseAnimation = {
    scale: [1, 1.1, 1],
    opacity: [0.7, 1, 0.7],
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 260, 
            damping: 20,
            duration: 0.4 
          }}
          className={cn("relative", className)}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
        >
          {/* Pulsing ring effect for attention */}
          {!hasAnimated && (
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/30 -z-10"
              animate={pulseAnimation}
              transition={{
                duration: 2,
                repeat: 3,
                repeatType: "loop",
              }}
              onAnimationComplete={() => setHasAnimated(true)}
            />
          )}

          {/* Glow effect on hover */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1.2 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/40 via-purple-500/40 to-primary/40 blur-lg -z-10"
              />
            )}
          </AnimatePresence>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClick}
            className="relative h-10 w-10 hover:bg-transparent"
          >
            {/* Lottie animation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Lottie
                animationData={helpAnimation}
                loop={isHovered || isDialogOpen}
                autoplay={isHovered || isDialogOpen}
                style={{ 
                  width: '24px', 
                  height: '24px',
                  filter: 'invert(0) brightness(0) dark:invert(1) dark:brightness(1)',
                }}
                className="dark:invert"
                rendererSettings={{
                  preserveAspectRatio: 'xMidYMid meet',
                }}
              />
            </div>

            {/* Fallback icon (hidden, just for accessibility) */}
            <HelpCircle className="h-5 w-5 opacity-0" />
          </Button>

          {/* Notification dot (optional - can be used to indicate new features) */}
          {/* <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-gradient-to-r from-red-500 to-pink-500 border-2 border-background"
          /> */}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="left" className="bg-card/95 backdrop-blur-sm border-primary/30">
        <p className="text-sm font-medium">How it works</p>
      </TooltipContent>
    </Tooltip>
  );
}
