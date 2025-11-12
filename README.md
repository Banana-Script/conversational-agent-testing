# Framework de Testing para ElevenLabs Agents 🧪

Framework automatizado de testing para agentes conversacionales de ElevenLabs con soporte para dos flujos: **simulación directa** y **tests persistentes**.

## 🎯 Características

- ✅ **Definición de tests en YAML**: Formato simple y legible
- 🔄 **Dos flujos de testing**:
  - **Simulación directa**: Ejecuta tests inmediatamente sin guardarlos
  - **Tests persistentes**: Guarda tests en ElevenLabs para reutilizar
- 📊 **Reportes detallados**: JSON y Markdown con métricas completas
- 🎨 **CLI amigable**: Interface con colores y spinners
- 📝 **Criterios personalizables**: Define tus propios criterios de evaluación

## 📋 Requisitos

- Node.js 18+
- Cuenta de ElevenLabs con API key
- Agent ID de tu agente

## 🚀 Instalación

```bash
cd testingElevenLabs
npm install
```

Configura el `.env`:

```env
ELEVENLABS_API_KEY=tu_api_key
ELEVENLABS_AGENT_ID=tu_agent_id
```

## 📖 Comandos Disponibles

### 1. Simulación Directa (`simulate`)

Ejecuta tests inmediatamente usando la API de simulación:

```bash
npm run simulate
```

✨ **Cuándo usar**: Desarrollo rápido, iteración de prompts, testing ad-hoc

### 2. Crear Tests Persistentes (`create`)

Guarda tests en tu cuenta de ElevenLabs:

```bash
npm run create
```

Retorna IDs de tests creados que puedes reutilizar.

### 3. Ejecutar Tests Persistentes (`run`)

Ejecuta tests ya creados en ElevenLabs:

```bash
npm run run -- --agent agent_123 --tests test_456 test_789
```

✨ **Cuándo usar**: CI/CD, testing programado, tests de regresión

### 4. Listar Tests (`list`)

Lista todos los tests de un agente:

```bash
npm run list -- --agent agent_123
```

### 5. Generar Reporte (`report`)

Genera reporte Markdown desde resultados:

```bash
npm run report results/test-results-*.json
```

## 📝 Crear Tests

### Dos Enfoques de Testing

#### 🔄 Simulación Directa (`npm run simulate`)
Ejecuta conversaciones completas multi-turno. El usuario simulado (LLM) interactúa con tu agente por varios turnos, luego se evalúa toda la conversación.

**Cuándo usar**: Desarrollo, iteración de prompts, testing de flujos conversacionales completos

#### 💾 Tests Persistentes (`npm run create` + `npm run run`)
Crea tests de un solo turno guardados en ElevenLabs. El agente responde UNA vez y se compara contra ejemplos.

**Cuándo usar**: CI/CD, testing automatizado, validación de regresión

⚠️ **IMPORTANTE**: NO mezcles ambos enfoques en el mismo test.

### Formato YAML

```yaml
name: "Nombre del Test"
description: "Qué valida este test"
agent_id: "${ELEVENLABS_AGENT_ID}"
type: "llm"  # Solo para tests persistentes

simulated_user:
  # IMPORTANTE: prompt debe ser un STRING simple
  prompt: "Comportamiento del usuario simulado..."
  first_message: "Hola"
  language: "es"
  temperature: 0.4  # Opcional: 0.0-1.0

# OPCIÓN 1: Para simulación directa (conversación completa)
evaluation_criteria:
  - id: "criterion-1"
    name: "Criterio de Éxito"
    prompt: "Evalúa si el agente cumplió con..."
    use_knowledge_base: false

# OPCIÓN 2: Para tests persistentes (un solo turno)
success_condition: "El agente debe..."
success_examples:
  - "Respuesta apropiada ejemplo 1"
failure_examples:
  - "Respuesta inapropiada ejemplo 1"

dynamic_variables:
  nombre_cliente: "María González"
  documento: "1234567"
```

**📖 Ver plantilla completa**: `tests/template.yaml`

### 3 Tests de Ejemplo Incluidos

- `happy-path.yaml`: Flujo exitoso completo
- `invalid-data.yaml`: Manejo de datos inválidos
- `callback-scheduling.yaml`: Agendamiento de callbacks

## 🔄 Flujos de Trabajo

### Desarrollo Rápido

```bash
# 1. Crea tu test YAML en tests/scenarios/
# 2. Ejecuta simulación
npm run simulate

# 3. Revisa resultados en results/
# 4. Itera ajustando el YAML
```

### Producción/CI

```bash
# 1. Crea tests persistentes una vez
npm run create

# 2. Guarda los test IDs
# 3. Ejecuta en CI/CD
npm run run -- --agent $AGENT_ID --tests $TEST_IDS

# 4. Verifica resultados
```

## 📊 Resultados

### Console Output

```
✅ Validación Exitosa - Happy Path (6/6 criterios, 12500ms)
❌ Manejo de Datos Inválidos (4/5 criterios, 15200ms)
```

### JSON (`results/test-results-*.json`)

```json
{
  "generated_at": "2025-01-11T...",
  "total_tests": 3,
  "successful_tests": 2,
  "results": [...]
}
```

### Markdown (`results/report-*.md`)

Reporte completo con:
- Resumen ejecutivo
- Tabla de tests
- Transcripciones completas
- Criterios y rationales

## 🏗️ Estructura del Proyecto

```
testingElevenLabs/
├── src/
│   ├── api/elevenlabs-client.ts      # Cliente API
│   ├── testing/
│   │   ├── test-runner.ts            # Ejecutor
│   │   └── reporter.ts               # Reportes
│   ├── types/index.ts                # Tipos TS
│   └── index.ts                      # CLI
├── tests/
│   ├── template.yaml                 # Plantilla
│   └── scenarios/                    # Tests
└── results/                          # Resultados
```

## 🔧 Configuración Avanzada

### Variables Dinámicas

Personaliza tests sin duplicar:

```yaml
dynamic_variables:
  nombre_cliente: "Juan"
  monto: "1000000"
```

### Tool Mocking

Simula herramientas externas:

```yaml
tool_mock_config:
  consultar_db:
    return_value: "OK"
    should_fail: false
```

## 🐛 Troubleshooting

### Error: ELEVENLABS_API_KEY no encontrada

```bash
cat .env | grep ELEVENLABS_API_KEY
```

### Error 422 al crear tests

Verifica que `agent_id` sea correcto y el agente exista.

### Tests lentos

Reduce `new_turns_limit`:

```yaml
new_turns_limit: 20
```

## 🔗 Enlaces

- [Documentación ElevenLabs](https://elevenlabs.io/docs)
- [API Reference - Tests](https://elevenlabs.io/docs/api-reference/tests/create)
- [API Reference - Simulate](https://elevenlabs.io/docs/api-reference/agents/simulate-conversation)

---

**Desarrollado para testing automatizado de agentes de ElevenLabs** 🚀
