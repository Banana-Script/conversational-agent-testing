import { z } from 'zod';

/**
 * Esquema de validación para la configuración del usuario simulado en YAML
 */
const SimulatedUserConfigYAMLSchema = z.object({
  prompt: z.string().min(1, 'El prompt del usuario simulado no puede estar vacío'),
  llm: z.string().optional(),
  first_message: z.string().min(1, 'El primer mensaje no puede estar vacío'),
  language: z.string().min(2, 'El código de idioma debe tener al menos 2 caracteres'),
  temperature: z.number().min(0).max(1).optional(),
  max_tokens: z.number().positive().optional(),
  tools: z.array(z.any()).optional(),
});

/**
 * Esquema de validación para criterios de evaluación
 */
const TestEvaluationCriterionSchema = z.object({
  id: z.string().min(1, 'El ID del criterio no puede estar vacío'),
  name: z.string().min(1, 'El nombre del criterio no puede estar vacío'),
  prompt: z.string().optional(),
  conversation_goal_prompt: z.string().optional(),
  use_knowledge_base: z.boolean().optional(),
}).refine(
  (data) => data.prompt || data.conversation_goal_prompt,
  {
    message: 'Debe especificar al menos uno: prompt o conversation_goal_prompt',
  }
);

/**
 * Esquema de validación para la configuración de mock de herramientas
 */
const ToolMockConfigSchema = z.record(
  z.string(),
  z.object({
    return_value: z.any(),
    should_fail: z.boolean().optional(),
  })
);

/**
 * Esquema de validación para turnos de conversación
 */
const ConversationTurnSchema = z.object({
  role: z.enum(['user', 'agent']).refine((val) => val === 'user' || val === 'agent', {
    message: 'El rol debe ser "user" o "agent"',
  }),
  message: z.string(),
  tool_calls: z.array(z.any()).optional(),
  timestamp: z.string().optional(),
});

/**
 * Esquema principal de validación para definiciones de test
 */
export const TestDefinitionSchema = z.object({
  name: z.string().min(1, 'El nombre del test no puede estar vacío'),
  description: z.string().min(1, 'La descripción del test no puede estar vacía'),
  agent_id: z.string().min(1, 'El agent_id no puede estar vacío'),
  simulated_user: SimulatedUserConfigYAMLSchema,
  evaluation_criteria: z.array(TestEvaluationCriterionSchema).optional(),
  dynamic_variables: z.record(z.string(), z.any()).optional(),
  tool_mock_config: ToolMockConfigSchema.optional(),
  partial_conversation_history: z.array(ConversationTurnSchema).optional(),
  new_turns_limit: z.number().positive().optional(),

  // Campos para tests persistentes
  success_condition: z.string().optional(),
  success_examples: z.array(z.string()).optional(),
  failure_examples: z.array(z.string()).optional(),
  type: z.enum(['llm', 'tool']).optional(),

  // Multi-provider support
  provider: z.enum(['elevenlabs', 'vapi', 'viernes']).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),

  // Vapi-specific configuration
  vapi: z.object({
    assistant_id: z.string().optional(),
    attempts: z.number().min(1).max(5).optional(),
    persistent_eval: z.boolean().optional(),
    max_conversation_tokens: z.number().optional(),
    conversation_turns: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      message: z.string(),
    })).optional(),
  }).optional(),

  // Viernes-specific configuration
  viernes: z.object({
    organization_id: z.number().optional(),
    agent_id: z.number().optional(),
    platform: z.enum(['whatsapp', 'telegram', 'facebook', 'instagram', 'web', 'api']).optional(),
    max_turns: z.number().optional(),
    conversation_timeout: z.number().optional(),
    webhook_timeout: z.number().optional(),
  }).optional(),
}).refine(
  (data) => {
    // Validar que no se mezclen ambos enfoques
    const hasEvaluationCriteria = data.evaluation_criteria && data.evaluation_criteria.length > 0;
    const hasSuccessExamples = data.success_examples && data.success_examples.length > 0;

    if (hasEvaluationCriteria && hasSuccessExamples) {
      return false;
    }

    return true;
  },
  {
    message: 'No puedes usar evaluation_criteria y success_examples en el mismo test. Usa evaluation_criteria para simulación directa o success_examples para tests persistentes.',
  }
).refine(
  (data) => {
    // Si tiene success_condition, debe tener success_examples
    if (data.success_condition && (!data.success_examples || data.success_examples.length === 0)) {
      return false;
    }
    return true;
  },
  {
    message: 'Si especificas success_condition, debes proporcionar al menos un success_example',
  }
);

/**
 * Tipo inferido del esquema de validación
 */
export type ValidatedTestDefinition = z.infer<typeof TestDefinitionSchema>;

/**
 * Clase de error personalizada para errores de validación
 */
export class TestValidationError extends Error {
  public readonly issues: z.ZodIssue[];

  constructor(zodError: z.ZodError) {
    const messages = zodError.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  • ${path}: ${issue.message}`;
    }).join('\n');

    super(`Errores de validación en el archivo YAML:\n${messages}`);
    this.name = 'TestValidationError';
    this.issues = zodError.issues;

    Object.setPrototypeOf(this, TestValidationError.prototype);
  }

  /**
   * Retorna una representación amigable del error para logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    };
  }
}
