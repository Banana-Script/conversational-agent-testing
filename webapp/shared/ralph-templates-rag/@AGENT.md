# RAG Output Validation Instructions

## Workspace Structure
```
/workspace/
  docs/            # Source documents (READ ONLY)
  output/          # Extracted knowledge base (WRITE HERE)
  @fix_plan.md     # Task checklist
  @AGENT.md        # This file - validation rules
  PROMPT.md        # Main instructions
```

## Output Directory Structure

### Required Directories
```
output/
  01-empresa/       # Company/organization info
  02-productos/     # Products or services catalog
  03-precios/       # Pricing information
  04-horarios/      # Schedules and operating hours
  05-contacto/      # Contact information
  06-politicas/     # Policies and procedures
  07-faq/           # Frequently asked questions
```

### Optional Directories (create as needed)
```
  08-ubicaciones/   # Locations and branches
  09-equipo/        # Team and staff info
  10-promociones/   # Current promotions
  11-integraciones/ # Partnerships and integrations
  99-misc/          # Uncategorized information
```

## Output File Schema

### Required YAML Frontmatter
Every markdown file MUST start with:

```yaml
---
category: string        # Must match parent directory name (without number prefix)
tags: [string, ...]     # 1-5 relevant tags for search
last_updated: YYYY-MM-DD # Date of extraction
source: string          # Original filename(s) this came from
confidence: high | medium | low
---
```

### Confidence Levels
- **high**: Data copied verbatim, numbers verified
- **medium**: Data interpreted, numbers double-checked
- **low**: Data inferred or partially unclear in source

### File Naming Convention
```
{descriptive-name}.md

Examples:
- general.md
- lista-precios.md
- horarios-atencion.md
- politica-devoluciones.md
```

## Content Formatting Rules

### Numbers and Prices
```markdown
**Precio:** $1,234.56   # Include currency symbol
**Cantidad:** 50 unidades
**Peso:** 2.5 kg
**Dimensiones:** 30 x 20 x 10 cm
```

### Phone Numbers
```markdown
**Telefono:** +1 (555) 123-4567
**WhatsApp:** +52 55 1234 5678
```

### Dates and Times
```markdown
**Horario:** Lunes a Viernes 9:00 - 18:00
**Fecha:** 15 de enero de 2024
```

### Lists
```markdown
## Servicios Incluidos
- Servicio 1
- Servicio 2
- Servicio 3

## Caracteristicas
| Caracteristica | Valor |
|----------------|-------|
| Material | Acero inoxidable |
| Garantia | 2 anos |
```

## Validation Commands

Run these to verify your output:

```bash
# Check all files have frontmatter
for f in output/**/*.md; do
  head -1 "$f" | grep -q "^---$" && echo "OK: $f" || echo "MISSING FRONTMATTER: $f"
done

# Count files per category
find output -name "*.md" | wc -l

# Check file sizes (should be < 500 words each)
for f in output/**/*.md; do
  words=$(wc -w < "$f")
  [ "$words" -gt 500 ] && echo "TOO LONG ($words words): $f"
done
```

## Quality Checklist

Before marking Phase 8 complete, verify:

1. **Numerical Accuracy**
   - [ ] All prices match source exactly
   - [ ] All phone numbers are correct
   - [ ] All dates/times are accurate
   - [ ] All measurements are precise

2. **Frontmatter Completeness**
   - [ ] Every file has valid YAML frontmatter
   - [ ] Category matches directory
   - [ ] Tags are relevant
   - [ ] Source file is documented
   - [ ] Confidence level is set

3. **Organization**
   - [ ] Files are in appropriate directories
   - [ ] No duplicate content
   - [ ] Each file covers ONE topic
   - [ ] Filenames are descriptive

4. **Content Quality**
   - [ ] Information is actionable
   - [ ] Language is clear and concise
   - [ ] Formatting is consistent
   - [ ] Cross-references work

## Common Issues

| Issue | Fix |
|-------|-----|
| Missing frontmatter | Add `---` block at file start |
| Wrong category | Move file to correct directory |
| Price discrepancy | Re-check source, update with `[VERIFY]` if unclear |
| File too long | Split into multiple topic-specific files |
| Duplicate content | Merge into single authoritative file |
| Unclear source | Set confidence: low, add source note |

## Example Complete File

```markdown
---
category: precios
tags: [electrodomesticos, licuadoras, catalogo]
last_updated: 2024-01-15
source: catalogo-productos-2024.pdf
confidence: high
---

# Precios de Licuadoras

## Linea Profesional

| Modelo | Precio | Capacidad |
|--------|--------|-----------|
| LIC-2000 Pro | $89.99 | 2 litros |
| LIC-3000 Pro+ | $129.99 | 3 litros |

## Linea Basica

| Modelo | Precio | Capacidad |
|--------|--------|-----------|
| LIC-1500 Basic | $49.99 | 1.5 litros |
| LIC-1000 Mini | $29.99 | 1 litro |

**Nota:** Precios incluyen IVA. Vigentes hasta 31/03/2024.
```
