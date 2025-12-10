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

## Regla de Despliegue
- **Desplegable**: NO hay fallos con severidad `critical` NI `high`
- **No desplegable**: Hay al menos 1 fallo `critical` o `high`
- **Con advertencias**: Solo fallos `medium` o `low` - desplegable pero revisar

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

### 4. Nivel de confianza

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

   d. **Clasifica severidad inicial** según tabla de criterios

   e. **Ajusta severidad** considerando:
      - ¿Este fallo refleja un problema que afectaría usuarios reales?
      - ¿O es una limitación de testing automatizado?
      - Si hay duda, indica en `confidence` y `testing_limitation_notes`

   f. **Determina confianza**:
      - `high`: Claramente problema real del bot
      - `medium`: Probablemente problema del bot
      - `low`: Podría ser limitación de test

   g. **Extrae key_issues**: Problemas específicos, no genéricos

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
