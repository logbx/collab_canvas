/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Error Logger Utility
 * Tracks and stores recent errors for debugging and analysis
 */

export interface ErrorLog {
  timestamp: number;
  message: string;
  code?: string;
  stack?: string;
  context?: Record<string, any>;
  severity: 'error' | 'warning' | 'info';
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs = 50; // Keep last 50 errors

  /**
   * Log an error
   */
  logError(message: string, error?: Error | any, context?: Record<string, any>) {
    const log: ErrorLog = {
      timestamp: Date.now(),
      message,
      code: error?.code,
      stack: error?.stack,
      context,
      severity: 'error',
    };

    this.logs.unshift(log); // Add to beginning
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs); // Keep only last N logs
    }

    // Also log to console for development
    console.error(`[ErrorLogger] ${message}`, error, context);

    // Store in localStorage for persistence across refreshes
    this.persistLogs();
  }

  /**
   * Log a warning
   */
  logWarning(message: string, context?: Record<string, any>) {
    const log: ErrorLog = {
      timestamp: Date.now(),
      message,
      context,
      severity: 'warning',
    };

    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    console.warn(`[ErrorLogger] ${message}`, context);
    this.persistLogs();
  }

  /**
   * Log info message
   */
  logInfo(message: string, context?: Record<string, any>) {
    const log: ErrorLog = {
      timestamp: Date.now(),
      message,
      context,
      severity: 'info',
    };

    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    console.info(`[ErrorLogger] ${message}`, context);
    this.persistLogs();
  }

  /**
   * Get all logs
   */
  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  /**
   * Get logs by severity
   */
  getLogsBySeverity(severity: 'error' | 'warning' | 'info'): ErrorLog[] {
    return this.logs.filter(log => log.severity === severity);
  }

  /**
   * Get recent logs (last N minutes)
   */
  getRecentLogs(minutes: number = 10): ErrorLog[] {
    const cutoffTime = Date.now() - minutes * 60 * 1000;
    return this.logs.filter(log => log.timestamp > cutoffTime);
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    this.persistLogs();
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Get formatted logs for display
   */
  getFormattedLogs(): string {
    return this.logs
      .map(log => {
        const time = new Date(log.timestamp).toLocaleString();
        const context = log.context ? `\n  Context: ${JSON.stringify(log.context)}` : '';
        const code = log.code ? ` [${log.code}]` : '';
        return `[${time}] [${log.severity.toUpperCase()}]${code} ${log.message}${context}`;
      })
      .join('\n\n');
  }

  /**
   * Persist logs to localStorage
   */
  private persistLogs() {
    try {
      localStorage.setItem('error_logs', JSON.stringify(this.logs));
    } catch (err) {
      console.warn('Failed to persist error logs:', err);
    }
  }

  /**
   * Load logs from localStorage
   */
  loadLogs() {
    try {
      const stored = localStorage.getItem('error_logs');
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (err) {
      console.warn('Failed to load error logs:', err);
    }
  }
}

// Singleton instance
export const errorLogger = new ErrorLogger();

// Load logs on initialization
errorLogger.loadLogs();



