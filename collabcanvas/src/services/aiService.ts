/**
 * AI Service - OpenAI Function Calling Integration
 * 
 * Handles AI-powered canvas manipulation using OpenAI's function calling.
 * Interprets natural language commands and translates them into canvas operations.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { canvasTools, SYSTEM_PROMPT } from './aiTools';
import { executeFunction, type CanvasOperations, type ExecutionResult } from './aiExecutor';

// Check if AI features are enabled via API key
export const AI_ENABLED = Boolean(import.meta.env.VITE_OPENAI_API_KEY);

// OpenAI client instance
let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient && AI_ENABLED) {
    openaiClient = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true, // Required for client-side usage
    });
  }
  
  if (!openaiClient) {
    throw new Error('OpenAI API key not configured');
  }
  
  return openaiClient;
}

/**
 * AI Chat Message for conversation history
 */
export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  executionResult?: ExecutionResult;
}

/**
 * Process a natural language command using OpenAI function calling
 * 
 * @param command - User's natural language command
 * @param operations - Canvas operation functions
 * @param conversationHistory - Previous messages for context
 * @returns Execution results and AI response
 */
export async function processAICommand(
  command: string,
  operations: CanvasOperations,
  conversationHistory: AIChatMessage[] = []
): Promise<{
  response: string;
  results: ExecutionResult[];
  functionCalls: number;
}> {
  console.log('[AI Service] Processing command:', command);
  
  if (!AI_ENABLED) {
    throw new Error('AI features require OpenAI API key. Please add VITE_OPENAI_API_KEY to your .env.local file.');
  }

  const client = getOpenAIClient();
  
  // Build conversation context
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Add recent conversation history (last 10 messages for context)
  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Add current user command
  messages.push({
    role: 'user',
    content: command,
  });

  try {
    // Call OpenAI with function calling
    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages,
      tools: canvasTools,
      tool_choice: 'auto', // Let AI decide when to use tools
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiMessage = response.choices[0].message;
    const toolCalls = aiMessage.tool_calls || [];
    
    console.log(`[AI Service] Received ${toolCalls.length} function calls from OpenAI`);

    const results: ExecutionResult[] = [];
    let functionCallCount = 0;

    // Execute each function call
    for (const toolCall of toolCalls) {
      if (toolCall.type === 'function') {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`[AI Service] Executing: ${functionName}`, functionArgs);
        
        const result = await executeFunction(functionName, functionArgs, operations);
        results.push(result);
        functionCallCount++;
      }
    }

    // Generate response message
    let responseText = aiMessage.content || '';
    
    if (results.length > 0) {
      const successfulResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      
      if (successfulResults.length > 0) {
        const messages = successfulResults.map(r => r.message).join('. ');
        responseText = responseText || messages;
      }
      
      if (failedResults.length > 0) {
        const errors = failedResults.map(r => r.error || r.message).join('. ');
        responseText += failedResults.length > 0 ? `\n\nErrors: ${errors}` : '';
      }
    }

    // If no function calls but we have AI text response
    if (results.length === 0 && responseText) {
      console.log('[AI Service] AI provided text response without function calls');
    }

    // If no response at all, provide default
    if (!responseText) {
      responseText = 'I processed your request. Let me know if you need anything else!';
    }

    return {
      response: responseText,
      results,
      functionCalls: functionCallCount,
    };

  } catch (error) {
    const err = error as { status?: number; code?: string; message?: string };
    console.error('[AI Service] Error:', err);
    
    // Provide helpful error messages
    if (err.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your .env.local file.');
    } else if (err.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    } else if (err.code === 'ENOTFOUND' || err.message?.includes('network')) {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error(`AI service error: ${err.message || 'Unknown error'}`);
    }
  }
}

/**
 * Validate that the AI service is properly configured
 */
export function validateAIService(): { isValid: boolean; error?: string } {
  if (!AI_ENABLED) {
    return {
      isValid: false,
      error: 'OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env.local file.',
    };
  }

  return { isValid: true };
}

/**
 * Get AI service status and configuration
 */
export function getAIServiceStatus(): {
  enabled: boolean;
  implementation: 'openai' | 'disabled';
  features: string[];
} {
  return {
    enabled: AI_ENABLED,
    implementation: AI_ENABLED ? 'openai' : 'disabled',
    features: AI_ENABLED ? [
      'Create shapes (rectangles, circles, text, lines)',
      'Move, resize, and rotate shapes',
      'Change colors and styles',
      'Arrange shapes in layouts (grids, rows, columns)',
      'Align and distribute shapes',
      'Complex multi-step operations',
      'Natural language understanding via GPT-4',
    ] : [
      'AI features disabled - API key required',
    ],
  };
}

