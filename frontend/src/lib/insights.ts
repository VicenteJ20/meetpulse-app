// Convierte el markdown de un resumen en módulos de insights (resumen, decisiones, acciones, temas,
// preguntas y riesgos). Entiende el formato nuevo y también el de las plantillas anteriores.

export type InsightKind = 'summary' | 'decisions' | 'actions' | 'topics' | 'questions' | 'other';

export interface InsightItem {
  text: string;
  /** Líneas de detalle bajo el elemento (viñetas anidadas o subsecciones). */
  details: string[];
  /** Solo en acciones: marcada o no. */
  checked?: boolean;
  /** Índice de la línea en el markdown original, para poder alternar la casilla. */
  line: number;
}

export interface InsightSection {
  kind: InsightKind;
  title: string;
  paragraphs: string[];
  items: InsightItem[];
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function kindForTitle(title: string): InsightKind | 'skip' {
  const t = normalize(title).replace(/[^a-z ]/g, ' ').trim();
  if (/^(metadatos|metadata)/.test(t)) return 'skip';
  if (/^(resumen|summary|objetivo|contexto)/.test(t)) return 'summary';
  if (/decision/.test(t)) return 'decisions';
  if (/^(acciones|compromisos|tareas|action|proximos pasos|next steps)/.test(t)) return 'actions';
  if (/^(temas|topics|puntos clave|key points)/.test(t)) return 'topics';
  if (/(pregunta|riesgo|bloqueo|sin resolver|pendiente|open question|risk)/.test(t)) return 'questions';
  return 'other';
}

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const CHECKBOX = /^\[( |x|X)\]\s*(.*)$/;

export function parseInsights(markdown: string): InsightSection[] {
  const lines = markdown.split('\n');
  const sections: InsightSection[] = [];
  let current: InsightSection | null = null;
  let currentTitle = '';
  let paragraph: string[] = [];
  let lastItem: InsightItem | null = null;
  let subHeading: InsightItem | null = null;

  const flushParagraph = () => {
    if (current && paragraph.length) current.paragraphs.push(paragraph.join(' ').trim());
    paragraph = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flushParagraph();
      currentTitle = h2[1].trim();
      const kind = kindForTitle(currentTitle);
      lastItem = null;
      subHeading = null;
      if (kind === 'skip') {
        current = null;
        return;
      }
      // Las secciones del mismo tipo (por ejemplo Objetivo y Contexto) se funden en una sola.
      const existing = sections.find((section) => section.kind === kind && kind !== 'other');
      current = existing ?? { kind, title: currentTitle, paragraphs: [], items: [] };
      if (!existing) sections.push(current);
      return;
    }
    if (!current) return;
    if (/^#\s/.test(line)) return;
    if (/^\s*\|/.test(line)) return; // tablas: no forman parte de los insights

    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      flushParagraph();
      subHeading = { text: `**${h3[1].trim()}**`, details: [], line: index };
      current.items.push(subHeading);
      lastItem = null;
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      return;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const indent = item[1].length;
      let text = item[2].trim();
      let checked: boolean | undefined;
      const box = CHECKBOX.exec(text);
      if (box) {
        checked = box[1].toLowerCase() === 'x';
        text = box[2].trim();
      }
      if (subHeading && !box && indent === 0 && current.kind === 'topics') {
        subHeading.details.push(text);
        return;
      }
      if (indent >= 2 && lastItem && !box) {
        lastItem.details.push(text);
        return;
      }
      lastItem = { text, details: [], checked, line: index };
      current.items.push(lastItem);
      return;
    }
    if (lastItem && /^\s{2,}\S/.test(raw)) {
      lastItem.details.push(line.trim());
      return;
    }
    paragraph.push(line.trim());
  });
  flushParagraph();
  return sections;
}

/** Alterna la casilla de la línea indicada y devuelve el markdown nuevo. */
export function toggleCheckbox(markdown: string, line: number): string {
  const lines = markdown.split('\n');
  const target = lines[line];
  if (target === undefined) return markdown;
  lines[line] = /\[ \]/.test(target) ? target.replace('[ ]', '[x]') : target.replace(/\[[xX]\]/, '[ ]');
  return lines.join('\n');
}

export interface ParsedAction {
  owner: string | null;
  task: string;
  context: string | null;
}

/** Separa responsable, tarea y contexto de una acción: "**Ana:** tarea" o "@Ana - tarea (Contexto: …)". */
export function parseAction(text: string): ParsedAction {
  let rest = text.trim();
  let context: string | null = null;
  const ctx = /\s*[_*]?\((?:Contexto|Context):\s*([^)]*)\)[_*]?\s*$/i.exec(rest);
  if (ctx) {
    context = ctx[1].trim();
    rest = rest.slice(0, ctx.index).trim();
  }
  const bold = /^\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(rest);
  if (bold) return { owner: bold[1].replace(/:$/, '').trim(), task: bold[2].trim(), context };
  const mention = /^@([^\s]+(?:\s[^\s—–-]+)*)\s*[—–-]\s*(.*)$/.exec(rest);
  if (mention) return { owner: mention[1].trim(), task: mention[2].trim(), context };
  return { owner: null, task: rest, context };
}

/** Separa el título en negrita de un tema: "**Tema:** descripción". */
export function parseTopic(text: string): { title: string | null; body: string } {
  const match = /^\*\*([^*]+?):?\*\*:?\s*(.*)$/.exec(text.trim());
  return match ? { title: match[1].replace(/:$/, '').trim(), body: match[2].trim() } : { title: null, body: text.trim() };
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
}
