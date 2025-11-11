import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, 
  BarChart3, 
  Trash2, 
  RefreshCw, 
  Eye,
  EyeOff,
  Clock,
  FileText,
  MessageSquare,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCacheStore, useCacheManagement } from '@/stores/cache-store';

interface CacheDebuggerProps {
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  className?: string;
}

export function CacheDebugger({ 
  position = 'bottom-right',
  className = ''
}: CacheDebuggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(import.meta.env.DEV);
  
  const { clearAllCache, clearExpiredCache, getCacheStats } = useCacheManagement();
  
  // Get cache data for display
  const documentLibrary = useCacheStore(state => state.documentLibrary);
  const documentContents = useCacheStore(state => state.documentContents);
  const recentQueries = useCacheStore(state => state.recentQueries);
  const chatHistory = useCacheStore(state => state.chatHistory);
  const selectedDocumentIds = useCacheStore(state => state.selectedDocumentIds);

  if (!isVisible) return null;

  const stats = getCacheStats();
  
  const positionClasses = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getExpiryStatus = (timestamp: number, ttl: number) => {
    const remaining = timestamp + ttl - Date.now();
    if (remaining <= 0) return { status: 'expired', text: 'Expired' };
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return { status: 'active', text: `${minutes}m ${seconds}s` };
    } else {
      return { status: 'expiring', text: `${seconds}s` };
    }
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50 ${className}`}>
      {/* Toggle Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mb-2"
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="icon"
          variant="outline"
          className="h-10 w-10 bg-background/95 backdrop-blur shadow-lg border-2"
        >
          <Database className="h-4 w-4" />
        </Button>
        
        {/* Hide/Show toggle */}
        <Button
          onClick={() => setIsVisible(false)}
          size="icon"
          variant="ghost"
          className="h-6 w-6 ml-1 opacity-60 hover:opacity-100"
        >
          <EyeOff className="h-3 w-3" />
        </Button>
      </motion.div>

      {/* Cache Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <Card className="w-80 bg-background/95 backdrop-blur shadow-xl border-2 max-h-[70vh] overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4" />
                  Cache Monitor
                  <Badge variant="outline" className="ml-auto text-xs">
                    {stats.totalMemoryUsage}
                  </Badge>
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Cache Statistics */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Statistics
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Documents:</span>
                        <span>{(stats.documentLibrarySize / 1024).toFixed(1)}KB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contents:</span>
                        <span>{(stats.documentContentsSize / 1024).toFixed(1)}KB</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Queries:</span>
                        <span>{(stats.queryCacheSize / 1024).toFixed(1)}KB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Chat:</span>
                        <span>{(stats.chatHistorySize / 1024).toFixed(1)}KB</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t my-2"></div>

                {/* Document Library Cache */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Document Library
                  </h4>
                  {documentLibrary ? (
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span>Documents: {documentLibrary.data.length}</span>
                        <Badge 
                          variant={getExpiryStatus(documentLibrary.timestamp, documentLibrary.expiresAt ? documentLibrary.expiresAt - documentLibrary.timestamp : 0).status === 'expired' ? 'destructive' : 'outline'} 
                          className="text-xs"
                        >
                          {documentLibrary.expiresAt ? getExpiryStatus(documentLibrary.timestamp, documentLibrary.expiresAt - documentLibrary.timestamp).text : 'No TTL'}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        Cached: {formatTime(documentLibrary.timestamp)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No cache</div>
                  )}
                </div>

                <div className="border-t my-2"></div>

                {/* Document Contents Cache */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Document Contents
                  </h4>
                  {documentContents.size > 0 ? (
                    <div className="text-xs space-y-1">
                      <div>Cached contents: {documentContents.size}</div>
                      <div className="max-h-20 overflow-y-auto space-y-1">
                        {Array.from(documentContents.entries()).map(([id, content]) => (
                          <div key={id} className="flex justify-between items-center text-muted-foreground">
                            <span className="truncate flex-1 mr-2">{id.slice(0, 8)}...</span>
                            <Badge variant="outline" className="text-xs">
                              {getExpiryStatus(content.cachedAt, 10 * 60 * 1000).text}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No cached contents</div>
                  )}
                </div>

                <div className="border-t my-2"></div>

                {/* Query Cache */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Query Cache
                  </h4>
                  {recentQueries.length > 0 ? (
                    <div className="text-xs space-y-1">
                      <div>Cached queries: {recentQueries.length}</div>
                      <div className="max-h-16 overflow-y-auto space-y-1">
                        {recentQueries.slice(0, 3).map((query, index) => (
                          <div key={index} className="text-muted-foreground">
                            <div className="truncate">{query.query.slice(0, 30)}...</div>
                            <div className="flex justify-between">
                              <span>{formatTime(query.timestamp)}</span>
                              <Badge variant="outline" className="text-xs">
                                {getExpiryStatus(query.timestamp, 30 * 60 * 1000).text}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No cached queries</div>
                  )}
                </div>

                <div className="border-t my-2"></div>

                {/* UI State */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Settings className="h-3 w-3" />
                    UI State
                  </h4>
                  <div className="text-xs space-y-1">
                    <div>Selected docs: {selectedDocumentIds.length}</div>
                    <div>Chat history: {chatHistory.length} messages</div>
                  </div>
                </div>

                <div className="border-t my-2"></div>

                {/* Cache Controls */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Controls
                  </h4>
                  <div className="flex gap-2">
                    <Button
                      onClick={clearExpiredCache}
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      Clear Expired
                    </Button>
                    <Button
                      onClick={clearAllCache}
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-8 text-xs"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear All
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Export a hook to toggle visibility from anywhere
export function useCacheDebuggerToggle() {
  return {
    show: () => {
      // You could use a global state here if needed
      // console.log('Cache debugger show requested');
    },
    hide: () => {
      // console.log('Cache debugger hide requested');
    }
  };
}