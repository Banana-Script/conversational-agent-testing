# Corrección de Instrucciones del Asistente

## Objetivo
Analizar los resultados de pruebas fallidas de un asistente conversacional y generar las instrucciones completas corregidas para mejorar su comportamiento.

## Contexto

### Tipo de Asistente
- **Provider**: ${provider}
- **Tipo**: ${assistantType}

### Instrucciones Actuales del Asistente
```
${currentInstructions}
```

### Resultados de Pruebas Fallidas

${failedTestsDetails}

## Reglas para la Corrección

### 1. Mantener la Esencia
- Preserva el objetivo principal del asistente
- Mantén el tono y personalidad definidos
- No cambies la lógica de negocio que funciona correctamente

### 2. Corregir Problemas Específicos
Para cada test fallido, identifica:
- ¿Qué comportamiento esperado no se cumplió?
- ¿Qué parte de las instrucciones causó el problema?
- ¿Cómo se puede corregir sin afectar otros flujos?

### 3. Tipos de Correcciones Comunes

#### Para Asistentes de Voz (ElevenLabs, Vapi)
- **Claridad**: Las instrucciones deben ser concisas para respuestas rápidas
- **Manejo de interrupciones**: Agregar guías para cuando el usuario interrumpe
- **Confirmaciones**: Asegurar que el bot confirma información crítica
- **Transiciones**: Mejorar el flujo entre temas
- **Manejo de "No aplica"**: Cómo responder cuando el usuario indica que algo no aplica

#### Para Asistentes de Chat (Viernes)
- **Estructura de respuestas**: Usar formato claro y legible
- **Longitud apropiada**: Ni muy largas ni muy cortas
- **Uso de listas/bullets**: Cuando hay múltiples opciones
- **Emojis**: Solo si el tono lo permite
- **Links y recursos**: Formateo correcto

### 4. Patrones de Problemas y Soluciones

| Problema | Solución en Instrucciones |
|----------|---------------------------|
| Bot no maneja objeciones | Agregar sección específica de manejo de objeciones |
| Bot da información incorrecta | Corregir los datos o agregar validaciones |
| Bot no confirma datos | Agregar paso explícito de confirmación |
| Bot es muy agresivo/vendedor | Suavizar el tono, agregar empatía |
| Bot no sabe cuándo cerrar | Agregar criterios de cierre de conversación |
| Bot no maneja edge cases | Agregar sección de casos especiales |
| Bot interrumpe al usuario | Agregar instrucción de esperar respuesta completa |

## Output Requerido

Genera un documento Markdown con la siguiente estructura:

```markdown
# Instrucciones Corregidas del Asistente

## Resumen de Cambios

### Problemas Identificados
- [Lista de problemas encontrados en los tests]

### Correcciones Aplicadas
- [Lista de correcciones realizadas]

---

## Instrucciones Completas

[Aquí van las instrucciones completas corregidas del asistente, listas para copiar y pegar en la configuración del agente]

---

## Notas de Implementación

- [Cualquier consideración adicional para implementar estos cambios]
- [Sugerencias de tests adicionales a crear]
```

## Instrucciones de Ejecución

1. **Analiza cada test fallido**:
   - Lee los criterios que fallaron y sus rationales
   - Identifica el comportamiento problemático
   - Determina qué parte de las instrucciones originales causó el problema

2. **Prioriza correcciones**:
   - Primero los problemas críticos (seguridad, datos incorrectos, flujos rotos)
   - Luego los problemas de UX
   - Finalmente los problemas menores

3. **Genera las instrucciones corregidas**:
   - Integra todas las correcciones necesarias
   - Asegúrate de que las nuevas instrucciones sean coherentes
   - No dupliques información
   - Mantén un formato claro y estructurado

4. **Documenta los cambios**:
   - Explica qué se cambió y por qué
   - Esto ayuda al equipo a entender las modificaciones

## Ejemplo de Corrección

### Antes (problema: bot no maneja objeción "no me interesa")
```
Eres un asistente de ventas. Tu objetivo es presentar nuestros productos y cerrar ventas.
```

### Después (corrección aplicada)
```
Eres un asistente de ventas. Tu objetivo es presentar nuestros productos y cerrar ventas.

## Manejo de Objeciones

Si el usuario dice que no le interesa:
1. Agradece su tiempo: "Entiendo perfectamente, gracias por escucharme"
2. Ofrece una alternativa suave: "¿Le gustaría que le envíe información por correo por si en el futuro le interesa?"
3. Si insiste en que no, cierra amablemente: "Perfecto, que tenga un excelente día"

NUNCA insistas más de una vez si el usuario rechaza la oferta.
```

## Notas Importantes

- Las instrucciones corregidas deben ser COMPLETAS, no solo los cambios
- El documento debe poder usarse directamente para actualizar el agente
- Mantén el idioma original de las instrucciones (español/inglés)
- Si hay problemas que no se pueden resolver solo con instrucciones, indícalo en las notas
