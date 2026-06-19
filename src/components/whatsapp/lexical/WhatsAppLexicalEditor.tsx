import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import type { EditorThemeClasses, TextFormatType } from 'lexical';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  KEY_ENTER_COMMAND,
  LineBreakNode,
  mergeRegister,
  PASTE_COMMAND,
  ParagraphNode,
  TextNode,
  type LexicalEditor,
  type PasteCommandType,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { Box, Typography } from '@mui/material';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import './whatsappComposer.css';
import {
  $hydrateWhatsAppString,
  $serializeWhatsAppString,
  insertPlainTextWithLineBreaks,
  readWhatsAppPlainText,
} from './whatsappLexicalSerialize';

const lexicalTheme: EditorThemeClasses = {
  paragraph: 'wa-composer-paragraph',
  text: {
    bold: 'wa-composer-text-bold',
    italic: 'wa-composer-text-italic',
    strikethrough: 'wa-composer-text-strikethrough',
    code: 'wa-composer-text-code',
  },
};

const MARKER_TO_FORMAT: Record<string, 'bold' | 'italic' | 'strikethrough' | 'code'> = {
  '*': 'bold',
  _: 'italic',
  '~': 'strikethrough',
  '`': 'code',
};

function bitmaskForFormat(fmt: TextFormatType): number {
  switch (fmt) {
    case 'bold':
      return IS_BOLD;
    case 'italic':
      return IS_ITALIC;
    case 'strikethrough':
      return IS_STRIKETHROUGH;
    case 'code':
      return IS_CODE;
    default:
      return 0;
  }
}

function onLexicalError(error: Error, editor: LexicalEditor): void {
  console.error('WhatsAppLexicalEditor', error, editor);
}

function InitialParagraphPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(() => {
      const root = $getRoot();
      if (root.getChildrenSize() === 0) {
        root.append($createParagraphNode());
      }
    });
  }, [editor]);

  return null;
}

/** Enter sin Shift no inserta salto de línea; el envío lo maneja MessageInput.onKeyDown. */
function EnterSubmitPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) {
          return false;
        }
        event?.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}

function PlainTextPastePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        PASTE_COMMAND,
        (event: PasteCommandType) => {
          if (!(event instanceof ClipboardEvent)) {
            return false;
          }
          const plain = event.clipboardData?.getData('text/plain');
          if (plain == null) {
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              insertPlainTextWithLineBreaks(selection, plain);
            }
          });
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  return null;
}

export interface WhatsAppLexicalEditorHandle {
  focus: () => void;
  getWhatsAppText: () => string;
  setWhatsAppText: (value: string) => void;
  insertAtSelection: (value: string) => void;
  wrapSelection: (before: string, after?: string) => void;
}

export interface WhatsAppLexicalEditorProps {
  disabled?: boolean;
  ariaLabel: string;
  placeholder: string;
  composerMinHeight: number;
  composerMaxHeight: number;
  onHeightChange?: (height: number) => void;
  onPlainTextChange: (plainWhatsApp: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
}

const EditorBridge = forwardRef<WhatsAppLexicalEditorHandle, WhatsAppLexicalEditorProps>(
  function EditorBridge(props, ref) {
    const {
      disabled = false,
      ariaLabel,
      placeholder,
      composerMinHeight,
      composerMaxHeight,
      onHeightChange,
      onPlainTextChange,
      onKeyDown,
      onBlur,
    } = props;

    const [editor] = useLexicalComposerContext();
    const contentEditableRef = useRef<HTMLDivElement | null>(null);

    const measureHeight = useCallback(() => {
      const el = contentEditableRef.current;
      if (!el) return;
      const next = Math.max(composerMinHeight, Math.min(el.scrollHeight, composerMaxHeight));
      onHeightChange?.(next);
    }, [composerMinHeight, composerMaxHeight, onHeightChange]);

    useEffect(() => {
      editor.setEditable(!disabled);
    }, [editor, disabled]);

    useEffect(() => {
      measureHeight();
    }, [measureHeight]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editor.focus();
        },
        getWhatsAppText: () => readWhatsAppPlainText(editor),
        setWhatsAppText: (value: string) => {
          editor.update(() => {
            $hydrateWhatsAppString(value);
          });
          requestAnimationFrame(measureHeight);
        },
        insertAtSelection: (value: string) => {
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              insertPlainTextWithLineBreaks(selection, value);
            }
          });
          editor.focus();
        },
        wrapSelection: (before: string, after = before) => {
          const fmt = MARKER_TO_FORMAT[before];
          if (!fmt || before !== after) return;
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            if (selection.isCollapsed()) {
              const placeholderText = 'texto';
              const node = $createTextNode(placeholderText);
              const bit = bitmaskForFormat(fmt);
              if (bit) node.setFormat(bit);
              selection.insertNodes([node]);
              node.select(0, placeholderText.length);
            } else {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, fmt);
            }
          });
          editor.focus();
        },
      }),
      [editor, measureHeight],
    );

    return (
      <>
        <InitialParagraphPlugin />
        <EnterSubmitPlugin />
        <PlainTextPastePlugin />
        <HistoryPlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => {
              onPlainTextChange($serializeWhatsAppString());
            });
            requestAnimationFrame(measureHeight);
          }}
        />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              ref={contentEditableRef}
              className="wa-composer-root"
              aria-label={ariaLabel}
              aria-multiline
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              style={{
                minHeight: composerMinHeight,
                maxHeight: composerMaxHeight,
              }}
            />
          }
          placeholder={
            <Typography
              variant="body2"
              className="wa-composer-placeholder"
              sx={{ color: 'text.disabled' }}
            >
              {placeholder}
            </Typography>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </>
    );
  },
);

export const WhatsAppLexicalEditor = forwardRef<WhatsAppLexicalEditorHandle, WhatsAppLexicalEditorProps>(
  function WhatsAppLexicalEditor(props, ref) {
    const initialConfig = {
      namespace: 'WhatsAppComposer',
      theme: lexicalTheme,
      onError: onLexicalError,
      nodes: [ParagraphNode, TextNode, LineBreakNode, HeadingNode, QuoteNode],
      editable: !props.disabled,
    };

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <Box sx={{ position: 'relative', width: '100%' }}>
          <EditorBridge ref={ref} {...props} />
        </Box>
      </LexicalComposer>
    );
  },
);
