/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Form to Canvas Converter
 * 
 * Converts JSON form definitions into canvas shapes using design tokens.
 * Implements 8px grid-based layout with professional spacing and hierarchy.
 * 
 * LAYER SYSTEM (Z-INDEX):
 * - Container/Background (zIndex: -10) - BACK layer, guaranteed behind everything
 * - Shape Elements (zIndex: 10)        - Middle layer (inputs, buttons, checkboxes)
 * - Text Elements (zIndex: 20)         - FRONT layer, always on top
 * 
 * The container uses negative z-index (-10) to ensure it ALWAYS renders behind
 * all form elements, even if users manually adjust layers via right-click menu.
 * 
 * CONTAINER SIZING:
 * - Calculates actual bounds of all form elements
 * - Adds equal padding on all sides (48px default)
 * - Centers container on canvas with equal left/right margins
 * - Automatically adjusts width to encompass all elements
 */

import type { FormDefinition, FormComponent, CanvasFormComponent } from '../types/formLayout.types';
import { getDesignTokens, gridSpacing, FORM_DIMENSIONS } from './designTokens';
import type { CanvasOperations } from './aiExecutor';

/**
 * Convert form definition to canvas shapes and create them
 */
export async function renderFormToCanvas(
  formDef: FormDefinition,
  operations: CanvasOperations
): Promise<{ shapesCreated: number; message: string }> {
  const tokens = getDesignTokens(formDef.style || 'minimal');
  const canvasDims = operations.getCanvasDimensions();
  
  // Calculate form dimensions with padding
  const formPadding = gridSpacing(6, tokens); // 48px padding
  const contentWidth = FORM_DIMENSIONS.width;
  const formWidth = contentWidth + (formPadding * 2);
  
  // Center the form container on canvas
  const formStartX = (canvasDims.width - formWidth) / 2;
  const formStartY = 100; // Top position
  
  // Content starts centered within the container
  const contentStartX = formStartX + formPadding;
  let currentY = formStartY + formPadding;
  
  const shapesToCreate: CanvasFormComponent[] = [];
  
  // Process each component
  for (const component of formDef.components) {
    const renderedShapes = renderComponent(
      component,
      contentStartX,
      currentY,
      contentWidth,
      tokens
    );
    
    shapesToCreate.push(...renderedShapes);
    
    // Move Y position for next component
    const componentHeight = Math.max(...renderedShapes.map(s => s.y + s.height)) - currentY;
    currentY += componentHeight + gridSpacing(3, tokens); // 24px gap between components
  }
  
  // Calculate actual bounds of all content
  const minX = Math.min(...shapesToCreate.map(s => s.x));
  const maxX = Math.max(...shapesToCreate.map(s => s.x + s.width));
  const maxY = Math.max(...shapesToCreate.map(s => s.y + s.height));
  
  // Ensure container encompasses all content with padding
  const actualContentWidth = maxX - minX;
  const finalFormWidth = Math.max(formWidth, actualContentWidth + (formPadding * 2));
  const finalFormStartX = (canvasDims.width - finalFormWidth) / 2;
  const formHeight = maxY - formStartY + formPadding;
  
  // Create container background rectangle FIRST (so it appears behind everything)
  // Use a light gray for container so white inputs stand out
  const containerBgColor = formDef.style === 'glass' 
    ? 'rgba(255, 255, 255, 0.1)' 
    : (formDef.style === 'neumorphic' ? '#F0F0F3' : '#F9FAFB');
  
  const containerBackground: CanvasFormComponent = {
    id: crypto.randomUUID(),
    type: 'Container',
    x: finalFormStartX,
    y: formStartY,
    width: finalFormWidth,
    height: formHeight,
    fill: containerBgColor,
    stroke: tokens.colorBorder,
    props: {},
  };
  
  // Insert container at the beginning so it renders first (behind other elements)
  shapesToCreate.unshift(containerBackground);
  
  // Assign proper z-index layering for all shapes
  // CRITICAL: Container must ALWAYS be in the very back
  // CRITICAL: Text must ALWAYS be on top of rectangles/circles
  // Layer ordering: Container (-10) < Shapes (10) < Text (20)
  console.log('🎨 [Form Generator] Assigning z-index to shapes...');
  shapesToCreate.forEach((shape, index) => {
    if (shape.type === 'Container') {
      shape.zIndex = -10; // VERY BACK - form background card/panel (negative to ensure it's behind everything)
      console.log(`  [${index}] Container - zIndex: -10 (BACK)`, { text: shape.text, type: shape.type });
    } else if (shape.type === 'Text') {
      shape.zIndex = 20; // Front layer - ALL text on top (labels, headers, placeholders)
      console.log(`  [${index}] Text - zIndex: 20 (FRONT)`, { text: shape.text, type: shape.type });
    } else {
      shape.zIndex = 10; // Middle layer - input boxes, buttons, checkboxes (rectangles/circles)
      console.log(`  [${index}] Shape - zIndex: 10 (MIDDLE)`, { text: shape.text, type: shape.type });
    }
  });
  
  // CRITICAL: Sort shapes by zIndex before creation
  // Lower zIndex values must be created first to appear in back
  console.log('🔄 [Form Generator] Sorting shapes by z-index...');
  shapesToCreate.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  
  console.log('📊 [Form Generator] Creation order (after sorting):');
  shapesToCreate.forEach((shape, index) => {
    console.log(`  ${index + 1}. ${shape.type} (zIndex: ${shape.zIndex}) - ${shape.text || 'no text'}`);
  });
  
  // Create all shapes on canvas in zIndex order
  console.log('✨ [Form Generator] Creating shapes on canvas...');
  let created = 0;
  for (const shape of shapesToCreate) {
    try {
      // Build shape data, only including defined fields (Firestore doesn't accept undefined)
      const shapeData: any = {
        type: getShapeType(shape.type),
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        fill: shape.fill || tokens.colorBackground,
        userId: operations.getUserId(),
      };
      
      // Only add optional fields if they're defined
      if (shape.text !== undefined) shapeData.text = shape.text;
      if (shape.textColor !== undefined) shapeData.textColor = shape.textColor;
      if (shape.stroke !== undefined) shapeData.stroke = shape.stroke;
      if (shape.zIndex !== undefined) shapeData.zIndex = shape.zIndex;
      
      console.log(`  ✅ Creating ${shape.type} (zIndex: ${shape.zIndex})`, shapeData);
      
      await operations.createShape(shapeData);
      created++;
    } catch (error) {
      console.error('[FormToCanvas] Error creating shape:', error);
    }
  }
  
  console.log(`🎉 [Form Generator] Complete! Created ${created} shapes`);
  console.log('📝 [Form Generator] Final shape summary:');
  console.log('  - Container (zIndex: -10) - Should be in BACK');
  console.log('  - Input boxes/Buttons (zIndex: 10) - Should be MIDDLE');
  console.log('  - Text/Labels (zIndex: 20) - Should be in FRONT');
  
  return {
    shapesCreated: created,
    message: `Created ${formDef.components.length}-component ${formDef.style || 'minimal'} form`,
  };
}

