import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useShapeSync } from './useShapeSync';
import * as firestore from 'firebase/firestore';

// Mock Firestore functions
vi.mock('firebase/firestore');

describe('useShapeSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock doc to return a mock document reference
    vi.mocked(firestore.doc).mockReturnValue({ id: 'mock-doc-ref' } as any);
    
    // Mock onSnapshot to immediately call callback with empty snapshot
    vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
      if (typeof onNext === 'function') {
        onNext({
          docs: [],
        } as any);
      }
      return vi.fn(); // Return unsubscribe function
    });
  });

  it('should initialize with empty shapes array', () => {
    const { result } = renderHook(() => useShapeSync());
    
    expect(result.current.shapes).toEqual([]);
  });

  it('should create a shape successfully', async () => {
    const mockSetDoc = vi.fn().mockResolvedValue(undefined);
    vi.mocked(firestore.setDoc).mockImplementation(mockSetDoc);
    
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await result.current.createShape({
      type: 'rectangle',
      x: 100,
      y: 200,
      width: 150,
      height: 100,
      fill: '#3498db',
      userId: 'test-user',
    });
    
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it('should update a shape position', async () => {
    const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
    vi.mocked(firestore.updateDoc).mockImplementation(mockUpdateDoc);
    
    // Mock snapshot with one shape
    vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
      if (typeof onNext === 'function') {
        onNext({
          docs: [{
            id: 'shape-1',
            data: () => ({
              id: 'shape-1',
              type: 'rectangle',
              x: 100,
              y: 200,
              width: 150,
              height: 100,
              fill: '#3498db',
              userId: 'test-user',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          }],
        } as any);
      }
      return vi.fn();
    });
    
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.shapes.length).toBe(1);
    });
    
    await result.current.updateShape('shape-1', { x: 150, y: 250 });
    
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ x: 150, y: 250 })
    );
  });

  it('should delete a shape', async () => {
    const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
    vi.mocked(firestore.deleteDoc).mockImplementation(mockDeleteDoc);
    
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await result.current.deleteShape('shape-1');
    
    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it('should lock and unlock shapes', async () => {
    const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
    vi.mocked(firestore.updateDoc).mockImplementation(mockUpdateDoc);
    
    // Mock snapshot with one shape
    vi.mocked(firestore.onSnapshot).mockImplementation((ref, onNext) => {
      if (typeof onNext === 'function') {
        onNext({
          docs: [{
            id: 'shape-1',
            data: () => ({
              id: 'shape-1',
              type: 'rectangle',
              x: 100,
              y: 200,
              width: 150,
              height: 100,
              fill: '#3498db',
              userId: 'test-user',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }),
          }],
        } as any);
      }
      return vi.fn();
    });
    
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    // Lock
    await result.current.lockShape('shape-1', 'user-id');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isLocked: true, lockedBy: 'user-id' })
    );
    
    // Unlock
    await result.current.unlockShape('shape-1');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isLocked: false, lockedBy: null })
    );
  });

  it('should handle errors gracefully', async () => {
    const mockError = new Error('Firestore error');
    vi.mocked(firestore.setDoc).mockRejectedValue(mockError);
    
    const { result } = renderHook(() => useShapeSync());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    
    await expect(result.current.createShape({
      type: 'rectangle',
      x: 100,
      y: 200,
      width: 150,
      height: 100,
      fill: '#3498db',
      userId: 'test-user',
    })).rejects.toThrow('Firestore error');
    
    await waitFor(() => {
      expect(result.current.error).toBe('Firestore error');
    });
  });
});



