import { db } from "@/lib/firebase";
import type { Project } from "@/lib/types";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";

export function subscribeToProjects(userId: string, callback: (projects: Project[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(query(collection(db, "projects"), where("userId", "==", userId)), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Project)).sort((a, b) => a.deadline.localeCompare(b.deadline)));
  }, (error) => { console.error("Projects could not load", error); onError?.(error); });
}

export async function saveProject(project: Project) {
  if (!project.name.trim() || !project.outcome.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(project.deadline)) {
    throw new Error("A project needs a name, a finished outcome, and a deadline.");
  }
  await setDoc(doc(db, "projects", project.id), project);
}
