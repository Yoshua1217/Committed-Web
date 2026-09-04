"use client";

import {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth-context";
import {
  GoogleCalendarCache,
  SyncedGoogleCalendar,
  readLocalCalendarSyncCache,
  saveCalendarSyncCache,
  subscribeToCalendarSync,
} from "@/lib/calendar-sync-service";
import {
  MarkdownNote,
  NoteFolder,
  deleteMarkdownNote,
  generateNotesId,
  saveMarkdownNote,
  saveNoteFolder,
  saveNoteFolderOrder,
  subscribeToMarkdownNotes,
  subscribeToNoteFolders,
} from "@/lib/notes-service";
import NotesMarkdown from "@/components/notes-markdown";

type EditorMode = "write" | "preview";
type MenuAnchor = { left: number; top: number };

interface SlashCommand {
  id: string;
  label: string;
  detail: string;
  icon: string;
  keywords: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "heading1", label: "Heading 1", detail: "Large section heading", icon: "format_h1", keywords: "h1 title" },
  { id: "heading2", label: "Heading 2", detail: "Medium section heading", icon: "format_h2", keywords: "h2 subtitle" },
  { id: "heading3", label: "Heading 3", detail: "Small section heading", icon: "format_h3", keywords: "h3 subtitle" },
  { id: "heading4", label: "Heading 4", detail: "Compact section heading", icon: "format_h4", keywords: "h4 subtitle" },
  { id: "bullet", label: "Bulleted list", detail: "Start a simple list", icon: "format_list_bulleted", keywords: "unordered list" },
  { id: "number", label: "Numbered list", detail: "Start an ordered list", icon: "format_list_numbered", keywords: "ordered list" },
  { id: "checkbox", label: "Checkbox", detail: "Add a to-do item", icon: "check_box", keywords: "todo task" },
  { id: "quote", label: "Block quote", detail: "Call out quoted text", icon: "format_quote", keywords: "blockquote" },
  { id: "divider", label: "Divider", detail: "Separate sections", icon: "horizontal_rule", keywords: "rule line" },
  { id: "codeblock", label: "Code block", detail: "Add fenced code", icon: "code_blocks", keywords: "fence pre" },
  { id: "internal", label: "Internal note link", detail: "Link another note", icon: "account_tree", keywords: "wiki backlink" },
  { id: "bold", label: "Bold", detail: "Make text strong", icon: "format_bold", keywords: "strong" },
  { id: "italic", label: "Italic", detail: "Emphasize text", icon: "format_italic", keywords: "emphasis" },
  { id: "underline", label: "Underline", detail: "Underline text", icon: "format_underlined", keywords: "u" },
  { id: "strike", label: "Strikethrough", detail: "Strike text out", icon: "strikethrough_s", keywords: "delete" },
  { id: "inlinecode", label: "Inline code", detail: "Format a code phrase", icon: "data_object", keywords: "code" },
  { id: "link", label: "Web link", detail: "Add a labelled URL", icon: "link", keywords: "url hyperlink" },
];

const SHORTCUT_GROUPS = [
  {
    title: "Keyboard formatting",
    items: [
      ["Ctrl / ⌘ + B", "Bold selected text"],
      ["Ctrl / ⌘ + I", "Italicize selected text"],
      ["Ctrl / ⌘ + U", "Underline selected text"],
      ["Ctrl / ⌘ + S", "Open global note search"],
      ["Tab", "Indent with two spaces"],
    ],
  },
  {
    title: "Markdown blocks",
    items: [
      ["# + Space", "Heading 1"],
      ["## + Space", "Heading 2"],
      ["### + Space", "Heading 3"],
      ["#### + Space", "Heading 4"],
      ["- + Space", "Bulleted list"],
      ["* + Space", "Bulleted list"],
      ["1. + Space", "Numbered list"],
      ["[] + Space", "Checkbox"],
      ["[ ] + Space", "Checkbox"],
      ["> + Space", "Block quote"],
      ["--- + Enter", "Divider"],
      ["``` + Enter", "Code block"],
      ["[[", "Search and link another note"],
    ],
  },
  {
    title: "Inline Markdown",
    items: [
      ["**text**", "Bold"],
      ["*text*", "Italic"],
      ["<u>text</u>", "Underline"],
      ["~~text~~", "Strikethrough"],
      ["`text`", "Inline code"],
      ["[text](url)", "Link"],
      ["/", "Open the slash command menu"],
    ],
  },
];

const FOLDER_RENAME_DOUBLE_CLICK_MS = 360;

function icon(name: string, size = 18, color?: string) {
  return <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: size, color }}>{name}</span>;
}

