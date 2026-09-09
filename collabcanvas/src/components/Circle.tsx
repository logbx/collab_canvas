import { memo } from 'react';
import { Ellipse, Text, Group } from 'react-konva';
import type Konva from 'konva';

interface CircleProps {
  id: string;
  x: number;
  y: number;
  width: number;  // Horizontal diameter (radiusX = width/2)
  height: number; // Vertical diameter (radiusY = height/2)
  fill: string;
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
  shapeRef?: (node: Konva.Group | null) => void;
  opacity?: number;
}

function Circle({
  id,
  x,
  y,
  width,
  height,
  fill,
  rotation = 0,
  isSelected: _isSelected,
  isLocked,
  lockedBy,
  currentUserId,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClick,
  onContextMenu,
  onTransformEnd,
  shapeRef,
  opacity = 1,
}: CircleProps) {
  // Check if this shape is locked by another user
  const isLockedByOther = isLocked && lockedBy !== currentUserId;
  
  // Allow dragging if not locked OR if locked by current user
  const isDraggable = !isLocked || lockedBy === currentUserId;

  // Calculate radii from width and height (allows ellipses/ovals)
  const radiusX = width / 2;
  const radiusY = height / 2;

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; // Prevent stage from receiving drag event
    console.log(`[CIRCLE DRAG START] ID: ${id}, Position: (${x}, ${y})`);
    onDragStart(id);
  };

  const handleDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[CIRCLE DRAGGING] ID: ${id}, Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    if (onDragMove) {
      onDragMove(id, newX, newY);
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[CIRCLE DRAG END] ID: ${id}, Final Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    onDragEnd(id, newX, newY);
  };

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent stage click
    onClick(id);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent stage from starting drag
  };

  return (
    <Group
      id={id}
      x={x}
      y={y}
      width={width}
      height={height} // Now supports independent width and height
      rotation={rotation}
      draggable={isDraggable}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragMove={handleDrag}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onTransformEnd={onTransformEnd}
      ref={shapeRef}
    >
      {/* Main ellipse/circle shape - uses Ellipse for independent width/height */}
      <Ellipse
        x={0}
        y={0}
        radiusX={radiusX}
        radiusY={radiusY}
        fill={fill}
        opacity={opacity}
        stroke={isLockedByOther ? '#e74c3c' : undefined}
        strokeWidth={isLockedByOther ? 2 : 0}
      />
      
      {/* Show lock indicator when locked by another user */}
      {isLockedByOther && (
        <Text
          x={-30}
          y={-radiusY - 20}
          text="🔒 Locked"
          fontSize={14}
          fill="#e74c3c"
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  );
}

// Memoize component to prevent unnecessary re-renders
// Only re-render if these specific props change
export default memo(Circle, (prevProps, nextProps) => {
  return (
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.fill === nextProps.fill &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLocked === nextProps.isLocked &&
    prevProps.lockedBy === nextProps.lockedBy &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.opacity === nextProps.opacity
  );
});

