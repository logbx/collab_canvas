/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Color palette for user cursors
 * Uses vibrant, distinct colors that are easy to tell apart
 */
const CURSOR_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Sky Blue
  '#F8B88B', // Peach
  '#A8E6CF', // Light Green
  '#FFD93D', // Golden Yellow
  '#6BCF7F', // Green
  '#C780E8', // Lavender
  '#FF8B94', // Pink
  '#91C4F2', // Light Blue
];

/**
 * Generates a consistent color for a user based on their ID
 * Uses a simple hash function to map user IDs to colors
 */
export function getUserCursorColor(userId: string): string {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Map hash to color index
  const index = Math.abs(hash) % CURSOR_COLORS.length;
  return CURSOR_COLORS[index];
}

/**
 * Get a random color from the cursor color palette
 * Used for AI-generated shapes and other random color needs
 */
export function getRandomColor(): string {
  const index = Math.floor(Math.random() * CURSOR_COLORS.length);
  return CURSOR_COLORS[index];
}

/**
 * Throttle function to limit how often a function can be called
 * Used for cursor position updates to maintain 60fps max
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return function (...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}


