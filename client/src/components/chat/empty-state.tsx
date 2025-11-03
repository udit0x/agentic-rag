import { MessageSquare, FileText, Sparkles, Calculator, Clock, Brain, Upload, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

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
    description: "PDF, TXT files with automatic text extraction"
  },
  {
    icon: Brain,
    title: "Multi-Agent Processing",
    description: "Router, Retriever, Reasoning, Simulation & Temporal agents"
  },
  {
    icon: Zap,
    title: "Specialized Modes",
    description: "Factual Q&A, What-if scenarios, Timeline analysis"
  }
];

export function EmptyState({ onSamplePromptClick, uploadedDocuments = [] }: EmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full px-4 py-12"
    >
      {/* Hero Section */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="flex items-center justify-center h-32 w-32 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 mb-6"
      >
        <MessageSquare className="h-16 w-16 text-primary" />
      </motion.div>

      <motion.h2 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="text-3xl font-bold text-foreground mb-2" 
        data-testid="text-empty-heading"
      >
        Multi-Agent RAG Orchestrator
      </motion.h2>
      
      <motion.p 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="text-lg text-muted-foreground text-center max-w-md mb-8"
      >
        Upload documents and experience AI-powered intelligence with specialized reasoning modes
      </motion.p>

      {/* Uploaded Documents Status */}
      {uploadedDocuments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="mb-8"
        >
          <Card className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <FileText className="h-5 w-5" />
              <span className="font-medium">
                {uploadedDocuments.length} document{uploadedDocuments.length !== 1 ? 's' : ''} ready for querying
              </span>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Features Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mb-8"
      >
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
      </motion.div>

      {/* Sample Prompts */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="w-full max-w-4xl"
      >
        
        
      </motion.div>

      {/* Context-aware Tip */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.3 }}
        className="mt-8 text-center"
      >
        <p className="text-sm text-muted-foreground">
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
