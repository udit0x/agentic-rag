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
    const hasVisited = localStorage.getItem(HELP_STORAGE_KEY);
    
    if (!hasVisited) {
      setIsFirstVisit(true);
      const timer = setTimeout(() => {
        setShouldShowHelp(true);
      }, 1200); // Increased delay to ensure page is fully loaded

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
