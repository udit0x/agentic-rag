import { FileText, Upload, Brain, Zap, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import Lottie from "lottie-react";
import { useState, useEffect } from "react";
import { HelpButton } from "@/components/help/help-button";
import { AppHelpDialog } from "@/components/help/app-help-dialog";
import { useAppHelp } from "@/hooks/use-app-help";
import { useUploadContext } from "@/contexts/upload-context";

// Import animations
import uploadAnimation from "@/assets/animations/upload-animation.json";
import brainAnimation from "@/assets/animations/Loading-files-animation.json";
import zapAnimation from "@/assets/animations/Star-loader.json";

interface EmptyStateProps {
  uploadedDocuments?: Array<{
    id: string;
    filename: string;
    size: number;
    uploadedAt: string;
  }>;
}

const features = [
  {
    animation: uploadAnimation,
    icon: Upload,
    title: "Upload Documents",
    description: "PDF, TXT files with automatic text extraction",
    shortDescription: "Upload & Extract",
    size: { mobile: 32, desktop: 80 }
  },
  {
    animation: brainAnimation,
    icon: Brain,
    title: "Multi-Agent Processing",
    description: "Router, Retriever, Reasoning, Simulation & Temporal agents",
    shortDescription: "AI Orchestration",
    size: { mobile: 100, desktop: 150 }
  },
  {
    animation: zapAnimation,
    icon: Zap,
    title: "Specialized Modes",
    description: "Factual Q&A, What-if scenarios, Timeline analysis",
    shortDescription: "Smart Analysis",
    size: { mobile: 62, desktop: 80 }
  }
];

export function EmptyState({ uploadedDocuments = [] }: EmptyStateProps) {
  const isMobile = useIsMobile();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { isFirstVisit, shouldShowHelp, openHelp, closeHelp, markAsVisited } = useAppHelp();
  const { setUploadScreenOpen } = useUploadContext();
  
  // Dynamic viewport width for responsive scaling
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1920
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Scale down desktop animations on smaller screens
  const sizeScale = viewportWidth < 1280 ? 0.8 : 1.0;

  // Handle help dialog close
  const handleHelpClose = () => {
    if (isFirstVisit) {
      markAsVisited(); // Mark as visited on first close
    } else {
      closeHelp();
    }
  };

  // Handle "Get Started" click - close help and open upload
  const handleGetStarted = () => {
    setUploadScreenOpen(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "flex flex-col items-center justify-center px-4 overflow-y-auto relative",
        isMobile ? "py-6 min-h-full" : "py-1 gap-2 lg:gap-4"
      )}
      style={{
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch"
      }}
    >
      {/* Help Button - Top Right Corner */}
      <div className={cn(
        "absolute z-10",
        isMobile ? "top-4 right-4" : "top-6 right-6"
      )}>
        <HelpButton 
          onClick={openHelp} 
          isDialogOpen={shouldShowHelp}
        />
      </div>

      {/* Help Dialog */}
      <AppHelpDialog 
        isOpen={shouldShowHelp} 
        onClose={handleHelpClose}
        onGetStarted={handleGetStarted}
        isFirstTime={isFirstVisit}
      />

      {/* Hero Section - Animated Rectangle Background */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className={cn(
          "relative flex items-center justify-center flex-shrink-0 overflow-hidden rounded-2xl border border-border/50 bg-card/30 backdrop-blur-xl",
          isMobile ? "h-14 w-40 mb-2" : "h-12 w-36 lg:h-14 lg:w-40 mb-2"
        )}
      >
        {/* Animated gradient bars in background */}
        <motion.div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--primary) 50%, transparent 100%)',
          }}
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #8b5cf6 50%, transparent 100%)',
          }}
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear",
            delay: 0.5,
          }}
        />
        
        {/* Text/Logo */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-gradient-to-r from-primary to-purple-500" />
          <span className={cn(
            "font-bold bg-gradient-to-r from-primary via-purple-500 to-cyan-500 bg-clip-text text-transparent whitespace-nowrap",
            isMobile ? "text-sm" : "text-xs lg:text-sm"
          )}>
            AI Knowledge Engine
          </span>
          <div className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500" />
        </div>
      </motion.div>

      <motion.h2 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className={cn(
          "font-bold text-foreground text-center flex-shrink-0",
          isMobile ? "text-2xl mb-2" : "text-2xl lg:text-3xl"
        )}
        data-testid="text-empty-heading"
      >
        Your Connected Knowledge Base
      </motion.h2>
      
      <motion.p 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className={cn(
          "text-muted-foreground text-center max-w-md flex-shrink-0",
          isMobile ? "text-sm mb-6" : "text-sm lg:text-base"
        )}
      >
        Turn your files into insights with intelligent agents
      </motion.p>

      {/* Uploaded Documents Status with Subtle Animation */}
      {uploadedDocuments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="flex-shrink-0"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-purple-500/5 to-primary/5 backdrop-blur-sm">
            {/* Animated gradient border */}
            <div className="absolute inset-0 rounded-2xl opacity-50">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/40 via-purple-500/40 to-primary/40 animate-pulse" 
                   style={{ 
                     padding: '1px',
                     WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                     WebkitMaskComposite: 'xor',
                     maskComposite: 'exclude'
                   }}
              />
            </div>
            
            <div className={cn(
              "relative flex items-center gap-3 backdrop-blur-xl",
              isMobile ? "px-4 py-3" : "px-5 py-3"
            )}>
              <div className="flex-shrink-0">
                <div className="rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 p-2">
                  <FileText className="h-4 w-4 lg:h-5 lg:w-5 text-primary" strokeWidth={2} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-xs lg:text-sm">
                  {uploadedDocuments.length} Document{uploadedDocuments.length !== 1 ? 's' : ''} Ready
                </p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">
                  Ready for intelligent querying
                </p>
              </div>
              <div className="flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-gradient-to-r from-primary to-purple-500 animate-pulse" />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Features - Mobile Optimized */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className={cn(
          "w-full flex-shrink-0",
          isMobile ? "mb-4 max-w-sm mt-4" : "max-w-xl lg:max-w-2xl"
        )}
      >
        {isMobile ? (
          // Mobile: Single row with 3 equal cards using Lucide icons
          <div className="grid grid-cols-3 gap-3 px-1">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                >
                  <Card className="p-2 text-center border border-border/50 h-18 relative overflow-hidden cursor-default rounded-xl hover:border-primary/30 transition-all">
                    {/* Subtle glow background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-primary/5" />
                    
                    <div className="relative z-10 flex flex-col items-center justify-center gap-1">
                      <div className="h-12 w-12 flex items-center justify-center">
                        <div className="rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 p-2">
                          <IconComponent className="h-6 w-6 text-primary" strokeWidth={2} />
                        </div>
                      </div>
                      <h3 className="font-medium text-[10px] leading-tight">{feature.shortDescription}</h3>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          // Desktop: Horizontal row layout with Lottie animations
          <div className="grid grid-cols-3 gap-3 lg:gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                onHoverStart={() => setHoveredIndex(index)}
                onHoverEnd={() => setHoveredIndex(null)}
              >
                <Card className="p-3 lg:p-4 text-center border border-border/50 relative overflow-hidden cursor-default transition-all hover:border-primary/30 hover:shadow-lg">
                  {/* Animated glow background on hover */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/20 to-primary/20 blur-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hoveredIndex === index ? 0.5 : 0 }}
                    transition={{ duration: 0.4 }}
                  />
                  
                  <div className="relative z-10">
                    <div className="h-16 w-16 lg:h-20 lg:w-20 mx-auto mb-2 lg:mb-3 flex items-center justify-center">
                      <div style={{ transform: 'scale(1.2)' }}>
                        <Lottie
                          animationData={feature.animation}
                          loop={hoveredIndex === index}
                          autoplay={hoveredIndex === index}
                          style={{ 
                            width: `${feature.size.desktop * sizeScale}px`, 
                            height: `${feature.size.desktop * sizeScale}px` 
                          }}
                          rendererSettings={{
                            preserveAspectRatio: 'xMidYMid meet',
                            progressiveLoad: true,
                          }}
                        />
                      </div>
                    </div>
                    <h3 className="font-semibold text-xs lg:text-sm mb-1 lg:mb-2">{feature.title}</h3>
                    <p className="text-[10px] lg:text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Context-aware Tip */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.3 }}
        className={cn(
          "text-center flex-shrink-0",
          isMobile ? "mt-3" : ""
        )}
      >
        <p className={cn(
          "text-muted-foreground",
          isMobile ? "text-xs" : "text-xs lg:text-sm"
        )}>
          {uploadedDocuments.length > 0 ? (
            <><strong>Ready to go!</strong> Your documents are loaded and ready for intelligent querying</>
          ) : (
            <>💡 <strong>Tip:</strong> Upload documents first to unlock the full potential of our multi-agent system</>
          )}
        </p>
      </motion.div>
    </motion.div>
  );
}
