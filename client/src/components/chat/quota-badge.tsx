/**
 * QuotaBadge - Display user's remaining message quota in header
 */
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Infinity, Coins, Sparkles, Code2, MessageSquare } from 'lucide-react';
import { useQuotaStore } from '@/stores/quota-store';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function QuotaBadge() {
  const { quotaRemaining, isUnlimited, hasPersonalKey, getQuotaStatus } = useQuotaStore();
  
  const status = getQuotaStatus();

  // Animation for low quota warning - but NOT for personal keys or unlimited
  const shouldPulse = !hasPersonalKey && !isUnlimited && (status === 'low' || status === 'exhausted');
  
  // Get badge variant based on status
  const getBadgeVariant = () => {
    if (hasPersonalKey || isUnlimited) return 'secondary'; // No destructive variant for personal keys
    if (status === 'exhausted') return 'destructive';
    if (status === 'low') return 'secondary';
    return 'secondary';
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Badge
              variant={getBadgeVariant()}
              className={cn(
                'h-9 px-3 font-medium transition-all duration-300 flex items-center cursor-pointer hover:scale-105',
                status === 'low' && 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20',
                shouldPulse && 'animate-pulse'
              )}
            >
              <div className="flex items-center gap-2">
                {isUnlimited ? (
                  <>
                    <Infinity className="h-4 w-4" />
                    <span className="text-sm font-semibold">Unlimited</span>
                  </>
                ) : hasPersonalKey ? (
                  <>
                    <Code2 className="h-4 w-4" />
                    <span className="text-sm font-semibold">Your Key</span>
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4" />
                    <span className="text-sm">
                      <span className="font-semibold">{quotaRemaining}</span>
                      <span className="opacity-70"> credits</span>
                    </span>
                  </>
                )}
              </div>
            </Badge>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="max-w-[320px] p-4 bg-gradient-to-br from-background to-muted/50 border-2"
        >
          <div className="space-y-3">
            {/* Header with icon */}
            <div className="flex items-center gap-2 pb-2 border-b border-border/50">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="font-bold text-sm">Why Credits?</p>
            </div>
            
            {/* Main content */}
            <div className="space-y-2.5">
              <div className="flex gap-2 items-start">
                <Coins className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This is a <span className="font-semibold text-foreground">personal project</span> with limited resources to keep it running.
                </p>
              </div>
              
              <div className="flex gap-2 items-start">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  It's <span className="font-semibold text-foreground">open source</span>! Feel free to fork, contribute, or self-host with your own infrastructure.
                </p>
              </div>
              
              <div className="flex gap-2 items-start">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Get <span className="font-semibold text-foreground">unlimited messages</span> by adding your API keys in Settings.
                </p>
              </div>
            </div>
            
            {/* Footer */}
            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-center text-muted-foreground">
                Questions?{" "}
                <a 
                  href="https://www.linkedin.com/in/uditkashyap/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-semibold inline-flex items-center gap-1"
                >
                  Contact me on LinkedIn
                </a>
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
