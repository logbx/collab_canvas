import { useEffect, useState, useCallback, useRef } from 'react';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import { rtdb } from '../firebase';
import type { CursorPosition, CursorsState } from '../types/cursor.types';
import { throttle } from '../utils/colorUtils';

const CANVAS_ID = 'global-canvas-v1';
const CURSOR_UPDATE_THROTTLE_MS = 16; // 60fps max

interface UseCursorSyncReturn {
  cursors: CursorsState;
  updateCursor: (x: number, y: number) => void;
  removeCursor: () => void;
}

export function useCursorSync(
  userId: string | null,
  userName: string,
  userColor: string
): UseCursorSyncReturn {
  const [cursors, setCursors] = useState<CursorsState>({});
  const cursorRef = useRef<ReturnType<typeof ref> | null>(null);
  const disconnectHandlerSet = useRef(false);

  // Setup cursor sync and auto-cleanup on disconnect
  useEffect(() => {
    if (!userId) {
      console.log('[useCursorSync] No userId, skipping cursor sync setup');
      return;
    }

    console.log(`[useCursorSync] Setting up cursor sync for user ${userId}`);

    // Reference to this user's cursor
    const userCursorRef = ref(rtdb, `cursors/${CANVAS_ID}/${userId}`);
    cursorRef.current = userCursorRef;

    // Setup auto-cleanup when user disconnects
    if (!disconnectHandlerSet.current) {
      const disconnectRef = onDisconnect(userCursorRef);
      disconnectRef.remove().then(() => {
        console.log(`[useCursorSync] Auto-cleanup registered for user ${userId}`);
        disconnectHandlerSet.current = true;
      }).catch((err) => {
        console.error('[useCursorSync] Error setting up disconnect handler:', err);
      });
    }

    // Listen to all cursors in this canvas
    const allCursorsRef = ref(rtdb, `cursors/${CANVAS_ID}`);
    const unsubscribe = onValue(allCursorsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as CursorsState;
        // Filter out current user's cursor (we don't need to see our own)
        const otherCursors: CursorsState = {};
        Object.entries(data).forEach(([id, cursor]) => {
          if (id !== userId) {
            otherCursors[id] = cursor;
          }
        });
        console.log(`[useCursorSync] Received ${Object.keys(otherCursors).length} other cursors`);
        setCursors(otherCursors);
      } else {
        console.log('[useCursorSync] No cursors in canvas');
        setCursors({});
      }
    }, (error) => {
      console.error('[useCursorSync] Error listening to cursors:', error);
    });

    // Cleanup on unmount
    return () => {
      console.log(`[useCursorSync] Cleaning up cursor sync for user ${userId}`);
      unsubscribe();
      
      // Remove cursor on cleanup
      if (cursorRef.current) {
        set(cursorRef.current, null).catch((err) => {
          console.error('[useCursorSync] Error removing cursor on cleanup:', err);
        });
      }
    };
  }, [userId]);

  // Throttled cursor update function
  // Create throttled function outside useCallback to avoid type conflicts
  const throttledCursorUpdate = throttle((x: number, y: number) => {
    if (!cursorRef.current || !userId) {
      return;
    }

    const cursorData: CursorPosition = {
      x,
      y,
      userId,
      userName,
      color: userColor,
      timestamp: Date.now(),
    };

    set(cursorRef.current, cursorData).catch((err) => {
      console.error('[useCursorSync] Error updating cursor:', err);
    });
  }, CURSOR_UPDATE_THROTTLE_MS);

  const updateCursor = useCallback(
    (x: number, y: number) => {
      throttledCursorUpdate(x, y);
    },
    [userId, userName, userColor]
  );

  // Remove cursor manually (called on unmount or user action)
  const removeCursor = useCallback(() => {
    if (!cursorRef.current) {
      return;
    }

    console.log(`[useCursorSync] Manually removing cursor for user ${userId}`);
    set(cursorRef.current, null).catch((err) => {
      console.error('[useCursorSync] Error removing cursor:', err);
    });
  }, [userId]);

  return {
    cursors,
    updateCursor,
    removeCursor,
  };
}

