/**
 * Global Task Polling Service
 * Manages background task polling that persists across tab switches
 */

import { corpusApi } from '../api'
import { useCorpusStore, type TaskInfo } from '../stores/corpusStore'

class TaskPollingService {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map()
  private onTaskCompleteCallbacks: Map<string, () => void> = new Map()
  private hadActiveTasks: Map<string, boolean> = new Map()
  private lastProgressUpdate: Map<string, { progress: number; time: number }> = new Map()
  
  // If no progress update for 30 seconds, consider task stale
  private readonly STALE_TIMEOUT_MS = 30000
  
  /**
   * Start polling for a corpus's tasks
   */
  startPolling(corpusId: string, onComplete?: () => void) {
    // If already polling, just update the callback
    if (this.pollingIntervals.has(corpusId)) {
      console.log('[TaskPolling] Already polling for corpus, updating callback:', corpusId)
      if (onComplete) {
        this.onTaskCompleteCallbacks.set(corpusId, onComplete)
      }
      // Do an immediate poll to catch new tasks
      this.poll(corpusId)
      return
    }
    
    console.log('[TaskPolling] Starting polling for corpus:', corpusId)
    
    if (onComplete) {
      this.onTaskCompleteCallbacks.set(corpusId, onComplete)
    }
    
    // Mark that we expect active tasks
    this.hadActiveTasks.set(corpusId, true)
    
    // Start immediate poll
    this.poll(corpusId)
    
    // Set up faster interval for responsive progress updates (500ms)
    const intervalId = setInterval(() => this.poll(corpusId), 500)
    this.pollingIntervals.set(corpusId, intervalId)
  }
  
  /**
   * Stop polling for a corpus
   */
  stopPolling(corpusId: string) {
    const intervalId = this.pollingIntervals.get(corpusId)
    if (intervalId) {
      clearInterval(intervalId)
      this.pollingIntervals.delete(corpusId)
      this.onTaskCompleteCallbacks.delete(corpusId)
      
      // Clean up progress tracking for this corpus
      for (const key of this.lastProgressUpdate.keys()) {
        if (key.startsWith(`${corpusId}:`)) {
          this.lastProgressUpdate.delete(key)
        }
      }
      
      console.log('[TaskPolling] Stopped polling for corpus:', corpusId)
    }
  }
  
  /**
   * Check if polling is active for a corpus
   */
  isPolling(corpusId: string): boolean {
    return this.pollingIntervals.has(corpusId)
  }
  
  /**
   * Poll for task updates
   */
  private async poll(corpusId: string) {
    try {
      const response = await corpusApi.listCorpusTasks(corpusId)
      
      if (!response.success || !response.data) {
        return
      }
      
      const store = useCorpusStore.getState()
      
      // Get all tasks (including recently completed ones for display)
      const allTasks = response.data
      const activeTasks = allTasks.filter(
        task => task.status === 'pending' || task.status === 'processing'
      )
      const completedTasks = allTasks.filter(
        task => task.status === 'completed' || task.status === 'failed'
      )
      
      console.log('[TaskPolling] Poll result:', {
        corpusId,
        total: allTasks.length,
        active: activeTasks.length,
        completed: completedTasks.length
      })
      
      // Update store with active tasks
      // For each textId, only update if it's the same task we're tracking or a newer task
      const now = Date.now()
      
      activeTasks.forEach(task => {
        if (task.textId) {
          const existing = store.processingTasks.get(task.textId)
          const taskKey = `${corpusId}:${task.textId}`
          const lastUpdate = this.lastProgressUpdate.get(taskKey)
          
          // Check if task is stale (no progress change for too long)
          if (lastUpdate && lastUpdate.progress === task.progress) {
            const elapsed = now - lastUpdate.time
            if (elapsed > this.STALE_TIMEOUT_MS) {
              console.log('[TaskPolling] Task appears stale, marking as failed:', task.id)
              store.setTask(task.textId, {
                taskId: task.id,
                corpusId: corpusId,
                textId: task.textId,
                progress: task.progress || 0,
                stage: 'failed',
                message: 'Task appears to have stopped (no progress)',
                status: 'failed'
              })
              this.lastProgressUpdate.delete(taskKey)
              return
            }
          } else {
            // Progress changed, update last progress time
            this.lastProgressUpdate.set(taskKey, { progress: task.progress || 0, time: now })
          }
          
          // Only update if:
          // 1. We're not tracking any task for this text yet, OR
          // 2. It's the same task (same taskId), OR  
          // 3. The existing task is already completed (so this is a new task)
          const shouldUpdate = !existing || 
                              existing.taskId === task.id || 
                              existing.status === 'completed' || 
                              existing.status === 'failed'
          
          if (shouldUpdate) {
            const messageParts = (task.message || '').split(': ')
            const stage = messageParts.length > 1 ? messageParts[0] : 'processing'
            const message = messageParts.length > 1 ? messageParts.slice(1).join(': ') : task.message
            
            store.setTask(task.textId, {
              taskId: task.id,
              corpusId: corpusId,
              textId: task.textId,
              progress: task.progress || 0,
              stage,
              message: message || 'Processing...',
              status: task.status
            })
          }
        }
      })
      
      // Also show recently completed tasks briefly (100% progress)
      // But only if the task ID matches what we're tracking
      completedTasks.forEach(task => {
        if (task.textId) {
          const existing = store.processingTasks.get(task.textId)
          // Only update if we were tracking this exact task (same task ID)
          if (existing && existing.corpusId === corpusId && existing.taskId === task.id) {
            store.setTask(task.textId, {
              ...existing,
              progress: 100,
              stage: task.status === 'completed' ? 'completed' : 'failed',
              message: task.message || (task.status === 'completed' ? 'Completed' : 'Failed'),
              status: task.status
            })
          }
        }
      })
      
      // Remove tasks that are no longer in the response at all
      const allTextIds = new Set(allTasks.map(t => t.textId))
      const currentTasks = store.processingTasks
      for (const [textId, task] of currentTasks) {
        if (task.corpusId === corpusId && !allTextIds.has(textId)) {
          store.removeTask(textId)
        }
      }
      
      // Track if we had active tasks
      const hadActive = this.hadActiveTasks.get(corpusId) || false
      
      // If no more active tasks and we had some before, tasks just completed
      if (activeTasks.length === 0 && hadActive) {
        console.log('[TaskPolling] All tasks completed for corpus:', corpusId)
        
        // Clear completed tasks from store after a brief delay to show 100%
        setTimeout(() => {
          const currentStore = useCorpusStore.getState()
          for (const [textId, task] of currentStore.processingTasks) {
            if (task.corpusId === corpusId) {
              currentStore.removeTask(textId)
            }
          }
        }, 1500)
        
        const callback = this.onTaskCompleteCallbacks.get(corpusId)
        this.stopPolling(corpusId)
        this.hadActiveTasks.delete(corpusId)
        
        if (callback) {
          callback()
        }
      } else if (activeTasks.length > 0) {
        this.hadActiveTasks.set(corpusId, true)
      }
    } catch (err) {
      console.error('[TaskPolling] Error polling tasks:', err)
    }
  }
  
  /**
   * Get active task count for a corpus
   */
  getActiveTaskCount(corpusId: string): number {
    const store = useCorpusStore.getState()
    let count = 0
    for (const task of store.processingTasks.values()) {
      if (task.corpusId === corpusId && 
          (task.status === 'pending' || task.status === 'processing')) {
        count++
      }
    }
    return count
  }
}

// Singleton instance
export const taskPollingService = new TaskPollingService()

