"use client";

import { useEffect, useMemo, useState } from "react";
import IdeaCapture, { IdeaStarIcon } from "@/components/idea-capture";
import { useAuth } from "@/lib/auth-context";
import { setIdeaCompleted, setIdeaStarred, subscribeToIdeas } from "@/lib/ideas-service";
import ProjectsPanel from "@/components/projects-panel";
import { Idea } from "@/lib/types";

function formatIdeaDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function IdeasPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"projects" | "ideas">("projects");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIdeaId, setUpdatingIdeaId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToIdeas(user.uid, (nextIdeas) => {
      setIdeas(nextIdeas);
      setLoading(false);
    });
  }, [user]);

  const activeGroups = useMemo(() => [
    { id: "starred", label: "Starred", ideas: ideas.filter((idea) => idea.starred && !idea.completed) },
    { id: "unstarred", label: "Ideas", ideas: ideas.filter((idea) => !idea.starred && !idea.completed) },
  ].filter((group) => group.ideas.length > 0), [ideas]);
  const completedIdeas = useMemo(() => ideas.filter((idea) => idea.completed), [ideas]);

  const handleToggleStar = async (idea: Idea) => {
    if (updatingIdeaId) return;
    setUpdatingIdeaId(idea.id);
    try {
      await setIdeaStarred(idea, !idea.starred);
    } catch (error) {
      console.error("Failed to update idea:", error);
    } finally {
      setUpdatingIdeaId(null);
    }
  };

  const handleToggleCompleted = async (idea: Idea) => {
    if (updatingIdeaId) return;
    setUpdatingIdeaId(idea.id);
    try {
      await setIdeaCompleted(idea, !idea.completed);
    } catch (error) {
      console.error("Failed to update idea:", error);
    } finally {
      setUpdatingIdeaId(null);
    }
  };

  return (
    <div className="idea-bank-page" style={{ padding: 32, maxWidth: 1280 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: "0 0 24px" }}>
        Projects
      </h1>

      <div role="tablist" aria-label="Project sections" className="planning-tabs">
        {(["projects", "ideas"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item === "projects" ? "Projects" : "Idea Bank"}</button>)}
      </div>
      {tab === "projects" ? <ProjectsPanel /> : <div role="tabpanel" aria-label="Idea Bank" style={{ maxWidth: 840 }}>
      {user && <IdeaCapture userId={user.uid} autoFocus />}

      <div style={{ display: "grid", rowGap: 18 }}>
        <div className="idea-list-card">
        {loading ? (
          <p className="idea-list-message">Loading…</p>
        ) : ideas.length === 0 ? (
          <p className="idea-list-message">Your captured ideas will show up here.</p>
        ) : activeGroups.length === 0 ? (
          <p className="idea-list-message">No active ideas.</p>
        ) : (
          activeGroups.map((group) => (
            <section key={group.id} className="idea-list-group" aria-labelledby={`idea-group-${group.id}`}>
              <h2 id={`idea-group-${group.id}`}>
                {group.label} <span>({group.ideas.length})</span>
              </h2>
              {group.ideas.map((idea, index) => (
                <div className={`idea-list-row${idea.completed ? " is-completed" : ""}`} key={idea.id}>
                  <button
                    type="button"
                    className={`idea-star-button${idea.starred ? " is-starred" : ""}`}
                    onClick={() => void handleToggleStar(idea)}
                    disabled={updatingIdeaId === idea.id}
                    aria-label={idea.starred ? `Unstar ${idea.text}` : `Star ${idea.text}`}
                    aria-pressed={idea.starred}
                  >
                    <IdeaStarIcon filled={idea.starred} />
                  </button>
                  <p>{idea.text}</p>
                  <div className="idea-row-meta">
                    <time dateTime={new Date(idea.createdAt).toISOString()}>
                      {formatIdeaDate(idea.createdAt)}
                    </time>
                    <button
                      type="button"
                      className="idea-complete-button"
                      onClick={() => void handleToggleCompleted(idea)}
                      disabled={updatingIdeaId === idea.id}
                      aria-label={idea.completed ? `Mark ${idea.text} incomplete` : `Complete ${idea.text}`}
                      aria-pressed={idea.completed}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </div>
                  {index < group.ideas.length - 1 && <span className="idea-row-divider" aria-hidden="true" />}
                </div>
              ))}
            </section>
          ))
        )}
        </div>

        {completedIdeas.length > 0 && (
          <div className="idea-list-card">
          <section className="idea-list-group" aria-labelledby="idea-group-completed">
            <h2 id="idea-group-completed">
              Completed <span>({completedIdeas.length})</span>
            </h2>
            {completedIdeas.map((idea, index) => (
              <div className="idea-list-row is-completed" key={idea.id}>
                <button
                  type="button"
                  className={`idea-star-button${idea.starred ? " is-starred" : ""}`}
                  onClick={() => void handleToggleStar(idea)}
                  disabled={updatingIdeaId === idea.id}
                  aria-label={idea.starred ? `Unstar ${idea.text}` : `Star ${idea.text}`}
                  aria-pressed={idea.starred}
                >
                  <IdeaStarIcon filled={idea.starred} />
                </button>
                <p>{idea.text}</p>
                <div className="idea-row-meta">
                  <time dateTime={new Date(idea.createdAt).toISOString()}>
                    {formatIdeaDate(idea.createdAt)}
                  </time>
                  <button
                    type="button"
                    className="idea-complete-button"
                    onClick={() => void handleToggleCompleted(idea)}
                    disabled={updatingIdeaId === idea.id}
                    aria-label={`Mark ${idea.text} incomplete`}
                    aria-pressed="true"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
                {index < completedIdeas.length - 1 && <span className="idea-row-divider" aria-hidden="true" />}
              </div>
            ))}
          </section>
          </div>
        )}
      </div>
      </div>}
    </div>
  );
}
