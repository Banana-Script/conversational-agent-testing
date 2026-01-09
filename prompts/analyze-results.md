# Análisis de Severidad de Pruebas

## Objetivo
Analizar los resultados de pruebas de agentes conversacionales y clasificar cada fallo por severidad para determinar si el sistema es desplegable a producción.

**IMPORTANTE**: Este análisis requiere BALANCE entre rigor y pragmatismo. Las pruebas automatizadas tienen limitaciones inherentes que deben considerarse al evaluar severidad.

## Input
- Archivo de resultados: `@${resultsJsonPath}`

## Limitaciones de Pruebas Automatizadas

Antes de clasificar severidad, reconoce que las pruebas automatizadas **NO PUEDEN** validar:

1. **Interrupciones reales**: El usuario interrumpiendo al bot mid-sentence
2. **Latencia/timing real**: Delays naturales en conversaciones telefónicas
3. **Prosodia y tono**: Entonación, emoción, calidez en la voz
4. **Problemas de conexión**: Ruido, cortes, calidad de audio
5. **Limitaciones del framework**: Parsing estricto de respuestas que podrían funcionar en producción

**Implicación**: Un fallo en tests automatizados NO siempre significa un fallo real del bot. Considera el contexto.

## Criterios de Clasificación

### Critical (Bloquea Despliegue)
**Fallos que demuestran problemas REALES de lógica de negocio o seguridad**

Ejemplos:
- Redirección incorrecta a departamento/flujo equivocado
- Preguntas no autorizadas que violan políticas
- Información incorrecta entregada al usuario
- Violación de reglas de negocio críticas
- Error de ejecución que detiene el flujo completamente
- 0% criterios pasados en flujo principal

**NO son critical**:
- Fallo por parsing estricto de respuesta válida pero con formato diferente
- Timeout que podría ser limitación del framework, no del bot
- Falta de interrupción (no se puede probar realmente en automatizado)

### High (Bloquea Despliegue)
**Flujos principales con problemas significativos pero parcialmente funcionales**

Ejemplos:
- 1-25% criterios pasados en flujo principal
- Manejo inadecuado de información crítica del usuario
- UX severamente degradada que confundiría a usuarios
- Múltiples pasos del flujo omitidos o en orden incorrecto
- **Bucle infinito de despedidas**: El agente no cierra la conversación cuando el usuario se despide, generando intercambios repetitivos de "adiós/gracias/cuídate" (más de 2 turnos de despedida)
- **Fallo en cierre de conversación**: El agente responde indefinidamente a despedidas en lugar de terminar la interacción de forma profesional

**Considera downgrade a Medium si**:
- El fallo parece ser por expectativas demasiado rígidas del test
- La funcionalidad core se logra pero con diferencias menores
- El problema podría no manifestarse en conversación real

### Medium (Permite Despliegue con Advertencias)
**Flujos secundarios afectados o edge cases no manejados óptimamente**

Ejemplos:
- 26-50% criterios pasados
- Edge cases sin manejo elegante pero que no rompen el flujo
- Problemas de UX en flujos secundarios
- Respuestas subóptimas pero no incorrectas

### Low (Permite Despliegue)
**Problemas menores que no afectan funcionalidad**

Ejemplos:
- >50% criterios pasados
- Problemas cosméticos de mensajes
- Verbosidad o brevedad excesiva
- Orden de preguntas subóptimo pero funcional

### Incomplete (Cobertura Insuficiente - NO Permite Despliegue Automático)
**Tests que no pudieron ejecutarse o no tienen evidencia de comportamiento**

Ejemplos:
- 0/0 criterios evaluados (test no ejecutó)
- Conversación vacía (timeout antes de cualquier interacción)
- Error de infraestructura que impidió la prueba
- Criterios que retornan "unknown" sin evaluación real

**IMPORTANTE**: Un test con 0/0 criterios y conversación vacía NO debe clasificarse como "low" - debe clasificarse como "incomplete". No tenemos evidencia de que el bot funcione en ese escenario.

## Regla de Despliegue
- **Desplegable**: NO hay fallos con severidad `critical` NI `high` Y menos de 20% de tests son `incomplete`
- **No desplegable**: Hay al menos 1 fallo `critical` o `high`
- **Cobertura insuficiente**: Más del 20% de tests son `incomplete` (timeouts, 0/0 criterios) - NO desplegable hasta re-ejecutar tests
- **Con advertencias**: Solo fallos `medium` o `low` y menos de 20% `incomplete` - desplegable pero revisar

## Análisis Requerido

Para cada test fallido (donde `success === false`), evalúa:

### 1. ¿Es un problema REAL del bot o limitación del test?

**Señales de problema REAL**:
- Lógica de negocio incorrecta (redirects, datos, flujos)
- Información incorrecta entregada
- Violación de políticas o reglas
- Flujo completamente roto

**Señales de limitación de test**:
- Fallo por formato de respuesta (bot dio info correcta pero en distinto orden)
- Timeout en test (podría funcionar en timing real)
- Expectativa de interrupción (no testeable realmente)
- Parsing muy estricto de respuestas válidas

