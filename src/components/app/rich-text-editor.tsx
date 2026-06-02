"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Heading2,
  Quote,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minRows?: number;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  minRows = 4,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-violet-600 underline underline-offset-2",
          rel: "noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap devuelve "<p></p>" para contenido vacío — normalizamos a "".
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          "min-h-[var(--rte-min-h)] px-3 py-2 text-[12.5px] leading-relaxed",
        ),
        style: `--rte-min-h: ${minRows * 1.5}rem;`,
        "data-placeholder": placeholder ?? "Escribí algo…",
      },
    },
    immediatelyRender: false,
  });

  // Sync external value changes (ej: reset, defaults).
  useEffect(() => {
    if (editor && value !== editor.getHTML() && value !== "" && editor.isEmpty) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // Si value se vacía externamente y el editor tiene contenido distinto, resetear.
    if (editor && !value && !editor.isEmpty) {
      editor.commands.clearContent(false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-[80px] rounded-md border border-input bg-background animate-pulse",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <Toolbar editor={editor} disabled={disabled} />
      <div className="border-t border-border">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
      <ToolBtn
        active={editor.isActive("bold")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Negrita (⌘B)"
      >
        <Bold size={13} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("italic")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Cursiva (⌘I)"
      >
        <Italic size={13} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("heading", { level: 2 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Encabezado"
      >
        <Heading2 size={13} />
      </ToolBtn>

      <Divider />

      <ToolBtn
        active={editor.isActive("bulletList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Lista con viñetas"
      >
        <List size={13} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("orderedList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Lista numerada"
      >
        <ListOrdered size={13} />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive("blockquote")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Cita"
      >
        <Quote size={13} />
      </ToolBtn>

      <Divider />

      <ToolBtn
        active={editor.isActive("link")}
        disabled={disabled}
        onClick={() => {
          const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
          const url = window.prompt("URL del enlace:", prev);
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          } else {
            const finalUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
            editor.chain().focus().extendMarkRange("link").setLink({ href: finalUrl }).run();
          }
        }}
        label="Insertar enlace"
      >
        <LinkIcon size={13} />
      </ToolBtn>

      <div className="flex-1" />

      <ToolBtn
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        label="Deshacer (⌘Z)"
      >
        <Undo size={13} />
      </ToolBtn>
      <ToolBtn
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        label="Rehacer (⌘⇧Z)"
      >
        <Redo size={13} />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "size-6 rounded transition-colors",
        active && "bg-violet-500/15 text-violet-600 dark:text-violet-400",
      )}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}