function translucentCalendarColor(color: string, alpha: number) {
  const hex = color.trim().match(/^#([\da-f]{6})$/i)?.[1];
  if (!hex) return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function slugFilename(title: string) {
  const clean = title.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return `${clean || "Untitled note"}.md`;
}

// Kept outside the React render scope so timestamps are created only from
// explicit user actions, never as part of rendering.
function actionTimestamp() {
  return Date.now();
}

function matchesNote(note: MarkdownNote, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || note.title.toLocaleLowerCase().includes(normalized) || note.content.toLocaleLowerCase().includes(normalized);
}

function caretAnchor(textarea: HTMLTextAreaElement): MenuAnchor {
  const rect = textarea.getBoundingClientRect();
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const properties = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth",
    "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "wordSpacing",
  ] as const;
  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.left = `${rect.left}px`;
  mirror.style.top = `${rect.top}px`;
  mirror.style.width = `${rect.width}px`;
  properties.forEach((property) => { mirror.style[property] = computed[property]; });
  mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(textarea.selectionStart, textarea.selectionStart + 1) || "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  mirror.remove();
  return {
    left: Math.min(window.innerWidth - 300, Math.max(12, markerRect.left - textarea.scrollLeft)),
    top: Math.max(160, markerRect.top - textarea.scrollTop),
  };
}

function contextSnippet(content: string, query: string) {
  const plain = content.replace(/[#>*_`~\[\]()\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "Empty note";
  const index = query ? plain.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  const start = Math.max(0, index < 0 ? 0 : index - 45);
  return `${start > 0 ? "…" : ""}${plain.slice(start, start + 125)}${plain.length > start + 125 ? "…" : ""}`;
}

export default function NotesPage() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<MarkdownNote[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [draggedNotebookId, setDraggedNotebookId] = useState<string | null>(null);
  const [notebookDropTarget, setNotebookDropTarget] = useState<{ id: string; edge: "before" | "after" } | null>(null);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [notePendingDelete, setNotePendingDelete] = useState<MarkdownNote | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("write");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [calendars, setCalendars] = useState<SyncedGoogleCalendar[]>([]);
  const [slashRange, setSlashRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const [linkRange, setLinkRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor>({ left: 320, top: 280 });
  const [menuIndex, setMenuIndex] = useState(0);
  const [importTargetId, setImportTargetId] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const initializedForUserRef = useRef<string | null>(null);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastFolderLabelClickRef = useRef<{ folderId: string; timestamp: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    const saveTimers = saveTimersRef.current;
    const unsubscribeFolders = subscribeToNoteFolders(user.uid, (nextFolders) => {
      setFolders(nextFolders);
      setFoldersLoaded(true);
    });
    const unsubscribeNotes = subscribeToMarkdownNotes(user.uid, (nextNotes) => {
      setNotes(nextNotes);
      setNotesLoaded(true);
    });
    const localCalendarCache = readLocalCalendarSyncCache(user.uid);
    let promotedLocalCalendarCache = false;
    const unsubscribeCalendar = subscribeToCalendarSync(user.uid, (_preferences, cache: GoogleCalendarCache | null) => {
      if (cache?.calendars.length) {
        setCalendars(cache.calendars);
        return;
      }
      // Older Calendar sessions can have a complete local snapshot without a
      // cloud copy. Keep those layers visible and promote the snapshot so the
      // notebook mapping is available on the user's other devices too.
      if (localCalendarCache?.calendars.length) {
        setCalendars(localCalendarCache.calendars);
        if (!promotedLocalCalendarCache) {
          promotedLocalCalendarCache = true;
          void saveCalendarSyncCache(user.uid, localCalendarCache).catch((error) => {
            console.error("Calendar layers could not be promoted for Notes:", error);
          });
        }
        return;
      }
      setCalendars([]);
    });
    return () => {
      unsubscribeFolders();
      unsubscribeNotes();
      unsubscribeCalendar();
      saveTimers.forEach(clearTimeout);
      saveTimers.clear();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !foldersLoaded || !notesLoaded || folders.length > 0 || initializedForUserRef.current === user.uid) return;
    initializedForUserRef.current = user.uid;
    queueMicrotask(() => {
      const now = actionTimestamp();
      const notebookId = generateNotesId();
      const noteId = generateNotesId();
      const notebook: NoteFolder = {
        id: notebookId,
        userId: user.uid,
        name: "Personal",
        kind: "notebook",
        parentId: null,
        notebookId,
        calendarId: null,
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      };
      const welcomeNote: MarkdownNote = {
        id: noteId,
        userId: user.uid,
        folderId: notebookId,
        notebookId,
        title: "Welcome to Notes",
        content: "Start writing in Markdown. Type `/` for commands, `[[` to link a note, or press **Ctrl + S** to search everything.\n\n## A fast place for clear thinking\n\n- Notes save automatically\n- Drag pages between folders\n- Import and export standard `.md` files",
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      };
      setFolders([notebook]);
      setNotes([welcomeNote]);
      setSelectedFolderId(notebookId);
      setSelectedNoteId(noteId);
      setExpandedIds(new Set([notebookId]));
      void Promise.all([saveNoteFolder(notebook), saveMarkdownNote(welcomeNote)]).catch(() => setSaveState("error"));
    });
  }, [folders.length, foldersLoaded, notesLoaded, user]);

  useEffect(() => {
    const openSearch = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
        event.preventDefault();
        setSearchOpen(true);
        setPageMenuOpen(false);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSettingsOpen(false);
        setPageMenuOpen(false);
        setNotePendingDelete(null);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const setPreviewOnMobile = () => {
      if (mobileQuery.matches) setEditorMode("preview");
    };
    setPreviewOnMobile();
    mobileQuery.addEventListener("change", setPreviewOnMobile);
    return () => mobileQuery.removeEventListener("change", setPreviewOnMobile);
  }, []);

  const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const notebooks = folders.filter((folder) => folder.kind === "notebook");
  const activeNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null;
  const effectiveFolderId = selectedFolderId ?? activeNote?.folderId ?? notebooks[0]?.id ?? null;
  const activeFolder = effectiveFolderId ? folderMap.get(effectiveFolderId) ?? null : null;
  const calendarMap = useMemo(() => new Map(calendars.map((calendar) => [calendar.id, calendar])), [calendars]);

  const scheduleSave = useCallback((note: MarkdownNote) => {
    const previousTimer = saveTimersRef.current.get(note.id);
    if (previousTimer) clearTimeout(previousTimer);
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveMarkdownNote(note)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
      saveTimersRef.current.delete(note.id);
    }, 500);
    saveTimersRef.current.set(note.id, timer);
  }, []);

  const updateActiveNote = useCallback((patch: Partial<MarkdownNote>) => {
    if (!activeNote) return;
    const nextNote = { ...activeNote, ...patch, updatedAt: actionTimestamp() };
    setNotes((current) => current.map((note) => note.id === nextNote.id ? nextNote : note));
    scheduleSave(nextNote);
  }, [activeNote, scheduleSave]);

  const selectNote = (note: MarkdownNote) => {
    setSelectedNoteId(note.id);
    setSelectedFolderId(note.folderId);
    setExpandedIds((current) => {
      const next = new Set(current);
      let parent = folderMap.get(note.folderId);
      while (parent) {
        next.add(parent.id);
        parent = parent.parentId ? folderMap.get(parent.parentId) : undefined;
      }
      return next;
    });
    setSidebarOpen(false);
    setSearchOpen(false);
    setSidebarQuery("");
  };

  const createNotebook = () => {
    if (!user) return;
    const now = actionTimestamp();
    const id = generateNotesId();
    const notebook: NoteFolder = { id, userId: user.uid, name: "Untitled notebook", kind: "notebook", parentId: null, notebookId: id, calendarId: null, sortOrder: now, createdAt: now, updatedAt: now };
    setFolders((current) => [...current, notebook]);
    setSelectedFolderId(id);
    setExpandedIds((current) => new Set(current).add(id));
    setRenamingFolderId(id);
    void saveNoteFolder(notebook).catch(() => setSaveState("error"));
  };

  const createSubfolder = () => {
    if (!user || !activeFolder) return;
    const now = actionTimestamp();
    const id = generateNotesId();
    const notebookId = activeFolder.kind === "notebook" ? activeFolder.id : activeFolder.notebookId;
    const folder: NoteFolder = { id, userId: user.uid, name: "Untitled folder", kind: "folder", parentId: activeFolder.id, notebookId, calendarId: null, sortOrder: now, createdAt: now, updatedAt: now };
    setFolders((current) => [...current, folder]);
    setExpandedIds((current) => new Set(current).add(activeFolder.id));
    setSelectedFolderId(id);
    setRenamingFolderId(id);
    void saveNoteFolder(folder).catch(() => setSaveState("error"));
  };

  const createNote = (folderId?: string | null) => {
    if (!user) return;
    const destinationId = folderId ?? effectiveFolderId;
    const destination = destinationId ? folderMap.get(destinationId) : notebooks[0];
    if (!destination) {
      createNotebook();
      return;
    }
    const now = actionTimestamp();
    const note: MarkdownNote = {
      id: generateNotesId(),
      userId: user.uid,
      folderId: destination.id,
      notebookId: destination.kind === "notebook" ? destination.id : destination.notebookId,
      title: "Untitled note",
      content: "",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    };
    setNotes((current) => [...current, note]);
    setSelectedNoteId(note.id);
    setSelectedFolderId(destination.id);
    setExpandedIds((current) => new Set(current).add(destination.id));
    setEditorMode("write");
    void saveMarkdownNote(note).catch(() => setSaveState("error"));
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".notes-title-input")?.select());
  };

  const renameFolder = (folder: NoteFolder, name: string) => {
    const next = { ...folder, name: name.trim() || (folder.kind === "notebook" ? "Untitled notebook" : "Untitled folder"), updatedAt: actionTimestamp() };
    setFolders((current) => current.map((item) => item.id === next.id ? next : item));
    setRenamingFolderId(null);
    void saveNoteFolder(next).catch(() => setSaveState("error"));
  };

  const moveNote = (noteId: string, folderId: string) => {
    const note = notes.find((item) => item.id === noteId);
    const destination = folderMap.get(folderId);
    if (!note || !destination || note.folderId === destination.id) return;
    const next = { ...note, folderId: destination.id, notebookId: destination.kind === "notebook" ? destination.id : destination.notebookId, updatedAt: actionTimestamp() };
    setNotes((current) => current.map((item) => item.id === noteId ? next : item));
    setSelectedFolderId(destination.id);
    setExpandedIds((current) => new Set(current).add(destination.id));
    void saveMarkdownNote(next).catch(() => setSaveState("error"));
  };

  const reorderNotebook = (draggedId: string, targetId: string, edge: "before" | "after") => {
    if (draggedId === targetId) return;
    const reordered = [...notebooks];
    const draggedIndex = reordered.findIndex((notebook) => notebook.id === draggedId);
    if (draggedIndex < 0) return;
    const [dragged] = reordered.splice(draggedIndex, 1);
    const targetIndex = reordered.findIndex((notebook) => notebook.id === targetId);
    if (targetIndex < 0) return;
    reordered.splice(targetIndex + (edge === "after" ? 1 : 0), 0, dragged);
    const updatedAt = actionTimestamp();
    const updatedNotebooks = reordered.map((notebook, index) => ({
      ...notebook,
      sortOrder: (index + 1) * 1_000,
      updatedAt,
    }));
    const updatedById = new Map(updatedNotebooks.map((notebook) => [notebook.id, notebook]));
    setFolders((current) => current
      .map((folder) => updatedById.get(folder.id) ?? folder)
      .sort((first, second) => first.sortOrder - second.sortOrder || first.createdAt - second.createdAt));
    setSaveState("saving");
    void saveNoteFolderOrder(updatedNotebooks)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  };

  const downloadActiveNote = () => {
    if (!activeNote) return;
    const body = `# ${activeNote.title.trim() || "Untitled note"}\n\n${activeNote.content}`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = slugFilename(activeNote.title);
    anchor.click();
    URL.revokeObjectURL(url);
    setPageMenuOpen(false);
  };

  const confirmDeleteNote = async () => {
    if (!notePendingDelete) return;
    const noteId = notePendingDelete.id;
    const nextSelection = notes.find((note) => note.id !== noteId)?.id ?? null;
    setNotePendingDelete(null);
    setNotes((current) => current.filter((note) => note.id !== noteId));
    setSelectedNoteId(nextSelection);
    setPageMenuOpen(false);
    setSaveState("saving");
    await deleteMarkdownNote(noteId)
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  };

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!user || !event.target.files?.length) return;
    const targetId = importTargetId || effectiveFolderId || notebooks[0]?.id;
    const destination = targetId ? folderMap.get(targetId) : null;
    if (!destination) return;
    const imported: MarkdownNote[] = [];
    for (const [index, file] of Array.from(event.target.files).entries()) {
      const source = await file.text();
      const lines = source.replace(/\r\n/g, "\n").split("\n");
      const firstHeading = lines[0]?.match(/^#\s+(.+)$/);
      const title = firstHeading?.[1].trim() || file.name.replace(/\.md$/i, "") || "Imported note";
      const content = firstHeading ? lines.slice(1).join("\n").replace(/^\n/, "") : source;
      const now = actionTimestamp() + index;
      imported.push({
        id: generateNotesId(),
        userId: user.uid,
        folderId: destination.id,
        notebookId: destination.kind === "notebook" ? destination.id : destination.notebookId,
        title,
        content,
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    setNotes((current) => [...current, ...imported]);
    setExpandedIds((current) => new Set(current).add(destination.id));
    if (imported[0]) selectNote(imported[0]);
    await Promise.all(imported.map(saveMarkdownNote)).catch(() => setSaveState("error"));
    event.target.value = "";
  };

  const setNotebookCalendar = (notebook: NoteFolder, calendarId: string) => {
    const next = { ...notebook, calendarId: calendarId || null, updatedAt: actionTimestamp() };
    setFolders((current) => current.map((folder) => folder.id === next.id ? next : folder));
    void saveNoteFolder(next).catch(() => setSaveState("error"));
  };

  const replaceEditorRange = useCallback((start: number, end: number, replacement: string, selectionStart: number, selectionEnd = selectionStart) => {
    if (!activeNote) return;
    const nextContent = `${activeNote.content.slice(0, start)}${replacement}${activeNote.content.slice(end)}`;
    updateActiveNote({ content: nextContent });
    setSlashRange(null);
    setLinkRange(null);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(start + selectionStart, start + selectionEnd);
    });
  }, [activeNote, updateActiveNote]);

  const wrapSelection = useCallback((prefix: string, suffix: string, placeholder: string) => {
    if (!activeNote || !editorRef.current) return;
    const start = editorRef.current.selectionStart;
    const end = editorRef.current.selectionEnd;
    const selected = activeNote.content.slice(start, end);
    const inner = selected || placeholder;
    replaceEditorRange(start, end, `${prefix}${inner}${suffix}`, prefix.length, prefix.length + inner.length);
  }, [activeNote, replaceEditorRange]);

  const commandOutput = (commandId: string) => {
    const outputs: Record<string, { value: string; start: number; end?: number }> = {
      heading1: { value: "# Heading 1", start: 2, end: 11 },
      heading2: { value: "## Heading 2", start: 3, end: 12 },
      heading3: { value: "### Heading 3", start: 4, end: 13 },
      heading4: { value: "#### Heading 4", start: 5, end: 14 },
      bullet: { value: "- List item", start: 2, end: 11 },
      number: { value: "1. List item", start: 3, end: 12 },
      checkbox: { value: "- [ ] To-do", start: 6, end: 11 },
      quote: { value: "> Quote", start: 2, end: 7 },
      divider: { value: "---\n", start: 4 },
      codeblock: { value: "```\ncode\n```", start: 4, end: 8 },
      internal: { value: "[[Note name]]", start: 2, end: 11 },
      bold: { value: "**bold text**", start: 2, end: 11 },
      italic: { value: "*italic text*", start: 1, end: 12 },
      underline: { value: "<u>underlined text</u>", start: 3, end: 18 },
      strike: { value: "~~struck text~~", start: 2, end: 13 },
      inlinecode: { value: "`inline code`", start: 1, end: 12 },
      link: { value: "[link text](https://)", start: 1, end: 10 },
    };
    return outputs[commandId];
  };

  const filteredCommands = useMemo(() => {
    const query = slashRange?.query.toLocaleLowerCase() ?? "";
    return SLASH_COMMANDS.filter((command) => `${command.label} ${command.keywords}`.toLocaleLowerCase().includes(query));
  }, [slashRange]);

  const linkResults = useMemo(() => notes
    .filter((note) => note.id !== activeNote?.id && matchesNote(note, linkRange?.query ?? ""))
    .slice(0, 8), [activeNote?.id, linkRange?.query, notes]);

  const executeSlashCommand = (command: SlashCommand | undefined) => {
    if (!command || !slashRange) return;
    const output = commandOutput(command.id);
    if (!output) return;
    replaceEditorRange(slashRange.start, slashRange.end, output.value, output.start, output.end);
  };

  const selectInternalLink = (note: MarkdownNote) => {
    if (!linkRange) return;
    const value = `[[${note.title}]]`;
    replaceEditorRange(linkRange.start, linkRange.end, value, value.length);
  };

  const refreshFloatingMenu = (textarea: HTMLTextAreaElement) => {
    requestAnimationFrame(() => setMenuAnchor(caretAnchor(textarea)));
  };

  const handleEditorChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const cursor = event.target.selectionStart;
    updateActiveNote({ content: value });
    const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
    const beforeCursor = value.slice(lineStart, cursor);
    const slashMatch = beforeCursor.match(/^\/([a-zA-Z0-9]*)$/);
    const linkMatch = beforeCursor.match(/\[\[([^\]]*)$/);
    if (slashMatch) {
      setSlashRange({ start: lineStart, end: cursor, query: slashMatch[1] });
      setLinkRange(null);
      setMenuIndex(0);
      refreshFloatingMenu(event.target);
    } else if (linkMatch) {
      setLinkRange({ start: lineStart + (linkMatch.index ?? 0), end: cursor, query: linkMatch[1] });
      setSlashRange(null);
      setMenuIndex(0);
      refreshFloatingMenu(event.target);
    } else {
      setSlashRange(null);
      setLinkRange(null);
    }
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeNote) return;
    const key = event.key.toLocaleLowerCase();
    if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(key)) {
      event.preventDefault();
      if (key === "b") wrapSelection("**", "**", "bold text");
      if (key === "i") wrapSelection("*", "*", "italic text");
      if (key === "u") wrapSelection("<u>", "</u>", "underlined text");
      return;
    }
    if ((slashRange || linkRange) && ["arrowdown", "arrowup"].includes(key)) {
      event.preventDefault();
      const length = slashRange ? filteredCommands.length : linkResults.length;
      setMenuIndex((current) => key === "arrowdown" ? (current + 1) % Math.max(1, length) : (current - 1 + Math.max(1, length)) % Math.max(1, length));
      return;
    }
    if (event.key === "Escape" && (slashRange || linkRange)) {
      event.preventDefault();
      setSlashRange(null);
      setLinkRange(null);
      return;
    }
    if (event.key === "Enter" && slashRange) {
      event.preventDefault();
      executeSlashCommand(filteredCommands[menuIndex] ?? filteredCommands[0]);
      return;
    }
    if (event.key === "Enter" && linkRange && linkResults.length) {
      event.preventDefault();
      selectInternalLink(linkResults[menuIndex] ?? linkResults[0]);
      return;
    }
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = activeNote.content.lastIndexOf("\n", start - 1) + 1;
    const currentLine = activeNote.content.slice(lineStart, start);
    if (event.key === "Tab") {
      event.preventDefault();
      replaceEditorRange(start, end, "  ", 2);
      return;
    }
    if (event.key === " " && /^(\[\]|\[ \])$/.test(currentLine)) {
      event.preventDefault();
      replaceEditorRange(lineStart, end, "- [ ] ", 6);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    if (/^\s*```\s*$/.test(currentLine)) {
      event.preventDefault();
      replaceEditorRange(start, end, "\n\n```", 1);
      return;
    }
    const continuation = currentLine.match(/^(\s*)(- \[ \] |[-*] |(\d+)\. |> )(.*)$/);
    if (!continuation) return;
    event.preventDefault();
    const marker = continuation[2];
    const trailingText = continuation[4];
    if (!trailingText.trim()) {
      replaceEditorRange(lineStart, end, "", 0);
      return;
    }
    const nextMarker = continuation[3] ? `${Number(continuation[3]) + 1}. ` : marker;
    replaceEditorRange(start, end, `\n${continuation[1]}${nextMarker}`, nextMarker.length + continuation[1].length + 1);
  };

  const sidebarResults = notes.filter((note) => matchesNote(note, sidebarQuery)).slice(0, 20);
  const globalResults = notes.filter((note) => matchesNote(note, searchQuery)).sort((a, b) => b.updatedAt - a.updatedAt);

  const renderFolder = (folder: NoteFolder, depth: number): React.ReactNode => {
    const children = folders.filter((item) => item.parentId === folder.id);
    const folderNotes = notes.filter((note) => note.folderId === folder.id);
    const expanded = expandedIds.has(folder.id);
    const owningNotebook = folder.kind === "notebook" ? folder : folderMap.get(folder.notebookId);
    const folderCalendar = owningNotebook?.calendarId ? calendarMap.get(owningNotebook.calendarId) : null;
    const linkedCalendar = folder.kind === "notebook" ? folderCalendar : null;
    const selected = effectiveFolderId === folder.id && !activeNote;
    const notebookDropClass = notebookDropTarget?.id === folder.id ? `is-drop-${notebookDropTarget.edge}` : "";
    return <div key={folder.id} className="notes-tree-branch">
      <div
        className={`notes-tree-folder ${folder.kind === "notebook" ? "is-notebook" : ""} ${selected ? "is-selected" : ""} ${draggedNotebookId === folder.id ? "is-dragging" : ""} ${notebookDropClass}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={folder.kind === "notebook" && renamingFolderId !== folder.id}
        onDragStart={(event) => {
          if (folder.kind !== "notebook") return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/notebook-id", folder.id);
          setDraggedNotebookId(folder.id);
        }}
        onDragEnd={() => { setDraggedNotebookId(null); setNotebookDropTarget(null); }}
        onDragOver={(event) => {
          event.preventDefault();
          if (draggedNotebookId && folder.kind === "notebook") {
            const bounds = event.currentTarget.getBoundingClientRect();
            setNotebookDropTarget({ id: folder.id, edge: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
            return;
          }
          event.currentTarget.classList.add("is-drop-target");
        }}
        onDragLeave={(event) => {
          event.currentTarget.classList.remove("is-drop-target");
          if (notebookDropTarget?.id === folder.id) setNotebookDropTarget(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.currentTarget.classList.remove("is-drop-target");
          const notebookId = event.dataTransfer.getData("text/notebook-id");
          if (notebookId && folder.kind === "notebook") {
            reorderNotebook(notebookId, folder.id, notebookDropTarget?.id === folder.id ? notebookDropTarget.edge : "before");
            setDraggedNotebookId(null);
            setNotebookDropTarget(null);
            return;
          }
          moveNote(event.dataTransfer.getData("text/note-id"), folder.id);
        }}
      >
        {folder.kind === "notebook" && <span className="notes-notebook-drag-handle" title="Drag to reorder">{icon("drag_indicator", 15)}</span>}
        <button
          type="button"
          className={`notes-tree-chevron ${expanded ? "is-expanded" : ""}`}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${folder.name}`}
          onClick={() => setExpandedIds((current) => {
            const next = new Set(current);
            if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
            return next;
          })}
          style={expanded && linkedCalendar ? { backgroundColor: linkedCalendar.backgroundColor ?? "#41e987", color: "#111" } : undefined}
        >{icon("chevron_right", 17)}</button>
        {icon(folder.kind === "notebook" ? (expanded ? "folder_open" : "folder") : (expanded ? "folder_open" : "folder"), 17)}
        {renamingFolderId === folder.id ? <input
          className="notes-tree-rename"
          autoFocus
          defaultValue={folder.name}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => renameFolder(folder, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setRenamingFolderId(null);
          }}
        /> : <button
          type="button"
          className="notes-tree-name"
          onClick={() => {
            const now = actionTimestamp();
            const previousClick = lastFolderLabelClickRef.current;
            const isFastSecondClick = previousClick?.folderId === folder.id
              && now - previousClick.timestamp <= FOLDER_RENAME_DOUBLE_CLICK_MS;
            lastFolderLabelClickRef.current = isFastSecondClick ? null : { folderId: folder.id, timestamp: now };
            if (isFastSecondClick) {
              setRenamingFolderId(folder.id);
              return;
            }
            setSelectedFolderId(folder.id);
            setSelectedNoteId(null);
            setExpandedIds((current) => {
              const next = new Set(current);
              if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
              return next;
            });
          }}
          title="Click to expand or collapse · Double-click quickly to rename"
        >{folder.name}</button>}
        {linkedCalendar && <span className="notes-calendar-dot" title={`Linked to ${linkedCalendar.summary}`} style={{ backgroundColor: linkedCalendar.backgroundColor ?? "#41e987" }} />}
        <button className="notes-tree-add" type="button" aria-label={`New note in ${folder.name}`} title="New note" onClick={() => createNote(folder.id)}>{icon("add", 16)}</button>
      </div>
      {expanded && <div className="notes-tree-children">
        {children.map((child) => renderFolder(child, depth + 1))}
        {folderNotes.map((note) => {
          const calendarColor = folderCalendar?.backgroundColor;
          const noteIsSelected = activeNote?.id === note.id;
          return <button
            type="button"
            key={note.id}
            draggable
            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/note-id", note.id); }}
            onClick={() => selectNote(note)}
            className={`notes-tree-note ${noteIsSelected ? "is-selected" : ""}`}
            style={{
              paddingLeft: 36 + depth * 14,
              backgroundColor: noteIsSelected && calendarColor ? translucentCalendarColor(calendarColor, 0.2) : undefined,
              "--notes-note-accent": calendarColor ?? "var(--notes-accent)",
            } as CSSProperties}
            title={note.title}
          >
            {icon("description", 16, noteIsSelected ? calendarColor : undefined)}<span>{note.title || "Untitled note"}</span>
          </button>;
        })}
        {!children.length && !folderNotes.length && <p className="notes-tree-empty" style={{ paddingLeft: 38 + depth * 14 }}>Empty folder</p>}
      </div>}
    </div>;
  };

  return <div className="notes-workspace">
    <aside className={`notes-sidebar ${sidebarOpen ? "is-open" : ""}`}>
      <div className="notes-sidebar-header">
        <div className="notes-sidebar-brand"><div><strong>Notes</strong><span>Markdown workspace</span></div></div>
        <button type="button" className="notes-mobile-close" aria-label="Close notes navigation" onClick={() => setSidebarOpen(false)}>{icon("close")}</button>
        <label className="notes-sidebar-search">
          {icon("search", 18)}
          <input value={sidebarQuery} onChange={(event) => setSidebarQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" />
          <kbd>⌘S</kbd>
        </label>
        <div className="notes-create-actions">
          <button type="button" onClick={() => createNote()} title="New note">{icon("note_add", 19)}<span>New note</span></button>
          <button type="button" onClick={createNotebook} title="New notebook">{icon("create_new_folder", 19)}<span>Notebook</span></button>
          <button type="button" onClick={createSubfolder} disabled={!activeFolder} title="New subfolder">{icon("folder_copy", 19)}<span>Subfolder</span></button>
        </div>
      </div>
      <div className="notes-tree">
        {sidebarQuery ? <div className="notes-sidebar-results">
          <p className="notes-tree-label">SEARCH RESULTS</p>
          {sidebarResults.map((note) => <button type="button" key={note.id} onClick={() => selectNote(note)} className={`notes-search-result ${activeNote?.id === note.id ? "is-selected" : ""}`}>
            {icon("description", 17)}<span><strong>{note.title}</strong><small>{contextSnippet(note.content, sidebarQuery)}</small></span>
          </button>)}
          {!sidebarResults.length && <div className="notes-no-results">No notes match “{sidebarQuery}”</div>}
        </div> : <>
          <p className="notes-tree-label">NOTEBOOKS <span>{notebooks.length}</span></p>
          {notebooks.map((notebook) => renderFolder(notebook, 0))}
        </>}
      </div>
      <div className="notes-sidebar-footer">
        <button type="button" onClick={() => setSettingsOpen(true)}>{icon("settings", 19)}<span>Notes settings</span></button>
        <span className={`notes-save-state is-${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "All changes saved"}</span>
      </div>
    </aside>

    <main className="notes-editor-shell">
      <header className="notes-editor-toolbar">
        <div className="notes-editor-toolbar-left">
          <button type="button" className="notes-mobile-sidebar" aria-label="Open notes navigation" onClick={() => setSidebarOpen(true)}>{icon("dock_to_right", 20)}</button>
          <div className="notes-breadcrumb">
            {activeNote ? <><span>{folderMap.get(activeNote.notebookId)?.name ?? "Notes"}</span>{activeNote.folderId !== activeNote.notebookId && <>{icon("chevron_right", 15)}<span>{folderMap.get(activeNote.folderId)?.name}</span></>}</> : <span>Notes</span>}
          </div>
        </div>
        <div className="notes-editor-toolbar-actions">
          <div className="notes-mode-switch" role="group" aria-label="Editor mode">
            <button type="button" className={editorMode === "write" ? "is-active" : ""} onClick={() => setEditorMode("write")}>{icon("edit_note", 17)} Write</button>
            <button type="button" className={editorMode === "preview" ? "is-active" : ""} onClick={() => setEditorMode("preview")}>{icon("visibility", 17)} Preview</button>
          </div>
          <button type="button" className="notes-toolbar-search" onClick={() => setSearchOpen(true)} title="Global search (Ctrl + S)">{icon("search", 19)}</button>
          <div className="notes-page-menu-wrap">
            <button type="button" className="notes-page-menu-trigger" aria-label="Page options" onClick={() => setPageMenuOpen((open) => !open)}>{icon("more_horiz", 21)}</button>
            {pageMenuOpen && <div className="notes-page-menu">
              <button type="button" onClick={downloadActiveNote} disabled={!activeNote}>{icon("download", 18)}<span><strong>Export Markdown</strong><small>Download this page as .md</small></span></button>
              <button type="button" className="is-danger" onClick={() => { if (activeNote) setNotePendingDelete(activeNote); setPageMenuOpen(false); }} disabled={!activeNote}>{icon("delete", 18)}<span><strong>Delete note</strong><small>Remove this page permanently</small></span></button>
            </div>}
          </div>
        </div>
      </header>

      {activeNote ? <div className="notes-document-scroll">
        <article className="notes-document">
          <textarea
            className="notes-title-input"
            rows={1}
            value={activeNote.title}
            onChange={(event) => updateActiveNote({ title: event.target.value.replace(/[\r\n]+/g, " ") })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editorRef.current?.focus();
              }
            }}
            placeholder="Untitled"
            aria-label="Note title"
          />
          <div className="notes-document-meta">
            <span>{activeNote.content.trim() ? activeNote.content.trim().split(/\s+/).length : 0} words</span>
            <span>Edited {new Date(activeNote.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <span>Markdown</span>
          </div>
          {editorMode === "write" ? <div className="notes-editor-area">
            <div className="notes-format-strip" aria-label="Text formatting">
              <button type="button" onClick={() => wrapSelection("**", "**", "bold text")} title="Bold (Ctrl+B)">{icon("format_bold", 18)}</button>
              <button type="button" onClick={() => wrapSelection("*", "*", "italic text")} title="Italic (Ctrl+I)">{icon("format_italic", 18)}</button>
              <button type="button" onClick={() => wrapSelection("<u>", "</u>", "underlined text")} title="Underline (Ctrl+U)">{icon("format_underlined", 18)}</button>
              <button type="button" onClick={() => wrapSelection("~~", "~~", "struck text")} title="Strikethrough">{icon("strikethrough_s", 18)}</button>
              <span />
              <button type="button" onClick={() => wrapSelection("`", "`", "inline code")} title="Inline code">{icon("data_object", 18)}</button>
              <button type="button" onClick={() => wrapSelection("[", "](https://)", "link text")} title="Link">{icon("link", 18)}</button>
            </div>
            <textarea
              ref={editorRef}
              className="notes-markdown-editor"
              value={activeNote.content}
              onChange={handleEditorChange}
              onKeyDown={handleEditorKeyDown}
              onClick={(event) => refreshFloatingMenu(event.currentTarget)}
              placeholder={'Start writing…\n\nType "/" for commands or "[[" to link a note.'}
              spellCheck
              aria-label="Markdown note content"
            />
          </div> : <NotesMarkdown content={activeNote.content} />}
        </article>
      </div> : <div className="notes-empty-editor">
        <div>{icon("edit_note", 34)}</div><h1>{notesLoaded ? "Choose a note" : "Opening your notes…"}</h1><p>Select a page from the sidebar or start something new.</p><button type="button" onClick={() => createNote()}>{icon("add", 18)} New note</button>
      </div>}
    </main>

    {sidebarOpen && <button className="notes-sidebar-scrim" aria-label="Close notes navigation" onClick={() => setSidebarOpen(false)} />}

    {slashRange && <div className="notes-command-menu" style={{ left: menuAnchor.left, top: menuAnchor.top }}>
      <div className="notes-command-heading"><span>BLOCKS & FORMATTING</span><kbd>↑↓ Enter</kbd></div>
      <div className="notes-command-list">
        {filteredCommands.map((command, index) => <button
          type="button"
          key={command.id}
          className={index === menuIndex ? "is-active" : ""}
          onMouseDown={(event: ReactMouseEvent) => { event.preventDefault(); executeSlashCommand(command); }}
          onMouseEnter={() => setMenuIndex(index)}
        ><span className="notes-command-icon">{icon(command.icon, 20)}</span><span><strong>{command.label}</strong><small>{command.detail}</small></span></button>)}
        {!filteredCommands.length && <p className="notes-command-empty">No commands match “{slashRange.query}”</p>}
      </div>
    </div>}

    {linkRange && <div className="notes-command-menu notes-link-menu" style={{ left: menuAnchor.left, top: menuAnchor.top }}>
      <div className="notes-command-heading"><span>LINK A NOTE</span><kbd>↑↓ Enter</kbd></div>
      <div className="notes-command-list">
        {linkResults.map((note, index) => <button
          type="button"
          key={note.id}
          className={index === menuIndex ? "is-active" : ""}
          onMouseDown={(event: ReactMouseEvent) => { event.preventDefault(); selectInternalLink(note); }}
          onMouseEnter={() => setMenuIndex(index)}
        ><span className="notes-command-icon">{icon("description", 19)}</span><span><strong>{note.title}</strong><small>{contextSnippet(note.content, linkRange.query)}</small></span></button>)}
        {!linkResults.length && <p className="notes-command-empty">No other notes found</p>}
      </div>
    </div>}

    {searchOpen && <div className="notes-modal-layer" role="dialog" aria-modal="true" aria-label="Search all notes" onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}>
      <div className="notes-search-modal">
        <div className="notes-search-modal-input">{icon("search", 24)}<input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search every note…" /><kbd>ESC</kbd></div>
        <div className="notes-search-modal-body">
          <p>{searchQuery ? `${globalResults.length} result${globalResults.length === 1 ? "" : "s"}` : "Recently edited"}</p>
          {globalResults.slice(0, 30).map((note) => <button type="button" key={note.id} onClick={() => selectNote(note)}>
            <span className="notes-search-modal-icon">{icon("description", 20)}</span>
            <span><strong>{note.title}</strong><small>{contextSnippet(note.content, searchQuery)}</small><em>{folderMap.get(note.notebookId)?.name ?? "Notes"} / {folderMap.get(note.folderId)?.name ?? "Unfiled"}</em></span>
            {icon("north_west", 17)}
          </button>)}
          {!globalResults.length && <div className="notes-search-empty">{icon("search_off", 28)}<strong>No matching notes</strong><span>Try another title or phrase.</span></div>}
        </div>
      </div>
    </div>}

    {notePendingDelete && <div className="notes-modal-layer notes-delete-layer" style={{ zIndex: 200, alignItems: "center", paddingTop: 24, background: "rgba(0, 0, 0, .48)", backdropFilter: "none" }} role="alertdialog" aria-modal="true" aria-labelledby="notes-delete-title" aria-describedby="notes-delete-description" onMouseDown={(event) => { if (event.currentTarget === event.target) setNotePendingDelete(null); }}>
      <div className="notes-delete-dialog" style={{ width: "min(420px, 100%)", padding: 25, border: "1px solid var(--border)", borderRadius: 19, background: "var(--surface)", boxShadow: "0 28px 90px rgba(0, 0, 0, .42)", textAlign: "center" }}>
        <span className="notes-delete-icon" style={{ width: 48, height: 48, display: "grid", placeItems: "center", margin: "0 auto 16px", border: "1px solid color-mix(in srgb, var(--error) 35%, var(--border))", borderRadius: 14, background: "color-mix(in srgb, var(--error) 11%, transparent)", color: "var(--error)" }}>{icon("delete", 24)}</span>
        <h2 id="notes-delete-title" style={{ margin: 0, color: "var(--primary)", fontSize: 19, fontWeight: 760 }}>Delete this note?</h2>
        <p id="notes-delete-description" style={{ margin: "8px auto 23px", color: "var(--secondary)", fontSize: 12, lineHeight: 1.55 }}><strong style={{ color: "var(--primary)", fontWeight: 680 }}>“{notePendingDelete.title || "Untitled note"}”</strong> will be permanently removed from your notes on every device.</p>
        <div className="notes-delete-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <button type="button" style={{ minHeight: 42, display: "flex", alignItems: "center", justifyContent: "center", padding: "9px 13px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--surface-variant)", color: "var(--primary)", cursor: "pointer", fontSize: 11, fontWeight: 720 }} onClick={() => setNotePendingDelete(null)}>Cancel</button>
          <button type="button" className="is-danger" style={{ minHeight: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 13px", border: "1px solid var(--error)", borderRadius: 11, background: "var(--error)", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 720 }} autoFocus onClick={() => void confirmDeleteNote()}>{icon("delete", 17)} Delete note</button>
        </div>
      </div>
    </div>}

    {settingsOpen && <div className="notes-modal-layer" role="dialog" aria-modal="true" aria-label="Notes settings" onMouseDown={(event) => { if (event.currentTarget === event.target) setSettingsOpen(false); }}>
      <div className="notes-settings-modal">
        <header><div><span className="notes-settings-mark">{icon("tune", 23)}</span><div><h2>Notes settings</h2><p>Markdown, imports, and calendar layers</p></div></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">{icon("close", 20)}</button></header>
        <div className="notes-settings-scroll">
          <section className="notes-settings-section">
            <div className="notes-settings-heading"><div><h3>Import Markdown</h3><p>Each .md file becomes a separate page. A leading H1 becomes the page title.</p></div>{icon("upload_file", 23)}</div>
            <div className="notes-import-row">
              <label><span>Import into</span><select value={importTargetId || effectiveFolderId || ""} onChange={(event) => setImportTargetId(event.target.value)}>
                {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.kind === "notebook" ? "▰ " : "— "}{folder.name}</option>)}
              </select></label>
              <input ref={importInputRef} type="file" accept=".md,text/markdown,text/plain" multiple hidden onChange={(event) => void importMarkdown(event)} />
              <button type="button" onClick={() => importInputRef.current?.click()}>{icon("upload", 18)} Choose .md files</button>
            </div>
          </section>

          <section className="notes-settings-section">
            <div className="notes-settings-heading"><div><h3>Calendar layers</h3><p>Link a synced Google Calendar layer to a notebook. Its colour appears throughout the notebook tree.</p></div>{icon("calendar_month", 23)}</div>
            <div className="notes-calendar-links">
              {notebooks.map((notebook) => <label key={notebook.id}>
                <span><i style={{ backgroundColor: notebook.calendarId ? calendarMap.get(notebook.calendarId)?.backgroundColor ?? "#41e987" : "var(--border)" }} />{notebook.name}</span>
                <select value={notebook.calendarId ?? ""} onChange={(event) => setNotebookCalendar(notebook, event.target.value)}>
                  <option value="">No calendar linked</option>
                  {calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " (primary)" : ""}</option>)}
                </select>
              </label>)}
              {!calendars.length && <p className="notes-calendar-empty">No synced calendar layers found. Connect Google Calendar from the Calendar page, then return here.</p>}
            </div>
          </section>

          <section className="notes-settings-section notes-shortcuts-section">
            <div className="notes-settings-heading"><div><h3>Complete shortcut reference</h3><p>Everything supported by the editor, in one place.</p></div>{icon("keyboard", 23)}</div>
            <div className="notes-shortcut-grid">
              {SHORTCUT_GROUPS.map((group) => <div className="notes-shortcut-group" key={group.title}><h4>{group.title}</h4>{group.items.map(([shortcut, description]) => <div key={shortcut}><code>{shortcut}</code><span>{description}</span></div>)}</div>)}
            </div>
          </section>
        </div>
      </div>
    </div>}
  </div>;
}
