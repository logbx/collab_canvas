import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useShapeSync } from './useShapeSync';
import * as firestore from 'firebase/firestore';

// Mock Firestore
vi.mock('firebase/firestore');

describe('useShapeSync - Concurrent Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful operations
    vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
    vi.mocked(firestore.updateDoc).mockResolvedValue(undefined);
    vi.mocked(firestore.deleteDoc).mockResolvedValue(undefined);
    vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
      if (typeof onNext === 'function') {
        onNext({ docs: [] } as firestore.QuerySnapshot);
      }
      return vi.fn();
    });
  });

  it('should handle multiple users creating different shapes without conflicts', async () => {
    // Simulate User A's hook
    const { result: userA } = renderHook(() => useShapeSync());
    
    // Simulate User B's hook
    const { result: userB } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(userA.current.loading).toBe(false);
      expect(userB.current.loading).toBe(false);
    });
    
    // User A creates shape 1
    const createA = userA.current.createShape({
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 150,
      height: 100,
      fill: '#3498db',
      userId: 'user-a',
    });
    
    // User B creates shape 2 simultaneously
    const createB = userB.current.createShape({
      type: 'rectangle',
      x: 200,
      y: 200,
      width: 150,
      height: 100,
      fill: '#e74c3c',
      userId: 'user-b',
    });
    
    // Both operations should succeed without conflicts
    await Promise.all([createA, createB]);
    
    expect(userA.current.error).toBeNull();
    expect(userB.current.error).toBeNull();
  });

  it('should handle rapid updates to different shapes concurrently', async () => {
    const { result: userA } = renderHook(() => useShapeSync());
    const { result: userB } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(userA.current.loading).toBe(false);
      expect(userB.current.loading).toBe(false);
    });
    
    // Rapid fire updates to different shapes by different users
    const updates = [
      userA.current.updateShape('shape-1', { x: 10, y: 10 }),
      userB.current.updateShape('shape-2', { x: 20, y: 20 }),
      userA.current.updateShape('shape-3', { x: 30, y: 30 }),
      userB.current.updateShape('shape-4', { x: 40, y: 40 }),
    ];
    
    await Promise.all(updates);
    
    // All updates should complete without errors (no transaction conflicts!)
    expect(userA.current.error).toBeNull();
    expect(userB.current.error).toBeNull();
  });

  it('should handle rapid updates to the same shape (last-write-wins)', async () => {
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    // Rapid fire 10 position updates to the same shape
    const updates = Array.from({ length: 10 }, (_, i) => 
      result.current.updateShape('shape-1', { x: i * 10, y: i * 10 })
    );
    
    await Promise.all(updates);
    
    // All updates should complete without errors
    // With individual docs, no transaction conflicts occur!
    expect(result.current.error).toBeNull();
  });

  it('should handle concurrent create, update, and delete operations', async () => {
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    // Mix of operations
    const operations = [
      result.current.createShape({
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 150,
        height: 100,
        fill: '#3498db',
        userId: 'user-1',
      }),
      result.current.updateShape('shape-1', { x: 100, y: 100 }),
      result.current.deleteShape('shape-2'),
      result.current.updateShape('shape-3', { fill: '#e74c3c' }),
    ];
    
    await Promise.all(operations);
    
    // All operations should succeed
    expect(result.current.error).toBeNull();
  });
});



