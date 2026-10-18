"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const CITATION = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\](?!\()/g;

// "[1, 2, 3]" -> enlace interno que se dibuja como chips numerados
function withCitationLinks(text: string): string {
  return text.replace(CITATION, (_, group: string) => `[cita](cite:${group.replace(/\s/g, "").replace(/;/g, ",")})`);
}

/** Números de fuente citados en un texto, p. ej. [1, 3] y [5]. */
export function citedNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(CITATION)) {
    match[1].split(/[,;]/).forEach((n) => numbers.add(Number(n.trim())));
  }
  return [...numbers].sort((a, b) => a - b);
}

function CitationChips({ numbers, onOpen, titles }: { numbers: number[]; onOpen?: (n: number) => void; titles?: (n: number) => string | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 3;
  const visible = expanded ? numbers : numbers.slice(0, limit);
  const hidden = numbers.length - visible.length;
  return (
    <span className="mx-0.5 inline-flex flex-wrap items-center gap-0.5 align-baseline">
      {visible.map((n) => (
        <button
          key={n}
          type="button"
          title={titles?.(n)}
          onClick={() => onOpen?.(n)}
          className="inline-grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-md bg-accent px-1 font-mono text-[0.68rem] font-medium leading-none text-accent-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
        >
          {n}
        </button>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-grid h-[1.15rem] place-items-center rounded-md bg-muted px-1 font-mono text-[0.68rem] leading-none text-muted-foreground transition-colors hover:text-foreground"
        >
          +{hidden}
        </button>
      )}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) => (typeof child === "string" ? child : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : ""))
    .join("");

// Markdown del chat: tipografía propia (clase .chat-md), tablas, código con copiar y citas como chips.
export function ChatMarkdown({
  children,
  onCite,
  citationTitle,
  className,
}: {
  children: string;
  onCite?: (number: number) => void;
  citationTitle?: (number: number) => string | undefined;
  className?: string;
}) {
  return (
    <div className={cn("chat-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          a: ({ href, children: content }) => {
            if (href?.startsWith("cite:")) {
              const numbers = href.slice(5).split(",").map(Number).filter(Number.isFinite);
              return <CitationChips numbers={numbers} onOpen={onCite} titles={citationTitle} />;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {content}
              </a>
            );
          },
          pre: ({ children: content }) => {
            const code = textOf(content).replace(/\n$/, "");
            const language = (isValidElement<{ className?: string }>(Children.toArray(content)[0]) &&
              /language-(\w+)/.exec((Children.toArray(content)[0] as { props: { className?: string } }).props.className ?? "")?.[1]) || "";
            return (
              <div className="chat-code">
                <div className="chat-code-head">
                  <span>{language}</span>
                  <CopyButton text={code} />
                </div>
                <pre>{content}</pre>
              </div>
            );
          },
          table: ({ children: content }) => (
            <div className="chat-table">
              <table>{content}</table>
            </div>
          ),
        }}
      >
        {withCitationLinks(children)}
      </ReactMarkdown>
    </div>
  );
}

export { CopyButton };