/**
 * Render a single form component to canvas shapes
 */
function renderComponent(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent[] {
  const shapes: CanvasFormComponent[] = [];
  
  switch (component.type) {
    case 'Text':
      shapes.push(...renderText(component, x, y, width, tokens));
      break;
    
    case 'Input':
      shapes.push(...renderInput(component, x, y, width, tokens));
      break;
    
    case 'Button':
      shapes.push(...renderButton(component, x, y, width, tokens));
      break;
    
    case 'Checkbox':
      shapes.push(...renderCheckbox(component, x, y, width, tokens));
      break;
    
    case 'Container':
      shapes.push(...renderContainer(component, x, y, width, tokens));
      break;
    
    case 'Shape':
      shapes.push(renderShape(component, x, y, width, tokens));
      break;
  }
  
  return shapes;
}

/**
 * Render text component (header, label, body)
 */
function renderText(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent[] {
  const variant = component.props.variant || 'body';
  const value = component.props.value || 'Text';
  
  let fontSize: number;
  let textY = y;
  
  switch (variant) {
    case 'header':
      fontSize = FORM_DIMENSIONS.headerFontSize;
      break;
    case 'label':
      fontSize = FORM_DIMENSIONS.labelFontSize;
      textY = y + gridSpacing(1, tokens);
      break;
    case 'caption':
      fontSize = 11;
      break;
    default:
      fontSize = FORM_DIMENSIONS.bodyFontSize;
  }
  
  return [{
    id: crypto.randomUUID(),
    type: 'Text',
    x: variant === 'header' ? x + width / 2 - (value.length * fontSize / 4) : x,
    y: textY,
    width: width,
    height: fontSize + gridSpacing(1, tokens),
    text: value,
    fill: 'transparent',
    textColor: variant === 'label' ? '#374151' : tokens.colorText,
    props: component.props,
  }];
}

/**
 * Render input field (background + label + placeholder)
 */
function renderInput(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent[] {
  const shapes: CanvasFormComponent[] = [];
  const inputHeight = FORM_DIMENSIONS.inputHeight;
  const label = component.props.label || 'Input';
  const placeholder = component.props.placeholder || 'Enter value...';
  
  // Label - darker color for visibility
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Text',
    x,
    y,
    width,
    height: FORM_DIMENSIONS.labelFontSize + 4,
    text: label + (component.props.required ? ' *' : ''),
    fill: 'transparent',
    textColor: '#374151',
    props: { ...component.props, variant: 'label' },
  });
  
  // Input background - use white with visible border
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Input',
    x,
    y: y + gridSpacing(3, tokens),
    width,
    height: inputHeight,
    fill: '#FFFFFF',
    stroke: '#D1D5DB',
    props: component.props,
  });
  
  // Placeholder text - darker gray for better visibility
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Text',
    x: x + gridSpacing(2, tokens),
    y: y + gridSpacing(3, tokens) + (inputHeight - FORM_DIMENSIONS.bodyFontSize) / 2,
    width: width - gridSpacing(4, tokens),
    height: FORM_DIMENSIONS.bodyFontSize,
    text: placeholder,
    fill: 'transparent',
    textColor: '#9CA3AF',
    props: component.props,
  });
  
  return shapes;
}

