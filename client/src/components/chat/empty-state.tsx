import { MessageSquare, FileText, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  onSamplePromptClick?: (prompt: string) => void;
}

const samplePrompts = [
  "What are the key findings in the uploaded documents?",
  "Summarize the main topics across all documents",
  "Compare the approaches discussed in different documents",
  "Extract important dates and events mentioned",
];

export function EmptyState({ onSamplePromptClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      <div className="flex items-center justify-center h-32 w-32 rounded-full bg-primary/10 mb-6">
        <MessageSquare className="h-16 w-16 text-primary" />
      </div>

      <h2 className="text-2xl font-semibold text-foreground mb-2" data-testid="text-empty-heading">
        Start a conversation
      </h2>
      <p className="text-base text-muted-foreground text-center max-w-md mb-8">
        Upload documents and ask questions to get AI-powered insights with cited sources
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
        {samplePrompts.map((prompt, index) => (
          <Card
            key={index}
            className="p-4 hover-elevate active-elevate-2 cursor-pointer transition-all"
            onClick={() => onSamplePromptClick?.(prompt)}
            data-testid={`button-sample-prompt-${index}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {index === 0 && <FileText className="h-4 w-4 text-primary" />}
                {index === 1 && <Sparkles className="h-4 w-4 text-primary" />}
                {index === 2 && <MessageSquare className="h-4 w-4 text-primary" />}
                {index === 3 && <FileText className="h-4 w-4 text-primary" />}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{prompt}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
