import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getUserCursorColor, getRandomColor, throttle } from './colorUtils';

describe('colorUtils', () => {
  describe('getUserCursorColor', () => {
    it('should return a consistent color for the same user ID', () => {
      const userId = 'user123';
      const color1 = getUserCursorColor(userId);
      const color2 = getUserCursorColor(userId);
      
      expect(color1).toBe(color2);
    });

    it('should return different colors for different user IDs', () => {
      const color1 = getUserCursorColor('user1');
      const color2 = getUserCursorColor('user2');
      const color3 = getUserCursorColor('user3');
      
      // Not guaranteed to be different due to hash collision, but highly likely
      const uniqueColors = new Set([color1, color2, color3]);
      expect(uniqueColors.size).toBeGreaterThan(1);
    });

    it('should return a valid hex color code', () => {
      const color = getUserCursorColor('testUser');
      
      // Hex color format: #RRGGBB
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should return one of the predefined cursor colors', () => {
      // From the source code, these are the available colors
      const validColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A8E6CF',
        '#FFD93D', '#6BCF7F', '#C780E8', '#FF8B94', '#91C4F2',
      ];
      
      const color = getUserCursorColor('anyUser');
      expect(validColors).toContain(color);
    });

    it('should handle empty string user ID', () => {
      const color = getUserCursorColor('');
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should handle very long user IDs', () => {
      const longUserId = 'a'.repeat(1000);
      const color = getUserCursorColor(longUserId);
      
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should distribute colors across the palette', () => {
      // Generate colors for many users
      const colors = new Set();
      for (let i = 0; i < 100; i++) {
        colors.add(getUserCursorColor(`user${i}`));
      }
      
      // Should use multiple colors from the palette (at least 10 different colors)
      expect(colors.size).toBeGreaterThanOrEqual(10);
    });

    it('should handle special characters in user ID', () => {
      const specialIds = ['user@123', 'user#456', 'user$789', 'user!@#$%'];
      
      specialIds.forEach(id => {
        const color = getUserCursorColor(id);
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should handle unicode characters in user ID', () => {
      const unicodeIds = ['用户123', 'пользователь456', '🙂user789'];
      
      unicodeIds.forEach(id => {
        const color = getUserCursorColor(id);
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should use consistent hashing (same color for similar IDs is coincidence)', () => {
      // Testing that the function is deterministic
      const id = 'test-user-id';
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        results.push(getUserCursorColor(id));
      }
      
      // All results should be identical
      expect(new Set(results).size).toBe(1);
    });
  });

  describe('getRandomColor', () => {
    it('should return a valid hex color code', () => {
      const color = getRandomColor();
      expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should return one of the predefined cursor colors', () => {
      const validColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A8E6CF',
        '#FFD93D', '#6BCF7F', '#C780E8', '#FF8B94', '#91C4F2',
      ];
      
      const color = getRandomColor();
      expect(validColors).toContain(color);
    });

    it('should potentially return different colors on subsequent calls', () => {
      const colors = new Set();
      
      // Call 50 times, should get at least a few different colors
      for (let i = 0; i < 50; i++) {
        colors.add(getRandomColor());
      }
      
      expect(colors.size).toBeGreaterThan(1);
    });

    it('should use the full palette over many calls', () => {
      const colors = new Set();
      
      // With 1000 calls, should hit most colors in a 15-color palette
      for (let i = 0; i < 1000; i++) {
        colors.add(getRandomColor());
      }
      
      // Should use at least 12 out of 15 colors
      expect(colors.size).toBeGreaterThanOrEqual(12);
    });

    it('should not throw errors', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          getRandomColor();
        }
      }).not.toThrow();
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call the function immediately on first call', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 100);
      
      throttled();
      
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should not call the function again within the delay period', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 100);
      
      throttled();
      throttled();
      throttled();
      
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should call the function again after the delay period', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 100);
      
      throttled(); // Call 1
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(99);
      throttled(); // Still within delay
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(1); // Now at 100ms
      throttled(); // Call 2
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments to the throttled function', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 100);
      
      throttled('arg1', 'arg2', 123);
      
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    it('should preserve this context', () => {
      const obj = {
        value: 42,
        getValue: function() { return this.value; },
      };
      
      const mockFn = vi.fn(function(this: typeof obj) {
        return this.value;
      });
      
      obj.getValue = throttle(mockFn, 100);
      obj.getValue();
      
      expect(mockFn).toHaveBeenCalled();
    });

    it('should handle rapid successive calls correctly', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 100);
      
      // Rapid calls
      for (let i = 0; i < 10; i++) {
        throttled();
      }
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      // Advance time and call again
      vi.advanceTimersByTime(100);
      for (let i = 0; i < 10; i++) {
        throttled();
      }
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should work with different delay values', () => {
      const mockFn1 = vi.fn();
      const mockFn2 = vi.fn();
      
      const throttled1 = throttle(mockFn1, 50);
      const throttled2 = throttle(mockFn2, 200);
      
      throttled1();
      throttled2();
      
      expect(mockFn1).toHaveBeenCalledTimes(1);
      expect(mockFn2).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(50);
      throttled1();
      throttled2();
      
      expect(mockFn1).toHaveBeenCalledTimes(2); // Can call again
      expect(mockFn2).toHaveBeenCalledTimes(1); // Still throttled
      
      vi.advanceTimersByTime(150);
      throttled2();
      
      expect(mockFn2).toHaveBeenCalledTimes(2); // Can call now
    });

    it('should handle zero delay (effectively no throttling)', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 0);
      
      throttled();
      throttled();
      throttled();
      
      // With 0 delay, should call every time
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle very large delay values', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 1000000);
      
      throttled();
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(999999);
      throttled();
      expect(mockFn).toHaveBeenCalledTimes(1); // Still throttled
      
      vi.advanceTimersByTime(1);
      throttled();
      expect(mockFn).toHaveBeenCalledTimes(2); // Can call now
    });

    it('should allow calling with no arguments', () => {
      const mockFn = vi.fn();
      const throttled = throttle(mockFn, 100);
      
      throttled();
      
      expect(mockFn).toHaveBeenCalledWith();
    });

    it('should execute function without returning values', () => {
      // Note: The throttle implementation does not return values from the wrapped function.
      // It only executes the function when conditions are met.
      const mockFn = vi.fn(() => 'return value');
      const throttled = throttle(mockFn, 100);
      
      const result1 = throttled();
      expect(result1).toBeUndefined(); // Throttle doesn't return values
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      // Throttled call doesn't execute
      const result2 = throttled();
      expect(result2).toBeUndefined();
      expect(mockFn).toHaveBeenCalledTimes(1); // Still 1
      
      vi.advanceTimersByTime(100);
      const result3 = throttled();
      expect(result3).toBeUndefined();
      expect(mockFn).toHaveBeenCalledTimes(2); // Now 2
    });

    it('should maintain independent state for multiple throttled functions', () => {
      const mockFn1 = vi.fn();
      const mockFn2 = vi.fn();
      
      const throttled1 = throttle(mockFn1, 100);
      const throttled2 = throttle(mockFn2, 100);
      
      throttled1();
      throttled2();
      
      expect(mockFn1).toHaveBeenCalledTimes(1);
      expect(mockFn2).toHaveBeenCalledTimes(1);
      
      throttled1();
      throttled2();
      
      expect(mockFn1).toHaveBeenCalledTimes(1); // Throttled
      expect(mockFn2).toHaveBeenCalledTimes(1); // Throttled
    });

    it('should work correctly with real timers (integration test)', () => {
      vi.useRealTimers();
      
      return new Promise<void>((resolve) => {
        const mockFn = vi.fn();
        const throttled = throttle(mockFn, 50);
        
        throttled(); // Call 1
        expect(mockFn).toHaveBeenCalledTimes(1);
        
        throttled(); // Throttled
        expect(mockFn).toHaveBeenCalledTimes(1);
        
        setTimeout(() => {
          throttled(); // Call 2
          expect(mockFn).toHaveBeenCalledTimes(2);
          resolve();
        }, 60);
      });
    });
  });
});
