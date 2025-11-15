import { useState, useEffect } from "react";

const HELP_STORAGE_KEY = "app-help-visited";

interface UseAppHelpReturn {
  isFirstVisit: boolean;
  shouldShowHelp: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  markAsVisited: () => void;
}

export function useAppHelp(): UseAppHelpReturn {
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [shouldShowHelp, setShouldShowHelp] = useState(false);

  useEffect(() => {
    // Check if user has visited before
    const hasVisited = localStorage.getItem(HELP_STORAGE_KEY);
    
    if (!hasVisited) {
      setIsFirstVisit(true);
      // Auto-open help dialog after a short delay for better UX
      const timer = setTimeout(() => {
        setShouldShowHelp(true);
      }, 800); // Delay to let the page load first

      return () => clearTimeout(timer);
    }
  }, []);

  const openHelp = () => {
    setShouldShowHelp(true);
  };

  const closeHelp = () => {
    setShouldShowHelp(false);
  };

  const markAsVisited = () => {
    localStorage.setItem(HELP_STORAGE_KEY, "true");
    setIsFirstVisit(false);
    closeHelp();
  };

  return {
    isFirstVisit,
    shouldShowHelp,
    openHelp,
    closeHelp,
    markAsVisited,
  };
}