### 2. Análisis de criterios fallidos

- Lee CADA `rationale` de criterios fallidos
- Identifica el problema subyacente
- Distingue entre "bot hizo algo incorrecto" vs "test esperaba formato específico"
- Nota si el criterio tiene `"Evaluation failed:"` (error técnico del framework)

### 3. Contexto de negocio

- ¿Es flujo crítico (ventas, soporte, compliance) o secundario?
- ¿Impacta experiencia del usuario directamente?
- ¿Qué pasaría si este comportamiento llega a producción?

### 4. Análisis de patrones de conversación (NUEVO)

**IMPORTANTE**: Revisa la conversación completa buscando estos patrones problemáticos:

**Bucle de despedidas (HIGH severity)**:
- El usuario se despide ("adiós", "gracias", "hasta luego", "nos vemos", "cuídate")
- El agente responde con otra despedida en lugar de cerrar
- El usuario vuelve a despedirse
- El agente vuelve a responder
- **Si hay más de 2 turnos de despedida → severidad HIGH**

Ejemplo de patrón problemático:
```
[USER]: ¡Gracias! Hasta luego.
[AGENT]: ¡Hasta luego! Cuídate.
[USER]: ¡Igualmente! Nos vemos.        ← Ya son 2 despedidas
[AGENT]: Gracias, nos vemos pronto.    ← Debería haber cerrado
[USER]: ¡Cuídate!                       ← 3 despedidas = HIGH
```

**Otros patrones a detectar**:
- **Repetición excesiva**: El agente repite la misma información sin agregar valor
- **No progresión**: La conversación no avanza hacia una resolución
- **Eco mecánico**: El agente solo repite lo que dice el usuario sin aportar

### 5. Análisis de Timeout (IMPORTANTE para tests con timeout_analysis)

Si un test tiene el campo `timeout_analysis`, DEBES calcular y generar recomendaciones específicas:

```json
"timeout_analysis": {
  "configured_timeout_seconds": 200,
  "configured_max_turns": 12,
  "elapsed_seconds": 197.94,
  "current_turn": 9,
  "total_turns": 12
}
```

**Cálculos requeridos:**
1. `timeoutUsage = elapsed_seconds / configured_timeout_seconds` (ej: 197.94/200 = 98.97%)
2. `turnsCompletion = current_turn / total_turns` (ej: 9/12 = 75%)
3. `avgSecsPerTurn = elapsed_seconds / current_turn` (ej: 197.94/9 = 21.99s)
4. `estimatedTotalTime = avgSecsPerTurn × total_turns` (ej: 21.99×12 = 263.9s)
5. `suggestedTimeout = estimatedTotalTime × 1.1` (ej: 263.9×1.1 = 290s, +45%)

**Reglas de recomendación:**

| Condición | Recomendación |
|-----------|---------------|
| `timeoutUsage > 90%` Y `turnsCompletion < 100%` | **Aumentar timeout** - el tiempo se agotó antes de completar turnos |
| `turnsCompletion = 100%` Y `timeoutUsage < 90%` | **Aumentar turnos** - completó turnos con tiempo sobrante |
| `timeoutUsage > 90%` Y `abs(timeoutUsage - turnsCompletion) < 15%` | **Aumentar ambos +33%** - proporcionales |

**Formato de recomendación (OBLIGATORIO si hay timeout_analysis):**
```
"Aumentar conversation_timeout de Xs a Ys (+Z%) para test 'nombre' - usó A% del tiempo, B% turnos (C/D)"
```

Ejemplo real con los datos de arriba:
```
"Aumentar conversation_timeout de 200s a 290s (+45%) para test 'P0-029' - usó 99% del tiempo, 75% turnos (9/12)"
```

### 6. Nivel de confianza

- **Alta confianza**: El fallo es claramente un problema real del bot
- **Media confianza**: Probablemente es problema del bot pero podría ser test
- **Baja confianza**: Más probable que sea limitación de test que problema real

## Output Requerido

**IMPORTANTE**: Debes generar ÚNICAMENTE un archivo JSON válido. No generes explicaciones adicionales ni texto fuera del JSON.

Genera el archivo: `./results/severity-analysis-${timestamp}.json`

El JSON debe tener exactamente esta estructura:

