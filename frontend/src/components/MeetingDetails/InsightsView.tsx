"use client";

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, CheckCircle2, CircleHelp, ListChecks, Route, Sparkles } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';
import {
  initials,
  parseAction,
  parseInsights,
  parseTopic,
  toggleCheckbox,
  type InsightSection,
} from '@/lib/insights';

// Markdown en línea (negritas, cursivas, código, enlaces) sin envolver en párrafos.
function Inline({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children: content }) => <>{content}</>,
        a: ({ children: content, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline">{content}</a>
        ),
        code: ({ children: content }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{content}</code>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function SectionTitle({ icon: Icon, label, count }: { icon: React.ComponentType<{ className?: string }>; label: string; count?: number }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-[0.82rem] font-semibold text-muted-foreground">
      <Icon className="size-4" />
      <span>{label}</span>
      {count !== undefined && <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground/80">{count}</span>}
    </h3>
  );
}

interface InsightsViewProps {
  markdown: string;
  /** Recibe el markdown actualizado al marcar o desmarcar una acción. */
  onChange: (markdown: string) => void;
}

// Insights del resumen con la estructura del diseño: resumen, decisiones, acciones, temas y preguntas.
export function InsightsView({ markdown, onChange }: InsightsViewProps) {
  const { t } = useTranslation();
  const sections = useMemo(() => parseInsights(markdown), [markdown]);
  const doneCount = (section: InsightSection) => section.items.filter((item) => item.checked).length;

  if (sections.length === 0) {
    return <p className="px-8 py-10 text-sm text-muted-foreground">{t('insights.empty')}</p>;
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-9 px-8 py-8">
      {sections.map((section, sectionIndex) => (
        <section key={`${section.kind}-${sectionIndex}`} className={cn(sectionIndex > 0 && 'border-t border-border pt-8')}>
          {section.kind === 'summary' && (
            <>
              <SectionTitle icon={Sparkles} label={t('insights.summary')} />
              <div className="space-y-3">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-[1.08rem] leading-[1.6] tracking-[-0.01em] text-foreground"><Inline>{paragraph}</Inline></p>
                ))}
                {section.items.length > 0 && (
                  <ul className="space-y-1.5 text-[0.95rem] leading-relaxed text-foreground/90">
                    {section.items.map((item) => (
                      <li key={item.line} className="flex gap-2"><span className="mt-2.5 h-0.5 w-1.5 shrink-0 bg-brand" /><span><Inline>{item.text}</Inline></span></li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {section.kind === 'decisions' && (
            <>
              <SectionTitle icon={CheckCircle2} label={t('insights.decisions')} count={section.items.length} />
              <ol className="divide-y divide-border">
                {section.items.map((item, index) => (
                  <li key={item.line} className="flex items-baseline gap-4 py-2.5 first:pt-0">
                    <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 text-[0.97rem] leading-snug"><Inline>{item.text}</Inline></span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {section.kind === 'actions' && (
            <>
              <SectionTitle
                icon={ListChecks}
                label={t('insights.actions')}
                count={section.items.length}
              />
              <p className="-mt-2 mb-3 text-xs text-muted-foreground">
                {t('insights.actionsDone').replace('{done}', String(doneCount(section))).replace('{total}', String(section.items.length))}
              </p>
              <ul className="-mx-2 space-y-0.5">
                {section.items.map((item) => {
                  const action = parseAction(item.text);
                  const checkable = item.checked !== undefined;
                  return (
                    <li key={item.line} className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                      {checkable ? (
                        <input
                          type="checkbox"
                          checked={!!item.checked}
                          onChange={() => onChange(toggleCheckbox(markdown, item.line))}
                          aria-label={action.task}
                          className="mt-1 size-4 shrink-0 cursor-pointer rounded border-input accent-[hsl(var(--brand))]"
                        />
                      ) : (
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[0.97rem] leading-snug', item.checked && 'text-muted-foreground line-through decoration-border')}>
                          <Inline>{action.task}</Inline>
                        </p>
                        {(action.owner || action.context) && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {action.owner && (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-muted text-[0.55rem] font-semibold text-muted-foreground">{initials(action.owner)}</span>
                                {action.owner}
                              </span>
                            )}
                            {action.context && <span className="italic">{action.context}</span>}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {section.kind === 'topics' && (
            <>
              <SectionTitle icon={Route} label={t('insights.topics')} count={section.items.length} />
              <ul className="space-y-3.5">
                {section.items.map((item, index) => {
                  const topic = parseTopic(item.text);
                  return (
                    <li key={item.line} className="flex gap-3">
                      <span className="mt-[0.45rem] size-2 shrink-0 rounded-[3px] bg-brand" style={{ opacity: Math.max(0.35, 1 - index * 0.14) }} />
                      <div className="min-w-0 flex-1 text-[0.95rem] leading-relaxed">
                        {topic.title ? (
                          <>
                            <span className="font-medium text-foreground">{topic.title}</span>
                            {topic.body && <span className="text-muted-foreground">. <Inline>{topic.body}</Inline></span>}
                          </>
                        ) : (
                          <Inline>{topic.body}</Inline>
                        )}
                        {item.details.length > 0 && (
                          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                            {item.details.map((detail, i) => <li key={i}><Inline>{detail}</Inline></li>)}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {section.kind === 'questions' && (
            <>
              <SectionTitle icon={CircleHelp} label={t('insights.questions')} count={section.items.length} />
              <ul className="space-y-2.5">
                {section.items.map((item) => {
                  const risk = /^\*{0,2}(riesgo|bloqueo|risk|blocker)/i.test(item.text);
                  const Icon = risk ? AlertTriangle : CircleHelp;
                  return (
                    <li key={item.line} className="flex items-start gap-2.5 text-[0.95rem] leading-snug">
                      <Icon className={cn('mt-0.5 size-4 shrink-0', risk ? 'text-warning' : 'text-muted-foreground')} />
                      <span><Inline>{item.text}</Inline></span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {section.kind === 'other' && (
            <>
              <h3 className="mb-3 text-[0.82rem] font-semibold text-muted-foreground">{section.title}</h3>
              <div className="space-y-2 text-[0.95rem] leading-relaxed">
                {section.paragraphs.map((paragraph, index) => <p key={index}><Inline>{paragraph}</Inline></p>)}
                {section.items.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5">
                    {section.items.map((item) => <li key={item.line}><Inline>{item.text}</Inline></li>)}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
