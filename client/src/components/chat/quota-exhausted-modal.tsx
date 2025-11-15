/**
 * QuotaExhaustedModal - Modal shown when user runs out of messages
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Key, Linkedin } from 'lucide-react';
import { useState } from 'react';
import Lottie from 'lottie-react';
import linkedinAnimation from '@/assets/animations/linkedin.json';

interface QuotaExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddApiKey: () => void;
  quotaLimit: number;
}

export function QuotaExhaustedModal({ 
  isOpen, 
  onClose, 
  onAddApiKey, 
  quotaLimit = 50 
}: QuotaExhaustedModalProps) {
  const [linkedinHovered, setLinkedinHovered] = useState(false);
  
  // LinkedIn profile link - replace with actual owner's LinkedIn
  const linkedinUrl = "https://www.linkedin.com/in/udit-kashyap-0xUdit/";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <DialogTitle className="text-xl">Message Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            You've used all <span className="font-semibold text-foreground">{quotaLimit} messages</span> in your quota. 
            To continue chatting, you can add your own API key or contact the owner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-4">
          {/* Add Personal API Key Option */}
          <Button
            onClick={() => {
              onAddApiKey();
              onClose();
            }}
            className="w-full justify-start h-auto py-4 px-4 group hover:scale-[1.02] transition-transform"
            variant="default"
          >
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
                <Key className="h-5 w-5" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold">Add Your Own API Key</div>
                <div className="text-xs opacity-90 font-normal">
                  Use your Azure OpenAI or OpenAI key for unlimited messages
                </div>
              </div>
            </div>
          </Button>

          {/* Contact Owner Option */}
          <Button
            onClick={() => {
              window.open(linkedinUrl, '_blank', 'noopener,noreferrer');
            }}
            onMouseEnter={() => setLinkedinHovered(true)}
            onMouseLeave={() => setLinkedinHovered(false)}
            className="w-full justify-start h-auto py-4 px-4 group hover:scale-[1.02] transition-transform"
            variant="outline"
          >
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {linkedinHovered ? (
                    <motion.div
                      key="animated"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="w-5 h-5"
                    >
                      <Lottie
                        animationData={linkedinAnimation}
                        loop={false}
                        autoplay={true}
                        style={{ width: 20, height: 20 }}
                        rendererSettings={{
                          preserveAspectRatio: 'xMidYMid meet',
                        }}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="static"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Linkedin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-foreground">Contact Owner</div>
                <div className="text-xs text-muted-foreground font-normal">
                  Request quota increase or discuss access options
                </div>
              </div>
            </div>
          </Button>

          {/* Dismiss */}
          <Button
            onClick={onClose}
            className="w-full"
            variant="ghost"
          >
            Close
          </Button>
        </div>

        {/* Info Footer */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Your data and conversations are safe. You can resume chatting after adding an API key.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
