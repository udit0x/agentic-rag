"""Memory Management Service for conversation and cache cleanup."""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.agents.conversation_memory import conversation_memory_agent
from server.agents.query_refinement import query_refinement_agent
from server.agents.retriever import retriever_agent

logger = logging.getLogger(__name__)


class MemoryManager:
    """Service for managing conversation memory and agent caches."""
    
    def __init__(self):
        self.cleanup_interval_hours = 6  # Cleanup every 6 hours
        self.session_timeout_hours = 24  # Sessions timeout after 24 hours
        self.conversation_memory_agent = conversation_memory_agent
        self.query_refinement_agent = query_refinement_agent
        self.retriever_agent = retriever_agent
        self._cleanup_task: Optional[asyncio.Task] = None
        self._is_running = False
    
    async def start_periodic_cleanup(self) -> None:
        """Start periodic cleanup task."""
        if self._is_running:
            return
        
        self._is_running = True
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup_loop())
        logger.info("Started periodic cleanup (every %d hours)", self.cleanup_interval_hours)
    
    async def stop_periodic_cleanup(self) -> None:
        """Stop periodic cleanup task."""
        self._is_running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped periodic cleanup")
    
    async def _periodic_cleanup_loop(self) -> None:
        """Periodic cleanup loop."""
        while self._is_running:
            try:
                await self.cleanup_all_caches()
                await asyncio.sleep(self.cleanup_interval_hours * 3600)  # Convert to seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in cleanup loop: %s", e, exc_info=True)
                await asyncio.sleep(300)  # Wait 5 minutes before retrying
    
    async def cleanup_all_caches(self) -> Dict[str, Any]:
        """Perform comprehensive cleanup of all caches and memory."""
        logger.info("Starting comprehensive cache cleanup...")
        
        cleanup_stats = {
            "timestamp": datetime.now(),
            "conversation_memory": {},
            "query_refinement_cache": {},
            "retriever_cache": {},
            "total_memory_freed": 0
        }
        
        try:
            # Cleanup conversation memory
            conversation_cleanup = await self.conversation_memory_agent.cleanup_old_sessions(
                max_age_hours=self.session_timeout_hours
            )
            cleanup_stats["conversation_memory"] = {
                "sessions_cleaned": conversation_cleanup,
                "active_sessions": len(self.conversation_memory_agent.session_memories)
            }
            
            # Cleanup query refinement cache
            refinement_cleanup = await self.query_refinement_agent.cleanup_cache()
            cleanup_stats["query_refinement_cache"] = refinement_cleanup
            
            # Cleanup retriever cache
            retriever_cleanup = await self.retriever_agent.cleanup_cache()
            cleanup_stats["retriever_cache"] = retriever_cleanup
            
            # Calculate total memory freed (approximate)
            total_freed = (
                conversation_cleanup +
                refinement_cleanup.get("expired_entries_removed", 0) +
                retriever_cleanup.get("expired_entries_removed", 0)
            )
            cleanup_stats["total_memory_freed"] = total_freed
            
            logger.info("Cleanup completed: %d entries freed", total_freed)
            
        except Exception as e:
            logger.error("Error during cleanup: %s", e, exc_info=True)
            cleanup_stats["error"] = str(e)
        
        return cleanup_stats
    
    async def cleanup_session(self, session_id: str) -> Dict[str, bool]:
        """Cleanup all caches for a specific session."""
        logger.info("Cleaning up session: %s", session_id)
        
        results = {
            "conversation_memory_cleared": False,
            "query_refinement_cleared": False,
            "retriever_cache_cleared": False
        }
        
        try:
            # Clear conversation memory
            self.conversation_memory_agent.clear_session_memory(session_id)
            results["conversation_memory_cleared"] = True
            
            # Clear query refinement cache
            results["query_refinement_cleared"] = self.query_refinement_agent.clear_session_cache(session_id)
            
            # Clear retriever cache
            results["retriever_cache_cleared"] = self.retriever_agent.clear_session_cache(session_id)
            
            logger.info("Session %s cleanup completed", session_id)
            
        except Exception as e:
            logger.error("Error cleaning session %s: %s", session_id, e, exc_info=True)
        
        return results
    
    def get_memory_usage_stats(self) -> Dict[str, Any]:
        """Get comprehensive memory usage statistics."""
        try:
            conversation_stats = self.conversation_memory_agent.get_memory_stats()
            refinement_stats = self.query_refinement_agent.get_cache_stats()
            retriever_stats = self.retriever_agent.get_cache_stats()
            
            return {
                "timestamp": datetime.now(),
                "conversation_memory": conversation_stats,
                "query_refinement_cache": refinement_stats,
                "retriever_cache": retriever_stats,
                "total_sessions_tracked": max(
                    conversation_stats.get("active_sessions", 0),
                    refinement_stats.get("total_sessions", 0),
                    retriever_stats.get("total_sessions", 0)
                ),
                "memory_manager_config": {
                    "cleanup_interval_hours": self.cleanup_interval_hours,
                    "session_timeout_hours": self.session_timeout_hours,
                    "is_running": self._is_running
                }
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "timestamp": datetime.now()
            }
    
    async def force_cleanup_all(self) -> Dict[str, int]:
        """Force immediate cleanup of all caches (use with caution)."""
        logger.warning("Forcing complete cache clearance...")
        
        results = {
            "conversation_sessions_cleared": 0,
            "query_refinement_entries_cleared": 0,
            "retriever_entries_cleared": 0
        }
        
        try:
            # Clear conversation memory
            results["conversation_sessions_cleared"] = len(self.conversation_memory_agent.session_memories)
            self.conversation_memory_agent.session_memories.clear()
            self.conversation_memory_agent.session_summaries.clear()
            
            # Clear query refinement cache
            results["query_refinement_entries_cleared"] = self.query_refinement_agent.clear_all_cache()
            
            # Clear retriever cache
            results["retriever_entries_cleared"] = self.retriever_agent.clear_all_cache()
            
            logger.info("Force cleanup completed: %s", results)
            
        except Exception as e:
            logger.error("Error in force cleanup: %s", e, exc_info=True)
            results["error"] = str(e)
        
        return results
    
    def configure_cleanup_intervals(self, cleanup_hours: int, session_timeout_hours: int) -> None:
        """Configure cleanup intervals."""
        self.cleanup_interval_hours = cleanup_hours
        self.session_timeout_hours = session_timeout_hours
        logger.info("Updated config: cleanup every %dh, session timeout %dh", cleanup_hours, session_timeout_hours)


# Global memory manager instance
memory_manager = MemoryManager()