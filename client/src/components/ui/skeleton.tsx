import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

function Skeleton({
  className,
  animate = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { animate?: boolean }) {
  if (animate) {
    return (
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className={cn("rounded-md bg-muted", className)}
      />
    );
  }
  
  return (
    <div
      className={cn("rounded-md bg-muted", className)}
      {...props}
    />
  );
}

// Specialized skeleton components for different UI elements
function MessageSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 justify-start"
    >
      <div className="flex-shrink-0">
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      
      <div className="flex flex-col gap-1 flex-1">
        <Skeleton className="h-4 w-20" />
        
        <div className="bg-card border border-card-border rounded-2xl px-4 py-3 max-w-2xl">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DocumentUploadSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="border border-dashed border-muted-foreground/25 rounded-lg p-6"
    >
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="text-center space-y-2">
          <Skeleton className="h-4 w-32 mx-auto" />
          <Skeleton className="h-3 w-48 mx-auto" />
        </div>
        <Skeleton className="h-2 w-full max-w-xs" />
      </div>
    </motion.div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="border border-border rounded-lg p-4"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export { Skeleton, MessageSkeleton, DocumentUploadSkeleton, SearchResultsSkeleton };
