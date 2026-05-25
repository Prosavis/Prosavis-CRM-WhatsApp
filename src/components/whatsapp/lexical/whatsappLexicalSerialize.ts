import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import type { ElementNode, LexicalEditor, RangeSelection } from 'lexical';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  $setSelection,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
} from 'lexical';

import { parseWhatsAppFormatting } from '@/utils/whatsappTextFormatting';

function wrapTextWithWhatsAppMarkers(text: string, format: number): string {
  let s = text;
  if (format & IS_STRIKETHROUGH) s = `~${s}~`;
  if (format & IS_ITALIC) s = `_${s}_`;
  if (format & IS_BOLD) s = `*${s}*`;
  return s;
}

function isPureCodeFormat(format: number): boolean {
  return (format & IS_CODE) !== 0 && (format & ~IS_CODE) === 0;
}

function serializeElementBlock(block: ElementNode): string {
  const children = block.getChildren();
  let result = '';
  let i = 0;

  while (i < children.length) {
    const child = children[i];

    if ($isLineBreakNode(child)) {
      result += '\n';
      i += 1;
      continue;
    }

    if (!$isTextNode(child)) {
      i += 1;
      continue;
    }

    const format = child.getFormat();

    if (isPureCodeFormat(format)) {
      const codeChunks: string[] = [];
      let hasLineBreak = false;

      while (i < children.length) {
        const c = children[i];
        if ($isLineBreakNode(c)) {
          hasLineBreak = true;
          codeChunks.push('\n');
          i += 1;
          continue;
        }
        if ($isTextNode(c)) {
          const tf = c.getFormat();
          if (!isPureCodeFormat(tf)) break;
          codeChunks.push(c.getTextContent());
          i += 1;
        } else {
          break;
        }
      }

      const codeBody = codeChunks.join('');
      const useBlock = hasLineBreak || codeBody.includes('\n');
      if (codeBody.length > 0) {
        result += useBlock ? `\`\`\`${codeBody}\`\`\`` : `\`${codeBody}\``;
      }
      continue;
    }

    result += wrapTextWithWhatsAppMarkers(child.getTextContent(), format);
    i += 1;
  }

  return result;
}

/** Serializa el documento Lexical a string con marcadores WhatsApp. Uso: dentro de `editorState.read`. */
export function $serializeWhatsAppString(): string {
  const root = $getRoot();
  const children = root.getChildren();
  const parts: string[] = [];

  for (const child of children) {
    if ($isParagraphNode(child) || $isHeadingNode(child) || $isQuoteNode(child)) {
      parts.push(serializeElementBlock(child));
    }
  }

  if (parts.length === 0) {
    return '';
  }

  return parts.join('\n');
}

/** Puebla el editor desde un string con marcadores WhatsApp. Uso: dentro de `editor.update`. */
export function $hydrateWhatsAppString(text: string): void {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  root.append(paragraph);

  const appendFormattedChunk = (chunk: string, format: number) => {
    const lines = chunk.split('\n');
    for (let li = 0; li < lines.length; li += 1) {
      if (li > 0) {
        paragraph.append($createLineBreakNode());
      }
      const line = lines[li];
      if (line.length > 0) {
        const tn = $createTextNode(line);
        if (format !== 0) {
          tn.setFormat(format);
        }
        paragraph.append(tn);
      }
    }
  };

  if (!text.trim()) {
    if (text.length > 0) {
      appendFormattedChunk(text, 0);
    }
    paragraph.selectEnd();
    return;
  }

  const segments = parseWhatsAppFormatting(text);
  if (segments.length === 0 && text.length > 0) {
    appendFormattedChunk(text, 0);
    paragraph.selectEnd();
    return;
  }

  for (const seg of segments) {
    switch (seg.type) {
      case 'text':
        appendFormattedChunk(seg.value, 0);
        break;
      case 'bold':
        appendFormattedChunk(seg.value, IS_BOLD);
        break;
      case 'italic':
        appendFormattedChunk(seg.value, IS_ITALIC);
        break;
      case 'strikethrough':
        appendFormattedChunk(seg.value, IS_STRIKETHROUGH);
        break;
      case 'monospace':
        appendFormattedChunk(seg.value, IS_CODE);
        break;
      case 'codeBlock':
        appendFormattedChunk(seg.value, IS_CODE);
        break;
      default:
        break;
    }
  }

  paragraph.selectEnd();
}

export function readWhatsAppPlainText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $serializeWhatsAppString());
}

export function insertPlainTextWithLineBreaks(selection: RangeSelection, text: string): void {
  const lines = text.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    if (lineIdx > 0) {
      selection.insertNodes([$createLineBreakNode()]);
    }
    const line = lines[lineIdx];
    if (line.length > 0) {
      selection.insertText(line);
    }
  }
}

/** Limpia el editor dejando un párrafo vacío. */
export function $resetComposerDocument(): void {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  root.append(paragraph);
  $setSelection(paragraph.selectEnd());
}
