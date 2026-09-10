/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI Executor - Execute OpenAI Function Calls on Canvas
 * 
 * Translates OpenAI function calls into actual canvas operations.
 * Handles shape finding, position calculations, and command execution.
 */

import type { Shape, ShapeType } from '../types/shape.types';
import { resolveColor } from './aiTools';
import type { FormDefinition } from '../types/formLayout.types';
import { renderFormToCanvas } from './formToCanvas';
import { generateBulkShapePositions, type BulkShapeConfig } from './bulkShapeGenerator';

/**
 * Canvas operation functions interface
 * These are provided by the Canvas component via useShapeSync
 */
export interface CanvasOperations {
  createShape: (shape: Omit<Shape, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  createShapesBatch: (shapes: Omit<Shape, 'id' | 'createdAt' | 'updatedAt'>[]) => Promise<number>;
  updateShape: (id: string, updates: Partial<Shape>) => Promise<void>;
  deleteShape: (id: string) => Promise<void>;
  getShapes: () => Shape[];
  getSelectedShapeId: () => string | null;
  getCanvasDimensions: () => { width: number; height: number };
  getUserId: () => string;
}

/**
 * Result of executing an AI command
 */
export interface ExecutionResult {
  success: boolean;
  message: string;
  shapesCreated?: number;
  shapesModified?: number;
  error?: string;
}

/**
 * Execute a single OpenAI function call
 */
export async function executeFunction(
  functionName: string,
  args: Record<string, unknown>,
  operations: CanvasOperations
): Promise<ExecutionResult> {
  try {
    switch (functionName) {
      case 'createShape':
        return await createShape(args, operations);
      
      case 'createMultipleShapes':
        return await createMultipleShapes(args, operations);
      
      case 'moveShape':
        return await moveShape(args, operations);
      
      case 'resizeShape':
        return await resizeShape(args, operations);
      
      case 'rotateShape':
        return await rotateShape(args, operations);
      
      case 'updateShapeStyle':
        return await updateShapeStyle(args, operations);
      
      case 'deleteShape':
        return await deleteShape(args, operations);
      
      case 'arrangeShapes':
        return await arrangeShapes(args, operations);
      
      case 'distributeShapes':
        return await distributeShapes(args, operations);
      
      case 'alignShapes':
        return await alignShapes(args, operations);
      
      case 'getCanvasState':
        return getCanvasState(args, operations);
      
      case 'findShapes':
        return findShapes(args, operations);
      
      case 'createFormLayout':
        return await createFormLayout(args, operations);
      
      case 'createBulkShapes':
        return await createBulkShapes(args, operations);
      
      default:
        return {
          success: false,
          message: `Unknown function: ${functionName}`,
          error: 'Unknown function',
        };
    }
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      message: `Error executing ${functionName}: ${err.message}`,
      error: err.message,
    };
  }
}

// ==================== CREATION FUNCTIONS ====================

async function createShape(args: Record<string, unknown>, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeType, x, y, width, height, fill, text, stroke, rotation } = args;
  
  // Validate shape type
  const validTypes: ShapeType[] = ['rectangle', 'circle', 'text', 'line'];
  if (!validTypes.includes(shapeType as ShapeType)) {
    return {
      success: false,
      message: `Invalid shape type: ${shapeType}`,
      error: 'Invalid shape type',
    };
  }

  // Set defaults based on shape type
  let finalWidth = width || 100;
  let finalHeight = height || 100;
  
  // For text shapes without specified color, use transparent fill
  let finalFill: string;
  if (shapeType === 'text' && !fill) {
    finalFill = 'transparent';
  } else {
    finalFill = fill ? resolveColor(String(fill)) : '#3498db';
  }

  // For circles, ensure width = height (diameter)
  if (shapeType === 'circle') {
    finalWidth = finalHeight = width || height || 100;
  }

  // For text, use provided text or default
  const finalText = text || (shapeType === 'text' ? 'Text' : undefined);

  // Build shape object, only including defined fields
  const shapeData: any = {
    type: shapeType,
    x,
    y,
    width: finalWidth,
    height: finalHeight,
    fill: finalFill,
    rotation: rotation || 0,
    userId: ops.getUserId(),
  };

  // Only add optional fields if they're defined (Firestore doesn't accept undefined)
  if (finalText !== undefined) shapeData.text = finalText;
  if (stroke) shapeData.stroke = resolveColor(String(stroke));

  await ops.createShape(shapeData);

  return {
    success: true,
    message: `Created ${shapeType} at (${x}, ${y})`,
    shapesCreated: 1,
  };
}

