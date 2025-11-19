/**
 * Tipos para el framework de testing de ElevenLabs
 */

// Tipos para la configuración del usuario simulado
export interface SimulatedUserConfig {
  prompt: {
    prompt: string;
    llm?: string;
    temperature?: number;
    max_tokens?: number;
  };
  first_message: string;
  language: string;
  tools?: any[];
}

// Tipos para criterios de evaluación
export interface EvaluationCriterion {
  id: string;
  name: string;
  type: 'prompt';
  conversation_goal_prompt: string;
  use_knowledge_base: boolean;
}

// Resultado de evaluación
export interface EvaluationResult {
  criteria_id: string;
  result: 'success' | 'failure' | 'unknown';
  rationale: string;
}

// Configuración de mock de herramientas
export interface ToolMockConfig {
  [toolName: string]: {
    return_value: any;
    should_fail?: boolean;
  };
}

// Turno de conversación
export interface ConversationTurn {
  role: 'user' | 'agent';
  message: string;
  tool_calls?: any[];
  timestamp?: string;
}

// Especificación de simulación interna
export interface SimulationSpecificationInner {
  simulated_user_config: SimulatedUserConfig;
  tool_mock_config?: ToolMockConfig;
  partial_conversation_history?: ConversationTurn[];
  dynamic_variables?: Record<string, any>;
}

// Request body para simulate-conversation
export interface SimulationSpecification {
  simulation_specification: SimulationSpecificationInner;
  extra_evaluation_criteria?: EvaluationCriterion[];
  new_turns_limit?: number;
}

// Análisis de conversación simulada
export interface SimulationAnalysis {
  evaluation_criteria_results: Record<string, EvaluationResult>; // Es un objeto, no array
  data_collection_results: Record<string, any>;
  call_success: boolean;
  transcript_summary: string;
}

// Respuesta de simulación
export interface SimulationResponse {
  simulated_conversation: ConversationTurn[];
  analysis: SimulationAnalysis;
}

// Criterio de evaluación desde YAML (formato flexible)
export interface TestEvaluationCriterion {
  id: string;
  name: string;
  prompt?: string; // Formato antiguo/alternativo
  conversation_goal_prompt?: string; // Formato de API
  use_knowledge_base?: boolean;
}

// Formato simplificado del usuario simulado en YAML
export interface SimulatedUserConfigYAML {
  prompt: string;  // String directo en YAML
  llm?: string;
  first_message: string;
  language: string;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
}

// Definición de test desde YAML
export interface TestDefinition {
  name: string;
  description: string;
  agent_id: string;
  simulated_user: SimulatedUserConfigYAML;  // Formato YAML
  evaluation_criteria?: TestEvaluationCriterion[];
  dynamic_variables?: Record<string, any>;
  tool_mock_config?: ToolMockConfig;
  partial_conversation_history?: ConversationTurn[];
  new_turns_limit?: number;

  // Campos para tests persistentes (agent-testing/create)
  success_condition?: string;
  success_examples?: string[];
  failure_examples?: string[];
  type?: 'llm' | 'tool';

  // Multi-provider support
  provider?: 'elevenlabs' | 'vapi';  // default: 'elevenlabs'
  category?: string;  // Para agrupar tests en suites (Vapi)
  tags?: string[];    // Para filtrado y organización

  // Vapi-specific configuration
  vapi?: {
    assistant_id?: string;  // Opcional, usa env var si no se especifica
    attempts?: number;      // 1-5, default: 1
  };
}

// Resultado de un test ejecutado
export interface TestResult {
  test_name: string;
  agent_id: string;
  timestamp: string;
  success: boolean;
  simulation_response: SimulationResponse;
  execution_time_ms: number;
}

// Configuración del cliente API
export interface ElevenLabsConfig {
  apiKey: string;
  baseURL?: string;
}

// Test persistente creado en ElevenLabs
export interface PersistentTest {
  id: string;
  name: string;
  chat_history: ConversationTurn[];
  success_condition: string;
  success_examples: string[];
  failure_examples: string[];
  type?: 'llm' | 'tool';
  dynamic_variables?: Record<string, any>;
}

// Ejemplo de respuesta para tests
export interface ResponseExample {
  response: string;
  type: string;
}

// Request para crear test persistente
export interface CreatePersistentTestRequest {
  name: string;
  chat_history: Array<{
    role: 'user' | 'agent';
    message?: string;
    time_in_call_secs: number;
  }>;
  success_condition: string;
  success_examples: ResponseExample[];
  failure_examples: ResponseExample[];
  type?: 'llm' | 'tool';
  dynamic_variables?: Record<string, any>;
}

// Response de creación de test
export interface CreateTestResponse {
  id: string;
}

// Request para ejecutar tests
export interface RunTestsRequest {
  tests: Array<{
    test_id: string;
    workflow_node_id?: string;
  }>;
}

// Resultado de ejecución de test persistente
export interface TestSuiteInvocation {
  id: string; // Suite invocation ID
  agent_id: string;
  branch_id: string | null;
  created_at: number;
  test_runs: Array<{
    test_run_id: string;
    test_id: string;
    test_name: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
    condition_result: any | null;
    last_updated_at_unix: number;
    metadata?: any;
  }>;
}

// Lista de tests
export interface TestsList {
  tests: PersistentTest[];
}
