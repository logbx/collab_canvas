/**
 * AI Command Parser
 * 
 * Provides simple regex-based parsing for AI commands.
 * This will be replaced with LangChain/OpenAI function calling in the future.
 */

import type { ShapeType } from '../types/shape.types';

export interface AICommand {
  action: 'create' | 'move' | 'delete' | 'update' | 'arrange';
  shapeType?: ShapeType;
  properties?: {
    fill?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  targetId?: string;
  error?: string;
}

/**
 * Parse natural language commands into structured actions
 * 
 * Examples:
 * - "create red circle" -> {action: 'create', shapeType: 'circle', properties: {fill: 'red'}}
 * - "create blue rectangle" -> {action: 'create', shapeType: 'rectangle', properties: {fill: 'blue'}}
 * - "delete selected" -> {action: 'delete'}
 * 
 * @param input - Natural language command
 * @returns Parsed command or null if not recognized
 */
export function parseCommand(input: string): AICommand | null {
  const lowerInput = input.toLowerCase().trim();

  // Create commands
  if (lowerInput.includes('create') || lowerInput.includes('add') || lowerInput.includes('make')) {
    const shapeType: ShapeType = lowerInput.includes('circle') ? 'circle' : 'rectangle';
    
    // Color detection
    const colors: Record<string, string> = {
      'red': '#e74c3c',
      'blue': '#3498db',
      'green': '#2ecc71',
      'yellow': '#f1c40f',
      'purple': '#9b59b6',
      'orange': '#e67e22',
      'pink': '#ff69b4',
      'gray': '#95a5a6',
      'black': '#34495e',
      'white': '#ecf0f1',
    };

    let fill = '#3498db'; // Default blue
    for (const [colorName, hexCode] of Object.entries(colors)) {
      if (lowerInput.includes(colorName)) {
        fill = hexCode;
        break;
      }
    }

    return {
      action: 'create',
      shapeType,
      properties: { fill },
    };
  }

  // Delete commands
  if (lowerInput.includes('delete') || lowerInput.includes('remove')) {
    return {
      action: 'delete',
    };
  }

  // Not recognized
  return null;
}

/**
 * Get user-friendly description of what the command will do
 */
export function describeCommand(command: AICommand): string {
  switch (command.action) {
    case 'create': {
      const color = command.properties?.fill || 'blue';
      return `Creating a ${color} ${command.shapeType}`;
    }
    case 'delete':
      return 'Deleting selected shape';
    case 'move':
      return 'Moving shape';
    case 'update':
      return 'Updating shape properties';
    case 'arrange':
      return 'Arranging shapes';
    default:
      return 'Unknown command';
  }
}