async function createMultipleShapes(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapes } = args;
  
  if (!Array.isArray(shapes) || shapes.length === 0) {
    return {
      success: false,
      message: 'No shapes provided',
      error: 'Invalid shapes array',
    };
  }

  let created = 0;
  const errors: string[] = [];

  for (const shapeSpec of shapes) {
    try {
      await createShape(shapeSpec, ops);
      created++;
    } catch (error: any) {
      errors.push(`Failed to create shape: ${error.message}`);
    }
  }

  return {
    success: created > 0,
    message: `Created ${created} of ${shapes.length} shapes`,
    shapesCreated: created,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ==================== MANIPULATION FUNCTIONS ====================

async function moveShape(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifier, targetX, targetY, direction, distance } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifier, ops);
  if (shapes.length === 0) {
    return {
      success: false,
      message: `No shapes found matching: ${shapeIdentifier}`,
      error: 'Shape not found',
    };
  }

  const shape = shapes[0]; // Use first match
  let newX = shape.x;
  let newY = shape.y;

  // Calculate new position
  if (direction) {
    const dist = distance || 50;
    const dims = ops.getCanvasDimensions();
    
    switch (direction) {
      case 'left':
        newX -= dist;
        break;
      case 'right':
        newX += dist;
        break;
      case 'up':
        newY -= dist;
        break;
      case 'down':
        newY += dist;
        break;
      case 'center':
        newX = dims.width / 2;
        newY = dims.height / 2;
        break;
    }
  } else if (targetX !== undefined || targetY !== undefined) {
    newX = targetX !== undefined ? targetX : shape.x;
    newY = targetY !== undefined ? targetY : shape.y;
  }

  await ops.updateShape(shape.id, { x: newX, y: newY, updatedAt: Date.now() });

  return {
    success: true,
    message: `Moved shape to (${Math.round(newX)}, ${Math.round(newY)})`,
    shapesModified: 1,
  };
}

async function resizeShape(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifier, width, height, scaleFactor } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifier, ops);
  if (shapes.length === 0) {
    return {
      success: false,
      message: `No shapes found matching: ${shapeIdentifier}`,
      error: 'Shape not found',
    };
  }

  const shape = shapes[0];
  let newWidth = shape.width;
  let newHeight = shape.height;

  if (scaleFactor !== undefined) {
    newWidth = shape.width * scaleFactor;
    newHeight = shape.height * scaleFactor;
  } else {
    if (width !== undefined) newWidth = width;
    if (height !== undefined) newHeight = height;
  }

  // For circles, keep width = height
  if (shape.type === 'circle') {
    newWidth = newHeight = Math.max(newWidth, newHeight);
  }

  await ops.updateShape(shape.id, { 
    width: newWidth, 
    height: newHeight, 
    updatedAt: Date.now() 
  });

  return {
    success: true,
    message: `Resized shape to ${Math.round(newWidth)}x${Math.round(newHeight)}`,
    shapesModified: 1,
  };
}

async function rotateShape(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifier, degrees, absolute } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifier, ops);
  if (shapes.length === 0) {
    return {
      success: false,
      message: `No shapes found matching: ${shapeIdentifier}`,
      error: 'Shape not found',
    };
  }

  const shape = shapes[0];
  const currentRotation = shape.rotation || 0;
  const newRotation = absolute ? degrees : currentRotation + degrees;

  await ops.updateShape(shape.id, { 
    rotation: newRotation, 
    updatedAt: Date.now() 
  });

  return {
    success: true,
    message: `Rotated shape to ${Math.round(newRotation)}°`,
    shapesModified: 1,
  };
}

