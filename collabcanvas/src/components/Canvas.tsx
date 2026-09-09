import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Line as KonvaLine, Transformer, Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { useAuth } from '../contexts/AuthContext';
import { useShapeSync } from '../hooks/useShapeSync';
import { useCursorSync } from '../hooks/useCursorSync';
import { usePresence } from '../hooks/usePresence';
import { useHistory } from '../hooks/useHistory';
import { getUserCursorColor } from '../utils/colorUtils';
import { snapLineDelta } from '../utils/canvasHelpers';
import Rectangle from './Rectangle';
import Circle from './Circle';
import TextBox from './TextBox';
import LineShape from './Line';
import Cursor from './Cursor';
import LeftSidebar from './LeftSidebar';
import UserMenu from './UI/UserMenu';
import Toast from './UI/Toast';
import AIChatWindow from './AI/AIChatWindow';
import { BulkConfirmationModal } from './AI/BulkConfirmationModal';
import ShapeStylePanel from './UI/ShapeStylePanel';
import KeyboardShortcuts from './UI/KeyboardShortcuts';
import SelectionIndicator from './UI/SelectionIndicator';
import ContextMenu from './UI/ContextMenu';
import ExportModal from './UI/ExportModal';
import { errorLogger } from '../utils/errorLogger';
import { processAICommand, AI_ENABLED, type AIChatMessage } from '../services/aiService';
import type { CanvasOperations } from '../services/aiExecutor';
import type { Shape, ShapeType } from '../types/shape.types';

