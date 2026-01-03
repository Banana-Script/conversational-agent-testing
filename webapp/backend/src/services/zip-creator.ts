import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Provider } from '../types/index.js';

export interface TestFile {
  name: string;
  content: string;
}

export async function createTestsZip(
  files: TestFile[],
  provider: Provider
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const zipDir = join(tmpdir(), 'test-generator-zips');

  await mkdir(zipDir, { recursive: true });

  const zipPath = join(zipDir, `tests-${provider}-${timestamp}.zip`);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);

    // Add each YAML file
    files.forEach(({ name, content }) => {
      archive.append(content, { name: `scenarios/${name}` });
    });

    // Add README
    archive.append(generateReadme(provider, files.length), { name: 'README.md' });

    archive.finalize();
  });
}

function generateReadme(provider: Provider, fileCount: number): string {
  return `# Test Cases Generados

## Informacion

- **Provider:** ${provider}
- **Total Tests:** ${fileCount}
- **Generado:** ${new Date().toLocaleString()}

## Uso

1. Copia el directorio \`scenarios/\` a tu proyecto de testing
2. Asegurate de tener las variables de entorno configuradas:
   ${getEnvVarsForProvider(provider)}
3. Ejecuta los tests:
   \`\`\`bash
   npm run simulate
   \`\`\`

## Estructura

Cada archivo YAML sigue el formato del template de ${provider}:

- \`name\`: Nombre descriptivo del test
- \`description\`: Que valida este test
- \`simulated_user\`: Configuracion del usuario simulado
- \`evaluation_criteria\`: Criterios de exito/fallo

## Prioridades

Los archivos estan nombrados con prefijos de prioridad:
- \`p0-\`: Tests criticos (smoke tests)
- \`p1-\`: Tests de features principales
- \`p2-\`: Tests de features secundarias
- \`p3-\`: Tests de edge cases

---

Generado con Test Generator Web App
`;
}

function getEnvVarsForProvider(provider: Provider): string {
  switch (provider) {
    case 'elevenlabs':
      return `
   - ELEVENLABS_API_KEY
   - ELEVENLABS_AGENT_ID`;
    case 'vapi':
      return `
   - VAPI_API_KEY
   - VAPI_ASSISTANT_ID`;
    case 'viernes':
      return `
   - VIERNES_BASE_URL
   - VIERNES_ORGANIZATION_ID
   - VIERNES_AGENT_ID`;
    default:
      return '';
  }
}
