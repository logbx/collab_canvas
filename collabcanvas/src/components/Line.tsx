import React, { useState, useRef } from 'react';
import { Line as KonvaLine, Group, Circle } from 'react-konva';
import type Konva from 'konva';
import { snapLineDelta } from '../utils/canvasHelpers';

interface LineProps {
  id: string;
  x: number;
  y: number;
  width: number;  // Delta X to end point
  height: number; // Delta Y to end point
  fill: string;   // Stroke color (fallback)
  stroke?: string; // Preferred stroke color
  rotation?: number;
  isSelected: boolean;
  isLocked?: boolean;
  lockedBy?: string;
  currentUserId?: string;
  onDragStart: (id: string) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onClick: (id: string) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
  onEndpointDrag?: (id: string, newWidth: number, newHeight: number, newX: number, newY: number) => void;
  shapeRef?: (node: Konva.Group | null) => void;
  opacity?: number; // For preview mode
}

const Line = React.memo(({
  id,
  x,
  y,
  width,
  height,
  fill,
  stroke,
  rotation = 0,
  isSelected,
  isLocked,
  lockedBy,
  currentUserId,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClick,
  onContextMenu,
  onTransformEnd,
  onEndpointDrag,
  shapeRef,
  opacity = 1,
}: LineProps) => {
  // Match Rectangle's lock check logic
  const isLockedByOther = isLocked && lockedBy !== currentUserId;
  
  // Allow dragging if not locked OR if locked by current user
  const isDraggable = !isLocked || lockedBy === currentUserId;
  
  // Track which endpoint is being dragged
  const [draggingEndpoint, setDraggingEndpoint] = useState<'start' | 'end' | null>(null);
  
  // Store original line position when endpoint drag starts
  const originalLinePos = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  
  // Track live preview dimensions and position during endpoint drag (for immediate visual feedback)
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number } | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Calculate endpoints from stored data (or preview data during drag)
  // x, y = start point, width/height = delta to end point
  const displayWidth = previewDimensions?.width ?? width;
  const displayHeight = previewDimensions?.height ?? height;
  const displayX = previewPosition?.x ?? x;
  const displayY = previewPosition?.y ?? y;
  
  const startX = 0;
  const startY = 0;
  const endX = displayWidth;
  const endY = displayHeight;

  // Determine stroke color based on state (match Rectangle)
  const getStrokeColor = () => {
    if (isSelected) return '#3498db'; // Blue for selected
    if (isLockedByOther) return '#e74c3c'; // Red for locked by another user
    return stroke || fill; // Use stroke if available, otherwise fall back to fill
  };

  // Determine stroke width based on state (match Rectangle)
  const getStrokeWidth = () => {
    if (isSelected || isLockedByOther) return 3;
    return 3;
  };

  // Match Rectangle/Circle behavior EXACTLY - use typed Konva events
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent stage from starting drag
  };

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; // Prevent stage from receiving drag event
    console.log(`[LINE DRAG START] ID: ${id}, Position: (${x}, ${y})`);
    onDragStart(id);
  };

  const handleDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const newX = e.target.x();
    const newY = e.target.y();
    if (onDragMove) {
      onDragMove(id, newX, newY);
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[LINE DRAG END] ID: ${id}, Final Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    onDragEnd(id, newX, newY);
  };

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent stage click
    onClick(id);
  };

  // Endpoint dragging handlers
  const handleEndpointDragStart = (endpoint: 'start' | 'end', e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    setDraggingEndpoint(endpoint);
    originalLinePos.current = { x, y, width, height };
    
    console.log(`[ENDPOINT DRAG START] ${endpoint} of line ${id}`);
    
    // Lock the line while dragging endpoint
    onDragStart(id);
  };

  const handleEndpointDrag = (endpoint: 'start' | 'end', e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    
    if (!originalLinePos.current) return;
    
    // Get the endpoint's position in the parent Group's coordinate space
    const endpointNode = e.target;
    const newEndpointX = endpointNode.x();
    const newEndpointY = endpointNode.y();
    
    let newX = originalLinePos.current.x;
    let newY = originalLinePos.current.y;
    let newWidth = originalLinePos.current.width;
    let newHeight = originalLinePos.current.height;
    
    if (endpoint === 'start') {
      // Moving start point: adjust x, y and recalculate width, height
      newX = originalLinePos.current.x + newEndpointX;
      newY = originalLinePos.current.y + newEndpointY;
      newWidth = originalLinePos.current.width - newEndpointX;
      newHeight = originalLinePos.current.height - newEndpointY;
    } else {
      // Moving end point: just adjust width and height
      newWidth = newEndpointX;
      newHeight = newEndpointY;
    }
    
    // Apply angle snapping to the new dimensions for visual feedback
    const snapped = snapLineDelta(newWidth, newHeight, 5);
    
    if (snapped.isSnapped) {
      console.log(`[ENDPOINT SNAP] ${endpoint}: (${newWidth.toFixed(1)}, ${newHeight.toFixed(1)}) → (${snapped.deltaX.toFixed(1)}, ${snapped.deltaY.toFixed(1)})`);
      newWidth = snapped.deltaX;
      newHeight = snapped.deltaY;
      
      // DON'T reposition the endpoint during drag - let it follow cursor
      // Only update the line dimensions for visual feedback
    }
    
    // Update preview dimensions and position immediately for instant visual feedback
    setPreviewDimensions({ width: newWidth, height: newHeight });
    
    // If dragging start endpoint, also update preview position
    if (endpoint === 'start') {
      setPreviewPosition({ x: newX, y: newY });
    }
    
    // Notify parent of dimension change (Firebase sync happens in background)
    if (onEndpointDrag) {
      onEndpointDrag(id, newWidth, newHeight, newX, newY);
    }
  };

  const handleEndpointDragEnd = (endpoint: 'start' | 'end', e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    
    if (!originalLinePos.current || !onEndpointDrag) return;
    
    const endpointNode = e.target;
    const finalX = endpointNode.x();
    const finalY = endpointNode.y();
    
    let newX = originalLinePos.current.x;
    let newY = originalLinePos.current.y;
    let newWidth = originalLinePos.current.width;
    let newHeight = originalLinePos.current.height;
    
    if (endpoint === 'start') {
      newX = originalLinePos.current.x + finalX;
      newY = originalLinePos.current.y + finalY;
      newWidth = originalLinePos.current.width - finalX;
      newHeight = originalLinePos.current.height - finalY;
    } else {
      newWidth = finalX;
      newHeight = finalY;
    }
    
    // Apply final snap
    const snapped = snapLineDelta(newWidth, newHeight, 5);
    newWidth = snapped.deltaX;
    newHeight = snapped.deltaY;
    
    console.log(`[ENDPOINT DRAG END] ${endpoint} of line ${id}: dimensions (${newWidth.toFixed(1)}, ${newHeight.toFixed(1)})`);
    
    // Reset endpoint position to match line data
    endpointNode.x(endpoint === 'start' ? 0 : newWidth);
    endpointNode.y(endpoint === 'start' ? 0 : newHeight);
    
    // Final update
    onEndpointDrag(id, newWidth, newHeight, newX, newY);
    
    // Unlock the line
    onDragEnd(id, newX, newY);
    
    // Clear preview dimensions and position - let Firebase props take over
    setPreviewDimensions(null);
    setPreviewPosition(null);
    setDraggingEndpoint(null);
    originalLinePos.current = null;
  };

  return (
    <Group
      id={id}
      x={displayX}
      y={displayY}
      width={Math.abs(displayWidth)}
      height={Math.abs(displayHeight)}
      rotation={rotation}
      draggable={isDraggable && !draggingEndpoint} // Disable group drag when dragging endpoint
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragMove={handleDrag}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onTransformEnd={onTransformEnd}
      ref={shapeRef}
    >
      {/* Main line */}
      <KonvaLine
        points={[startX, startY, endX, endY]}
        stroke={getStrokeColor()}
        strokeWidth={getStrokeWidth()}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={20} // Makes line easier to click
        opacity={opacity}
        listening={true} // Keep line interactive even when selected so users can grab and move it
      />
      
      {/* Figma-style endpoint anchors (only show when selected) */}
      {isSelected && isDraggable && (
        <>
          {/* Start point anchor */}
          <Circle
            x={startX}
            y={startY}
            radius={6}
            fill="white"
            stroke="#3498db"
            strokeWidth={2}
            draggable={true}
            onMouseDown={(e) => e.cancelBubble = true} // Prevent line drag when clicking endpoint
            onDragStart={(e) => handleEndpointDragStart('start', e)}
            onDragMove={(e) => handleEndpointDrag('start', e)}
            onDragEnd={(e) => handleEndpointDragEnd('start', e)}
          />
          
          {/* End point anchor */}
          <Circle
            x={endX}
            y={endY}
            radius={6}
            fill="white"
            stroke="#3498db"
            strokeWidth={2}
            draggable={true}
            onMouseDown={(e) => e.cancelBubble = true} // Prevent line drag when clicking endpoint
            onDragStart={(e) => handleEndpointDragStart('end', e)}
            onDragMove={(e) => handleEndpointDrag('end', e)}
            onDragEnd={(e) => handleEndpointDragEnd('end', e)}
          />
        </>
      )}
    </Group>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  return (
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.fill === nextProps.fill &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLocked === nextProps.isLocked &&
    prevProps.lockedBy === nextProps.lockedBy
  );
});

Line.displayName = 'Line';

export default Line;