async function updateShapeStyle(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifier, fill, stroke, textColor } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifier, ops);
  if (shapes.length === 0) {
    return {
      success: false,
      message: `No shapes found matching: ${shapeIdentifier}`,
      error: 'Shape not found',
    };
  }

  const shape = shapes[0];
  const updates: Partial<Shape> = { updatedAt: Date.now() };

  if (fill) updates.fill = resolveColor(fill);
  if (stroke) updates.stroke = resolveColor(stroke);
  if (textColor) updates.textColor = resolveColor(textColor);

  await ops.updateShape(shape.id, updates);

  return {
    success: true,
    message: 'Updated shape style',
    shapesModified: 1,
  };
}

async function deleteShape(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifier } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifier, ops);
  if (shapes.length === 0) {
    return {
      success: false,
      message: `No shapes found matching: ${shapeIdentifier}`,
      error: 'Shape not found',
    };
  }

  let deleted = 0;
  for (const shape of shapes) {
    await ops.deleteShape(shape.id);
    deleted++;
  }

  return {
    success: true,
    message: `Deleted ${deleted} shape(s)`,
    shapesModified: deleted,
  };
}

// ==================== LAYOUT FUNCTIONS ====================

async function arrangeShapes(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifiers, layout, spacing, startX, startY, gridColumns } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifiers, ops);
  if (shapes.length === 0) {
    return {
      success: false,
      message: `No shapes found matching: ${shapeIdentifiers}`,
      error: 'Shapes not found',
    };
  }

  const gap = spacing || 20;
  const baseX = startX ?? shapes[0].x;
  const baseY = startY ?? shapes[0].y;

  let modified = 0;

  if (layout === 'horizontal') {
    let currentX = baseX;
    for (const shape of shapes) {
      await ops.updateShape(shape.id, { 
        x: currentX, 
        y: baseY, 
        updatedAt: Date.now() 
      });
      currentX += shape.width + gap;
      modified++;
    }
  } else if (layout === 'vertical') {
    let currentY = baseY;
    for (const shape of shapes) {
      await ops.updateShape(shape.id, { 
        x: baseX, 
        y: currentY, 
        updatedAt: Date.now() 
      });
      currentY += shape.height + gap;
      modified++;
    }
  } else if (layout === 'grid') {
    const cols = gridColumns || Math.ceil(Math.sqrt(shapes.length));
    let currentX = baseX;
    let currentY = baseY;
    let col = 0;
    let maxHeightInRow = 0;

    for (const shape of shapes) {
      await ops.updateShape(shape.id, { 
        x: currentX, 
        y: currentY, 
        updatedAt: Date.now() 
      });
      
      maxHeightInRow = Math.max(maxHeightInRow, shape.height);
      currentX += shape.width + gap;
      col++;
      modified++;

      if (col >= cols) {
        col = 0;
        currentX = baseX;
        currentY += maxHeightInRow + gap;
        maxHeightInRow = 0;
      }
    }
  }

  return {
    success: true,
    message: `Arranged ${modified} shapes in ${layout} layout`,
    shapesModified: modified,
  };
}

async function distributeShapes(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifiers, direction, spacing } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifiers, ops).sort((a, b) => 
    direction === 'horizontal' ? a.x - b.x : a.y - b.y
  );
  
  if (shapes.length < 2) {
    return {
      success: false,
      message: 'Need at least 2 shapes to distribute',
      error: 'Insufficient shapes',
    };
  }

  let modified = 0;
  const gap = spacing;

  if (direction === 'horizontal') {
    let currentX = shapes[0].x;
    for (const shape of shapes) {
      await ops.updateShape(shape.id, { 
        x: currentX, 
        updatedAt: Date.now() 
      });
      currentX += shape.width + gap;
      modified++;
    }
  } else {
    let currentY = shapes[0].y;
    for (const shape of shapes) {
      await ops.updateShape(shape.id, { 
        y: currentY, 
        updatedAt: Date.now() 
      });
      currentY += shape.height + gap;
      modified++;
    }
  }

  return {
    success: true,
    message: `Distributed ${modified} shapes with ${gap}px spacing`,
    shapesModified: modified,
  };
}

