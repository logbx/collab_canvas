/**
 * Bulk Shape Generator
 * Generates positions for multiple shapes with various layout patterns
 */

export interface BulkShapeConfig {
  count: number;
  shapeType: 'rectangle' | 'circle' | 'mixed';
  layout: 'grid' | 'random' | 'spiral' | 'line';
  color?: string;
  size?: number;
}

export interface ShapePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

/**
 * Generate positions for bulk shapes based on layout pattern
 */
export function generateBulkShapePositions(
  config: BulkShapeConfig,
  canvasDims: { width: number; height: number }
): ShapePosition[] {
  const size = config.size || 50;
  
  console.log(`[BulkShapeGenerator] Generating ${config.count} ${config.shapeType} shapes in ${config.layout} layout`);
  
  switch (config.layout) {
    case 'grid':
      return generateGridLayout(config.count, config.shapeType, size, canvasDims);
    
    case 'random':
      return generateRandomLayout(config.count, config.shapeType, size, canvasDims);
    
    case 'spiral':
      return generateSpiralLayout(config.count, config.shapeType, size, canvasDims);
    
    case 'line':
      return generateLineLayout(config.count, config.shapeType, size, canvasDims);
    
    default:
      console.warn(`[BulkShapeGenerator] Unknown layout: ${config.layout}, defaulting to grid`);
      return generateGridLayout(config.count, config.shapeType, size, canvasDims);
  }
}

/**
 * Grid layout - organized rows and columns
 */
function generateGridLayout(
  count: number,
  shapeType: string,
  size: number,
  _canvasDims: { width: number; height: number } // eslint-disable-line @typescript-eslint/no-unused-vars
): ShapePosition[] {
  const shapes: ShapePosition[] = [];
  const cols = Math.ceil(Math.sqrt(count));
  const spacing = size + 20;
  
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    shapes.push({
      x: 100 + col * spacing,
      y: 100 + row * spacing,
      width: size,
      height: size,
      type: getShapeType(shapeType, i),
    });
  }
  
  console.log(`[Grid Layout] Created ${count} shapes in ${cols} columns`);
  return shapes;
}

/**
 * Random layout - scattered across canvas
 */
function generateRandomLayout(
  count: number,
  shapeType: string,
  size: number,
  canvasDims: { width: number; height: number }
): ShapePosition[] {
  const shapes: ShapePosition[] = [];
  const margin = 50;
  
  for (let i = 0; i < count; i++) {
    shapes.push({
      x: margin + Math.random() * (canvasDims.width - size - margin * 2),
      y: margin + Math.random() * (canvasDims.height - size - margin * 2),
      width: size,
      height: size,
      type: getShapeType(shapeType, i),
    });
  }
  
  console.log(`[Random Layout] Scattered ${count} shapes across canvas`);
  return shapes;
}

/**
 * Spiral layout - spiral pattern from center
 */
function generateSpiralLayout(
  count: number,
  shapeType: string,
  size: number,
  canvasDims: { width: number; height: number }
): ShapePosition[] {
  const shapes: ShapePosition[] = [];
  const centerX = canvasDims.width / 2;
  const centerY = canvasDims.height / 2;
  
  for (let i = 0; i < count; i++) {
    const angle = i * 0.3; // 0.3 radians between each shape
    const radius = 5 + i * 2; // Increasing radius
    shapes.push({
      x: centerX + Math.cos(angle) * radius - size / 2,
      y: centerY + Math.sin(angle) * radius - size / 2,
      width: size,
      height: size,
      type: getShapeType(shapeType, i),
    });
  }
  
  console.log(`[Spiral Layout] Created ${count} shapes in spiral pattern`);
  return shapes;
}

/**
 * Line layout - horizontal line
 */
function generateLineLayout(
  count: number,
  shapeType: string,
  size: number,
  canvasDims: { width: number; height: number }
): ShapePosition[] {
  const shapes: ShapePosition[] = [];
  const spacing = size + 10;
  const startX = 50;
  const centerY = canvasDims.height / 2;
  
  for (let i = 0; i < count; i++) {
    shapes.push({
      x: startX + i * spacing,
      y: centerY - size / 2,
      width: size,
      height: size,
      type: getShapeType(shapeType, i),
    });
  }
  
  console.log(`[Line Layout] Created ${count} shapes in horizontal line`);
  return shapes;
}

/**
 * Helper to determine shape type based on configuration
 */
function getShapeType(shapeType: string, index: number): string {
  if (shapeType === 'mixed') {
    return index % 2 === 0 ? 'rectangle' : 'circle';
  }
  return shapeType;
}

