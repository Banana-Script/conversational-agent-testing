# Test Generator Web App

Aplicacion web para generar test cases automaticamente usando Claude Code.

## Requisitos

- Docker y Docker Compose
- Token de Claude Code OAuth

## Configuracion

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```

2. Obtener el token de Claude Code:
   ```bash
   # Instalar Claude Code CLI
   npm install -g @anthropic-ai/claude-code

   # Autenticarse
   claude auth login

   # El token se encuentra en ~/.claude/config.json
   cat ~/.claude/config.json | grep oauthToken
   ```

3. Edita `.env` y agrega tu token:
   ```
   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
   ```

## Uso

### Con Docker (Recomendado)

```bash
# Build y ejecutar
docker-compose up --build

# O solo ejecutar si ya esta construido
docker-compose up
```

Abre http://localhost:3000

### Desarrollo Local

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

## Estructura

```
webapp/
├── frontend/          # React + Vite + Tailwind
├── backend/           # Express + TypeScript
├── shared/            # Prompts y templates
│   ├── prompts/       # Prompt para QA agent
│   └── templates/     # Templates YAML por provider
├── Dockerfile         # Imagen multi-stage
└── docker-compose.yml # Orquestacion
```

## Flujo de Uso

1. Sube un archivo `.txt` o `.md` con el prompt del agente o especificaciones
2. Selecciona el provider (Viernes, Vapi, ElevenLabs)
3. Click "Generar Test Cases"
4. Observa el progreso en tiempo real
5. Descarga el ZIP con los tests generados

## API Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/upload` | Subir archivo |
| POST | `/api/generate` | Iniciar generacion |
| GET | `/api/generate/:id/events` | SSE de progreso |
| GET | `/api/generate/:id/download` | Descargar ZIP |
