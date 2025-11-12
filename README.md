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
- 🤖 **Generación automática de tests**: Claude Code genera test cases a partir de configuración del agente
- 🔒 **Seguro**: Validación de inputs, prevención de command injection y path traversal
- 💾 **Backup automático**: Guarda tests existentes antes de regenerar

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

### 6. Descargar Configuración de Agente (`download`)

Descarga toda la configuración de un agente en formato JSON:

```bash
# Usar el agente del .env (automático)
npm run download

# O especificar un agente manualmente
npm run download -- --agent agent_123

# Cambiar directorio de salida
npm run download -- --output ./backups
```

Opciones:
- `--agent` (opcional): ID del agente a descargar. Si no se especifica, usa `ELEVENLABS_AGENT_ID` del .env
- `--output` (opcional): Directorio de salida (default: `./agents`)

✨ **Cuándo usar**:
- Respaldo de configuración antes de hacer cambios
- Documentar configuración actual del agente
- Versionamiento de prompts y configuración
- Comparar configuraciones entre diferentes agentes

📝 **Extracción automática de prompt**:
El comando extrae automáticamente el prompt del agente a un archivo `.md` separado:
- Archivo JSON: `<agent_id>.json` (configuración sin el prompt)
- Archivo MD: `<agent_id>.md` (prompt completo)
- En el JSON, el campo `conversation_config.agent.prompt.prompt` tendrá una referencia al archivo markdown

Ejemplo: Para el agente `agent_1401k6d9rrrzecdbww6x3jdyybx7` se crean:
- `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.json`
- `agents/agent_1401k6d9rrrzecdbww6x3jdyybx7.md`

⚠️ **Nota**: Los archivos descargados se guardan en `./agents/` y están en `.gitignore` para evitar exponer información sensible.

### 7. Generar Tests Automáticamente (`generate:tests`)

Genera test cases automáticamente usando Claude Code a partir de la configuración del agente:

```bash
# Generar con Claude Code base (más rápido, menos tokens)
npm run generate:tests

# Generar con qa-expert agent (mejor calidad, más tokens)
npm run generate:tests:qa
```

🤖 **Cómo funciona**:
1. Verifica que existan los archivos del agente (JSON + MD)
2. Si no existen, ejecuta `npm run download` automáticamente
3. **Crea backup automático** de tests existentes en `tests/scenarios-backup-<timestamp>/`
4. Limpia `tests/scenarios/` (tests anteriores están en backup)
5. Usa prompts optimizados de `prompts/` para generar tests de alta calidad
6. Crea todos los archivos YAML necesarios para cobertura completa

✨ **Diferencias entre los dos comandos**:

| Comando | Claude Mode | Tokens | Calidad | Tests Min | Cuándo usar |
|---------|-------------|--------|---------|-----------|-------------|
| `generate:tests` | Base Claude | Menos ⚡ | Buena ✓ | 10-25 | Desarrollo rápido, iteración |
| `generate:tests:qa` | qa-expert agent | Más 💰 | Excelente ✓✓✓ | 20-30 | Producción, cobertura exhaustiva |

📋 **Tipos de tests generados**:
- `happy-path-*.yaml` - Flujos exitosos
- `edge-case-*.yaml` - Casos límite
- `error-*.yaml` - Manejo de errores
- `validation-*.yaml` - Validación de datos
- `interruption-*.yaml` - Interrupciones de usuario
- `p0-smoke-*.yaml` - Tests críticos (solo QA mode)
- `p1-*, p2-*, p3-*` - Clasificación por prioridad (solo QA mode)

🔒 **Seguridad**:
- Validación de inputs para prevenir command injection
- Protección contra path traversal
- Backup automático antes de eliminar archivos
- Comandos ejecutados con `spawn` (no shell injection)

⚠️ **Requisitos previos**:
- Claude Code CLI instalado: `npm install -g @anthropic-ai/claude-code`
- Autenticado en Claude Code: `claude auth login`
- Para `generate:tests:qa`: agente qa-expert configurado globalmente

🔍 **Verificar instalación**:
```bash
npm run check:claude-cli
```

Este comando verifica que Claude Code CLI esté correctamente instalado y configurado.
Si falla, sigue las instrucciones en [CLAUDE_CLI_SETUP.md](./CLAUDE_CLI_SETUP.md).