/**
 * Render button (background + text)
 */
function renderButton(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent[] {
  const shapes: CanvasFormComponent[] = [];
  const buttonHeight = FORM_DIMENSIONS.buttonHeight;
  const buttonStyle = component.props.style || 'primary';
  const value = component.props.value || 'Button';
  
  let bgColor: string;
  let textColor: string;
  
  switch (buttonStyle) {
    case 'primary':
      bgColor = tokens.colorPrimary;
      textColor = '#FFFFFF';
      break;
    case 'secondary':
      bgColor = tokens.colorBackground;
      textColor = tokens.colorText;
      break;
    case 'ghost':
      bgColor = 'transparent';
      textColor = tokens.colorPrimary;
      break;
    default:
      bgColor = tokens.colorPrimary;
      textColor = '#FFFFFF';
  }
  
  // Button background
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Button',
    x,
    y,
    width,
    height: buttonHeight,
    fill: bgColor,
    stroke: buttonStyle === 'secondary' ? tokens.colorBorder : undefined,
    props: component.props,
  });
  
  // Button text (centered) - using center of button for proper alignment
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Text',
    x: x + (width / 2) - (value.length * 3.5), // Better centering approximation (7px per char average)
    y: y + (buttonHeight / 2) - (FORM_DIMENSIONS.bodyFontSize / 2),
    width: value.length * 8, // Approximate width based on text length
    height: FORM_DIMENSIONS.bodyFontSize,
    text: value,
    fill: 'transparent',
    textColor: textColor,
    props: component.props,
  });
  
  return shapes;
}

/**
 * Render checkbox (box + label)
 */
function renderCheckbox(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent[] {
  const shapes: CanvasFormComponent[] = [];
  const checkboxSize = 20;
  const label = component.props.label || 'Checkbox';
  
  // Checkbox box - white background with visible border
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Checkbox',
    x,
    y,
    width: checkboxSize,
    height: checkboxSize,
    fill: '#FFFFFF',
    stroke: '#D1D5DB',
    props: component.props,
  });
  
  // Checkbox label - darker for visibility
  shapes.push({
    id: crypto.randomUUID(),
    type: 'Text',
    x: x + checkboxSize + gridSpacing(1, tokens),
    y: y + (checkboxSize - FORM_DIMENSIONS.bodyFontSize) / 2,
    width: width - checkboxSize - gridSpacing(1, tokens),
    height: FORM_DIMENSIONS.bodyFontSize,
    text: label,
    fill: 'transparent',
    textColor: '#374151',
    props: component.props,
  });
  
  return shapes;
}

/**
 * Render container (background rectangle)
 */
function renderContainer(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent[] {
  return [{
    id: crypto.randomUUID(),
    type: 'Container',
    x,
    y,
    width,
    height: component.props.height || 200,
    fill: tokens.colorBackground,
    stroke: tokens.colorBorder,
    props: component.props,
  }];
}

/**
 * Render generic shape (divider, background, etc.)
 */
function renderShape(
  component: FormComponent,
  x: number,
  y: number,
  width: number,
  tokens: any
): CanvasFormComponent {
  return {
    id: crypto.randomUUID(),
    type: 'Shape',
    x,
    y,
    width: component.props.width || width,
    height: component.props.height || 1,
    fill: tokens.colorBorder,
    props: component.props,
  };
}

/**
 * Map form component types to canvas shape types
 */
function getShapeType(componentType: string): 'rectangle' | 'circle' | 'text' | 'line' {
  switch (componentType) {
    case 'Text':
      return 'text';
    case 'Shape':
      return 'line';
    default:
      return 'rectangle';
  }
}