async function alignShapes(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { shapeIdentifiers, alignment } = args;
  
  const shapes = findShapesByIdentifier(shapeIdentifiers, ops);
  if (shapes.length < 2) {
    return {
      success: false,
      message: 'Need at least 2 shapes to align',
      error: 'Insufficient shapes',
    };
  }

  // Calculate alignment reference
  let alignValue: number;
  
  switch (alignment) {
    case 'left':
      alignValue = Math.min(...shapes.map(s => s.x));
      for (const shape of shapes) {
        await ops.updateShape(shape.id, { x: alignValue, updatedAt: Date.now() });
      }
      break;
    
    case 'right':
      alignValue = Math.max(...shapes.map(s => s.x + s.width));
      for (const shape of shapes) {
        await ops.updateShape(shape.id, { x: alignValue - shape.width, updatedAt: Date.now() });
      }
      break;
    
    case 'top':
      alignValue = Math.min(...shapes.map(s => s.y));
      for (const shape of shapes) {
        await ops.updateShape(shape.id, { y: alignValue, updatedAt: Date.now() });
      }
      break;
    
    case 'bottom':
      alignValue = Math.max(...shapes.map(s => s.y + s.height));
      for (const shape of shapes) {
        await ops.updateShape(shape.id, { y: alignValue - shape.height, updatedAt: Date.now() });
      }
      break;
    
    case 'center-horizontal':
      alignValue = shapes.reduce((sum, s) => sum + s.x + s.width / 2, 0) / shapes.length;
      for (const shape of shapes) {
        await ops.updateShape(shape.id, { x: alignValue - shape.width / 2, updatedAt: Date.now() });
      }
      break;
    
    case 'center-vertical':
      alignValue = shapes.reduce((sum, s) => sum + s.y + s.height / 2, 0) / shapes.length;
      for (const shape of shapes) {
        await ops.updateShape(shape.id, { y: alignValue - shape.height / 2, updatedAt: Date.now() });
      }
      break;
  }

  return {
    success: true,
    message: `Aligned ${shapes.length} shapes (${alignment})`,
    shapesModified: shapes.length,
  };
}

// ==================== QUERY FUNCTIONS ====================

function getCanvasState(args: any, ops: CanvasOperations): ExecutionResult {
  const shapes = ops.getShapes();
  const includeDetails = args.includeDetails !== false;

  const summary = includeDetails
    ? shapes.map(s => ({
        id: s.id,
        type: s.type,
        position: `(${Math.round(s.x)}, ${Math.round(s.y)})`,
        size: `${Math.round(s.width)}x${Math.round(s.height)}`,
        color: s.fill,
        text: s.text,
      }))
    : `${shapes.length} shapes on canvas`;

  return {
    success: true,
    message: JSON.stringify(summary, null, 2),
  };
}

function findShapes(args: any, ops: CanvasOperations): ExecutionResult {
  const { shapeType, color, textContent } = args;
  let results = ops.getShapes();

  if (shapeType && shapeType !== 'any') {
    results = results.filter(s => s.type === shapeType);
  }

  if (color) {
    const targetColor = resolveColor(color).toLowerCase();
    results = results.filter(s => s.fill?.toLowerCase().includes(targetColor) || 
                                   s.fill?.toLowerCase() === targetColor);
  }

  if (textContent) {
    results = results.filter(s => s.text?.toLowerCase().includes(textContent.toLowerCase()));
  }

  return {
    success: true,
    message: `Found ${results.length} matching shapes`,
  };
}

// ==================== FORM GENERATION ====================

/**
 * Create a professional form layout with design tokens
 */
