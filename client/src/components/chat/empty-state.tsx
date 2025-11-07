import { MessageSquare, FileText, Sparkles, Calculator, Clock, Brain, Upload, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onSamplePromptClick?: (prompt: string) => void;
  uploadedDocuments?: Array<{
    id: string;
    filename: string;
    size: number;
    uploadedAt: string;
  }>;
}

const samplePrompts = [
  {
    category: "factual",
    icon: FileText,
    badge: "Factual",
    prompt: "What are the key findings in the uploaded documents?",
    description: "Get direct answers with citations"
  },
  {
    category: "simulation",
    icon: Calculator,
    badge: "Simulation",
    prompt: "What if revenue increased by 25%?",
    description: "Run quantitative projections"
  },
  {
    category: "temporal",
    icon: Clock,
    badge: "Temporal",
    prompt: "Has pricing changed since 2023?",
    description: "Detect knowledge evolution"
  },
  {
    category: "reasoning",
    icon: Brain,
    badge: "Analysis",
    prompt: "Compare approaches across different documents",
    description: "Deep analytical synthesis"
  },
];

const features = [
  {
    icon: Upload,
    title: "Upload Documents",
    description: "PDF, TXT files with automatic text extraction",
    shortDescription: "Upload & Extract"
  },
  {
    icon: Brain,
    title: "Multi-Agent Processing",
    description: "Router, Retriever, Reasoning, Simulation & Temporal agents",
    shortDescription: "AI Orchestration"
  },
  {
    icon: Zap,
    title: "Specialized Modes",
    description: "Factual Q&A, What-if scenarios, Timeline analysis",
    shortDescription: "Smart Analysis"
  }
];

export function EmptyState({ onSamplePromptClick, uploadedDocuments = [] }: EmptyStateProps) {
  const isMobile = useIsMobile();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "flex flex-col items-center justify-center min-h-full px-4",
        isMobile ? "py-6" : "py-8"
      )}
    >
      {/* Hero Section */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20",
          isMobile ? "h-24 w-24 mb-4" : "h-32 w-32 mb-6"
        )}
      >
        <MessageSquare className={cn(isMobile ? "h-12 w-12" : "h-16 w-16", "text-primary")} />
      </motion.div>

      <motion.h2 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className={cn(
          "font-bold text-foreground mb-2 text-center",
          isMobile ? "text-2xl" : "text-3xl"
        )}
        data-testid="text-empty-heading"
      >
        Multi-Agent RAG Orchestrator
      </motion.h2>
      
      <motion.p 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className={cn(
          "text-muted-foreground text-center max-w-md",
          isMobile ? "text-sm mb-6" : "text-lg mb-8"
        )}
      >
        Upload documents and experience AI-powered intelligence with specialized reasoning modes
      </motion.p>

      {/* Uploaded Documents Status with Subtle Animation */}
      {uploadedDocuments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className={cn(isMobile ? "mb-4" : "mb-6")}
        >
          <div className="relative overflow-hidden rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
            {/* Subtle animated border */}
            <div className="absolute inset-0 rounded-lg opacity-30">
              <div className="absolute inset-0 rounded-lg border-2 border-green-400 dark:border-green-500 animate-pulse"></div>
            </div>
            
            <div className="relative flex items-center gap-2 p-4 text-green-700 dark:text-green-300">
              <FileText className="h-5 w-5" />
              <span className="font-medium">
                {uploadedDocuments.length} document{uploadedDocuments.length !== 1 ? 's' : ''} ready for querying
              </span>
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
          "w-full",
          isMobile ? "mb-4 max-w-sm" : "mb-6 max-w-2xl"
        )}
      >
        {isMobile ? (
          // Mobile: Single row with 3 equal cards, no scroll
          <div className="grid grid-cols-3 gap-2">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
              >
                <Card className="p-2 text-center border border-border/50 h-16">
                  <feature.icon className="h-4 w-4 text-primary mx-auto mb-1" />
                  <h3 className="font-medium text-[10px] leading-tight">{feature.shortDescription}</h3>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          // Desktop: Horizontal row layout
          <div className="grid grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
              >
                <Card className="p-4 text-center border border-border/50">
                  <feature.icon className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold text-sm mb-2">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
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
          "text-center",
          isMobile ? "mt-3" : "mt-4"
        )}
      >
        <p className={cn(
          "text-muted-foreground",
          isMobile ? "text-xs" : "text-sm"
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