```json
{
  "analysis_timestamp": "2025-12-10T02:17:42.984Z",
  "deployment_status": {
    "is_deployable": false,
    "reason": "Explicación clara de por qué sí o no es desplegable, considerando limitaciones de testing",
    "confidence": "high"
  },
  "summary": {
    "total_tests": 11,
    "passed_tests": 6,
    "failed_tests": 5,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1,
    "incomplete": 0,
    "uncertain": 0
  },
  "test_classifications": [
    {
      "test_name": "Nombre exacto del test",
      "severity": "critical",
      "confidence": "high",
      "rationale": "Explicación detallada de por qué esta severidad, incluyendo si consideraste limitaciones de testing",
      "criteria_passed": "1/4",
      "key_issues": [
        "Issue específico 1 (ej: 'Redirige a ventas cuando debería ir a soporte')",
        "Issue específico 2"
      ],
      "is_real_bot_issue": true,
      "testing_limitation_notes": null
    },
    {
      "test_name": "Otro test",
      "severity": "medium",
      "confidence": "medium",
      "rationale": "Explicación que indica por qué hay incertidumbre",
      "criteria_passed": "2/5",
      "key_issues": [
        "Issue 1"
      ],
      "is_real_bot_issue": true,
      "testing_limitation_notes": "Podría ser parsing estricto - bot parece dar respuesta correcta pero en diferente formato"
    }
  ],
  "recommendations": [
    "Recomendación específica 1 para mejorar el bot",
    "Recomendación 2 para mejorar los tests si hay limitaciones identificadas"
  ],
  "testing_notes": [
    "Nota sobre limitaciones de testing encontradas durante análisis",
    "Sugerencias para mejorar la suite de tests"
  ]
}
```

## Instrucciones de Ejecución

1. **Lee el archivo JSON de resultados** completo para contexto general

2. **Identifica todos los tests donde** `success === false`

3. **Para cada test fallido**, ejecuta este análisis sistemático:

   a. **Calcula criterios pasados**: "X/Y" donde X = criterios con result="success", Y = total criterios

   b. **Lee TODOS los rationales**: Especialmente de criterios fallidos

   c. **Evalúa tipo de fallo**:
      - ¿Es problema de lógica de negocio? → Más severo
      - ¿Es problema de formato/parsing? → Considerar downgrade
      - ¿Tiene "Evaluation failed:"? → Error técnico, evaluar impacto real
      - ¿Tiene 0/0 criterios Y conversación vacía? → **INCOMPLETE** (NO es low)

   d. **Analiza patrones de conversación** (INCLUSO en tests que pasaron criterios):
      - Busca bucles de despedida (>2 turnos de adiós/gracias/cuídate) → **HIGH**
      - Busca repetición excesiva o falta de progresión
      - **IMPORTANTE**: Un test puede pasar todos sus criterios pero tener problemas de patrón que lo hacen HIGH

   e. **Clasifica severidad inicial** según tabla de criterios

   f. **Ajusta severidad** considerando:
      - ¿Este fallo refleja un problema que afectaría usuarios reales?
      - ¿O es una limitación de testing automatizado?
      - Si hay duda, indica en `confidence` y `testing_limitation_notes`

   g. **Determina confianza**:
      - `high`: Claramente problema real del bot
      - `medium`: Probablemente problema del bot
      - `low`: Podría ser limitación de test

   h. **Extrae key_issues**: Problemas específicos, no genéricos

4. **Genera el resumen de conteos** incluyendo `uncertain` si hay tests con confidence=low

5. **Determina desplegabilidad**:
   - Cuenta solo fallos `critical` y `high` con `confidence: high` o `medium`
   - Si todos los critical/high tienen `confidence: low`, considera deployment con advertencias
   - Explica el razonamiento en `deployment_status.reason`

6. **Genera recomendaciones** en dos categorías:
   - Mejoras al bot (para fallos reales)
   - Mejoras a los tests (si detectaste limitaciones del framework)

7. **Guarda el JSON** en `./results/severity-analysis-${timestamp}.json`

## Notas Importantes

- El `timestamp` en el nombre del archivo debe coincidir con el del archivo de resultados de input
- Solo clasifica tests FALLIDOS (success === false). Los tests exitosos no van en `test_classifications`
- **NO seas demasiado estricto**: Si un fallo parece ser de testing framework, indícalo
- **NO seas demasiado leniente**: Problemas reales de negocio DEBEN ser critical/high
- Si un criterio tiene `rationale` con "Evaluation failed:" evalúa si es error técnico vs problema real
- **Prioriza impacto en usuario real** sobre conformidad estricta con el test
- Las recomendaciones deben ser específicas y accionables, no genéricas
- Si tienes duda sobre severidad, err on the side of caution pero DOCUMENTA la incertidumbre

## Ejemplos de Clasificación Balanceada

### ✅ CRITICAL (correcto)
```
Test: "Transferencia a departamento correcto"
Fallo: Bot transfiere consultas de facturación a ventas en lugar de contabilidad
Razón: Violación directa de lógica de negocio - afecta a usuarios reales
Confidence: high
```

### ✅ MEDIUM (downgrade apropiado)
```
Test: "Confirmación de datos del usuario"
Fallo: Bot confirma datos pero dice "Perfecto, tengo X, Y y Z" en lugar de "Confirmame si tengo X, Y y Z"
Razón: Funcionalidad lograda, solo diferencia en fraseo - no afecta UX real
Confidence: medium
Testing note: Test muy estricto en formato exacto de confirmación
```

### ✅ HIGH (con incertidumbre documentada)
```
Test: "Manejo de interrupción"
Fallo: Bot no detecta interrupción del usuario
Razón: Tests automatizados no pueden simular interrupciones mid-sentence reales
Confidence: low
Testing note: Limitación fundamental del testing automatizado - requiere validación manual
```
