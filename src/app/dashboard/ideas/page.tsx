"use client";

import { useEffect, useMemo, useState } from "react";
import IdeaCapture, { IdeaStarIcon } from "@/components/idea-capture";
import { useAuth } from "@/lib/auth-context";
import { setIdeaStarred, subscribeToIdeas } from "@/lib/ideas-service";
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

  const groups = useMemo(() => [
    { id: "starred", label: "Starred", ideas: ideas.filter((idea) => idea.starred) },
    { id: "unstarred", label: "Ideas", ideas: ideas.filter((idea) => !idea.starred) },
  ].filter((group) => group.ideas.length > 0), [ideas]);

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

  return (
    <div className="idea-bank-page" style={{ padding: 32, maxWidth: 840 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)", margin: "0 0 24px" }}>
        Idea Bank
      </h1>

      {user && <IdeaCapture userId={user.uid} autoFocus />}

      <div className="idea-list-card">
        {loading ? (
          <p className="idea-list-message">Loading…</p>
        ) : ideas.length === 0 ? (
          <p className="idea-list-message">Your captured ideas will show up here.</p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="idea-list-group" aria-labelledby={`idea-group-${group.id}`}>
              <h2 id={`idea-group-${group.id}`}>
                {group.label} <span>({group.ideas.length})</span>
              </h2>
              {group.ideas.map((idea, index) => (
                <div className="idea-list-row" key={idea.id}>
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
                  <time dateTime={new Date(idea.createdAt).toISOString()}>
                    {formatIdeaDate(idea.createdAt)}
                  </time>
                  {index < group.ideas.length - 1 && <span className="idea-row-divider" aria-hidden="true" />}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
