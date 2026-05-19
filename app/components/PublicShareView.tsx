"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GraphView } from "./GraphView";
import { DocEditor } from "./DocEditor";
import type { DocIndex, DocNode } from "@/src/core/indexer";

interface Publication {
  id: string;
  handle: string;
  slug: string;
  root_doc_path: string;
  owner_email: string | null;
}

interface Props {
  publication: Publication;
  index: DocIndex;
  isSignedIn: boolean;
}

export function PublicShareView({ publication, index, isSignedIn }: Props) {
  const [activePath, setActivePath] = useState<string>(publication.root_doc_path);
  const viewLoggedRef = useRef(false);

  const byTitle = useMemo(() => {
    const m = new Map<string, DocNode>();
    for (const d of index.docs) m.set(d.title.toLowerCase(), d);
    return m;
  }, [index]);
  const byPath = useMemo(() => {
    const m = new Map<string, DocNode>();
    for (const d of index.docs) m.set(d.path, d);
    return m;
  }, [index]);

  const activeDoc = byPath.get(activePath) ?? null;
  const rootDoc = byPath.get(publication.root_doc_path) ?? null;

  const logEvent = useCallback(
    (eventType: string, docPath?: string) => {
      fetch("/api/publication-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publication_id: publication.id,
          event_type: eventType,
          doc_path: docPath ?? null,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [publication.id]
  );

  useEffect(() => {
    if (viewLoggedRef.current) return;
    viewLoggedRef.current = true;
    logEvent("view");
  }, [logEvent]);

  const selectDoc = useCallback(
    (path: string) => {
      if (path === activePath) return;
      setActivePath(path);
      if (path !== publication.root_doc_path) logEvent("doc_open", path);
    },
    [activePath, logEvent, publication.root_doc_path]
  );

  const handleWikiLinkClick = useCallback(
    (title: string) => {
      const doc = byTitle.get(title.toLowerCase());
      if (doc) selectDoc(doc.path);
    },
    [byTitle, selectDoc]
  );

  const { prevSibling, nextSibling, parentDoc } = useMemo<{
    prevSibling: DocNode | null;
    nextSibling: DocNode | null;
    parentDoc: DocNode | null;
  }>(() => {
    if (!activeDoc) return { prevSibling: null, nextSibling: null, parentDoc: null };
    const primaryParent = activeDoc.parents[0];
    if (!primaryParent) return { prevSibling: null, nextSibling: null, parentDoc: null };
    const parent = byTitle.get(primaryParent.title.toLowerCase()) ?? null;
    if (!parent) return { prevSibling: null, nextSibling: null, parentDoc: null };
    const siblings = parent.children
      .map((l) => byTitle.get(l.title.toLowerCase()))
      .filter((d): d is DocNode => !!d);
    const idx = siblings.findIndex((d) => d.path === activeDoc.path);
    if (idx === -1) return { prevSibling: null, nextSibling: null, parentDoc: parent };
    return {
      prevSibling: siblings[idx - 1] ?? null,
      nextSibling: siblings[idx + 1] ?? null,
      parentDoc: parent,
    };
  }, [activeDoc, byTitle]);

  const onSignupClick = useCallback(() => {
    logEvent("signup_click");
    window.location.href = `/sign-up?ref=${encodeURIComponent(`${publication.handle}/${publication.slug}`)}`;
  }, [logEvent, publication.handle, publication.slug]);

  const onSubscribeClick = useCallback(() => {
    logEvent("subscribe_click");
    alert(
      "Subscribe is coming soon — saving this vault to your own VAULT > SHARED so your AI can read it too. We logged your interest; you'll get an email when it ships."
    );
  }, [logEvent]);

  const rootTitle = rootDoc?.title ?? publication.slug;

  return (
    <div className="public-share-root">
      <header className="public-share-header">
        <div className="public-share-brand">
          <Link href="/" className="public-share-logo" aria-label="EMDEE home">
            <span className="public-share-logo-dot" />
            EMDEE
          </Link>
          <span className="public-share-brand-sep">·</span>
          <div className="public-share-crumbs">
            <span className="public-share-owner">{publication.handle}&rsquo;s vault</span>
            <span className="public-share-crumb-sep">/</span>
            <span className="public-share-pub">{rootTitle}</span>
          </div>
        </div>
        <div className="public-share-actions">
          {isSignedIn ? (
            <button className="public-share-cta" onClick={onSubscribeClick} type="button">
              Save to my vault
            </button>
          ) : (
            <button className="public-share-cta" onClick={onSignupClick} type="button">
              Sign up free
            </button>
          )}
        </div>
      </header>

      <div className="public-share-body">
        <section className="public-share-graph-pane">
          <div className="public-share-graph">
            <GraphView
              index={index}
              activePath={activePath}
              onSelect={selectDoc}
              prevSibling={prevSibling}
              nextSibling={nextSibling}
            />
          </div>
          <div className="public-share-graph-hint">
            <span className="public-share-graph-hint-key">{index.docs.length}</span>
            <span className="public-share-graph-hint-label">
              {index.docs.length === 1 ? "note" : "notes"} in this graph · click any to read
            </span>
          </div>
        </section>

        <article className="public-share-article">
          {activeDoc ? (
            <>
              <div className="public-share-article-head">
                {parentDoc && parentDoc.path !== activeDoc.path ? (
                  <button
                    type="button"
                    className="public-share-parent-link"
                    onClick={() => selectDoc(parentDoc.path)}
                  >
                    ← {parentDoc.title}
                  </button>
                ) : (
                  <span className="public-share-parent-link public-share-parent-link-muted">
                    Published vault
                  </span>
                )}
                <h1 className="public-share-article-title">{activeDoc.title}</h1>
              </div>
              <div className="public-share-article-body editor-host">
                <DocEditor
                  path={`__public__:${activeDoc.path}`}
                  initialContent={activeDoc.content}
                  mode="rendered"
                  onChange={() => {}}
                  onWikiLinkClick={handleWikiLinkClick}
                  readOnly
                />
              </div>
              {(prevSibling || nextSibling) && (
                <nav className="public-share-article-nav">
                  {prevSibling ? (
                    <button
                      type="button"
                      className="public-share-nav-btn"
                      onClick={() => selectDoc(prevSibling.path)}
                    >
                      <span className="public-share-nav-dir">← Previous</span>
                      <span className="public-share-nav-title">{prevSibling.title}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  {nextSibling ? (
                    <button
                      type="button"
                      className="public-share-nav-btn public-share-nav-btn-next"
                      onClick={() => selectDoc(nextSibling.path)}
                    >
                      <span className="public-share-nav-dir">Next →</span>
                      <span className="public-share-nav-title">{nextSibling.title}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
              {!isSignedIn && (
                <aside className="public-share-footer-cta">
                  <div className="public-share-footer-cta-text">
                    <div className="public-share-footer-cta-title">
                      Your notes deserve a graph like this.
                    </div>
                    <div className="public-share-footer-cta-sub">
                      EMDEE turns your plain markdown into an AI-readable knowledge graph.
                      Free to start — your notes, your graph, your AI&rsquo;s context.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="public-share-footer-cta-btn"
                    onClick={onSignupClick}
                  >
                    Get your own vault →
                  </button>
                </aside>
              )}
            </>
          ) : (
            <div className="public-share-empty">Pick a node from the graph to start reading.</div>
          )}
        </article>
      </div>
    </div>
  );
}
