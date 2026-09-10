import { memo } from 'react';
import { Text, Group, Rect } from 'react-konva';
import type Konva from 'konva';

interface TextBoxProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string; // Background color (optional, mostly transparent)
  textColor?: string; // Text color
  text: string;
  rotation?: number;
  isSelected: boolean;
  isLocked?: boolean;
  lockedBy?: string;
  currentUserId?: string;
  isEditing?: boolean; // NEW: Whether this text box is currently being edited
  onDragStart: (id: string) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onClick: (id: string) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onTextChange?: (id: string, newText: string) => void;
  onStartEdit?: (id: string) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
  shapeRef?: (node: Konva.Group | null) => void;
  opacity?: number;
}

function TextBox({
  id,
  x,
  y,
  width,
  height,
  fill,
  textColor,
  text,
  rotation = 0,
  isSelected,
  isLocked,
  lockedBy,
  currentUserId,
  isEditing = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClick,
  onContextMenu,
  onStartEdit,
  onTransformEnd,
  shapeRef,
  opacity = 1,
}: TextBoxProps) {
  // Check if this shape is locked by another user
  const isLockedByOther = isLocked && lockedBy !== currentUserId;
  
  // Allow dragging if not locked OR if locked by current user
  const isDraggable = !isLocked || lockedBy === currentUserId;

  // Calculate font size to stretch text to fill the box completely
  // Use 95% of height to leave small padding at top/bottom
  // Ensure all values are valid numbers to prevent NaN
  const safeHeight = Math.max(20, Math.abs(height || 20));
  const safeWidth = Math.max(20, Math.abs(width || 20));
  
  const heightBasedSize = Math.max(12, safeHeight * 0.95);
  
  // Estimate text width at current font size (rough approximation: avg char width = fontSize * 0.6)
  const avgCharWidth = heightBasedSize * 0.6;
  const estimatedTextWidth = Math.max(1, text.length * avgCharWidth);
  
  // Scale font size to fit width if text is too narrow or too wide
  const widthScale = safeWidth / estimatedTextWidth;
  const widthBasedSize = heightBasedSize * widthScale;
  
  // Use width-based size, constrained by height to prevent overflow
  const fontSize = Math.max(12, Math.min(widthBasedSize, safeHeight * 0.95));

  // Calculate letter spacing to help text fill width
  // Positive value spreads letters out, negative brings them closer
  const targetTextWidth = safeWidth * 0.95; // Use 95% of width
  const baseTextWidth = Math.max(1, text.length * fontSize * 0.6); // Approximate text width
  const letterSpacing = ((targetTextWidth - baseTextWidth) / Math.max(1, text.length));

  // Calculate dimensions text and badge dimensions
  const dimensionsText = `${Math.round(width)} × ${Math.round(height)}`;
  const badgePadding = { x: 8, y: 4 };
  const badgeFontSize = 12;
  // Approximate text width (rough estimate: 7px per character)
  const textWidth = dimensionsText.length * 7;
  const badgeWidth = textWidth + badgePadding.x * 2;
  const badgeHeight = badgeFontSize + badgePadding.y * 2;

  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; // Prevent stage from receiving drag event
    console.log(`[TEXTBOX DRAG START] ID: ${id}, Position: (${x}, ${y})`);
    onDragStart(id);
  };

  const handleDrag = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[TEXTBOX DRAGGING] ID: ${id}, Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    if (onDragMove) {
      onDragMove(id, newX, newY);
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const newX = e.target.x();
    const newY = e.target.y();
    console.log(`[TEXTBOX DRAG END] ID: ${id}, Final Position: (${newX.toFixed(2)}, ${newY.toFixed(2)})`);
    onDragEnd(id, newX, newY);
  };

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent stage click
    onClick(id);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent stage from starting drag
  };

  const handleDoubleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (!isLockedByOther && isSelected && onStartEdit) {
      console.log(`[TEXTBOX] Double-click detected on ${id}, entering edit mode`);
      onStartEdit(id);
    }
  };

  return (
    <Group
      id={id}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      draggable={isDraggable}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragMove={handleDrag}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      onDblClick={handleDoubleClick}
      onTransformEnd={onTransformEnd}
      ref={shapeRef}
    >
      {/* Background rectangle - with optional fill color */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={fill || "transparent"}
        stroke={isSelected ? '#3498db' : (isLockedByOther ? '#e74c3c' : undefined)}
        strokeWidth={isSelected ? 2 : (isLockedByOther ? 2 : 0)}
        opacity={fill && fill !== "transparent" ? 0.3 : 1}
      />
      
      {/* Text display - white color, no background */}
      {/* Hide the text element when editing to prevent duplicate overlay */}
      {!isEditing && (
        <Text
          x={0}
          y={0}
          width={width}
          height={height}
          text={text}
          fontSize={fontSize}
          letterSpacing={letterSpacing}
          fill={textColor || "#ffffff"}
          fontFamily="Arial, sans-serif"
          verticalAlign="middle"
          align="center"
          opacity={opacity}
          listening={false}
          wrap="word"
          ellipsis={false}
        />
      )}
      
      {/* Show lock indicator when locked by another user */}
      {isLockedByOther && (
        <Text
          x={0}
          y={-20}
          text="🔒 Locked"
          fontSize={14}
          fill="#e74c3c"
          fontStyle="bold"
          listening={false}
        />
      )}

      {/* Show dimensions badge when selected - follows during drag */}
      {isSelected && (
        <Group>
          {/* Badge background */}
          <Rect
            x={width / 2 - badgeWidth / 2}
            y={height + 10}
            width={badgeWidth}
            height={badgeHeight}
            fill="#3498db"
            cornerRadius={4}
            listening={false}
          />
          {/* Dimensions text */}
          <Text
            x={width / 2 - badgeWidth / 2}
            y={height + 10 + badgePadding.y}
            width={badgeWidth}
            text={dimensionsText}
            fontSize={badgeFontSize}
            fill="white"
            align="center"
            fontStyle="bold"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}

// Memoize component to prevent unnecessary re-renders
// Only re-render if these specific props change
export default memo(TextBox, (prevProps, nextProps) => {
  return (
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.fill === nextProps.fill &&
    prevProps.text === nextProps.text &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isLocked === nextProps.isLocked &&
    prevProps.lockedBy === nextProps.lockedBy &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.opacity === nextProps.opacity &&
    prevProps.isEditing === nextProps.isEditing
  );
});