async function createFormLayout(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { formType, stylePreset = 'minimal', customFields, includeSubmit = true } = args;
  
  console.log(`[createFormLayout] Generating ${formType} form with ${stylePreset} style`);
  
  // Build form definition based on form type
  const formDef: FormDefinition = {
    type: 'Form',
    layout: 'centered',
    style: stylePreset,
    components: [],
  };
  
  // Add header
  const formHeaders: Record<string, string> = {
    login: 'Welcome Back!',
    signup: 'Create Account',
    contact: 'Get in Touch',
    search: 'Search',
    payment: 'Payment Details',
    custom: 'Form',
  };
  
  formDef.components.push({
    type: 'Text',
    props: {
      value: formHeaders[formType] || 'Form',
      variant: 'header',
    },
  });
  
  // Add fields based on form type
  switch (formType) {
    case 'login':
      formDef.components.push(
        {
          type: 'Input',
          props: {
            label: 'Email',
            placeholder: 'you@example.com',
            type: 'email',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Password',
            placeholder: '••••••••',
            type: 'password',
            required: true,
          },
        }
      );
      break;
    
    case 'signup':
      formDef.components.push(
        {
          type: 'Input',
          props: {
            label: 'Full Name',
            placeholder: 'John Doe',
            type: 'text',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Email',
            placeholder: 'you@example.com',
            type: 'email',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Password',
            placeholder: '••••••••',
            type: 'password',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Confirm Password',
            placeholder: '••••••••',
            type: 'password',
            required: true,
          },
        },
        {
          type: 'Checkbox',
          props: {
            label: 'I agree to the Terms and Conditions',
          },
        }
      );
      break;
    
    case 'contact':
      formDef.components.push(
        {
          type: 'Input',
          props: {
            label: 'Name',
            placeholder: 'Your name',
            type: 'text',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Email',
            placeholder: 'your@email.com',
            type: 'email',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Message',
            placeholder: 'Your message...',
            type: 'text',
            height: 80,
          },
        }
      );
      break;
    
    case 'search':
      formDef.components.push({
        type: 'Input',
        props: {
          label: 'Search',
          placeholder: 'Type to search...',
          type: 'text',
        },
      });
      break;
    
    case 'payment':
      formDef.components.push(
        {
          type: 'Input',
          props: {
            label: 'Card Number',
            placeholder: '1234 5678 9012 3456',
            type: 'text',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'Expiry Date',
            placeholder: 'MM/YY',
            type: 'text',
            required: true,
          },
        },
        {
          type: 'Input',
          props: {
            label: 'CVV',
            placeholder: '123',
            type: 'text',
            required: true,
          },
        }
      );
      break;
    
    case 'custom':
      // Use custom fields if provided
      if (customFields && Array.isArray(customFields)) {
        for (const fieldName of customFields) {
          formDef.components.push({
            type: 'Input',
            props: {
              label: fieldName,
              placeholder: `Enter ${fieldName.toLowerCase()}...`,
              type: 'text',
            },
          });
        }
      } else {
        formDef.components.push({
          type: 'Input',
          props: {
            label: 'Field',
            placeholder: 'Enter value...',
            type: 'text',
          },
        });
      }
      break;
    
    default:
      return {
        success: false,
        message: `Unknown form type: ${formType}`,
        error: 'Invalid form type',
      };
  }
  
  // Add submit button
  if (includeSubmit) {
    const buttonLabels: Record<string, string> = {
      login: 'Sign In',
      signup: 'Create Account',
      contact: 'Send Message',
      search: 'Search',
      payment: 'Pay Now',
      custom: 'Submit',
    };
    
    formDef.components.push({
      type: 'Button',
      props: {
        value: buttonLabels[formType] || 'Submit',
        style: 'primary',
      },
    });
  }
  
  // Render form to canvas
  const result = await renderFormToCanvas(formDef, ops);
  
  return {
    success: true,
    message: result.message,
    shapesCreated: result.shapesCreated,
  };
}

/**
 * Create multiple shapes in bulk with organized layouts
 * Optimized for 10-1000+ shapes using Firebase batched writes
 */