💾 **Recuperar tests anteriores**:
Si necesitas restaurar tests de un backup:
```bash
# Listar backups disponibles
ls -la tests/scenarios-backup-*

# Restaurar desde un backup específico
cp tests/scenarios-backup-2025-11-12T02-47-50/*.yaml tests/scenarios/
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

## 🔒 Seguridad y Mejoras

### Mejoras de Seguridad Implementadas

Este framework incluye múltiples capas de seguridad para proteger contra vulnerabilidades comunes:

#### ✅ Prevención de Command Injection
- Uso de `spawn()` con array de argumentos (no shell execution)
- Validación estricta de todos los inputs
- `shell: false` para prevenir metacaracteres maliciosos

#### ✅ Prevención de Path Traversal
- Validación de agent IDs con regex: `/^[a-zA-Z0-9_-]{1,100}$/`
- Detección de patrones de traversal: `..`, rutas absolutas, drive letters
- Máximo 100 caracteres para prevenir buffer overflow

#### ✅ Protección de Datos
- Backup automático antes de eliminar archivos
- `.gitignore` configurado para evitar commits de datos sensibles
- Archivos de agente excluidos del control de versiones

### Tests de Validación

Para verificar que las medidas de seguridad funcionan correctamente:

```bash
node scripts/test-validation.js
```

Esto ejecuta 6 tests de seguridad:
1. ✅ Bloqueo de path traversal en agent ID
2. ✅ Rechazo de caracteres inválidos
3. ✅ Validación de agent ID requerido
4. ✅ Aceptación de agent IDs válidos
5. ✅ Bloqueo de path traversal en rutas de archivos
6. ✅ Aceptación de rutas relativas válidas

### Documentación de Mejoras

Para detalles completos sobre las mejoras de seguridad y optimización:

📄 **[SECURITY_AND_OPTIMIZATION_IMPROVEMENTS.md](./SECURITY_AND_OPTIMIZATION_IMPROVEMENTS.md)**

Incluye:
- Análisis detallado de vulnerabilidades corregidas
- Comparativas antes/después
- Métricas de impacto
- Recomendaciones futuras

## 🐛 Troubleshooting

### Error: ELEVENLABS_API_KEY no encontrada

```bash
cat .env | grep ELEVENLABS_API_KEY
```

### Error: ELEVENLABS_AGENT_ID inválido

Si ves este error, tu agent ID contiene caracteres no permitidos. Solo se aceptan:
- Letras (A-Z, a-z)
- Números (0-9)
- Guiones (-)
- Guiones bajos (_)
- Máximo 100 caracteres

Ejemplo válido: `agent_1401k6d9rrrzecdbww6x3jdyybx7`

### Error 422 al crear tests

Verifica que `agent_id` sea correcto y el agente exista.

### Error: spawn claude ENOENT

Claude Code CLI no está instalado o no está en el PATH.

**Solución rápida:**

```bash
# 1. Verificar el problema
npm run check:claude-cli

# 2. Instalar Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 3. Autenticar
claude auth login

# 4. Verificar instalación
claude --version

# 5. Ejecutar verificación nuevamente
npm run check:claude-cli
```

**Importante**: No confundir Claude Code Desktop (aplicación de escritorio) con Claude Code CLI (comando de terminal). Los scripts necesitan el CLI instalado globalmente.

Para más detalles, ver [CLAUDE_CLI_SETUP.md](./CLAUDE_CLI_SETUP.md)

### Tests lentos

Reduce `new_turns_limit`:

```yaml
new_turns_limit: 20
```

### Recuperar tests eliminados accidentalmente

Los tests se respaldan automáticamente antes de regenerar:

```bash
# Ver backups disponibles
ls -la tests/scenarios-backup-*

# Restaurar desde backup más reciente
LATEST_BACKUP=$(ls -td tests/scenarios-backup-* | head -1)
cp $LATEST_BACKUP/*.yaml tests/scenarios/
```

## 🔗 Enlaces

- [Documentación ElevenLabs](https://elevenlabs.io/docs)
- [API Reference - Tests](https://elevenlabs.io/docs/api-reference/tests/create)
- [API Reference - Simulate](https://elevenlabs.io/docs/api-reference/agents/simulate-conversation)

---

**Desarrollado para testing automatizado de agentes de ElevenLabs** 🚀
