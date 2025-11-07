import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Menu, 
  MessageSquare, 
  Plus, 
  Settings, 
  User, 
  ChevronLeft,
  Clock,
  Search,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ProfileScreen } from "@/components/profile/profile-screen";
import { TitleGenerationIndicator } from "@/components/ui/TitleGenerationIndicator";
import { OrbitalLoader } from "@/components/ui/orbital-loader";
import DecryptedText from "@/components/ui/DecryptedText";

interface ChatHistoryItem {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  role: string;
  joinedAt?: string;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  chatHistory: ChatHistoryItem[];
  currentChatId?: string;
  onChatSelect: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  userProfile: UserProfile;
  onSettingsClick: () => void;
  onLogout?: () => void;
  onUpdateRole?: (role: string) => void;
  className?: string;
  isTitleGenerating?: boolean;
  titleGeneratingChatId?: string;
  isLoadingChat?: boolean;
  loadingChatId?: string;
}

export function Sidebar({
  isOpen,
  onToggle,
  chatHistory,
  currentChatId,
  onChatSelect,
  onNewChat,
  onDeleteChat,
  userProfile,
  onSettingsClick,
  onLogout,
  onUpdateRole,
  className,
  isTitleGenerating = false,
  titleGeneratingChatId,
  isLoadingChat = false,
  loadingChatId
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isMobile = useIsMobile();
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filteredHistory = chatHistory.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInDays < 7) {
      return `${Math.floor(diffInDays)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleChatClick = (chatId: string) => {
    // Prevent multiple rapid clicks
    if (clickTimeoutRef.current) {
      return;
    }
    
    // Prevent clicking when loading or if it's already the current chat
    if ((isLoadingChat && loadingChatId === chatId) || currentChatId === chatId) {
      return;
    }
    
    // Set a brief timeout to prevent rapid clicking
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
    }, 300);
    
    onChatSelect(chatId);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  return (
    <TooltipProvider>
      <motion.aside
        initial={false}
        animate={{
          width: isOpen ? (isMobile ? 280 : 320) : (isMobile ? 280 : 64), // Keep full width on mobile even when "closed"
          x: isMobile ? (isOpen ? 0 : -280) : 0, // Use transform for mobile slide animation
        }}
        transition={{
          duration: isMobile ? 0.2 : 0.3, // Faster animation on mobile
          ease: "easeInOut",
        }}
        className={cn(
          "flex flex-col h-full bg-muted/10 border-r border-border backdrop-blur-sm",
          "supports-[backdrop-filter]:bg-background/95",
          isMobile ? [
            "fixed inset-y-0 left-0 z-[60]", // Fixed positioning with high z-index on mobile
            "w-[280px] max-w-[80vw]", // Constrain width and ensure it doesn't exceed viewport
            "shadow-lg"
          ] : "relative",
          className
        )}
        style={{
          // Ensure sidebar doesn't cause horizontal overflow on mobile
          ...(isMobile && { maxWidth: 'min(280px, 80vw)' })
        }}
      >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between border-b border-border",
        isMobile ? "p-3" : "p-4" // Tighter padding on mobile
      )}>
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="expanded-header"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <div className={cn(
                "flex items-center justify-center rounded-lg bg-primary text-primary-foreground",
                isMobile ? "h-7 w-7" : "h-8 w-8"
              )}>
                <MessageSquare className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
              </div>
              <h1 className={cn(
                "font-semibold text-foreground",
                isMobile ? "text-sm" : "text-sm"
              )}>
                Chat History
              </h1>
              {isTitleGenerating && (
                <div className="mt-1">
                  <TitleGenerationIndicator 
                    isGenerating={true}
                    className="scale-90"
                  />
                </div>
              )}
            </motion.div>
          ) : (
            !isMobile && ( // Don't show collapsed header on mobile
              <motion.div
                key="collapsed-header"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center w-10 h-8"
              >
                <MessageSquare className="h-5 w-5 text-foreground" />
              </motion.div>
            )
          )}
        </AnimatePresence>

        {(isOpen || !isMobile) && ( // Always show toggle button on desktop, only when open on mobile
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              isMobile ? "h-7 w-7" : "h-8 w-8"
            )}
          >
            <motion.div
              animate={{ rotate: isOpen ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronLeft className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
            </motion.div>
          </Button>
        )}
      </div>

      {/* New Chat Button */}
      <div className={cn(isMobile ? "p-2.5" : "p-3")}>
        {isOpen ? (
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 font-normal"
            variant="outline"
            size={isMobile ? "sm" : "default"}
          >
            <Plus className={cn(
              "shrink-0",
              isMobile ? "h-3.5 w-3.5" : "h-4 w-4"
            )} />
            <AnimatePresence>
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="whitespace-nowrap"
              >
                New Chat
              </motion.span>
            </AnimatePresence>
          </Button>
        ) : (
          !isMobile && ( // Don't show collapsed button on mobile
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onNewChat}
                  className="w-full px-3"
                  variant="outline"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                New Chat
              </TooltipContent>
            </Tooltip>
          )
        )}
      </div>

      {/* Search */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(isMobile ? "px-2.5 pb-2.5" : "px-3 pb-3")}
          >
            <div className="relative">
              <Search className={cn(
                "absolute text-muted-foreground",
                isMobile ? "left-2 top-2 h-3.5 w-3.5" : "left-2 top-2.5 h-4 w-4"
              )} />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "text-sm",
                  isMobile ? "pl-7 h-8" : "pl-8 h-9"
                )}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat History */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full px-1.5 sm:px-2">
          <div className={cn(
            "space-y-1 pb-4",
            isMobile && "pb-2"
          )}>
            <AnimatePresence>
              {filteredHistory.map((chat, index) => (
                <div key={chat.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "group relative rounded-lg transition-colors",
                      // Only make it clickable if not loading and not current chat
                      !(isLoadingChat && loadingChatId === chat.id) && currentChatId !== chat.id && "cursor-pointer hover:bg-muted/20 active:bg-muted/30",
                      // Show loading state styling
                      isLoadingChat && loadingChatId === chat.id && "bg-muted/30 cursor-wait animate-pulse",
                      // Current chat styling
                      currentChatId === chat.id && "bg-muted/40 border-2 border-primary/30 shadow-sm cursor-default",
                      !isOpen && "mx-1"
                    )}
                    onClick={() => handleChatClick(chat.id)}
                  >
                  <div className={cn(
                    isMobile ? "p-2.5" : "p-3",
                    !isOpen && "px-1 py-3"
                  )}>
                    <div className="flex items-start justify-between">
                      <div className={cn("flex-1 min-w-0", !isOpen && "flex justify-center")}>
                        {isOpen ? (
                          <>
                            {/* Show loading state for this specific chat */}
                            {isLoadingChat && loadingChatId === chat.id ? (
                              <div className="flex items-center gap-3">
                                <OrbitalLoader 
                                  className="w-5 h-5"
                                />
                                <div className="flex-1">
                                  <h3 className={cn(
                                    "font-medium text-muted-foreground mb-2",
                                    isMobile ? "text-sm" : "text-sm"
                                  )}>
                                    Loading...
                                  </h3>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Clock className={cn(
                                        "text-muted-foreground",
                                        isMobile ? "h-2.5 w-2.5" : "h-3 w-3"
                                      )} />
                                      <span className={cn(
                                        "text-muted-foreground",
                                        isMobile ? "text-[10px]" : "text-xs"
                                      )}>
                                        {formatDate(chat.createdAt)}
                                      </span>
                                    </div>
                                    <Badge variant="secondary" className={cn(
                                      "px-2 py-0",
                                      isMobile ? "text-[10px]" : "text-xs"
                                    )}>
                                      {chat.messageCount}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <h3 className={cn(
                                  "font-medium text-foreground mb-2", // Allow wrapping by removing line-clamp-1
                                  isMobile ? "text-sm" : "text-sm"
                                )}>
                                  {isTitleGenerating && titleGeneratingChatId === chat.id ? (
                                    <DecryptedText
                                      text={chat.title}
                                      speed={80}
                                      maxIterations={20}
                                      animateOn="view"
                                      className="text-foreground"
                                      encryptedClassName="text-foreground/60"
                                    />
                                  ) : (
                                    chat.title
                                  )}
                                </h3>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Clock className={cn(
                                      "text-muted-foreground",
                                      isMobile ? "h-2.5 w-2.5" : "h-3 w-3"
                                    )} />
                                    <span className={cn(
                                      "text-muted-foreground",
                                      isMobile ? "text-[10px]" : "text-xs"
                                    )}>
                                      {formatDate(chat.createdAt)}
                                    </span>
                                  </div>
                                  <Badge variant="secondary" className={cn(
                                    "px-2 py-0",
                                    isMobile ? "text-[10px]" : "text-xs"
                                  )}>
                                    {chat.messageCount}
                                  </Badge>
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          !isMobile && ( // Don't show tooltip items on mobile
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50">
                                  {isLoadingChat && loadingChatId === chat.id ? (
                                    <OrbitalLoader className="w-4 h-4" />
                                  ) : (
                                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-64">
                                <div className="space-y-1">
                                  <p className="font-medium text-sm">
                                    {isTitleGenerating && titleGeneratingChatId === chat.id ? (
                                      <DecryptedText
                                        text={chat.title}
                                        speed={80}
                                        maxIterations={20}
                                        animateOn="view"
                                        className="text-foreground"
                                        encryptedClassName="text-foreground/60"
                                      />
                                    ) : (
                                      chat.title
                                    )}
                                  </p>

                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-xs text-muted-foreground">
                                      {formatDate(chat.createdAt)}
                                    </span>
                                    <Badge variant="secondary" className="text-xs px-2 py-0">
                                      {chat.messageCount}
                                    </Badge>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )
                        )}
                      </div>
                      
                      {isOpen && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "flex-shrink-0 transition-opacity",
                                isMobile ? [
                                  "h-8 w-8 opacity-100", // Larger touch target on mobile (32x32px)
                                  "ml-1", // Small margin to separate from content
                                  "group-active:opacity-100",
                                  "touch-manipulation", // Optimize for touch
                                  "active:bg-muted/50" // Visual feedback on touch
                                ] : [
                                  "h-6 w-6 opacity-0 group-hover:opacity-100",
                                ]
                              )}
                              onClick={(e) => {
                                // Only stop propagation to prevent chat selection, but allow dropdown to work
                                e.stopPropagation();
                              }}
                            >
                              <MoreHorizontal className={cn(isMobile ? "h-4 w-4" : "h-4 w-4")} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent 
                            align="end" 
                            className={cn(
                              "w-48 z-[70]", // Higher z-index to appear above sidebar
                              isMobile && "text-sm" // Smaller text on mobile
                            )}
                            sideOffset={isMobile ? 8 : 4}
                            avoidCollisions={true}
                            collisionPadding={8}
                          >
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteChat(chat.id);
                              }}
                              className={cn(
                                "text-destructive focus:text-destructive cursor-pointer",
                                isMobile && [
                                  "py-2.5 px-3", // Slightly smaller padding
                                  "text-sm" // Smaller text
                                ]
                              )}
                            >
                              Delete conversation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </motion.div>
                  
                  {/* Subtle divider between chats */}
                  {index < filteredHistory.length - 1 && (
                    <div className="mx-3 my-2 border-b border-white/20" />
                  )}
                </div>
              ))}
            </AnimatePresence>
            
            {filteredHistory.length === 0 && isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-muted-foreground"
              >
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {searchQuery ? "No conversations found" : "No conversations yet"}
                </p>
                <p className="text-xs mt-1">
                  {searchQuery ? "Try a different search term" : "Start a new chat to begin"}
                </p>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* User Profile */}
      <div className="border-t border-border bg-background">
        <div
            className={cn(
            "flex items-center gap-3 transition-all duration-200",
            isOpen ? "p-[22px]" : "p-[20px] px-2"
            )}
        >
            {/* Avatar */}
            {isOpen ? (
              <Avatar
                className="h-8 w-8 transition-all duration-200"
              >
                <AvatarImage src={userProfile.avatar} alt={userProfile.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {userProfile.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar
                    className="h-10 w-10 transition-all duration-200 cursor-pointer"
                    onClick={() => setIsProfileOpen(true)}
                  >
                    <AvatarImage src={userProfile.avatar} alt={userProfile.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {userProfile.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{userProfile.name}</p>
                    <p className="text-xs text-muted-foreground">{userProfile.role}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {/* User Info (visible only when open) */}
            <AnimatePresence>
            {isOpen && (
                <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 min-w-0"
                >
                <p className="text-sm font-medium text-foreground line-clamp-1">
                    {userProfile.name}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                    {userProfile.role}
                </p>
                </motion.div>
            )}
            </AnimatePresence>

            {/* Dropdown Menu (visible only when open) */}
            <AnimatePresence>
            {isOpen && (
                <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end" 
                      className="w-48 z-[80]"
                      sideOffset={8}
                      avoidCollisions={true}
                      collisionPadding={8}
                    >
                    <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                        <User className="h-4 w-4 mr-2" />
                        Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onSettingsClick}>
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                </motion.div>
            )}
            </AnimatePresence>
        </div>
    </div>
    </motion.aside>

    {/* Profile Screen */}
    <ProfileScreen
      isOpen={isProfileOpen}
      onClose={() => setIsProfileOpen(false)}
      userProfile={userProfile}
      onUpdateRole={onUpdateRole}
      onLogout={onLogout}
    />
    </TooltipProvider>
  );
}