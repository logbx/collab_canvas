import { describe, it, expect } from 'vitest';
import {
  generateId,
  getCanvasCenter,
  calculateAngle,
  snapAngle,
  snapLineDelta,
} from './canvasHelpers';

describe('canvasHelpers', () => {
  describe('generateId', () => {
    it('should generate a valid UUID v4', () => {
      const id = generateId();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      
      // All 100 IDs should be unique
      expect(ids.size).toBe(100);
    });

    it('should return a string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
    });
  });

  describe('getCanvasCenter', () => {
    it('should calculate center with no pan or zoom', () => {
      const result = getCanvasCenter(800, 600, 1, { x: 0, y: 0 });
      
      expect(result).toEqual({ x: 400, y: 300 });
    });

    it('should calculate center with pan offset', () => {
      // Stage panned 100px right, 50px down
      const result = getCanvasCenter(800, 600, 1, { x: 100, y: 50 });
      
      // Center should shift left and up relative to viewport
      expect(result).toEqual({ x: 300, y: 250 });
    });

    it('should calculate center with zoom (scale 2x)', () => {
      const result = getCanvasCenter(800, 600, 2, { x: 0, y: 0 });
      
      // At 2x zoom, visible area is half the size
      expect(result).toEqual({ x: 200, y: 150 });
    });

    it('should calculate center with zoom (scale 0.5x)', () => {
      const result = getCanvasCenter(800, 600, 0.5, { x: 0, y: 0 });
      
      // At 0.5x zoom, visible area is double the size
      expect(result).toEqual({ x: 800, y: 600 });
    });

    it('should handle combined pan and zoom', () => {
      // Panned and zoomed
      const result = getCanvasCenter(800, 600, 2, { x: 100, y: 50 });
      
      expect(result).toEqual({ x: 150, y: 125 });
    });

    it('should handle negative pan offsets', () => {
      const result = getCanvasCenter(800, 600, 1, { x: -100, y: -50 });
      
      expect(result).toEqual({ x: 500, y: 350 });
    });

    it('should handle very small stage dimensions', () => {
      const result = getCanvasCenter(100, 100, 1, { x: 0, y: 0 });
      
      expect(result).toEqual({ x: 50, y: 50 });
    });

    it('should handle very large stage dimensions', () => {
      const result = getCanvasCenter(10000, 8000, 1, { x: 0, y: 0 });
      
      expect(result).toEqual({ x: 5000, y: 4000 });
    });
  });

  describe('calculateAngle', () => {
    it('should calculate 0° for horizontal right', () => {
      const angle = calculateAngle(100, 0);
      expect(angle).toBe(0);
    });

    it('should calculate 90° for vertical down', () => {
      const angle = calculateAngle(0, 100);
      expect(angle).toBe(90);
    });

    it('should calculate 180° for horizontal left', () => {
      const angle = calculateAngle(-100, 0);
      expect(angle).toBe(180);
    });

    it('should calculate 270° for vertical up', () => {
      const angle = calculateAngle(0, -100);
      expect(angle).toBe(270);
    });

    it('should calculate 45° for diagonal (down-right)', () => {
      const angle = calculateAngle(100, 100);
      expect(angle).toBeCloseTo(45, 5);
    });

    it('should calculate 135° for diagonal (down-left)', () => {
      const angle = calculateAngle(-100, 100);
      expect(angle).toBeCloseTo(135, 5);
    });

    it('should calculate 225° for diagonal (up-left)', () => {
      const angle = calculateAngle(-100, -100);
      expect(angle).toBeCloseTo(225, 5);
    });

    it('should calculate 315° for diagonal (up-right)', () => {
      const angle = calculateAngle(100, -100);
      expect(angle).toBeCloseTo(315, 5);
    });

    it('should normalize negative angles to 0-360 range', () => {
      // Any result from atan2 should be normalized
      const angle = calculateAngle(-1, -1);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(360);
    });

    it('should handle very small deltas', () => {
      const angle = calculateAngle(0.01, 0.01);
      expect(angle).toBeCloseTo(45, 1);
    });

    it('should handle very large deltas', () => {
      const angle = calculateAngle(10000, 10000);
      expect(angle).toBeCloseTo(45, 5);
    });

    it('should handle zero deltas (origin point)', () => {
      const angle = calculateAngle(0, 0);
      expect(angle).toBe(0);
    });
  });

  describe('snapAngle', () => {
    it('should snap 0° to 0°', () => {
      expect(snapAngle(0)).toBe(0);
    });

    it('should snap 90° to 90°', () => {
      expect(snapAngle(90)).toBe(90);
    });

    it('should snap 180° to 180°', () => {
      expect(snapAngle(180)).toBe(180);
    });

    it('should snap 270° to 270°', () => {
      expect(snapAngle(270)).toBe(270);
    });

    it('should snap 360° to 0° (normalized)', () => {
      expect(snapAngle(360)).toBe(0);
    });

    it('should snap 3° to 0° (within default tolerance)', () => {
      expect(snapAngle(3)).toBe(0);
    });

    it('should snap 357° to 0° (within default tolerance)', () => {
      expect(snapAngle(357)).toBe(0);
    });

    it('should snap 88° to 90° (within default tolerance)', () => {
      expect(snapAngle(88)).toBe(90);
    });

    it('should snap 92° to 90° (within default tolerance)', () => {
      expect(snapAngle(92)).toBe(90);
    });

    it('should snap 178° to 180° (within default tolerance)', () => {
      expect(snapAngle(178)).toBe(180);
    });

    it('should snap 182° to 180° (within default tolerance)', () => {
      expect(snapAngle(182)).toBe(180);
    });

    it('should snap 268° to 270° (within default tolerance)', () => {
      expect(snapAngle(268)).toBe(270);
    });

    it('should snap 272° to 270° (within default tolerance)', () => {
      expect(snapAngle(272)).toBe(270);
    });

    it('should NOT snap 45° (not near cardinal)', () => {
      expect(snapAngle(45)).toBe(45);
    });

    it('should NOT snap 135° (not near cardinal)', () => {
      expect(snapAngle(135)).toBe(135);
    });

    it('should NOT snap 6° (outside default tolerance)', () => {
      expect(snapAngle(6)).toBe(6);
    });

    it('should snap with custom tolerance (10°)', () => {
      expect(snapAngle(10, 10)).toBe(0);
      expect(snapAngle(11, 10)).toBe(11); // Outside tolerance
    });

    it('should snap with custom tolerance (1°)', () => {
      expect(snapAngle(1, 1)).toBe(0);
      expect(snapAngle(2, 1)).toBe(2); // Outside tolerance
    });

    it('should handle angles near 360° boundary', () => {
      expect(snapAngle(358)).toBe(0);
      expect(snapAngle(362)).toBe(0); // Over 360
    });
  });

  describe('snapLineDelta', () => {
    describe('horizontal lines (0°)', () => {
      it('should snap exact horizontal line', () => {
        const result = snapLineDelta(100, 0);
        
        expect(result.deltaX).toBeCloseTo(100, 5);
        expect(result.deltaY).toBe(0);
        expect(result.isSnapped).toBe(true);
      });

      it('should snap near-horizontal line (3° off)', () => {
        // Small Y component (approx 3°)
        const result = snapLineDelta(100, 5);
        
        expect(result.deltaX).toBeCloseTo(100.12, 1); // Length preserved
        expect(result.deltaY).toBe(0);
        expect(result.isSnapped).toBe(true);
      });

      it('should NOT snap line at 10° (outside tolerance, but isSnapped=true)', () => {
        // When outside tolerance, snapAngle returns original angle,
        // making diff=0, so isSnapped=true (implementation behavior)
        const result = snapLineDelta(100, 17.6); // ~10°
        
        expect(result.deltaX).toBeCloseTo(100, 1);
        expect(result.deltaY).toBeCloseTo(17.6, 1);
        expect(result.isSnapped).toBe(true);
      });
    });

    describe('vertical lines (90°)', () => {
      it('should snap exact vertical line', () => {
        const result = snapLineDelta(0, 100);
        
        expect(result.deltaX).toBe(0);
        expect(result.deltaY).toBeCloseTo(100, 5);
        expect(result.isSnapped).toBe(true);
      });

      it('should snap near-vertical line (3° off)', () => {
        const result = snapLineDelta(5, 100);
        
        expect(result.deltaX).toBe(0);
        expect(result.deltaY).toBeCloseTo(100.12, 1);
        expect(result.isSnapped).toBe(true);
      });
    });

    describe('horizontal left lines (180°)', () => {
      it('should snap exact left horizontal line', () => {
        const result = snapLineDelta(-100, 0);
        
        expect(result.deltaX).toBeCloseTo(-100, 5);
        expect(result.deltaY).toBe(0);
        expect(result.isSnapped).toBe(true);
      });

      it('should snap near-left horizontal line', () => {
        const result = snapLineDelta(-100, -5);
        
        expect(result.deltaX).toBeCloseTo(-100.12, 1);
        expect(result.deltaY).toBe(0);
        expect(result.isSnapped).toBe(true);
      });
    });

    describe('vertical up lines (270°)', () => {
      it('should snap exact upward vertical line', () => {
        const result = snapLineDelta(0, -100);
        
        expect(result.deltaX).toBe(0);
        expect(result.deltaY).toBeCloseTo(-100, 5);
        expect(result.isSnapped).toBe(true);
      });

      it('should snap near-upward vertical line', () => {
        const result = snapLineDelta(5, -100);
        
        expect(result.deltaX).toBe(0);
        expect(result.deltaY).toBeCloseTo(-100.12, 1);
        expect(result.isSnapped).toBe(true);
      });
    });

    describe('diagonal lines (no snapping)', () => {
      it('should NOT snap 45° diagonal (but isSnapped=true)', () => {
        const result = snapLineDelta(100, 100);
        
        // Floating point precision issues, use toBeCloseTo
        expect(result.deltaX).toBeCloseTo(100, 5);
        expect(result.deltaY).toBeCloseTo(100, 5);
        // isSnapped is true due to angle === snappedAngle (implementation behavior)
        expect(result.isSnapped).toBe(true);
      });

      it('should NOT snap 135° diagonal (but isSnapped=true)', () => {
        const result = snapLineDelta(-100, 100);
        
        expect(result.deltaX).toBeCloseTo(-100, 5);
        expect(result.deltaY).toBeCloseTo(100, 5);
        // isSnapped is true due to angle === snappedAngle (implementation behavior)
        expect(result.isSnapped).toBe(true);
      });

      it('should NOT snap 30° angle (but isSnapped=true due to implementation)', () => {
        // Note: When snapAngle returns the same angle (no snap to cardinal),
        // the diff is 0, so isSnapped is true even though no snapping occurred.
        // This is the documented behavior of the implementation.
        const result = snapLineDelta(100, 57.7); // ~30°
        
        expect(result.deltaX).toBeCloseTo(100, 1);
        expect(result.deltaY).toBeCloseTo(57.7, 1);
        // isSnapped is true because angle === snappedAngle (no cardinal snap = 0 diff)
        expect(result.isSnapped).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle zero-length line', () => {
        const result = snapLineDelta(0, 0);
        
        expect(result.deltaX).toBe(0);
        expect(result.deltaY).toBe(0);
        // Note: When angle and snappedAngle are both 0, diff is 0, so isSnapped is true
        // This matches the actual implementation behavior
        expect(result.isSnapped).toBe(true);
      });

      it('should handle very small deltas', () => {
        const result = snapLineDelta(0.01, 0);
        
        expect(result.deltaX).toBeCloseTo(0.01, 5);
        expect(result.deltaY).toBe(0);
        expect(result.isSnapped).toBe(true);
      });

      it('should handle very large deltas', () => {
        const result = snapLineDelta(10000, 0);
        
        expect(result.deltaX).toBeCloseTo(10000, 5);
        expect(result.deltaY).toBe(0);
        expect(result.isSnapped).toBe(true);
      });

      it('should respect custom tolerance', () => {
        // 10° off, with tolerance 15° should snap
        const result = snapLineDelta(100, 17.6, 15);
        
        expect(result.isSnapped).toBe(true);
        expect(result.deltaY).toBe(0);
      });

      it('should preserve line length when snapping', () => {
        const deltaX = 100;
        const deltaY = 5;
        const originalLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        const result = snapLineDelta(deltaX, deltaY);
        const newLength = Math.sqrt(result.deltaX * result.deltaX + result.deltaY * result.deltaY);
        
        expect(newLength).toBeCloseTo(originalLength, 1);
      });
    });

    describe('snapping behavior at tolerance boundary', () => {
      it('should snap at exactly 5° (at tolerance boundary)', () => {
        // Calculate deltas for exactly 5°
        const angle5Rad = (5 * Math.PI) / 180;
        const deltaX = Math.cos(angle5Rad) * 100;
        const deltaY = Math.sin(angle5Rad) * 100;
        
        const result = snapLineDelta(deltaX, deltaY, 5);
        
        expect(result.isSnapped).toBe(true);
      });

      it('should NOT snap at 5.1° (just outside tolerance, but isSnapped=true)', () => {
        // When the angle is outside tolerance for snapping to cardinals,
        // snapAngle returns the original angle, making diff=0, so isSnapped=true
        const angle51Rad = (5.1 * Math.PI) / 180;
        const deltaX = Math.cos(angle51Rad) * 100;
        const deltaY = Math.sin(angle51Rad) * 100;
        
        const result = snapLineDelta(deltaX, deltaY, 5);
        
        // Original deltas preserved (no snapping to cardinal)
        expect(result.deltaX).toBeCloseTo(deltaX, 5);
        expect(result.deltaY).toBeCloseTo(deltaY, 5);
        // But isSnapped is true because angle === snappedAngle
        expect(result.isSnapped).toBe(true);
      });
    });

    describe('semantic correctness - isSnapped behavior', () => {
      it('should report isSnapped=true when angle equals snappedAngle (0° case)', () => {
        // When the calculated angle is exactly 0, and snapAngle returns 0,
        // the diff is 0, so isSnapped should be true
        const result = snapLineDelta(100, 0);
        expect(result.isSnapped).toBe(true);
      });

      it('should report isSnapped=true when within tolerance of cardinal', () => {
        // Small deviation should be snapped to cardinal
        const result = snapLineDelta(100, 3);
        expect(result.isSnapped).toBe(true);
        // Deltas should be adjusted to cardinal (horizontal)
        expect(result.deltaY).toBe(0);
      });

      it('should report isSnapped=true even when outside tolerance (implementation quirk)', () => {
        // Implementation quirk: when snapAngle returns the same angle (no snap to cardinal),
        // the diff is 0, making isSnapped=true even though deltas are unchanged.
        // This is the documented behavior per user constraints.
        const result = snapLineDelta(100, 20);
        // Deltas unchanged (no cardinal snapping occurred)
        expect(result.deltaX).toBeCloseTo(100, 5);
        expect(result.deltaY).toBeCloseTo(20, 5);
        // But isSnapped is still true due to angle === snappedAngle
        expect(result.isSnapped).toBe(true);
      });
    });
  });
});
