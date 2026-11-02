import type { ExportDocument } from './document';
import { formatTxt } from './txt';

export const AI_INSTRUCTIONS = `Analiza la conversación comercial y crea un expediente estructurado. Identifica:
1. Cliente y empresa.
2. Objetivo del proyecto.
3. Necesidades y problemas.
4. Soluciones y automatizaciones solicitadas.
5. Funcionalidades acordadas.
6. Funcionalidades propuestas pero no aprobadas.
7. Presupuesto y condiciones económicas mencionadas.
8. Fechas y plazos.
9. Compromisos de ambas partes.
10. Objeciones y bloqueos.
11. Decisiones tomadas.
12. Pendientes.
13. Próximas acciones con responsables.
14. Riesgos.
15. Preguntas que faltan por hacer.
16. Resumen ejecutivo.
17. Borrador del próximo seguimiento comercial.
18. Briefing para el equipo técnico.

Separa HECHOS CONFIRMADOS, PROPUESTAS, HIPÓTESIS y PENDIENTES. No inventes información. Señala las evidencias con referencias a fechas o mensajes cuando sea posible. Si la conversación está incompleta, adviértelo.`;

export function formatForAi(doc: ExportDocument): string {
  const incomplete =
    doc.coverage !== 'start-reached'
      ? `\nAVISO DE COBERTURA: ${doc.coverageText}. Es posible que falten mensajes anteriores; tenlo en cuenta en el análisis.\n`
      : '';
  return `${AI_INSTRUCTIONS}\n${incomplete}\n===== INICIO DE LA CONVERSACIÓN =====\n\n${formatTxt(doc)}\n===== FIN DE LA CONVERSACIÓN =====\n`;
}
