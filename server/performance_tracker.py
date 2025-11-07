"""Performance monitoring utilities for document processing."""
import time
import asyncio
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager, contextmanager
from functools import wraps

class PerformanceTracker:
    """Track performance metrics for document processing operations."""
    
    def __init__(self):
        self.metrics = {}
        self.current_operation = None
    
    @contextmanager
    def track_sync(self, operation_name: str):
        """Context manager for tracking synchronous operations."""
        start_time = time.time()
        print(f"[PERF] Starting {operation_name}...")
        
        try:
            yield
        finally:
            duration_ms = int((time.time() - start_time) * 1000)
            self.metrics[operation_name] = duration_ms
            print(f"[PERF] {operation_name} completed in {duration_ms}ms")
    
    @asynccontextmanager
    async def track_async(self, operation_name: str):
        """Context manager for tracking asynchronous operations."""
        start_time = time.time()
        print(f"[PERF] Starting {operation_name}...")
        
        try:
            yield
        finally:
            duration_ms = int((time.time() - start_time) * 1000)
            self.metrics[operation_name] = duration_ms
            print(f"[PERF] {operation_name} completed in {duration_ms}ms")
    
    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary."""
        total_time = sum(self.metrics.values())
        return {
            "total_time_ms": total_time,
            "operations": self.metrics.copy(),
            "breakdown_percent": {
                op: round((time_ms / total_time) * 100, 1) if total_time > 0 else 0
                for op, time_ms in self.metrics.items()
            }
        }
    
    def print_summary(self):
        """Print performance summary."""
        summary = self.get_summary()
        print(f"\n[PERF] Performance Summary:")
        print(f"  Total Time: {summary['total_time_ms']}ms")
        print(f"  Operations:")
        
        for op, time_ms in summary['operations'].items():
            percent = summary['breakdown_percent'][op]
            print(f"    {op}: {time_ms}ms ({percent}%)")
        print()

def track_performance(operation_name: str):
    """Decorator for tracking function performance."""
    def decorator(func):
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start_time = time.time()
                print(f"[PERF] Starting {operation_name}...")
                
                try:
                    result = await func(*args, **kwargs)
                    return result
                finally:
                    duration_ms = int((time.time() - start_time) * 1000)
                    print(f"[PERF] {operation_name} completed in {duration_ms}ms")
            
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                start_time = time.time()
                print(f"[PERF] Starting {operation_name}...")
                
                try:
                    result = func(*args, **kwargs)
                    return result
                finally:
                    duration_ms = int((time.time() - start_time) * 1000)
                    print(f"[PERF] {operation_name} completed in {duration_ms}ms")
            
            return sync_wrapper
    
    return decorator

# Global performance tracker
perf_tracker = PerformanceTracker()