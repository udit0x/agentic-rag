import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw } from "lucide-react";

interface UnauthorizedPopupProps {
  isOpen: boolean;
  onReload: () => void;
}

export function UnauthorizedPopup({ isOpen, onReload }: UnauthorizedPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
          />

          {/* Popup */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="max-w-md w-full"
            >
              <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/95 backdrop-blur-xl p-8 shadow-2xl">
                {/* Subtle animated background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-primary/5" />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/10 to-cyan-500/10"
                  animate={{
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />

                {/* Content */}
                <div className="relative z-10">
                  {/* Icon */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="flex justify-center mb-6"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full" />
                      <div className="relative bg-gradient-to-br from-orange-500/10 to-red-500/10 p-4 rounded-full">
                        <ShieldAlert className="w-10 h-10 text-orange-500" strokeWidth={2} />
                      </div>
                    </div>
                  </motion.div>

                  {/* Message */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-center mb-6"
                  >
                    <h2 className="text-xl font-semibold text-foreground mb-2">
                      Session Expired
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Your authentication session has expired. Please reload the page to continue.
                    </p>
                  </motion.div>

                  {/* Button */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      onClick={onReload}
                      className="w-full h-11"
                      variant="default"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reload Page
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