async function createBulkShapes(args: any, ops: CanvasOperations): Promise<ExecutionResult> {
  const { count, shapeType, layout, color = 'blue', size = 50 } = args;
  
  console.log(`[createBulkShapes] Generating ${count} ${shapeType} shapes in ${layout} layout`);
  
  // Validate count
  if (count < 1) {
    return {
      success: false,
      message: 'Count must be at least 1',
      error: 'Invalid count',
    };
  }
  
  if (count > 10000) {
    return {
      success: false,
      message: 'Maximum count is 10,000 shapes',
      error: 'Count too large',
    };
  }
  
  // Get canvas dimensions
  const canvasDims = ops.getCanvasDimensions();
  
  // Resolve color
  const fillColor = resolveColor(color);
  
  // Build config
  const config: BulkShapeConfig = {
    count,
    shapeType: shapeType as 'rectangle' | 'circle' | 'mixed',
    layout: layout as 'grid' | 'random' | 'spiral' | 'line',
    color: fillColor,
    size,
  };
  
  // Generate shape positions
  const shapePositions = generateBulkShapePositions(config, canvasDims);
  
  console.log(`[createBulkShapes] Generated ${shapePositions.length} positions`);
  
  // Convert to Shape data format
  const shapesData = shapePositions.map((pos) => ({
    type: pos.type as ShapeType,
    x: pos.x,
    y: pos.y,
    width: pos.width,
    height: pos.height,
    fill: fillColor,
    userId: ops.getUserId(),
    rotation: 0,
    zIndex: 0,
  }));
  
  try {
    // Use batched creation
    const created = await ops.createShapesBatch(shapesData);
    
    console.log(`[createBulkShapes] Successfully created ${created} shapes`);
    
    return {
      success: true,
      message: `Created ${created} ${shapeType} shape(s) in ${layout} layout`,
      shapesCreated: created,
    };
  } catch (error: any) {
    console.error('[createBulkShapes] Error creating shapes:', error);
    return {
      success: false,
      message: `Failed to create shapes: ${error.message}`,
      error: error.message,
    };
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Find shapes based on identifier string
 */
function findShapesByIdentifier(identifier: string, ops: CanvasOperations): Shape[] {
  const allShapes = ops.getShapes();
  const lower = identifier.toLowerCase();

  // Handle special identifiers
  if (lower === 'selected') {
    const selectedId = ops.getSelectedShapeId();
    return selectedId ? allShapes.filter(s => s.id === selectedId) : [];
  }

  if (lower === 'last') {
    return allShapes.length > 0 
      ? [allShapes.reduce((latest, s) => s.createdAt > latest.createdAt ? s : latest, allShapes[0])]
      : [];
  }

  if (lower === 'first') {
    return allShapes.length > 0
      ? [allShapes.reduce((oldest, s) => s.createdAt < oldest.createdAt ? s : oldest, allShapes[0])]
      : [];
  }

  if (lower === 'all') {
    return allShapes;
  }

  // Check for "last N" pattern
  const lastNMatch = lower.match(/last (\d+)/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1]);
    return allShapes.sort((a, b) => b.createdAt - a.createdAt).slice(0, n);
  }

  // Filter by type
  if (lower.includes('rectangle') || lower.includes('rect')) {
    return allShapes.filter(s => s.type === 'rectangle');
  }
  if (lower.includes('circle')) {
    return allShapes.filter(s => s.type === 'circle');
  }
  if (lower.includes('text')) {
    return allShapes.filter(s => s.type === 'text');
  }
  if (lower.includes('line')) {
    return allShapes.filter(s => s.type === 'line');
  }

  // Filter by color
  const colorNames = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'gray', 'black', 'white'];
  for (const colorName of colorNames) {
    if (lower.includes(colorName)) {
      const targetColor = resolveColor(colorName);
      const matches = allShapes.filter(s => s.fill === targetColor);
      if (matches.length > 0) return matches;
    }
  }

  // Default: return all shapes if no match
  return allShapes;
}