export default function Canvas() {
  const { user } = useAuth();
  const { shapes, loading, error, createShape: createShapeFirestore, createShapesBatch, updateShape: updateShapeFirestore, deleteShape: deleteShapeFirestore, lockShape } = useShapeSync();
  const { canUndo, canRedo, undo, redo, recordCreate, recordUpdate, recordDelete } = useHistory();
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // Support multiple selections
  const [cursorMode, setCursorMode] = useState<'pan' | 'select'>('pan'); // Pan or select mode
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null); // Box selection
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const isProcessingTransformEnd = useRef(false); // Prevent recursive transform end calls
  
  // Track live position/size during drag/transform for dimension badge
  const [liveShapeProps, setLiveShapeProps] = useState<{ id: string; x: number; y: number; width: number; height: number; rotation: number } | null>(null);
  
  // Track box selection drag
  const boxSelectionStart = useRef<{ x: number; y: number } | null>(null);
  const justCompletedBoxSelection = useRef(false);
  
  // Backward compatibility: selectedId for components that expect single selection
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : (selectedIds.length > 0 ? selectedIds[0] : null);
  const setSelectedId = (id: string | null) => {
    if (id === null) {
      setSelectedIds([]);
    } else {
      setSelectedIds([id]);
    }
  };
  
  // Shape creation state
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [placementType, setPlacementType] = useState<'rectangle' | 'circle' | 'text' | 'line' | null>(null);
  const [isDraggingCreate, setIsDraggingCreate] = useState(false);
  const [isDraggingShape, setIsDraggingShape] = useState(false); // Track if user is dragging a shape
  const [previewShape, setPreviewShape] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isMouseDown = useRef(false);
  
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' | 'warning' } | null>(null);
  
  const showToast = useCallback((message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    setToast({ message, type });
  }, []);

  // Text editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AI command processing state
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<AIChatMessage[]>([]);

  // Bulk creation confirmation modal state
  const [bulkConfirmation, setBulkConfirmation] = useState<{
    count: number;
    command: string;
  } | null>(null);

  // Keyboard shortcuts modal state
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Context menu (right-click) state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; shapeId: string } | null>(null);

  // Clipboard state for copy/paste
  const [clipboard, setClipboard] = useState<Shape[]>([]);

  // Cursor sync for multiplayer
  const userColor = user ? getUserCursorColor(user.uid) : '#000000';
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Anonymous';
  const { cursors, updateCursor, removeCursor } = useCursorSync(
    user?.uid || null,
    userName,
    userColor
  );

  // Presence tracking for user online/offline status
  const { presence, updateActivity } = usePresence(user?.uid || null, userName);

  // Get window dimensions
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // FPS Counter (Always enabled for performance monitoring)
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;
    const countFrames = () => {
      frameCount++;
      const now = performance.now();
      if (now >= lastTime + 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }
      animationFrameId = requestAnimationFrame(countFrames);
    };
    animationFrameId = requestAnimationFrame(countFrames);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Handle zoom with mouse wheel
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    
    if (!pointer) return;

    // Calculate new scale
    const scaleBy = 1.05;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    
    // Clamp scale between 0.5 and 2
    const clampedScale = Math.min(Math.max(newScale, 0.5), 2);
    
    // Calculate new position to zoom to cursor
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    console.log(`[ZOOM] Scale: ${oldScale.toFixed(2)} → ${clampedScale.toFixed(2)}, Stage Pos: (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)})`);
    
    setStageScale(clampedScale);
    setStagePos(newPos);
  };

  // Handle pan state updates
  const handleStageDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    // CRITICAL: Only process Stage drags, silently ignore shape drags
    // Check if the drag target is NOT the Stage itself (it's a shape)
    if (e.target !== e.currentTarget) {
      console.log(`[STAGE DRAG START] ⚠️ BLOCKED - drag target is a shape, not the stage (ignoring silently)`);
      // DO NOT call stopDrag() - it interrupts the shape's drag!
      // Just return and let all Stage drag handlers ignore this drag
      return;
    }
    
    console.log(`[STAGE DRAG START] Position: (${stagePos.x.toFixed(2)}, ${stagePos.y.toFixed(2)}), Scale: ${stageScale.toFixed(2)}`);
  };

  const handleStageDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Extra safety: Ensure we're only tracking Stage drags, not shape drags
    if (e.target !== e.currentTarget) {
      return;
    }
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[STAGE DRAGGING] Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
  };

  const handleStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    // Extra safety: Ensure we're only handling Stage drag end, not shape drag end
    if (e.target !== e.currentTarget) {
      console.log(`[STAGE DRAG END] ⚠️ BLOCKED - this was a shape drag, not stage drag`);
      return;
    }
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[STAGE DRAG END] Final Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    setStagePos({
      x: newX,
      y: newY,
    });
  };

  // ===== HISTORY-AWARE SHAPE OPERATIONS =====
  // Wrapper functions that record history and then call Firestore operations

  const createShape = useCallback(async (shapeData: Omit<Shape, 'id' | 'createdAt' | 'updatedAt'>) => {
    // Create shape in Firestore (which returns the full shape via optimistic update)
    await createShapeFirestore(shapeData);
    
    // Find the newly created shape in the shapes array (it will have been added optimistically)
    // We need to wait a tiny bit for the optimistic update to reflect in shapes
    setTimeout(() => {
      const newShape = shapes.find(s => 
        s.x === shapeData.x && 
        s.y === shapeData.y && 
        s.type === shapeData.type &&
        s.userId === shapeData.userId
      );
      if (newShape) {
        recordCreate(newShape);
      }
    }, 50);
  }, [createShapeFirestore, shapes, recordCreate]);

  const updateShape = useCallback(async (id: string, updates: Partial<Shape>) => {
    // Find the shape before update
    const beforeShape = shapes.find(s => s.id === id);
    if (!beforeShape) {
      console.warn(`[updateShape] Shape ${id} not found for history recording`);
      await updateShapeFirestore(id, updates);
      return;
    }

    // Update shape in Firestore
    await updateShapeFirestore(id, updates);

    // Record history with before and after states
    const afterShape = { ...beforeShape, ...updates, updatedAt: Date.now() };
    recordUpdate(beforeShape, afterShape);
  }, [shapes, updateShapeFirestore, recordUpdate]);

  const deleteShape = useCallback(async (id: string) => {
    // Find the shape before deletion
    const shapeToDelete = shapes.find(s => s.id === id);
    if (!shapeToDelete) {
      console.warn(`[deleteShape] Shape ${id} not found for history recording`);
      await deleteShapeFirestore(id);
      return;
    }

    // Record deletion before actually deleting
    recordDelete(shapeToDelete);

    // Delete shape from Firestore
    await deleteShapeFirestore(id);
  }, [shapes, deleteShapeFirestore, recordDelete]);

  // Undo the last operation
  const handleUndo = useCallback(async () => {
    if (!canUndo) return;

    const entry = undo();
    if (!entry) return;

    console.log('[UNDO] Undoing operation:', entry.type, entry.shapeId);

    try {
      if (entry.type === 'create') {
        // Undo create = delete the shape
        await deleteShapeFirestore(entry.shapeId);
      } else if (entry.type === 'update') {
        // Undo update = restore previous state
        if (entry.before) {
          await updateShapeFirestore(entry.shapeId, entry.before);
        }
      } else if (entry.type === 'delete') {
        // Undo delete = recreate the shape
        if (entry.before) {
          await createShapeFirestore(entry.before);
        }
      }
    } catch (err) {
      console.error('[UNDO] Error:', err);
    }
  }, [canUndo, undo, createShapeFirestore, updateShapeFirestore, deleteShapeFirestore]);

  // Redo the last undone operation
  const handleRedo = useCallback(async () => {
    if (!canRedo) return;

    const entry = redo();
    if (!entry) return;

    console.log('[REDO] Redoing operation:', entry.type, entry.shapeId);

    try {
      if (entry.type === 'create') {
        // Redo create = recreate the shape
        if (entry.after) {
          await createShapeFirestore(entry.after);
        }
      } else if (entry.type === 'update') {
        // Redo update = apply the new state
        if (entry.after) {
          await updateShapeFirestore(entry.shapeId, entry.after);
        }
      } else if (entry.type === 'delete') {
        // Redo delete = delete the shape again
        await deleteShapeFirestore(entry.shapeId);
      }
    } catch (err) {
      console.error('[REDO] Error:', err);
    }
  }, [canRedo, redo, createShapeFirestore, updateShapeFirestore, deleteShapeFirestore]);

  // ===== END HISTORY-AWARE OPERATIONS =====

  // Shape management functions
  // Note: Legacy createShape function - shape creation is now handled
  // directly in drag-create and click-create handlers

  // Handle shape drag start (lock the shape)
  const handleShapeDragStart = async (id: string) => {
    if (!user) return;
    console.log(`[handleShapeDragStart] Locking shape ${id}`);
    
    // CRITICAL: Immediately disable Stage dragging SYNCHRONOUSLY
    if (stageRef.current) {
      stageRef.current.draggable(false);
      console.log(`[handleShapeDragStart] 🔒 Stage dragging DISABLED synchronously`);
    }
    
    setIsDraggingShape(true); // Also update state for React re-render
    
    // Initialize live tracking with current position
    const shape = shapes.find(s => s.id === id);
    if (shape) {
      setLiveShapeProps({
        id: shape.id,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation || 0,
      });
    }
    
    try {
      await lockShape(id, user.uid);
    } catch (err) {
      console.error('[handleShapeDragStart] Error locking shape:', err);
      errorLogger.logError('Failed to lock shape', err instanceof Error ? err : new Error(String(err)), { shapeId: id, userId: user.uid });
    }
  };

  // Throttled position sync during drag - ref to track last sync time
  const lastDragSyncTime = useRef<number>(0);
  const DRAG_SYNC_THROTTLE_MS = 100; // Sync position every 100ms during drag

  // Handle shape drag move (update live position for dimension badge + real-time sync)
  const handleShapeDragMove = useCallback((id: string, x: number, y: number) => {
    const shape = shapes.find(s => s.id === id);
    if (shape && liveShapeProps && liveShapeProps.id === id) {
      setLiveShapeProps({
        ...liveShapeProps,
        x,
        y,
      });
    }

    // Update cursor position during shape drag (so others can see it moving)
    // The shape center is a good approximation of cursor position during drag
    const cursorX = x + (shape?.width || 0) / 2;
    const cursorY = y + (shape?.height || 0) / 2;
    updateCursor(cursorX, cursorY);

    // Real-time position sync during drag (throttled to avoid excessive writes)
    const now = Date.now();
    if (now - lastDragSyncTime.current >= DRAG_SYNC_THROTTLE_MS) {
      lastDragSyncTime.current = now;
      
      // Update position in Firestore (async, non-blocking)
      updateShape(id, { x, y }).catch(err => {
        // Silently fail - final position will sync on drag end
        console.debug('[handleShapeDragMove] Position sync failed (will retry on drag end):', err);
      });
    }
  }, [shapes, liveShapeProps, updateShape, updateCursor]);

  // Handle shape drag end (update position and unlock in ONE write - optimization!)
  const handleShapeDragEnd = async (id: string, x: number, y: number) => {
    console.log(`[handleShapeDragEnd] Updating position and unlocking shape ${id}`);
    
    // CRITICAL: Re-enable Stage dragging SYNCHRONOUSLY
    if (stageRef.current) {
      stageRef.current.draggable(true);
      console.log(`[handleShapeDragEnd] 🔓 Stage dragging RE-ENABLED synchronously`);
    }
    
    setIsDraggingShape(false); // Also update state for React re-render
    setLiveShapeProps(null); // Clear live tracking
    
    // Check if shape still exists before trying to update
    const shapeExists = shapes.find(s => s.id === id);
    if (!shapeExists) {
      console.warn(`[handleShapeDragEnd] Shape ${id} no longer exists - may have been deleted during drag`);
      return;
    }
    
    try {
      // Combine position update and unlock into single Firestore write
      // This reduces writes from 3 per drag (lock + update + unlock) to 2 (lock + update+unlock)
      await updateShape(id, {
        x,
        y,
        isLocked: false,
        lockedBy: undefined,
      });
    } catch (err) {
      console.error('[handleShapeDragEnd] Error:', err);
      // Don't show toast for update errors - they're handled gracefully in useShapeSync
      // Just log for debugging
      const errorCode = (err as { code?: string }).code;
      if (errorCode !== 'not-found') {
        errorLogger.logError('Failed to update shape position', err, { 
          shapeId: id,
          position: { x, y }
        });
      }
    }
  };

  // Handle line endpoint dragging (Figma-style)
  const handleLineEndpointDrag = async (id: string, newWidth: number, newHeight: number, newX: number, newY: number) => {
    console.log(`[handleLineEndpointDrag] Line ${id}: dimensions (${newWidth.toFixed(1)}, ${newHeight.toFixed(1)}), position (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
    
    try {
      // Update line dimensions and position in real-time
      await updateShape(id, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
        rotation: 0, // Always reset rotation when using endpoint editing
      });
    } catch (err) {
      console.error('[handleLineEndpointDrag] Error updating line endpoints:', err);
      errorLogger.logError('Failed to update line endpoints', err instanceof Error ? err : new Error(String(err)), {
        shapeId: id,
        newWidth,
        newHeight,
        newX,
        newY,
      });
    }
  };

  // Handle transform end (resize/rotate) - sync to Firestore
  // Handle transform (resize/rotate) start
  const handleTransformStart = useCallback((e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const id = node.id();
    if (!id) return;

    const shape = shapes.find(s => s.id === id);
    if (shape) {
      setLiveShapeProps({
        id: shape.id,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation || 0,
      });
    }
  }, [shapes]);

  // Handle transform move (update live dimensions for badge)
  const handleTransform = useCallback((e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const id = node.id();
    if (!id || !liveShapeProps || liveShapeProps.id !== id) return;

    const shape = shapes.find(s => s.id === id);
    
    // For lines: apply real-time rotation snapping for visual feedback
    if (shape && shape.type === 'line') {
      let rotation = node.rotation();
      
      // Normalize rotation to 0-360 range
      let normalizedRotation = rotation % 360;
      if (normalizedRotation < 0) normalizedRotation += 360;
      
      console.log(`[handleTransform] Line rotation: ${rotation.toFixed(1)}° (normalized: ${normalizedRotation.toFixed(1)}°)`);
      
      // Check if within 5° of cardinal directions (more forgiving during transform)
      const cardinals = [0, 90, 180, 270];
      const tolerance = 5; // Wider tolerance during transform for better UX
      
      for (const cardinal of cardinals) {
        const diff = Math.abs(normalizedRotation - cardinal);
        if (diff <= tolerance || diff >= (360 - tolerance)) {
          const snappedRotation = cardinal % 360;
          node.rotation(snappedRotation);
          rotation = snappedRotation;
          console.log(`[handleTransform] ✅ SNAPPED: ${normalizedRotation.toFixed(1)}° → ${snappedRotation}°`);
          break;
        }
      }
    }

    // Calculate live dimensions including scale
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = node.width() * Math.abs(scaleX);
    const height = node.height() * Math.abs(scaleY);

    // Update live props for dimension badge
    setLiveShapeProps({
      id: liveShapeProps.id,
      x: node.x(),
      y: node.y(),
      width: Math.max(20, width),
      height: Math.max(20, height),
      rotation: node.rotation(),
    });

    // Force layer redraw to eliminate visual lag
    node.getLayer()?.batchDraw();
  }, [liveShapeProps, shapes]);

  const handleTransformEnd = useCallback(async (e: Konva.KonvaEventObject<Event>) => {
    // Prevent recursive calls from Transformer updates
    if (isProcessingTransformEnd.current) {
      console.log('[handleTransformEnd] Skipping recursive call');
      return;
    }
    isProcessingTransformEnd.current = true;

    // CRITICAL: Re-enable Stage dragging immediately after transform ends
    if (stageRef.current) {
      stageRef.current.draggable(true);
      console.log(`[handleTransformEnd] 🔓 Stage dragging RE-ENABLED`);
    }

    const node = e.target;
    const id = node.id();
    
    if (!id || !user) {
      isProcessingTransformEnd.current = false;
      return;
    }

    const shape = shapes.find(s => s.id === id);
    if (!shape) {
      console.warn(`[handleTransformEnd] Shape ${id} not found`);
      setLiveShapeProps(null); // Clear live tracking
      isProcessingTransformEnd.current = false;
      return;
    }

    // Get the transform attributes
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    let rotation = node.rotation();

    // For lines: apply rotation snapping to cardinal directions
    // When snapping, recalculate width/height to represent the snapped direction directly
    let snappedLineWidth = null;
    let snappedLineHeight = null;
    if (shape.type === 'line') {
      // Normalize rotation to 0-360 range
      let normalizedRotation = rotation % 360;
      if (normalizedRotation < 0) normalizedRotation += 360;
      
      // Check if within 5° of cardinal directions
      const cardinals = [0, 90, 180, 270];
      const tolerance = 5; // Matches real-time snapping tolerance
      
      for (const cardinal of cardinals) {
        const diff = Math.abs(normalizedRotation - cardinal);
        if (diff <= tolerance || diff >= (360 - tolerance)) {
          // Get the current line length
          const currentLength = Math.sqrt(shape.width * shape.width + shape.height * shape.height);
          
          // Recalculate width/height deltas based on snapped direction
          // Reset rotation to 0 and encode direction in the deltas
          const snappedRotation = cardinal % 360;
          const radians = (snappedRotation * Math.PI) / 180;
          
          // Calculate new deltas based on snapped angle
          snappedLineWidth = Math.cos(radians) * currentLength;
          snappedLineHeight = Math.sin(radians) * currentLength;
          
          // For cardinal directions, enforce exact 0 or full length
          if (snappedRotation === 0) {
            snappedLineWidth = currentLength;
            snappedLineHeight = 0;
          } else if (snappedRotation === 90) {
            snappedLineWidth = 0;
            snappedLineHeight = currentLength;
          } else if (snappedRotation === 180) {
            snappedLineWidth = -currentLength;
            snappedLineHeight = 0;
          } else if (snappedRotation === 270) {
            snappedLineWidth = 0;
            snappedLineHeight = -currentLength;
          }
          
          // Reset rotation to 0 since direction is now encoded in deltas
          rotation = 0;
          node.rotation(0);
          
          console.log(`[handleTransformEnd] Line snapped: ${normalizedRotation.toFixed(1)}° → ${snappedRotation}°, dimensions: ${Math.abs(Math.round(snappedLineWidth))} × ${Math.abs(Math.round(snappedLineHeight))}`);
          break;
        }
      }
    }

    // Calculate the actual dimensions after transformation
    const transformedWidth = node.width() * scaleX;
    const transformedHeight = node.height() * scaleY;
    
    const MIN_SIZE = 20;

    // Check if dimensions actually changed (not just rotation)
    // Use a small threshold (0.5px) to catch even tiny resizes, especially when expanding from minimum size
    const dimensionsChanged = Math.abs(transformedWidth - shape.width) > 0.5 || Math.abs(transformedHeight - shape.height) > 0.5;
    
    // Special case: if trying to shrink when already at minimum, don't treat as resize
    // Only flag as shrinking below minimum if BOTH dimensions are at/below minimum AND getting smaller
    const currentAtMinimum = shape.width <= MIN_SIZE && shape.height <= MIN_SIZE;
    const transformedAtMinimum = transformedWidth <= MIN_SIZE && transformedHeight <= MIN_SIZE;
    const isGettingSmaller = transformedWidth < shape.width || transformedHeight < shape.height;
    const isShrinkingBelowMinimum = currentAtMinimum && transformedAtMinimum && isGettingSmaller;
    
    const wasResized = dimensionsChanged && !isShrinkingBelowMinimum;
    
    let newWidth = shape.width;
    let newHeight = shape.height;

    if (wasResized) {
      // Apply minimum size of 20px to prevent tiny shapes
      newWidth = Math.max(MIN_SIZE, transformedWidth);
      newHeight = Math.max(MIN_SIZE, transformedHeight);

      console.log(`[handleTransformEnd] Shape ${id} resized: ${Math.round(newWidth)}x${Math.round(newHeight)}, rotation: ${Math.round(rotation)}°`);
      console.log(`  ↳ Transform: ${shape.width.toFixed(1)}x${shape.height.toFixed(1)} → ${transformedWidth.toFixed(1)}x${transformedHeight.toFixed(1)}`);
      console.log(`  ↳ Scale: ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}, node: ${node.width()}x${node.height()}`);
    } else {
      // Just rotating or negligible size change, keep original dimensions
      if (dimensionsChanged) {
        console.log(`[handleTransformEnd] Shape ${id} - resize ignored (shrinking below minimum)`, {
          current: `${shape.width}x${shape.height}`,
          transformed: `${transformedWidth.toFixed(1)}x${transformedHeight.toFixed(1)}`,
          currentAtMinimum,
          transformedAtMinimum,
          isGettingSmaller,
          isShrinkingBelowMinimum
        });
      } else {
        console.log(`[handleTransformEnd] Shape ${id} rotated: ${Math.round(rotation)}°`);
      }
    }
    
    // For lines that snapped to cardinal directions, use the recalculated dimensions
    if (snappedLineWidth !== null && snappedLineHeight !== null) {
      newWidth = snappedLineWidth;
      newHeight = snappedLineHeight;
      console.log(`[handleTransformEnd] Applying snapped line dimensions: ${Math.abs(Math.round(newWidth))} × ${Math.abs(Math.round(newHeight))}`);
    }
    
    // Always reset scale to 1 and apply dimensions to node (prevents visual jumps)
    node.scaleX(1);
    node.scaleY(1);
    
    // For lines, the Group needs absolute dimensions for proper bounding box
    if (shape.type === 'line') {
      node.width(Math.abs(newWidth));
      node.height(Math.abs(newHeight));
    } else {
    node.width(newWidth);
    node.height(newHeight);
    }

    // Force Transformer to immediately update by triggering a clean reattachment
    // Temporarily clear and reset selectedId to trigger the useEffect that attaches the transformer
    const currentSelectedId = selectedId;
    setSelectedId(null);
    // Use setTimeout with 0 to let React process the null state before resetting
    setTimeout(() => {
      setSelectedId(currentSelectedId);
      isProcessingTransformEnd.current = false; // Reset flag after reattachment
    }, 0);

    try {
      // Update shape with new dimensions and rotation
      await updateShape(id, {
        x: node.x(),
        y: node.y(),
        width: newWidth,
        height: newHeight,
        rotation: rotation,
      });

      // Resize notification removed per user request
      // if (wasResized) {
      //   showToast(`Resized to ${Math.round(newWidth)}×${Math.round(newHeight)}`, 'success');
      // }
    } catch (err) {
      console.error('[handleTransformEnd] Error updating shape:', err);
      errorLogger.logError('Failed to update shape transformation', err instanceof Error ? err : new Error(String(err)), {
        shapeId: id,
        newWidth,
        newHeight,
        rotation,
      });
      showToast('Failed to update shape', 'error');
    } finally {
      setLiveShapeProps(null); // Clear live tracking
      // Note: isProcessingTransformEnd flag is reset in setTimeout after reattachment
    }
  }, [user, shapes, updateShape, showToast, selectedId]);

  const selectShape = (id: string, multiSelect: boolean = false) => {
    if (multiSelect) {
      // Shift-click: toggle selection
      setSelectedIds(prev => {
        if (prev.includes(id)) {
          // Remove from selection
          return prev.filter(selectedId => selectedId !== id);
        } else {
          // Add to selection
          return [...prev, id];
        }
      });
    } else {
      // Regular click: single selection
      setSelectedIds([id]);
    }
  };

  const deselectShape = () => {
    setSelectedIds([]);
  };
  
  const selectMultipleShapes = (ids: string[]) => {
    setSelectedIds(ids);
  };

  // Attach transformer to selected shape(s)
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) {
      console.log('[Transformer Attach] No transformer ref');
      return;
    }

    if (selectedIds.length > 0) {
      console.log(`[Transformer Attach] Attaching to ${selectedIds.length} shape(s):`, selectedIds);
      
      // Get nodes for all selected shapes
      const nodes = selectedIds
        .map(id => {
          const node = shapeRefs.current.get(id);
          if (!node) {
            console.warn(`[Transformer Attach] Node not found for shape ${id}`);
          }
          return node;
        })
        .filter((node): node is Konva.Node => node !== undefined);
      
      console.log(`[Transformer Attach] Found ${nodes.length} valid nodes`);
      
      if (nodes.length > 0) {
        transformer.nodes(nodes);
        transformer.getLayer()?.batchDraw();
        console.log('[Transformer Attach] Transformer attached and layer redrawn');
      } else {
        console.warn('[Transformer Attach] No valid nodes found for selected shapes');
      }
    } else {
      console.log('[Transformer Attach] No shapes selected, clearing transformer');
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      
      // Force cursor reset when deselecting - clear any inline cursor styles set by Konva
      if (stageRef.current) {
        const container = stageRef.current.container();
        if (container) {
          container.style.cursor = '';
          console.log('[Transformer Attach] Cursor style cleared on deselect');
        }
      }
    }
  }, [selectedIds]);

  // Handle starting text edit
  const handleStartTextEdit = useCallback((id: string) => {
    // Use a small delay to ensure Firestore has synced the shape
    setTimeout(() => {
      const shape = shapes.find(s => s.id === id);
      if (shape && shape.type === 'text') {
        console.log(`[handleStartTextEdit] Starting edit for shape ${id}, text: "${shape.text}"`);
        setEditingTextId(id);
        setEditingText(shape.text || 'Text');
      }
    }, 50);
  }, [shapes]);

  // Handle saving text changes with auto-width adjustment
  const handleSaveTextEdit = useCallback(async () => {
    if (!editingTextId) return;
    
    const shape = shapes.find(s => s.id === editingTextId);
    if (!shape) return;
    
    console.log(`[handleSaveTextEdit] Saving text for shape ${editingTextId}: "${editingText}"`);
    
    // Calculate new width based on text content
    const fontSize = Math.max(12, shape.height * 0.8);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = `${fontSize}px Arial, sans-serif`;
      const metrics = context.measureText(editingText || 'Text');
      const newWidth = Math.max(50, metrics.width + 20); // Add padding, minimum 50px
      
      try {
        // Update both text and width
        await updateShape(editingTextId, { 
          text: editingText,
          width: newWidth 
        });
        setEditingTextId(null);
        setEditingText('');
      } catch (err) {
        console.error('[handleSaveTextEdit] Error updating text:', err);
        errorLogger.logError('Failed to update text', err instanceof Error ? err : new Error(String(err)), { shapeId: editingTextId });
        showToast('Failed to update text', 'error');
      }
    }
  }, [editingTextId, editingText, shapes, updateShape, showToast]);

  // Handle canceling text edit
  const handleCancelTextEdit = useCallback(() => {
    console.log('[handleCancelTextEdit] Canceling text edit');
    setEditingTextId(null);
    setEditingText('');
  }, []);

  // Handle color change for selected shape(s)
  const handleColorChange = useCallback(async (color: string) => {
    if (selectedIds.length === 0) return;
    
    console.log(`[handleColorChange] Changing fill color of ${selectedIds.length} shape(s) to ${color}`);
    
    // Apply color to ALL selected shapes
    try {
      await Promise.all(
        selectedIds.map(id => updateShape(id, { fill: color }))
      );
    } catch (err) {
      console.error(`[handleColorChange] Error updating shape color:`, err);
    }
  }, [selectedIds, updateShape]);

  // Handle stroke color change for lines (apply to all selected)
  const handleStrokeColorChange = useCallback(async (color: string) => {
    if (selectedIds.length === 0) return;
    
    console.log(`[handleStrokeColorChange] Changing stroke color of ${selectedIds.length} shape(s) to ${color}`);
    
    // Apply stroke color to ALL selected shapes
    try {
      await Promise.all(
        selectedIds.map(id => updateShape(id, { stroke: color }))
      );
    } catch (err) {
      console.error(`[handleStrokeColorChange] Error updating stroke color:`, err);
    }
  }, [selectedIds, updateShape]);

  // Handle text color change for text boxes (apply to all selected)
  const handleTextColorChange = useCallback(async (color: string) => {
    if (selectedIds.length === 0) return;
    
    console.log(`[handleTextColorChange] Changing text color of ${selectedIds.length} shape(s) to ${color}`);
    
    // Apply text color to ALL selected shapes
    try {
      await Promise.all(
        selectedIds.map(id => updateShape(id, { textColor: color }))
      );
    } catch (err) {
      console.error(`[handleTextColorChange] Error updating text color:`, err);
    }
  }, [selectedIds, updateShape]);

  // Handle opacity change (apply to all selected)
  const handleOpacityChange = useCallback(async (opacity: number) => {
    if (selectedIds.length === 0) return;
    
    console.log(`[handleOpacityChange] Changing opacity of ${selectedIds.length} shape(s) to ${opacity}`);
    
    // Apply opacity to ALL selected shapes
    try {
      await Promise.all(
        selectedIds.map(id => updateShape(id, { opacity }))
      );
    } catch (err) {
      console.error(`[handleOpacityChange] Error updating opacity:`, err);
    }
  }, [selectedIds, updateShape]);

  // ===== ALIGNMENT TOOLS =====
  
  // Align shapes
  const handleAlign = useCallback(async (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedIds.length < 2) return;

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length < 2) return;

    console.log(`[Align] Aligning ${selectedShapes.length} shapes: ${type}`);

    try {
      if (type === 'left') {
        // Find leftmost x position
        const minX = Math.min(...selectedShapes.map(s => s.x));
        await Promise.all(
          selectedShapes.map(s => updateShape(s.id, { x: minX }))
        );
      } else if (type === 'center') {
        // Find average center x position
        const centers = selectedShapes.map(s => s.x + s.width / 2);
        const avgCenter = centers.reduce((sum, c) => sum + c, 0) / centers.length;
        await Promise.all(
          selectedShapes.map(s => updateShape(s.id, { x: avgCenter - s.width / 2 }))
        );
      } else if (type === 'right') {
        // Find rightmost position
        const maxRight = Math.max(...selectedShapes.map(s => s.x + s.width));
        await Promise.all(
          selectedShapes.map(s => updateShape(s.id, { x: maxRight - s.width }))
        );
      } else if (type === 'top') {
        // Find topmost y position
        const minY = Math.min(...selectedShapes.map(s => s.y));
        await Promise.all(
          selectedShapes.map(s => updateShape(s.id, { y: minY }))
        );
      } else if (type === 'middle') {
        // Find average center y position
        const centers = selectedShapes.map(s => s.y + s.height / 2);
        const avgCenter = centers.reduce((sum, c) => sum + c, 0) / centers.length;
        await Promise.all(
          selectedShapes.map(s => updateShape(s.id, { y: avgCenter - s.height / 2 }))
        );
      } else if (type === 'bottom') {
        // Find bottommost position
        const maxBottom = Math.max(...selectedShapes.map(s => s.y + s.height));
        await Promise.all(
          selectedShapes.map(s => updateShape(s.id, { y: maxBottom - s.height }))
        );
      }
    } catch (err) {
      console.error('[Align] Error:', err);
    }
  }, [selectedIds, shapes, updateShape]);

  // Distribute shapes evenly
  const handleDistribute = useCallback(async (direction: 'horizontal' | 'vertical') => {
    if (selectedIds.length < 3) return; // Need at least 3 shapes to distribute

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length < 3) return;

    console.log(`[Distribute] Distributing ${selectedShapes.length} shapes: ${direction}`);

    try {
      if (direction === 'horizontal') {
        // Sort by x position (left edge)
        const sorted = [...selectedShapes].sort((a, b) => a.x - b.x);
        
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        
        // Calculate total available space for gaps
        const firstRightEdge = first.x + first.width;
        const lastLeftEdge = last.x;
        const totalSpaceForGaps = lastLeftEdge - firstRightEdge;
        
        // Calculate total width of middle shapes
        let totalMiddleWidth = 0;
        for (let i = 1; i < sorted.length - 1; i++) {
          totalMiddleWidth += sorted[i].width;
        }
        
        // Calculate equal gap size
        const gapSize = (totalSpaceForGaps - totalMiddleWidth) / (sorted.length - 1);
        
        // Position middle shapes with equal gaps
        let currentX = firstRightEdge + gapSize;
        for (let i = 1; i < sorted.length - 1; i++) {
          await updateShape(sorted[i].id, { x: currentX });
          currentX += sorted[i].width + gapSize;
        }
      } else {
        // Sort by y position (top edge)
        const sorted = [...selectedShapes].sort((a, b) => a.y - b.y);
        
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        
        // Calculate total available space for gaps
        const firstBottomEdge = first.y + first.height;
        const lastTopEdge = last.y;
        const totalSpaceForGaps = lastTopEdge - firstBottomEdge;
        
        // Calculate total height of middle shapes
        let totalMiddleHeight = 0;
        for (let i = 1; i < sorted.length - 1; i++) {
          totalMiddleHeight += sorted[i].height;
        }
        
        // Calculate equal gap size
        const gapSize = (totalSpaceForGaps - totalMiddleHeight) / (sorted.length - 1);
        
        // Position middle shapes with equal gaps
        let currentY = firstBottomEdge + gapSize;
        for (let i = 1; i < sorted.length - 1; i++) {
          await updateShape(sorted[i].id, { y: currentY });
          currentY += sorted[i].height + gapSize;
        }
      }
    } catch (err) {
      console.error('[Distribute] Error:', err);
    }
  }, [selectedIds, shapes, updateShape]);

  // Center shapes on canvas
  const handleCenterOnCanvas = useCallback(async () => {
    if (selectedIds.length === 0) return;

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return;

    console.log(`[Center] Centering ${selectedShapes.length} shapes on canvas`);

    try {
      // Calculate bounding box of all selected shapes
      const minX = Math.min(...selectedShapes.map(s => s.x));
      const minY = Math.min(...selectedShapes.map(s => s.y));
      const maxX = Math.max(...selectedShapes.map(s => s.x + s.width));
      const maxY = Math.max(...selectedShapes.map(s => s.y + s.height));
      
      const groupWidth = maxX - minX;
      const groupHeight = maxY - minY;
      
      // Calculate canvas center (viewport center)
      const canvasCenterX = dimensions.width / 2;
      const canvasCenterY = dimensions.height / 2;
      
      // Calculate offset to center the group
      const offsetX = canvasCenterX - (minX + groupWidth / 2);
      const offsetY = canvasCenterY - (minY + groupHeight / 2);
      
      // Apply offset to all shapes
      await Promise.all(
        selectedShapes.map(s => updateShape(s.id, { 
          x: s.x + offsetX, 
          y: s.y + offsetY 
        }))
      );
    } catch (err) {
      console.error('[Center] Error:', err);
    }
  }, [selectedIds, shapes, dimensions, updateShape]);

  // ===== END ALIGNMENT TOOLS =====

  // ===== LAYER OPERATIONS =====

  // Get max z-index
  const getMaxZIndex = useCallback(() => {
    if (shapes.length === 0) return 0;
    return Math.max(...shapes.map(s => s.zIndex || 0));
  }, [shapes]);

  // Get min z-index
  const getMinZIndex = useCallback(() => {
    if (shapes.length === 0) return 0;
    return Math.min(...shapes.map(s => s.zIndex || 0));
  }, [shapes]);

  // Bring to front
  const handleBringToFront = useCallback(async () => {
    if (selectedIds.length === 0) return;

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return;

    console.log(`[Layer] Bringing ${selectedShapes.length} shape(s) to front`);

    try {
      const maxZ = getMaxZIndex();
      // Set all selected shapes to be above the current max
      await Promise.all(
        selectedShapes.map((s, index) => updateShape(s.id, { zIndex: maxZ + index + 1 }))
      );
    } catch (err) {
      console.error('[Layer] Error bringing to front:', err);
    }
  }, [selectedIds, shapes, getMaxZIndex, updateShape]);

  // Send to back
  const handleSendToBack = useCallback(async () => {
    if (selectedIds.length === 0) return;

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return;

    console.log(`[Layer] Sending ${selectedShapes.length} shape(s) to back`);

    try {
      const minZ = getMinZIndex();
      // Set all selected shapes to be below the current min
      await Promise.all(
        selectedShapes.map((s, index) => updateShape(s.id, { zIndex: minZ - selectedShapes.length + index }))
      );
    } catch (err) {
      console.error('[Layer] Error sending to back:', err);
    }
  }, [selectedIds, shapes, getMinZIndex, updateShape]);

  // Bring forward (move up one layer)
  const handleBringForward = useCallback(async () => {
    if (selectedIds.length === 0) return;

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return;

    console.log(`[Layer] Bringing ${selectedShapes.length} shape(s) forward`);

    try {
      // Move each shape up by 1 z-index
      await Promise.all(
        selectedShapes.map(s => updateShape(s.id, { zIndex: (s.zIndex || 0) + 1 }))
      );
    } catch (err) {
      console.error('[Layer] Error bringing forward:', err);
    }
  }, [selectedIds, shapes, updateShape]);

  // Send backward (move down one layer)
  const handleSendBackward = useCallback(async () => {
    if (selectedIds.length === 0) return;

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return;

    console.log(`[Layer] Sending ${selectedShapes.length} shape(s) backward`);

    try {
      // Move each shape down by 1 z-index
      await Promise.all(
        selectedShapes.map(s => updateShape(s.id, { zIndex: (s.zIndex || 0) - 1 }))
      );
    } catch (err) {
      console.error('[Layer] Error sending backward:', err);
    }
  }, [selectedIds, shapes, updateShape]);

  // ===== END LAYER OPERATIONS =====

  // ===== COPY/PASTE OPERATIONS =====

  // Copy selected shapes to clipboard
  const handleCopy = useCallback(() => {
    if (selectedIds.length === 0) {
      console.log('[Copy] No shapes selected');
      return;
    }

    const selectedShapes = shapes.filter(s => selectedIds.includes(s.id));
    if (selectedShapes.length === 0) return;

    console.log(`[Copy] Copied ${selectedShapes.length} shape(s) to clipboard`);
    setClipboard(selectedShapes);
    showToast(`Copied ${selectedShapes.length} shape${selectedShapes.length > 1 ? 's' : ''}`, 'success');
  }, [selectedIds, shapes, showToast]);

  // Paste shapes from clipboard
  const handlePaste = useCallback(async () => {
    if (clipboard.length === 0) {
      console.log('[Paste] Clipboard is empty');
      return;
    }

    console.log(`[Paste] Pasting ${clipboard.length} shape(s) from clipboard`);

    try {
      const pasteOffset = 20; // Offset pasted shapes by 20px to make them visible

      // Create new shapes with offset position
      for (const shape of clipboard) {
        // Build shape object, only including defined properties (Firestore doesn't allow undefined)
        const newShape: Omit<Shape, 'id' | 'createdAt' | 'updatedAt'> = {
          type: shape.type,
          x: shape.x + pasteOffset,
          y: shape.y + pasteOffset,
          width: shape.width,
          height: shape.height,
          fill: shape.fill,
          rotation: shape.rotation || 0,
          zIndex: shape.zIndex || 0,
          opacity: shape.opacity ?? 1,
          userId: user?.uid || 'anonymous',
          // Only include optional properties if they're defined
          ...(shape.stroke !== undefined && { stroke: shape.stroke }),
          ...(shape.textColor !== undefined && { textColor: shape.textColor }),
          ...(shape.text !== undefined && { text: shape.text }),
        };

        // Create the new shape (Firebase generates ID and syncs automatically)
        await createShape(newShape);
      }

      // Clear selection (newly created shapes will appear via Firebase sync)
      setSelectedIds([]);
      showToast(`Pasted ${clipboard.length} shape${clipboard.length > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      console.error('[Paste] Error:', err);
      showToast('Failed to paste shapes', 'error');
    }
  }, [clipboard, createShape, user?.uid, showToast]);

  // Duplicate selected shapes (copy + paste in one action)
  const handleDuplicate = useCallback(async () => {
    if (selectedIds.length === 0) {
      console.log('[Duplicate] No shapes selected');
      return;
    }

    handleCopy();
    // Small delay to ensure clipboard is updated
    setTimeout(() => {
      handlePaste();
    }, 50);
  }, [selectedIds, handleCopy, handlePaste]);

  // ===== END COPY/PASTE OPERATIONS =====

  // ===== EXPORT OPERATIONS =====

  // Export canvas as PNG
  const handleExportPNG = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      showToast('Export failed: Canvas not found', 'error');
      return;
    }

    try {
      // Get the bounding box of all shapes
      const layer = stage.findOne('Layer');
      if (!layer) {
        showToast('Export failed: No shapes to export', 'error');
        return;
      }

      // Export the entire stage as PNG
      const dataURL = stage.toDataURL({
        pixelRatio: 2, // Higher quality (2x resolution)
        mimeType: 'image/png',
      });

      // Create download link
      const link = document.createElement('a');
      link.download = `canvas-export-${Date.now()}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Canvas exported as PNG!', 'success');
      console.log('[Export] PNG export successful');
    } catch (err) {
      console.error('[Export] PNG export failed:', err);
      showToast('PNG export failed', 'error');
    }
  }, [showToast]);

  // Export canvas as SVG
  const handleExportSVG = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      showToast('Export failed: Canvas not found', 'error');
      return;
    }

    try {
      // Check if Konva has SVG export support
      type StageWithSVG = Konva.Stage & { toSVG?: () => string };
      if (typeof (stage as StageWithSVG).toSVG !== 'function') {
        // Manual SVG construction
        const layer = stage.findOne('Layer');
        if (!layer) {
          showToast('Export failed: No shapes to export', 'error');
          return;
        }

        // Get stage dimensions
        const width = stage.width();
        const height = stage.height();

        // Create SVG string
        let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#1e1e1e"/>
`;

        // Add shapes to SVG
        shapes.forEach(shape => {
          if (shape.type === 'rectangle') {
            const opacity = shape.opacity ?? 1;
            svgContent += `  <rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.fill}" opacity="${opacity}" transform="rotate(${shape.rotation || 0} ${shape.x + shape.width/2} ${shape.y + shape.height/2})"/>\n`;
          } else if (shape.type === 'circle') {
            const radius = shape.width / 2;
            const cx = shape.x + radius;
            const cy = shape.y + radius;
            const opacity = shape.opacity ?? 1;
            svgContent += `  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${shape.fill}" opacity="${opacity}" transform="rotate(${shape.rotation || 0} ${cx} ${cy})"/>\n`;
          } else if (shape.type === 'text') {
            const opacity = shape.opacity ?? 1;
            svgContent += `  <text x="${shape.x}" y="${shape.y + 20}" fill="${shape.textColor || '#ffffff'}" font-size="16" opacity="${opacity}" transform="rotate(${shape.rotation || 0} ${shape.x} ${shape.y})">${shape.text || ''}</text>\n`;
          } else if (shape.type === 'line') {
            const x2 = shape.x + shape.width;
            const y2 = shape.y + shape.height;
            const opacity = shape.opacity ?? 1;
            svgContent += `  <line x1="${shape.x}" y1="${shape.y}" x2="${x2}" y2="${y2}" stroke="${shape.stroke || '#ffffff'}" stroke-width="2" opacity="${opacity}"/>\n`;
          }
        });

        svgContent += '</svg>';

        // Create blob and download
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `canvas-export-${Date.now()}.svg`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast('Canvas exported as SVG!', 'success');
        console.log('[Export] SVG export successful');
      } else {
        // Use Konva's built-in SVG export if available
        type StageWithSVG = Konva.Stage & { toSVG: () => string };
        const svgData = (stage as StageWithSVG).toSVG();
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `canvas-export-${Date.now()}.svg`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast('Canvas exported as SVG!', 'success');
        console.log('[Export] SVG export successful');
      }
    } catch (err) {
      console.error('[Export] SVG export failed:', err);
      showToast('SVG export failed', 'error');
    }
  }, [shapes, showToast]);

  // ===== END EXPORT OPERATIONS =====

  // Handle right-click context menu
  const handleShapeContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>, shapeId: string) => {
    e.evt.preventDefault();
    
    // If right-clicking on a non-selected shape, select it
    if (!selectedIds.includes(shapeId)) {
      setSelectedIds([shapeId]);
    }
    
    // Get the mouse position relative to the viewport
    const stage = e.target.getStage();
    if (!stage) return;
    
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    
    setContextMenu({ 
      x: pointerPos.x, 
      y: pointerPos.y, 
      shapeId 
    });
    
    console.log(`[ContextMenu] Opened at (${pointerPos.x}, ${pointerPos.y}) for shape ${shapeId}`);
  }, [selectedIds]);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Track if we've already initialized the textarea to prevent re-initialization
  const textareaInitialized = useRef<string | null>(null);

  // Focus and position textarea when editing starts
  useEffect(() => {
    if (editingTextId && textareaRef.current && stageRef.current) {
      const shape = shapes.find(s => s.id === editingTextId);
      if (!shape) return;

      const textarea = textareaRef.current;
      
      // Only initialize once per editing session
      const isNewSession = textareaInitialized.current !== editingTextId;
      
      // Calculate screen position accounting for stage transform
      const screenX = shape.x * stageScale + stagePos.x;
      const screenY = shape.y * stageScale + stagePos.y;
      const screenWidth = shape.width * stageScale;
      const screenHeight = shape.height * stageScale;
      
      // Calculate font size to stretch text to fill the box (same as TextBox component)
      const heightBasedSize = Math.max(12, Math.abs(shape.height || 20) * 0.95);
      const avgCharWidth = heightBasedSize * 0.6;
      const estimatedTextWidth = (shape.text || 'Text').length * avgCharWidth;
      const widthScale = estimatedTextWidth > 0 ? shape.width / estimatedTextWidth : 1;
      const widthBasedSize = heightBasedSize * widthScale;
      const fontSize = Math.max(12, Math.min(widthBasedSize, shape.height * 0.95)) * stageScale;

      // Calculate letter spacing to help text fill width
      const targetTextWidth = shape.width * 0.95;
      const baseTextWidth = (shape.text || 'Text').length * (fontSize / stageScale) * 0.6;
      const letterSpacing = baseTextWidth > 0 ? ((targetTextWidth - baseTextWidth) / (shape.text || 'Text').length) * stageScale : 0;

      // Position textarea over the text box
      textarea.style.position = 'absolute';
      textarea.style.left = `${screenX}px`;
      textarea.style.top = `${screenY}px`;
      textarea.style.width = `${screenWidth}px`;
      textarea.style.height = `${screenHeight}px`;
      textarea.style.fontSize = `${fontSize}px`;
      textarea.style.padding = '0';
      textarea.style.margin = '0';
      textarea.style.border = '2px solid #3498db';
      textarea.style.borderRadius = '0';
      textarea.style.backgroundColor = 'transparent';
      textarea.style.color = '#ffffff';
      textarea.style.outline = 'none';
      textarea.style.resize = 'none';
      textarea.style.overflow = 'hidden';
      textarea.style.fontFamily = 'Arial, sans-serif';
      textarea.style.zIndex = '1000';
      textarea.style.lineHeight = 'normal';
      textarea.style.display = 'flex';
      textarea.style.alignItems = 'center';
      textarea.style.textAlign = 'center';
      textarea.style.justifyContent = 'center';
      textarea.style.letterSpacing = `${letterSpacing}px`;

      // Only focus and select on initial setup, not on every update
      if (isNewSession) {
        textareaInitialized.current = editingTextId;
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(0, textarea.value.length);
        }, 0);
      }
    } else {
      // Reset when editing ends
      textareaInitialized.current = null;
    }
  }, [editingTextId, shapes, stagePos, stageScale]);

  // Handle click on stage background
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Don't deselect if we just completed a box selection
    if (justCompletedBoxSelection.current) {
      console.log('[handleStageClick] Skipping deselect - just completed box selection');
      return;
    }
    
    // Check if clicked on stage background (not on a shape)
    if (e.target === e.target.getStage()) {
      deselectShape();
    }
  };

  // Delete selected shape(s)
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.length === 0) {
      console.warn('[DELETE] No shapes selected');
      return;
    }
    
    const shapesToDelete = [...selectedIds]; // Capture for closure
    console.log(`[DELETE] Deleting ${shapesToDelete.length} shape(s)`);
    
    // Validate all shapes exist
    const validShapes = shapesToDelete.filter(id => shapes.find(s => s.id === id));
    if (validShapes.length === 0) {
      console.warn('[DELETE] No valid shapes to delete');
      setSelectedIds([]);
      return;
    }
    
    // Delete all shapes in parallel
    const deletePromises = validShapes.map(async (shapeId) => {
      try {
        await deleteShape(shapeId);
        console.log(`[DELETE] Successfully deleted shape ${shapeId}`);
        return { success: true, id: shapeId };
    } catch (err) {
        console.error(`[DELETE] Error deleting shape ${shapeId}:`, err);
      
      // Handle specific error cases
      const errorCode = (err as { code?: string }).code;
      if (errorCode === 'not-found') {
          console.log(`[DELETE] Shape ${shapeId} was already deleted by another user`);
      } else if (errorCode === 'permission-denied') {
          console.error(`[DELETE] Permission denied for shape ${shapeId}`);
        }
        
        return { success: false, id: shapeId, error: err };
      }
    });
    
    await Promise.allSettled(deletePromises);
    
    // Clear selection after delete (no toast notifications)
    setSelectedIds([]);
  }, [selectedIds, shapes, deleteShape]);

  // Clear all shapes from canvas
  const handleClearCanvas = useCallback(async () => {
    if (shapes.length === 0) {
      console.warn('[CLEAR] No shapes to delete');
      return;
    }
    
    console.log(`[CLEAR] Clearing ${shapes.length} shape(s) from canvas`);
    
    // Delete all shapes in parallel
    const deletePromises = shapes.map(async (shape) => {
      try {
        await deleteShapeFirestore(shape.id);
        console.log(`[CLEAR] Successfully deleted shape ${shape.id}`);
        return { success: true, id: shape.id };
      } catch (err) {
        console.error(`[CLEAR] Error deleting shape ${shape.id}:`, err);
        return { success: false, id: shape.id, error: err };
      }
    });
    
    const results = await Promise.allSettled(deletePromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    // Clear selection
    setSelectedIds([]);
    
    console.log(`[CLEAR] Canvas cleared: ${successCount}/${shapes.length} shapes deleted`);
  }, [shapes, deleteShapeFirestore]);

  // Helper function to detect and extract bulk shape count from command
  const detectBulkRequest = useCallback((command: string): number | null => {
    // Look for patterns like "100 shapes", "create 500", "make 200 circles", etc.
    const patterns = [
      /(\d+)\s*shapes/i,
      /create\s+(\d+)/i,
      /make\s+(\d+)/i,
      /generate\s+(\d+)/i,
      /(\d+)\s*(rectangle|circle|square|box)/i,
    ];
    
    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match && match[1]) {
        const count = parseInt(match[1], 10);
        if (count >= 100) {
          return count;
        }
      }
    }
    
    return null;
  }, []);

  // Execute AI command (called directly or after confirmation)
  const executeAICommand = useCallback(async (command: string): Promise<{ response: string }> => {
    if (!user) {
      throw new Error('User must be logged in');
    }

    setIsProcessingAI(true);
    
    // Add user message to conversation
    const userMessage: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: command,
      timestamp: Date.now(),
    };
    setConversationHistory(prev => [...prev, userMessage]);

    try {
      console.log('[AI] Processing command:', command);

      // Create canvas operations object for AI executor
      const canvasOps: CanvasOperations = {
        createShape: createShapeFirestore,
        createShapesBatch: createShapesBatch,
        updateShape: updateShape,
        deleteShape: deleteShapeFirestore,
        getShapes: () => shapes,
        getSelectedShapeId: () => selectedId,
        getCanvasDimensions: () => dimensions,
        getUserId: () => user.uid,
      };

      // Process command using OpenAI
      const result = await processAICommand(command, canvasOps, conversationHistory);
      
      console.log('[AI] Command processed:', result);

      // Add AI response to conversation
      const assistantMessage: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.response,
        timestamp: Date.now(),
        executionResult: result.results[0], // Show first result if available
      };
      setConversationHistory(prev => [...prev, assistantMessage]);

      // Toast notifications removed - chat window shows feedback instead
      return { response: result.response };

    } catch (err) {
      console.error('[AI] Error executing command:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to execute command';
      
      // Add error message to conversation
      const errorMessage: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: Date.now(),
        executionResult: {
          success: false,
          message: errorMsg,
          error: errorMsg,
        },
      };
      setConversationHistory(prev => [...prev, errorMessage]);

      // Error already shown in chat window, no toast needed
      throw err;
    } finally {
      setIsProcessingAI(false);
    }
  }, [user, shapes, dimensions, selectedId, createShapeFirestore, createShapesBatch, updateShape, deleteShapeFirestore, conversationHistory]);

  // Handle AI command with bulk confirmation check
  const handleAICommand = useCallback(async (command: string): Promise<{ response: string }> => {
    if (!user) {
      const errorMsg = 'You must be logged in to use AI features';
      throw new Error(errorMsg);
    }

    // Check if this is a bulk creation request (100+ shapes)
    const bulkCount = detectBulkRequest(command);
    
    if (bulkCount !== null && bulkCount >= 100) {
      // Show confirmation modal for bulk operations
      console.log(`[AI] Detected bulk request for ${bulkCount} shapes, showing confirmation`);
      
      // Store the command for later execution
      setBulkConfirmation({
        count: bulkCount,
        command: command,
      });
      
      // Return immediately - execution will happen after confirmation
      return { response: `Confirming creation of ${bulkCount} shapes...` };
    }

    // For non-bulk requests, execute directly
    return executeAICommand(command);
  }, [user, detectBulkRequest, executeAICommand]);

  // Handle bulk confirmation
  const handleBulkConfirm = useCallback(() => {
    if (bulkConfirmation) {
      const { command } = bulkConfirmation;
      setBulkConfirmation(null);
      // Execute the command
      executeAICommand(command).catch((err) => {
        console.error('[AI] Error after bulk confirmation:', err);
      });
    }
  }, [bulkConfirmation, executeAICommand]);

  // Handle bulk cancellation
  const handleBulkCancel = useCallback(() => {
    if (bulkConfirmation) {
      console.log('[AI] Bulk creation cancelled by user');
      
      // Add cancellation message to conversation
      const cancelMessage: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Bulk creation of ${bulkConfirmation.count} shapes cancelled.`,
        timestamp: Date.now(),
      };
      setConversationHistory(prev => [...prev, cancelMessage]);
      
      setBulkConfirmation(null);
    }
  }, [bulkConfirmation]);

  // Keyboard shortcuts
  // Debug: Log Stage draggability changes
  useEffect(() => {
    const stageDraggable = !isDraggingShape && !isDraggingCreate && !isPlacementMode;
    console.log(`[STAGE DRAGGABLE] 🎯 Stage draggable: ${stageDraggable} (isDraggingShape: ${isDraggingShape}, isDraggingCreate: ${isDraggingCreate}, isPlacementMode: ${isPlacementMode})`);
  }, [isDraggingShape, isDraggingCreate, isPlacementMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? - Show keyboard shortcuts (works anytime, even during text editing)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
        return;
      }

      // Don't trigger other shortcuts if currently editing text
      if (editingTextId) {
        return;
      }

      // Cmd+A / Ctrl+A - Select all shapes
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        const allShapeIds = shapes.map(s => s.id);
        setSelectedIds(allShapeIds);
        showToast(`Selected ${allShapeIds.length} shape${allShapeIds.length > 1 ? 's' : ''}`, 'info');
        return;
      }

      // Cmd+C / Ctrl+C - Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Cmd+V / Ctrl+V - Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Cmd+D / Ctrl+D - Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // Cmd+Z / Ctrl+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Cmd+Shift+Z / Ctrl+Shift+Z - Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Cmd+Y / Ctrl+Y - Alternative Redo (Windows standard)
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Cmd+] / Ctrl+] - Bring to Front (without Alt/Option)
      if ((e.metaKey || e.ctrlKey) && e.key === ']' && !e.altKey) {
        e.preventDefault();
        handleBringToFront();
        return;
      }

      // Cmd+[ / Ctrl+[ - Send to Back (without Alt/Option)
      if ((e.metaKey || e.ctrlKey) && e.key === '[' && !e.altKey) {
        e.preventDefault();
        handleSendToBack();
        return;
      }

      // Cmd+Alt+] / Ctrl+Alt+] - Bring Forward
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === ']') {
        e.preventDefault();
        handleBringForward();
        return;
      }

      // Cmd+Alt+[ / Ctrl+Alt+[ - Send Backward
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === '[') {
        e.preventDefault();
        handleSendBackward();
        return;
      }

      // Delete/Backspace - delete selected shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault(); // Prevent browser back navigation on Backspace
        handleDeleteSelected();
      }
      
      // Escape - deselect all, cancel drag-to-create or placement mode, or close shortcuts modal
      if (e.key === 'Escape') {
        if (showKeyboardShortcuts) {
          e.preventDefault();
          setShowKeyboardShortcuts(false);
          return;
        }
        if (selectedIds.length > 0 && !isDraggingCreate && !isPlacementMode) {
          e.preventDefault();
          setSelectedIds([]);
          return;
        }
        if (isDraggingCreate || isPlacementMode) {
        e.preventDefault();
        setIsDraggingCreate(false);
        setIsPlacementMode(false);
        setPlacementType(null);
        setPreviewShape(null);
        dragStartPos.current = null;
        isMouseDown.current = false;
        if (stageRef.current) {
          stageRef.current.draggable(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, shapes, handleDeleteSelected, isDraggingCreate, isPlacementMode, editingTextId, handleUndo, handleRedo, handleBringToFront, handleSendToBack, handleBringForward, handleSendBackward, handleCopy, handlePaste, handleDuplicate, showKeyboardShortcuts, showToast]);

  // Handle shape addition from sidebar - Click = custom-size drag mode
  const handleAddShape = (type: 'rectangle' | 'circle' | 'text' | 'line') => {
    console.log(`[handleAddShape] Called with type: ${type}, isPlacementMode: ${isPlacementMode}, isDraggingCreate: ${isDraggingCreate}`);
    
    // All shape types now use crosshair mode (click start, drag to end/size)
    console.log(`[handleAddShape] ✅ Activating CROSSHAIR mode for ${type} (drag to define ${type === 'line' ? 'endpoints' : 'custom size'})`);
    setIsDraggingCreate(true);
    setPlacementType(type);
    if (stageRef.current) {
      stageRef.current.draggable(false);
    }
  };

  // Start placement mode - Drag from tool = fixed-size preview follows cursor
  const handleStartDragCreate = (type: 'rectangle' | 'circle' | 'text' | 'line') => {
    console.log(`[handleStartDragCreate] ✅ Activating PLACEMENT mode for ${type} (fixed-size preview follows cursor)`);
    setIsPlacementMode(true);
    setPlacementType(type);
    // Disable stage dragging while in placement mode
    if (stageRef.current) {
      stageRef.current.draggable(false);
    }
  };

  // Throttled activity update (once per 5 seconds)
  const lastActivityUpdate = useRef<number>(0);
  const ACTIVITY_UPDATE_THROTTLE = 5000; // 5 seconds

  // Handle cursor movement for multiplayer and shape preview
  const handleMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Convert screen coordinates to canvas coordinates (accounting for pan/zoom)
    const canvasX = (pointer.x - stagePos.x) / stageScale;
    const canvasY = (pointer.y - stagePos.y) / stageScale;

    // Handle box selection drag in select mode
    if (cursorMode === 'select' && boxSelectionStart.current) {
      const startX = boxSelectionStart.current.x;
      const startY = boxSelectionStart.current.y;
      const width = canvasX - startX;
      const height = canvasY - startY;
      
      setSelectionBox({ x: startX, y: startY, width, height });
      return; // Don't process other mouse move logic
    }

    // DEBUG: Log when in drag-create mode
    if (isDraggingCreate) {
      console.log(`[handleMouseMove] 🖱️ isDraggingCreate: ${isDraggingCreate}, isMouseDown: ${isMouseDown.current}, placementType: ${placementType}, dragStartPos: ${dragStartPos.current ? 'SET' : 'NULL'}`);
    }

    // Handle drag-to-create (custom size)
    if (isDraggingCreate && isMouseDown.current && dragStartPos.current) {
      const startX = dragStartPos.current.x;
      const startY = dragStartPos.current.y;
      
      if (placementType === 'line') {
        // For lines: from start point to current cursor position
        // Store as: x,y = start point, width = deltaX, height = deltaY
        let deltaX = canvasX - startX;
        let deltaY = canvasY - startY;
        
        // Apply angle snapping (snap to 0°, 90°, 180°, 270° within 5° tolerance)
        const snapped = snapLineDelta(deltaX, deltaY, 5);
        deltaX = snapped.deltaX;
        deltaY = snapped.deltaY;
        
        console.log(`[LINE PREVIEW] Start: (${startX.toFixed(2)}, ${startY.toFixed(2)}), Current: (${canvasX.toFixed(2)}, ${canvasY.toFixed(2)}), Deltas: (${deltaX.toFixed(2)}, ${deltaY.toFixed(2)})${snapped.isSnapped ? ' [SNAPPED]' : ''}`);
        setPreviewShape({ 
          x: startX, 
          y: startY, 
          width: deltaX, 
          height: deltaY 
        });
      } else if (placementType === 'circle') {
        // For circles/ovals: expand from center with independent width and height
        const deltaX = canvasX - startX;
        const deltaY = canvasY - startY;
        const width = Math.abs(deltaX) * 2; // Full width (left + right from center)
        const height = Math.abs(deltaY) * 2; // Full height (top + bottom from center)
        
        // Circle/oval center is the start point, x/y for storage is center
        setPreviewShape({ 
          x: startX, 
          y: startY, 
          width: width, 
          height: height 
        });
      } else {
        // For rectangles and text boxes: expand from corner
        const width = Math.abs(canvasX - startX);
        const height = Math.abs(canvasY - startY);
        const x = Math.min(startX, canvasX);
        const y = Math.min(startY, canvasY);
        
        setPreviewShape({ x, y, width, height });
      }
    }
    // Handle placement mode (fixed size preview)
    else if (isPlacementMode && placementType) {
      if (placementType === 'rectangle') {
        const fixedWidth = 150;
        const fixedHeight = 100;
        setPreviewShape({
          x: canvasX - fixedWidth / 2,
          y: canvasY - fixedHeight / 2,
          width: fixedWidth,
          height: fixedHeight
        });
      } else if (placementType === 'circle') {
        const fixedSize = 100; // Diameter
        // For circles, x,y is the center, so we position it directly at cursor
        setPreviewShape({
          x: canvasX,
          y: canvasY,
          width: fixedSize,
          height: fixedSize
        });
      } else if (placementType === 'text') {
        const fixedWidth = 200;
        const fixedHeight = 50;
        setPreviewShape({
          x: canvasX - fixedWidth / 2,
          y: canvasY - fixedHeight / 2,
          width: fixedWidth,
          height: fixedHeight
        });
      } else if (placementType === 'line') {
        // For lines in placement mode: horizontal line centered at cursor
        const fixedLength = 120; // Default line length
        // x,y = start point (left), width = deltaX, height = deltaY (0 for horizontal)
        setPreviewShape({
          x: canvasX - fixedLength / 2,
          y: canvasY,
          width: fixedLength,  // Horizontal line (deltaX)
          height: 0            // No vertical component (deltaY = 0)
        });
        console.log(`[LINE PLACEMENT MODE] Fixed-size line preview at (${canvasX.toFixed(2)}, ${canvasY.toFixed(2)}), length: ${fixedLength}`);
      }
    } else {
      updateCursor(canvasX, canvasY);
    }
    
    // Throttle activity updates to avoid excessive Firebase writes
    const now = Date.now();
    if (now - lastActivityUpdate.current > ACTIVITY_UPDATE_THROTTLE) {
      updateActivity();
      lastActivityUpdate.current = now;
    }
  };

  // Handle mouse leaving canvas
  const handleMouseLeave = () => {
    removeCursor();
    
    // Cancel placement/drag mode if in progress
    if (isPlacementMode || isDraggingCreate) {
      setIsPlacementMode(false);
      setPlacementType(null);
      setIsDraggingCreate(false);
      setPreviewShape(null);
      dragStartPos.current = null;
      isMouseDown.current = false;
      if (stageRef.current) {
        stageRef.current.draggable(true);
      }
    }
  };

  // Handle canvas mouse down - start custom-size creation
  const handleCanvasMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;

    // CRITICAL: If clicking on a shape (not the Stage), pre-emptively disable Stage dragging
    // This prevents the Stage from starting a drag that would interrupt the shape's drag
    if (e.target !== e.currentTarget) {
      console.log(`[handleCanvasMouseDown] 🔒 Mouse down on shape - disabling Stage drag pre-emptively`);
      stage.draggable(false);
      // Note: Stage dragging will be re-enabled in handleShapeDragEnd
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const canvasX = (pointer.x - stagePos.x) / stageScale;
    const canvasY = (pointer.y - stagePos.y) / stageScale;

    console.log(`[handleCanvasMouseDown] isDraggingCreate: ${isDraggingCreate}, isPlacementMode: ${isPlacementMode}, placementType: ${placementType}, cursorMode: ${cursorMode}`);

    // If in drag-create mode (custom-size), start dragging
    if (isDraggingCreate && !isMouseDown.current) {
      isMouseDown.current = true;
      dragStartPos.current = { x: canvasX, y: canvasY };
      console.log(`[handleCanvasMouseDown] 🎯 Started drag from (${canvasX.toFixed(2)}, ${canvasY.toFixed(2)}) for ${placementType}`);
    }
    
    // If in select mode and clicking on empty canvas, start box selection
    if (cursorMode === 'select' && e.target === e.currentTarget && !isDraggingCreate && !isPlacementMode) {
      boxSelectionStart.current = { x: canvasX, y: canvasY };
      setSelectionBox({ x: canvasX, y: canvasY, width: 0, height: 0 });
      console.log(`[handleCanvasMouseDown] 📦 Starting box selection at (${canvasX.toFixed(2)}, ${canvasY.toFixed(2)})`);
    }
  };

  // Create shape from placement mode (fixed-size)
  const createPlacementShape = async () => {
    if (!previewShape || !user || !placementType) return;
    
    // Use actual width and height from preview (circles can now be ovals)
    const shapeWidth = previewShape.width;
    const shapeHeight = previewShape.height;
    
    console.log(`[createPlacementShape] Creating ${placementType} at preview position (${previewShape.x.toFixed(2)}, ${previewShape.y.toFixed(2)})`);
    
    try {
      const shapeData: Omit<Shape, 'id' | 'createdAt' | 'updatedAt'> = {
        type: placementType as ShapeType,
        x: previewShape.x,
        y: previewShape.y,
        width: shapeWidth,
        height: shapeHeight,
        fill: placementType === 'text' ? 'transparent' : (placementType === 'line' ? '#3498db' : '#3498db'),
        userId: user.uid,
        text: placementType === 'text' ? 'Text' : undefined,
      };
      
      console.log(`[createPlacementShape] 📝 Shape data:`, shapeData);

      await createShape(shapeData);
      console.log(`[PLACEMENT] ✅ Created ${placementType} at (${previewShape.x.toFixed(2)}, ${previewShape.y.toFixed(2)})`);
    } catch (err) {
      console.error('[createPlacementShape] Error:', err);
      errorLogger.logError('Failed to create shape via placement', err instanceof Error ? err : new Error(String(err)), { 
        position: { x: previewShape.x, y: previewShape.y },
        type: placementType
      });
      showToast('Failed to create shape', 'error');
    }
    
    // Reset placement mode immediately
    setIsPlacementMode(false);
    setPlacementType(null);
    
    // Clear preview shape immediately to prevent duplicate rendering
    setPreviewShape(null);
    
    if (stageRef.current) {
      stageRef.current.draggable(true);
    }
  };

  // Handle mouse up - finalize shape creation (both modes)
  const handleMouseUp = async () => {
    // Handle box selection completion in select mode
    if (cursorMode === 'select' && boxSelectionStart.current && selectionBox) {
      // Calculate the selection box bounds (normalized to handle negative dimensions)
      const box = selectionBox;
      const x1 = Math.min(box.x, box.x + box.width);
      const y1 = Math.min(box.y, box.y + box.height);
      const x2 = Math.max(box.x, box.x + box.width);
      const y2 = Math.max(box.y, box.y + box.height);
      
      // Find all shapes that intersect with the selection box
      const selectedShapeIds = shapes.filter(shape => {
        const shapeX1 = shape.x;
        const shapeY1 = shape.y;
        const shapeX2 = shape.x + shape.width;
        const shapeY2 = shape.y + shape.height;
        
        // Check for intersection
        return !(shapeX2 < x1 || shapeX1 > x2 || shapeY2 < y1 || shapeY1 > y2);
      }).map(s => s.id);
      
      selectMultipleShapes(selectedShapeIds);
      console.log(`[handleMouseUp] 📦 Box selection complete: selected ${selectedShapeIds.length} shape(s)`);
      
      // Set flag to prevent handleStageClick from clearing the selection
      justCompletedBoxSelection.current = true;
      setTimeout(() => {
        justCompletedBoxSelection.current = false;
      }, 100);
      
      // Clear box selection
      boxSelectionStart.current = null;
      setSelectionBox(null);
      
      // Force transformer to update after state change
      setTimeout(() => {
        transformerRef.current?.getLayer()?.batchDraw();
      }, 0);
      
      return;
    }
    
    // Mode 2: Placement mode (fixed-size) - create on release
    if (isPlacementMode && previewShape && user) {
      await createPlacementShape();
      return;
    }
    
    // Mode 1: Drag-create mode (custom-size) - create if dragged enough
    if (isDraggingCreate && isMouseDown.current && previewShape && user && placementType) {
      const minSize = 10; // Minimum size for a shape (diameter for circles)
      
      let shapeWidth, shapeHeight, finalX, finalY;
      let isValidSize = false;
      
      if (placementType === 'line') {
        // For lines: width/height are deltas, check minimum line length
        const lineLength = Math.sqrt(previewShape.width * previewShape.width + previewShape.height * previewShape.height);
        isValidSize = lineLength >= minSize;
        shapeWidth = previewShape.width;  // deltaX
        shapeHeight = previewShape.height; // deltaY
        finalX = previewShape.x; // Start point
        finalY = previewShape.y;
      } else {
        // Use actual dimensions from preview (circles can now be ovals)
        shapeWidth = previewShape.width;
        shapeHeight = previewShape.height;
        
        // Position is already correct from preview:
        // - Circles: x, y is already the center point
        // - Rectangles/Text: x, y is already the top-left corner
        finalX = previewShape.x;
        finalY = previewShape.y;
        
        // Only create if shape is large enough
        isValidSize = shapeWidth >= minSize && shapeHeight >= minSize;
      }
      
      if (isValidSize) {
        try {
          const shapeData: Omit<Shape, 'id' | 'createdAt' | 'updatedAt'> = {
            type: placementType as ShapeType,
            x: finalX,
            y: finalY,
            width: shapeWidth,
            height: shapeHeight,
            fill: placementType === 'text' ? 'transparent' : (placementType === 'line' ? '#3498db' : '#3498db'),
            userId: user.uid,
            text: placementType === 'text' ? 'Text' : undefined,
          };

          await createShape(shapeData);
          console.log(`[DRAG CREATE] Created ${placementType} at (${finalX.toFixed(2)}, ${finalY.toFixed(2)}) with ${placementType === 'line' ? `deltas (${shapeWidth.toFixed(2)}, ${shapeHeight.toFixed(2)})` : `size ${shapeWidth.toFixed(2)}x${shapeHeight.toFixed(2)}`}`);
        } catch (err) {
          console.error('[handleMouseUp] Error creating shape:', err);
          errorLogger.logError('Failed to create shape via drag', err instanceof Error ? err : new Error(String(err)), { 
            position: { x: finalX, y: finalY },
            size: { width: shapeWidth, height: shapeHeight },
            type: placementType
          });
          showToast('Failed to create shape', 'error');
        }
      }
      
      // Reset drag-create state immediately to prevent duplicate rendering
      setIsDraggingCreate(false);
      setPlacementType(null);
      dragStartPos.current = null;
      isMouseDown.current = false;
      
      // Clear preview shape immediately
      setPreviewShape(null);
      
      // Re-enable stage dragging
      if (stageRef.current) {
        stageRef.current.draggable(true);
      }
    } else {
      // Even if we didn't create a shape, clear the preview
      setPreviewShape(null);
      isMouseDown.current = false;
    }
  };

  // Filter cursors to only show active ones (within 5 minutes)
  const activeCursors = Object.values(cursors).filter((cursor) => {
    const isRecent = Date.now() - cursor.timestamp < 5 * 60 * 1000;
    return isRecent;
  });

  // Generate grid lines
  const renderGrid = () => {
    const lines = [];
    const gridSize = 50; // 50px grid
    const gridColor = '#333333'; // Dark gray lines
    const width = dimensions.width * 3; // Extended for panning
    const height = dimensions.height * 3;
    const offsetX = -dimensions.width;
    const offsetY = -dimensions.height;

    // Vertical lines
    for (let i = 0; i < width / gridSize; i++) {
      lines.push(
        <KonvaLine
          key={`v-${i}`}
          points={[offsetX + i * gridSize, offsetY, offsetX + i * gridSize, offsetY + height]}
          stroke={gridColor}
          strokeWidth={1}
          listening={false}
        />
      );
    }

    // Horizontal lines
    for (let i = 0; i < height / gridSize; i++) {
      lines.push(
        <KonvaLine
          key={`h-${i}`}
          points={[offsetX, offsetY + i * gridSize, offsetX + width, offsetY + i * gridSize]}
          stroke={gridColor}
          strokeWidth={1}
          listening={false}
        />
      );
    }

    return lines;
  };

  // Show loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        color: '#fff',
        fontSize: '18px',
      }}>
        Loading canvas...
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        color: '#e74c3c',
        fontSize: '18px',
        gap: '16px',
      }}>
        <div>Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3498db',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <LeftSidebar
        onAddShape={handleAddShape}
        onStartDragCreate={handleStartDragCreate}
        onDeleteSelected={handleDeleteSelected}
        onClearCanvas={handleClearCanvas}
        selectedShape={selectedId}
        selectedShapeCount={selectedIds.length}
        cursorMode={cursorMode}
        onCursorModeChange={setCursorMode}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onShowKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
        onExport={() => setShowExportModal(true)}
        fps={fps}
      />
      <UserMenu presence={presence} />
      
      {/* Selection Count Indicator */}
      <SelectionIndicator count={selectedIds.length} />
      
      {/* Unified Shape Style Panel - includes colors, opacity, alignment, and layer controls */}
      {selectedIds.length > 0 && (
        <ShapeStylePanel
          selectedShape={shapes.find(s => s.id === selectedIds[0]) || null}
          selectedCount={selectedIds.length}
          onColorChange={handleColorChange}
          onStrokeColorChange={handleStrokeColorChange}
          onTextColorChange={handleTextColorChange}
          onOpacityChange={handleOpacityChange}
          onAlign={handleAlign}
          onDistribute={handleDistribute}
          onCenterCanvas={handleCenterOnCanvas}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
        />
      )}

      {/* Context Menu - appears on right-click */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedIds.length}
          onClose={closeContextMenu}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteSelected}
        />
      )}
      
      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcuts
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onExportPNG={handleExportPNG}
          onExportSVG={handleExportSVG}
        />
      )}
      
      <div 
        className={`canvas-container ${isDraggingCreate ? 'create-mode' : ''} ${cursorMode === 'select' ? 'select-mode' : ''}`}
      >
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          draggable={cursorMode === 'pan' && !isDraggingShape && !isDraggingCreate && !isPlacementMode}
          dragBoundFunc={(pos) => {
            // CRITICAL: If dragging a shape, prevent Stage from moving AT ALL
            // This ensures Stage drag doesn't interfere with shape drags
            // Also prevent dragging in select mode
            if (cursorMode === 'select' || isDraggingShape || isDraggingCreate || isPlacementMode) {
              return { x: stagePos.x, y: stagePos.y }; // Return current position (no movement)
            }
            return pos; // Allow normal Stage dragging
          }}
          x={stagePos.x}
          y={stagePos.y}
          scaleX={stageScale}
          scaleY={stageScale}
          onWheel={handleWheel}
          onDragStart={handleStageDragStart}
          onDragMove={handleStageDrag}
          onDragEnd={handleStageDragEnd}
          onClick={handleStageClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            {/* Grid lines for visual feedback */}
            {renderGrid()}
            
            {/* Render all shapes (rectangles, circles, and text boxes) */}
            {/* CRITICAL: Sort by z-index to ensure proper layering */}
            {[...shapes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map((shape) => {
              const shapeProps = {
                id: shape.id,
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height,
                fill: shape.fill,
                stroke: shape.stroke,
                textColor: shape.textColor,
                rotation: shape.rotation || 0,
                opacity: shape.opacity ?? 1,
                isSelected: selectedIds.includes(shape.id),
                isLocked: shape.isLocked,
                lockedBy: shape.lockedBy,
                currentUserId: user?.uid,
                onDragStart: handleShapeDragStart,
                onDragMove: handleShapeDragMove,
                onDragEnd: handleShapeDragEnd,
                onClick: (id: string) => {
                  // Note: shift-click for multi-select would require event object
                  // Currently only single select is supported via this path
                  selectShape(id, false);
                },
                onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
                  handleShapeContextMenu(e, shape.id);
                },
                onTransformEnd: handleTransformEnd,
                // Add Figma-style endpoint dragging for lines
                ...(shape.type === 'line' && { onEndpointDrag: handleLineEndpointDrag }),
                shapeRef: (node: Konva.Node | null) => {
                  if (node) {
                    shapeRefs.current.set(shape.id, node);
                  } else {
                    shapeRefs.current.delete(shape.id);
                  }
                },
              };

              if (shape.type === 'circle') {
                return <Circle key={shape.id} {...shapeProps} />;
              } else if (shape.type === 'text') {
                return (
                  <TextBox
                    key={shape.id}
                    {...shapeProps}
                    text={shape.text || 'Text'}
                    isEditing={editingTextId === shape.id}
                    onStartEdit={handleStartTextEdit}
                  />
                );
              } else if (shape.type === 'line') {
                return <LineShape key={shape.id} {...shapeProps} />;
              } else {
                return <Rectangle key={shape.id} {...shapeProps} />;
              }
            })}
            
            {/* Transformer for resize and rotate */}
            {/* Hide Transformer for lines (they use Figma-style endpoint editing) */}
            {(() => {
              const selectedShape = selectedIds.length === 1 ? shapes.find(s => s.id === selectedIds[0]) : null;
              const isLineSelected = selectedShape?.type === 'line';
              
              return (
            <Transformer
              ref={transformerRef}
                  visible={!isLineSelected} // Hide for lines
              boundBoxFunc={(oldBox, newBox) => {
                // Limit minimum size to prevent tiny shapes
                const minWidth = 20;
                const minHeight = 20;
                
                if (newBox.width < minWidth || newBox.height < minHeight) {
                  return oldBox;
                }
                return newBox;
              }}
              enabledAnchors={[
                'top-left',
                'top-center',
                'top-right',
                'middle-right',
                'middle-left',
                'bottom-left',
                'bottom-center',
                'bottom-right',
              ]}
              rotateEnabled={true}
              onTransformStart={handleTransformStart}
              onTransform={handleTransform}
              onTransformEnd={handleTransformEnd}
              shouldOverdrawWholeArea={false}
              ignoreStroke={false}
            />
              );
            })()}
            
            {/* Dimension badge for selected shape - rendered outside shape Group */}
            {selectedId && (() => {
              const selectedShape = shapes.find(s => s.id === selectedId);
              if (!selectedShape) return null;
              
              // Use live props if available (during drag/transform), otherwise use shape from state
              const displayProps = liveShapeProps && liveShapeProps.id === selectedId ? liveShapeProps : {
                x: selectedShape.x,
                y: selectedShape.y,
                width: selectedShape.width,
                height: selectedShape.height,
                rotation: selectedShape.rotation || 0,
              };
              
              // For lines: show actual line length dimensions (not bounding box)
              // Lines store deltaX and deltaY, so show absolute values
              let dimensionsText: string;
              if (selectedShape.type === 'line') {
                const absWidth = Math.abs(Math.round(displayProps.width));
                const absHeight = Math.abs(Math.round(displayProps.height));
                dimensionsText = `${absWidth} × ${absHeight}`;
              } else {
                dimensionsText = `${Math.round(displayProps.width)} × ${Math.round(displayProps.height)}`;
              }
              const badgePadding = { x: 8, y: 4 };
              const badgeFontSize = 12;
              const textWidth = dimensionsText.length * 7;
              const badgeWidth = textWidth + badgePadding.x * 2;
              const badgeHeight = badgeFontSize + badgePadding.y * 2;
              
              // Calculate badge position based on shape type and rotation
              const rotation = displayProps.rotation;
              const rotationRad = (rotation * Math.PI) / 180;
              
              let badgeX, badgeY;
              
              if (selectedShape.type === 'circle') {
                // For circles/ovals: center below the shape
                // Use the larger radius to position badge below the shape
                const radiusY = displayProps.height / 2;
                badgeX = displayProps.x - badgeWidth / 2;
                badgeY = displayProps.y + radiusY + 10;
              } else if (selectedShape.type === 'line') {
                // For lines: below the end point
                const endY = displayProps.y + displayProps.height;
                const maxY = Math.max(displayProps.y, endY);
                badgeX = displayProps.x + displayProps.width / 2 - badgeWidth / 2;
                badgeY = maxY + 10;
              } else {
                // For rectangles and text: calculate bottom-center accounting for rotation
                const centerX = displayProps.width / 2;
                const bottomY = displayProps.height;
                
                // Apply rotation transformation
                const rotatedX = centerX * Math.cos(rotationRad) - bottomY * Math.sin(rotationRad);
                const rotatedY = centerX * Math.sin(rotationRad) + bottomY * Math.cos(rotationRad);
                
                badgeX = displayProps.x + rotatedX - badgeWidth / 2;
                badgeY = displayProps.y + rotatedY + 10;
              }
              
              return (
                <Group>
                  {/* Badge background */}
                  <Rect
                    x={badgeX}
                    y={badgeY}
                    width={badgeWidth}
                    height={badgeHeight}
                    fill="#3498db"
                    cornerRadius={4}
                    listening={false}
                  />
                  {/* Dimensions text */}
                  <Text
                    x={badgeX}
                    y={badgeY + badgePadding.y}
                    width={badgeWidth}
                    text={dimensionsText}
                    fontSize={badgeFontSize}
                    fill="white"
                    align="center"
                    fontStyle="bold"
                    listening={false}
                  />
                </Group>
              );
            })()}
            
            {/* Preview shape while dragging to create */}
            {previewShape && placementType && (isPlacementMode || (isDraggingCreate && isMouseDown.current)) && (
              placementType === 'line' ? (
                <LineShape
                  key="preview"
                  id="preview"
                  x={previewShape.x}
                  y={previewShape.y}
                  width={previewShape.width}
                  height={previewShape.height}
                  fill="#3498db"
                  isSelected={true}
                  isLocked={false}
                  lockedBy={undefined}
                  currentUserId={user?.uid}
                  onClick={() => {}}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  opacity={0.7}
                />
              ) : placementType === 'circle' ? (
                <Circle
                  key="preview"
                  id="preview"
                  x={previewShape.x}
                  y={previewShape.y}
                  width={previewShape.width}
                  height={previewShape.height}
                  fill="#3498db"
                  isSelected={true}
                  isLocked={isPlacementMode}
                  lockedBy={undefined}
                  currentUserId={user?.uid}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onClick={() => {}}
                  opacity={isPlacementMode ? 0.7 : 0.5}
                />
              ) : placementType === 'text' ? (
                <TextBox
                  key="preview"
                  id="preview"
                  x={previewShape.x}
                  y={previewShape.y}
                  width={previewShape.width}
                  height={previewShape.height}
                  fill="transparent"
                  text="Text"
                  isSelected={true}
                  isLocked={false}
                  lockedBy={undefined}
                  currentUserId={user?.uid}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onClick={() => {}}
                  opacity={isPlacementMode ? 0.7 : 0.5}
                />
              ) : (
                <Rectangle
                  key="preview"
                  id="preview"
                  x={previewShape.x}
                  y={previewShape.y}
                  width={previewShape.width}
                  height={previewShape.height}
                  fill="#3498db"
                  isSelected={true}
                  isLocked={isPlacementMode}
                  lockedBy={undefined}
                  currentUserId={user?.uid}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onClick={() => {}}
                  opacity={isPlacementMode ? 0.7 : 0.5}
                />
              )
            )}
            
            {/* Box selection visualization */}
            {selectionBox && cursorMode === 'select' && (
              <Rect
                x={selectionBox.x}
                y={selectionBox.y}
                width={selectionBox.width}
                height={selectionBox.height}
                fill="rgba(52, 152, 219, 0.1)"
                stroke="#3498db"
                strokeWidth={2 / stageScale}
                dash={[10 / stageScale, 5 / stageScale]}
                listening={false}
              />
            )}
          </Layer>

          {/* Separate layer for cursors (performance optimization) */}
          <Layer listening={false}>
            {activeCursors.map((cursor) => (
              <Cursor key={cursor.userId} cursor={cursor} />
            ))}
          </Layer>
        </Stage>
      </div>

      {/* AI Chat Window */}
      <AIChatWindow
        onExecuteCommand={handleAICommand}
        isProcessing={isProcessingAI}
        aiEnabled={AI_ENABLED}
        conversationHistory={conversationHistory}
      />

      {/* Bulk Shape Confirmation Modal */}
      {bulkConfirmation && (
        <BulkConfirmationModal
          count={bulkConfirmation.count}
          onConfirm={handleBulkConfirm}
          onCancel={handleBulkCancel}
        />
      )}

      {/* Text Editing Overlay */}
      {editingTextId && (
        <textarea
          ref={textareaRef}
          value={editingText}
          onChange={async (e) => {
            const newText = e.target.value;
            setEditingText(newText);
            
            // Auto-resize textarea and shape width based on content
            const shape = shapes.find(s => s.id === editingTextId);
            if (shape && textareaRef.current) {
              const fontSize = Math.max(12, shape.height * 0.8) * stageScale;
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (context) {
                context.font = `${fontSize}px Arial, sans-serif`;
                const metrics = context.measureText(newText || 'Text');
                const newWidth = Math.max(50, (metrics.width + 20) * stageScale);
                const actualWidth = Math.max(50, metrics.width + 20); // Unscaled width for shape
                
                // Update textarea width immediately
                textareaRef.current.style.width = `${newWidth}px`;
                
                // Update shape width in real-time for dimensions display
                try {
                  await updateShape(editingTextId, { 
                    text: newText,
                    width: actualWidth 
                  });
                } catch (err) {
                  // Silently fail during typing - will be saved on blur
                  console.log('[Text Edit] Width update during typing:', err);
                }
              }
            }
          }}
          onBlur={handleSaveTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSaveTextEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleCancelTextEdit();
            }
          }}
        />
      )}
    </div>
  );
}

