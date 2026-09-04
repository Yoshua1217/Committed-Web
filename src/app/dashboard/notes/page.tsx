"use client";

import {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
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
import { deleteNoteImages, uploadNoteImage } from "@/lib/note-image-service";
import NotesMarkdown, { collectMarkdownHeadings } from "@/components/notes-markdown";
import NotesFastScroll from "@/components/notes-fast-scroll";

type EditorMode = "write" | "preview";
type MenuAnchor = { left: number; top: number };

const NOTES_SIDEBAR_MIN_WIDTH = 220;
const NOTES_SIDEBAR_MAX_WIDTH = 460;
const NOTES_SIDEBAR_WIDTH_KEY = "committed-notes-sidebar-width";
const NOTES_SIDEBAR_COLLAPSED_KEY = "committed-notes-sidebar-collapsed";
const NOTES_DEFAULT_EDITOR_MODE_KEY = "committed-notes-default-editor-mode";
const NOTES_LAST_OPENED_KEY_PREFIX = "committed-notes-last-opened:";

interface SlashCommandBase {
  id: string;
  label: string;
  detail: string;
  icon: string;
  keywords: string;
}

type SlashCommand = SlashCommandBase & (
  | { kind: "insert"; value: string; placeholder?: string }
  | { kind: "image" }
);

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "heading1", kind: "insert", value: "# Heading 1", placeholder: "Heading 1", label: "Heading 1", detail: "Large section heading", icon: "format_h1", keywords: "h1 title" },
  { id: "heading2", kind: "insert", value: "## Heading 2", placeholder: "Heading 2", label: "Heading 2", detail: "Medium section heading", icon: "format_h2", keywords: "h2 subtitle" },
  { id: "heading3", kind: "insert", value: "### Heading 3", placeholder: "Heading 3", label: "Heading 3", detail: "Small section heading", icon: "format_h3", keywords: "h3 subtitle" },
  { id: "heading4", kind: "insert", value: "#### Heading 4", placeholder: "Heading 4", label: "Heading 4", detail: "Compact section heading", icon: "format_h4", keywords: "h4 subtitle" },
  { id: "bullet", kind: "insert", value: "- List item", placeholder: "List item", label: "Bulleted list", detail: "Start a simple list", icon: "format_list_bulleted", keywords: "unordered list" },
  { id: "number", kind: "insert", value: "1. List item", placeholder: "List item", label: "Numbered list", detail: "Start an ordered list", icon: "format_list_numbered", keywords: "ordered list" },
  { id: "checkbox", kind: "insert", value: "- [ ] To-do", placeholder: "To-do", label: "Checkbox", detail: "Add a to-do item", icon: "check_box", keywords: "todo task" },
  { id: "quote", kind: "insert", value: "> Quote", placeholder: "Quote", label: "Block quote", detail: "Call out quoted text", icon: "format_quote", keywords: "blockquote" },
  { id: "divider", kind: "insert", value: "---\n", label: "Divider", detail: "Separate sections", icon: "horizontal_rule", keywords: "rule line" },
  { id: "codeblock", kind: "insert", value: "```\ncode\n```", placeholder: "code", label: "Code block", detail: "Add fenced code", icon: "code_blocks", keywords: "fence pre" },
  { id: "internal", kind: "insert", value: "[[Note name]]", placeholder: "Note name", label: "Internal note link", detail: "Link another note", icon: "account_tree", keywords: "wiki backlink" },
  { id: "bold", kind: "insert", value: "**bold text**", placeholder: "bold text", label: "Bold", detail: "Make text strong", icon: "format_bold", keywords: "strong" },
  { id: "italic", kind: "insert", value: "*italic text*", placeholder: "italic text", label: "Italic", detail: "Emphasize text", icon: "format_italic", keywords: "emphasis" },
  { id: "underline", kind: "insert", value: "<u>underlined text</u>", placeholder: "underlined text", label: "Underline", detail: "Underline text", icon: "format_underlined", keywords: "u" },
  { id: "strike", kind: "insert", value: "~~struck text~~", placeholder: "struck text", label: "Strikethrough", detail: "Strike text out", icon: "strikethrough_s", keywords: "delete" },
  { id: "inlinecode", kind: "insert", value: "`inline code`", placeholder: "inline code", label: "Inline code", detail: "Format a code phrase", icon: "data_object", keywords: "code" },
  { id: "link", kind: "insert", value: "[link text](https://)", placeholder: "link text", label: "Web link", detail: "Add a labelled URL", icon: "link", keywords: "url hyperlink" },
  { id: "subscript", kind: "insert", value: "<sub>subscript</sub>", placeholder: "subscript", label: "Subscript", detail: "Lower text for chemistry", icon: "subscript", keywords: "chemistry lower index" },
  { id: "chem", kind: "insert", value: "$\\ce{H2O}$", placeholder: "H2O", label: "Chemistry formula", detail: "Format a chemical equation", icon: "science", keywords: "chem molecule equation mhchem" },
  { id: "fraction", kind: "insert", value: "$\\frac{numerator}{denominator}$", placeholder: "numerator", label: "Math fraction", detail: "Insert a stacked fraction", icon: "function", keywords: "math latex divide numerator denominator" },
  { id: "exponent", kind: "insert", value: "$base^{exponent}$", placeholder: "base", label: "Exponent", detail: "Type a base, then its exponent", icon: "superscript", keywords: "math power superscript squared cubed" },
  { id: "image", kind: "image", label: "Image", detail: "Upload one or more images", icon: "add_photo_alternate", keywords: "photo picture upload paste" },
];

const FORMATTING_GUIDE = [
  {
    id: "chemistry",
    title: "Chemistry formulas",
    icon: "science",
    description: "Write familiar chemical notation and let Preview format element counts, charges, and reaction arrows.",
    steps: "Type /chem, press Enter, then replace the selected H2O example with your formula.",
    syntax: "$\\ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O}$",
  },
  {
    id: "subscript",
    title: "Subscript",
    icon: "subscript",
    description: "Lower any short piece of text, including numbers used outside a full chemistry formula.",
    steps: "Type /subscript and replace the selected placeholder.",
    syntax: "H<sub>2</sub>O",
  },
  {
    id: "fractions",
    title: "Fractions and inline math",
    icon: "function",
    description: "Use LaTeX between dollar signs for clean inline equations and stacked fractions.",
    steps: "Type /fraction, replace numerator, then replace denominator.",
    syntax: "$\\frac{1}{2}$",
  },
  {
    id: "exponents",
    title: "Exponents and powers",
    icon: "superscript",
    description: "Raise a number or symbol to a power with a clean superscript, including negative exponents.",
    steps: "Type /exponent, enter the base, press Tab, then enter the exponent. Numeric forms such as 10^-2 also convert when you press Space.",
    syntax: "$10^{-2}$",
  },
  {
    id: "arrows",
    title: "Smart arrows",
    icon: "arrow_right_alt",
    description: "Turn familiar keyboard arrow characters into clean typographic arrows in formatted Notes views.",
    steps: "Type an arrow using hyphens, equals signs, and angle brackets. The Markdown source stays unchanged.",
    syntax: "A -> B\nA --> B\nA <-> B\nA => B",
  },
  {
    id: "images",
    title: "Images",
    icon: "image",
    description: "Paste images directly on desktop, or use /image to choose files on desktop and Android.",
    steps: "Paste or select PNG, JPEG, WebP, or GIF files. Images sync after upload and are removed when the note is deleted.",
    syntax: "![Lab setup](image-url)",
    previewSyntax: "![Committed image](/logo.png)",
  },
  {
    id: "commands",
    title: "Slash commands",
    icon: "keyboard_command_key",
    description: "Open formatting and media tools without leaving the keyboard.",
    steps: "Start a line with /, type part of a command name, then press Enter or tap the result.",
    syntax: "/subscript\n/chem\n/fraction\n/exponent\n/image",
    commands: [
      ["/subscript", "Insert lowered text"],
      ["/chem", "Insert a chemical formula"],
      ["/fraction", "Insert a stacked fraction"],
      ["/exponent", "Insert a base and exponent"],
      ["/image", "Open the image picker"],
    ],
  },
] as const;

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
      ["<sub>2</sub>", "Subscript"],
      ["$\\frac{1}{2}$", "Inline fraction"],
      ["$10^{-2}$", "Exponent or power"],
      ["10^-2 + Space", "Automatically format a numeric exponent"],
      ["$\\ce{H2O}$", "Chemistry formula"],
      ["![alt](url)", "Image"],
      ["-> / -->", "Right arrow"],
      ["<- / <--", "Left arrow"],
      ["<-> / <=>", "Two-way arrow"],
      ["=> / ==>", "Double right arrow"],
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

function hasOddUnescapedMarker(value: string, marker: string) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === marker && value[index - 1] !== "\\") count += 1;
  }
  return count % 2 === 1;
}

function isInsideFencedCode(content: string, position: number) {
  const fenceCount = content
    .slice(0, position)
    .split("\n")
    .filter((line) => line.trimStart().startsWith("```"))
    .length;
  return fenceCount % 2 === 1;
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
  const [defaultEditorMode, setDefaultEditorMode] = useState<EditorMode>("write");
  const [formattedPreviewOpen, setFormattedPreviewOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(282);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [calendars, setCalendars] = useState<SyncedGoogleCalendar[]>([]);
  const [slashRange, setSlashRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const [linkRange, setLinkRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor>({ left: 320, top: 280 });
  const [menuIndex, setMenuIndex] = useState(0);
  const [importTargetId, setImportTargetId] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [imageUploadNotice, setImageUploadNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [copiedGuideId, setCopiedGuideId] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const documentScrollRef = useRef<HTMLDivElement>(null);
  const livePreviewScrollRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initializedForUserRef = useRef<string | null>(null);
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inFlightSaveCountsRef = useRef<Map<string, number>>(new Map());
  const locallyDirtyNoteIdsRef = useRef<Set<string>>(new Set());
  const lastFolderLabelClickRef = useRef<{ folderId: string; timestamp: number } | null>(null);
  const notesRef = useRef<MarkdownNote[]>([]);
  const uploadNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarPreferencesLoadedRef = useRef(false);
  const editorModePreferenceLoadedRef = useRef(false);
  const restoredLastNoteForUserRef = useRef<string | null>(null);

  const showImageNotice = useCallback((message: string, error = false) => {
    if (uploadNoticeTimerRef.current) clearTimeout(uploadNoticeTimerRef.current);
    setImageUploadNotice({ message, error });
    uploadNoticeTimerRef.current = setTimeout(() => setImageUploadNotice(null), error ? 5_000 : 2_500);
  }, []);

  useEffect(() => {
    if (!user) return;
    const saveTimers = saveTimersRef.current;
    const unsubscribeFolders = subscribeToNoteFolders(user.uid, (nextFolders) => {
      setFolders(nextFolders);
      setFoldersLoaded(true);
    });
    const unsubscribeNotes = subscribeToMarkdownNotes(user.uid, (nextNotes) => {
      const editor = editorRef.current;
      const preserveSelection = editor && document.activeElement === editor
        ? { start: editor.selectionStart, end: editor.selectionEnd, scrollTop: editor.scrollTop }
        : null;
      const localById = new Map(notesRef.current.map((note) => [note.id, note]));
      const mergedNotes = nextNotes.map((incomingNote) => {
        const localNote = localById.get(incomingNote.id);
        if (!localNote) return incomingNote;
        const localSavePending = saveTimersRef.current.has(incomingNote.id)
          || (inFlightSaveCountsRef.current.get(incomingNote.id) ?? 0) > 0;
        const localIsNewer = localNote.updatedAt > incomingNote.updatedAt;
        const incomingMatchesLocal = localNote.content === incomingNote.content && localNote.title === incomingNote.title;
        if (incomingMatchesLocal && incomingNote.updatedAt >= localNote.updatedAt) locallyDirtyNoteIdsRef.current.delete(incomingNote.id);
        const pendingContentDiffers = (localSavePending || locallyDirtyNoteIdsRef.current.has(incomingNote.id)) && !incomingMatchesLocal;
        return localIsNewer || pendingContentDiffers ? localNote : incomingNote;
      });
      const incomingIds = new Set(nextNotes.map((note) => note.id));
      notesRef.current.forEach((localNote) => {
        const isPending = saveTimersRef.current.has(localNote.id)
          || (inFlightSaveCountsRef.current.get(localNote.id) ?? 0) > 0
          || locallyDirtyNoteIdsRef.current.has(localNote.id);
        if (!incomingIds.has(localNote.id) && isPending) mergedNotes.push(localNote);
      });
      notesRef.current = mergedNotes;
      setNotes(mergedNotes);
      setNotesLoaded(true);
      if (preserveSelection) {
        requestAnimationFrame(() => {
          const currentEditor = editorRef.current;
          if (!currentEditor || document.activeElement !== currentEditor) return;
          const maximum = currentEditor.value.length;
          currentEditor.setSelectionRange(Math.min(preserveSelection.start, maximum), Math.min(preserveSelection.end, maximum));
          currentEditor.scrollTop = preserveSelection.scrollTop;
        });
      }
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
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => () => {
    if (uploadNoticeTimerRef.current) clearTimeout(uploadNoticeTimerRef.current);
  }, []);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(NOTES_SIDEBAR_WIDTH_KEY));
    const savedCollapsed = window.localStorage.getItem(NOTES_SIDEBAR_COLLAPSED_KEY) === "true";
    const frame = window.requestAnimationFrame(() => {
      sidebarPreferencesLoadedRef.current = true;
      if (Number.isFinite(savedWidth) && savedWidth >= NOTES_SIDEBAR_MIN_WIDTH && savedWidth <= NOTES_SIDEBAR_MAX_WIDTH) {
        setSidebarWidth(savedWidth);
      }
      setSidebarCollapsed(savedCollapsed);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!sidebarPreferencesLoadedRef.current) return;
    window.localStorage.setItem(NOTES_SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    window.localStorage.setItem(NOTES_SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed, sidebarWidth]);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(NOTES_DEFAULT_EDITOR_MODE_KEY);
    const defaultMode: EditorMode = savedMode === "preview" || savedMode === "write"
      ? savedMode
      : window.matchMedia("(max-width: 767px)").matches ? "preview" : "write";
    const frame = window.requestAnimationFrame(() => {
      editorModePreferenceLoadedRef.current = true;
      setDefaultEditorMode(defaultMode);
      setEditorMode(defaultMode);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!editorModePreferenceLoadedRef.current) return;
    window.localStorage.setItem(NOTES_DEFAULT_EDITOR_MODE_KEY, defaultEditorMode);
  }, [defaultEditorMode]);

  const beginSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    document.body.classList.add("notes-sidebar-resizing");

    const resize = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(NOTES_SIDEBAR_MAX_WIDTH, Math.max(NOTES_SIDEBAR_MIN_WIDTH, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(Math.round(nextWidth));
    };
    const stopResize = () => {
      document.body.classList.remove("notes-sidebar-resizing");
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

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

  const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const notebooks = folders.filter((folder) => folder.kind === "notebook");
  const activeNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null;
  const effectiveFolderId = selectedFolderId ?? activeNote?.folderId ?? notebooks[0]?.id ?? null;
  const activeFolder = effectiveFolderId ? folderMap.get(effectiveFolderId) ?? null : null;
  const calendarMap = useMemo(() => new Map(calendars.map((calendar) => [calendar.id, calendar])), [calendars]);
  const activeNoteHeadings = useMemo(() => collectMarkdownHeadings(activeNote?.content ?? "", "notes-active"), [activeNote?.content]);

  useEffect(() => {
    if (!user || !foldersLoaded || !notesLoaded || !notes.length || restoredLastNoteForUserRef.current === user.uid) return;
    const savedNoteId = window.localStorage.getItem(`${NOTES_LAST_OPENED_KEY_PREFIX}${user.uid}`);
    const noteToRestore = notes.find((note) => note.id === savedNoteId) ?? notes[0];
    const frame = window.requestAnimationFrame(() => {
      restoredLastNoteForUserRef.current = user.uid;
      setSelectedNoteId(noteToRestore.id);
      setSelectedFolderId(noteToRestore.folderId);
      setExpandedIds((current) => {
        const next = new Set(current);
        let parent = folderMap.get(noteToRestore.folderId);
        while (parent) {
          next.add(parent.id);
          parent = parent.parentId ? folderMap.get(parent.parentId) : undefined;
        }
        return next;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [folderMap, foldersLoaded, notes, notesLoaded, user]);

  useEffect(() => {
    if (!user || !selectedNoteId) return;
    const selectedNote = notes.find((note) => note.id === selectedNoteId);
    if (selectedNote?.userId !== user.uid) return;
    window.localStorage.setItem(`${NOTES_LAST_OPENED_KEY_PREFIX}${user.uid}`, selectedNoteId);
  }, [notes, selectedNoteId, user]);

  const scheduleSave = useCallback((note: MarkdownNote) => {
    const previousTimer = saveTimersRef.current.get(note.id);
    if (previousTimer) clearTimeout(previousTimer);
    locallyDirtyNoteIdsRef.current.add(note.id);
    setSaveState("saving");
    const timer = setTimeout(() => {
      const currentCount = inFlightSaveCountsRef.current.get(note.id) ?? 0;
      inFlightSaveCountsRef.current.set(note.id, currentCount + 1);
      saveTimersRef.current.delete(note.id);
      void saveMarkdownNote(note)
        .then(() => {
          const latestNote = notesRef.current.find((item) => item.id === note.id);
          if ((!latestNote || latestNote.updatedAt <= note.updatedAt) && !saveTimersRef.current.has(note.id)) setSaveState("saved");
        })
        .catch(() => setSaveState("error"))
        .finally(() => {
          const remaining = (inFlightSaveCountsRef.current.get(note.id) ?? 1) - 1;
          if (remaining > 0) inFlightSaveCountsRef.current.set(note.id, remaining);
          else inFlightSaveCountsRef.current.delete(note.id);
        });
    }, 500);
    saveTimersRef.current.set(note.id, timer);
  }, []);

  const updateActiveNote = useCallback((patch: Partial<MarkdownNote>) => {
    if (!activeNote) return;
    const nextNote = { ...activeNote, ...patch, updatedAt: actionTimestamp() };
    notesRef.current = notesRef.current.map((note) => note.id === nextNote.id ? nextNote : note);
    setNotes((current) => current.map((note) => note.id === nextNote.id ? nextNote : note));
    scheduleSave(nextNote);
  }, [activeNote, scheduleSave]);

  const selectNote = (note: MarkdownNote) => {
    setSelectedNoteId(note.id);
    setSelectedFolderId(note.folderId);
    setEditorMode(defaultEditorMode);
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
    setEditorMode(defaultEditorMode);
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
    const deletedNote = notePendingDelete;
    const noteId = deletedNote.id;
    const nextSelection = notes.find((note) => note.id !== noteId)?.id ?? null;
    const pendingSave = saveTimersRef.current.get(noteId);
    if (pendingSave) clearTimeout(pendingSave);
    saveTimersRef.current.delete(noteId);
    locallyDirtyNoteIdsRef.current.delete(noteId);
    setNotePendingDelete(null);
    notesRef.current = notesRef.current.filter((note) => note.id !== noteId);
    setNotes((current) => current.filter((note) => note.id !== noteId));
    setSelectedNoteId(nextSelection);
    setPageMenuOpen(false);
    setSaveState("saving");
    try {
      await deleteMarkdownNote(noteId);
      setSaveState("saved");
      void deleteNoteImages(deletedNote.userId, noteId).catch(() => {
        showImageNotice("The note was deleted, but some stored images could not be cleaned up.", true);
      });
    } catch {
      setSaveState("error");
    }
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

  const replaceUploadToken = useCallback((noteId: string, token: string, replacement: string) => {
    const note = notesRef.current.find((item) => item.id === noteId);
    if (!note || !note.content.includes(token)) return;
    const next = { ...note, content: note.content.replace(token, replacement), updatedAt: actionTimestamp() };
    notesRef.current = notesRef.current.map((item) => item.id === noteId ? next : item);
    setNotes(notesRef.current);
    scheduleSave(next);
  }, [scheduleSave]);

  const insertImageFiles = useCallback(async (files: File[], start?: number, end?: number) => {
    if (!activeNote || !user || !files.length) return;
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      showImageNotice("Choose a PNG, JPEG, WebP, or GIF image.", true);
      return;
    }

    const noteAtStart = activeNote;
    const rangeStart = start ?? editorRef.current?.selectionStart ?? noteAtStart.content.length;
    const rangeEnd = end ?? editorRef.current?.selectionEnd ?? rangeStart;
    const uploads = imageFiles.map((file) => {
      const uploadId = generateNotesId();
      const alt = (file.name || "Pasted image").replace(/[\[\]()]/g, " ").replace(/\s+/g, " ").trim();
      return { file, token: `![Uploading ${alt}…](note-upload://${uploadId})` };
    });
    const leadingBreak = rangeStart > 0 && noteAtStart.content[rangeStart - 1] !== "\n" ? "\n" : "";
    const trailingBreak = rangeEnd < noteAtStart.content.length && noteAtStart.content[rangeEnd] !== "\n" ? "\n" : "";
    const insertion = `${leadingBreak}${uploads.map((upload) => upload.token).join("\n")}${trailingBreak}`;
    replaceEditorRange(rangeStart, rangeEnd, insertion, insertion.length);

    const progress = uploads.map(() => 0);
    setImageUploadNotice({ message: `Uploading ${uploads.length === 1 ? "image" : `${uploads.length} images`}… 0%` });
    const results = await Promise.allSettled(uploads.map(async (upload, index) => {
      const uploaded = await uploadNoteImage(user.uid, noteAtStart.id, upload.file, (percent) => {
        progress[index] = percent;
        const overall = Math.round(progress.reduce((sum, value) => sum + value, 0) / progress.length);
        setImageUploadNotice({ message: `Uploading ${uploads.length === 1 ? "image" : `${uploads.length} images`}… ${overall}%` });
      });
      replaceUploadToken(noteAtStart.id, upload.token, `![${uploaded.altText}](${uploaded.downloadUrl})`);
    }));

    const failed = results.filter((result) => result.status === "rejected").length;
    uploads.forEach((upload, index) => {
      if (results[index].status === "rejected") replaceUploadToken(noteAtStart.id, upload.token, "");
    });
    if (failed) {
      const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      const reason = firstFailure?.reason instanceof Error ? firstFailure.reason.message : "The upload failed.";
      showImageNotice(`${failed} image${failed === 1 ? "" : "s"} could not be added. ${reason}`, true);
    } else {
      showImageNotice(`${uploads.length} image${uploads.length === 1 ? "" : "s"} added.`);
    }
  }, [activeNote, replaceEditorRange, replaceUploadToken, showImageNotice, user]);

  const handleEditorPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    void insertImageFiles(files, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  };

  const handleImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) void insertImageFiles(Array.from(event.target.files));
    event.target.value = "";
  };

  const copyGuideSyntax = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = value;
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }
    setCopiedGuideId(id);
    window.setTimeout(() => setCopiedGuideId((current) => current === id ? null : current), 1_700);
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
    if (command.kind === "image") {
      replaceEditorRange(slashRange.start, slashRange.end, "", 0);
      window.setTimeout(() => imageInputRef.current?.click(), 0);
      return;
    }
    const placeholderStart = command.placeholder ? command.value.indexOf(command.placeholder) : command.value.length;
    const selectionStart = placeholderStart >= 0 ? placeholderStart : command.value.length;
    replaceEditorRange(slashRange.start, slashRange.end, command.value, selectionStart, selectionStart + (command.placeholder?.length ?? 0));
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
    const slashMatch = beforeCursor.match(/(^|\s)\/([a-zA-Z0-9]*)$/);
    const linkMatch = beforeCursor.match(/\[\[([^\]]*)$/);
    if (slashMatch) {
      const commandStart = lineStart + (slashMatch.index ?? 0) + slashMatch[1].length;
      setSlashRange({ start: commandStart, end: cursor, query: slashMatch[2] });
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
      if (start === end && activeNote.content.slice(start).startsWith("^{exponent}$")) {
        textarea.setSelectionRange(start + 2, start + 10);
        return;
      }
      replaceEditorRange(start, end, "  ", 2);
      return;
    }
    if (event.key === " " && start === end) {
      const exponentMatch = currentLine.match(/(^|[\s(])(\d+(?:\.\d+)?)\^([+-]?\d+(?:\.\d+)?)$/);
      if (exponentMatch) {
        const tokenOffset = (exponentMatch.index ?? 0) + exponentMatch[1].length;
        const tokenStart = lineStart + tokenOffset;
        const inlinePrefix = currentLine.slice(0, tokenOffset);
        const insideInlineCode = hasOddUnescapedMarker(inlinePrefix, "`");
        const insideInlineMath = hasOddUnescapedMarker(inlinePrefix, "$");
        if (!insideInlineCode && !insideInlineMath && !isInsideFencedCode(activeNote.content, tokenStart)) {
          event.preventDefault();
          const formatted = `$${exponentMatch[2]}^{${exponentMatch[3]}}$ `;
          replaceEditorRange(tokenStart, start, formatted, formatted.length);
          return;
        }
      }
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

  return <div
    className={`notes-workspace${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
    style={{ "--notes-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
  >
    <aside className={`notes-sidebar ${sidebarOpen ? "is-open" : ""}`}>
      <div className="notes-sidebar-header">
        <div className="notes-sidebar-brand">
          <div><strong>Notes</strong><span>Markdown workspace</span></div>
          <div className="notes-sidebar-brand-actions">
            <button
              type="button"
              className="notes-sidebar-default-mode"
              aria-label={`Newly opened notes default to ${defaultEditorMode === "preview" ? "viewing" : "editing"}`}
              aria-pressed={defaultEditorMode === "preview"}
              title={defaultEditorMode === "preview" ? "Newly opened notes default to viewing — switch to editing" : "Newly opened notes default to editing — switch to viewing"}
              onClick={() => {
                const nextMode: EditorMode = defaultEditorMode === "preview" ? "write" : "preview";
                if (editorMode === defaultEditorMode) setEditorMode(nextMode);
                setDefaultEditorMode(nextMode);
              }}
            >{icon(defaultEditorMode === "preview" ? "visibility" : "edit_note", 18)}</button>
            <button type="button" className="notes-sidebar-collapse" aria-label="Collapse notes navigation" title="Collapse sidebar" onClick={() => setSidebarCollapsed(true)}>{icon("left_panel_close", 18)}</button>
          </div>
        </div>
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
      <button type="button" className="notes-sidebar-resizer" aria-label="Resize notes navigation" title="Drag to resize sidebar" onPointerDown={beginSidebarResize} />
    </aside>

    <main className="notes-editor-shell">
      <header className="notes-editor-toolbar">
        <div className="notes-editor-toolbar-left">
          <button type="button" className="notes-mobile-sidebar" aria-label="Open notes navigation" onClick={() => { setSidebarCollapsed(false); setSidebarOpen(true); }}>{icon("dock_to_right", 20)}</button>
          <div className="notes-breadcrumb">
            {activeNote ? <><span>{folderMap.get(activeNote.notebookId)?.name ?? "Notes"}</span>{activeNote.folderId !== activeNote.notebookId && <>{icon("chevron_right", 15)}<span>{folderMap.get(activeNote.folderId)?.name}</span></>}</> : <span>Notes</span>}
          </div>
        </div>
        <div className="notes-editor-toolbar-actions">
          <div className="notes-mode-switch" role="group" aria-label="Editor mode">
            <button type="button" className={editorMode === "write" ? "is-active" : ""} onClick={() => setEditorMode("write")}>{icon("edit_note", 17)} Write</button>
            <button type="button" className={editorMode === "preview" ? "is-active" : ""} onClick={() => setEditorMode("preview")}>{icon("visibility", 17)} Preview</button>
          </div>
          {editorMode === "write" && <button
            type="button"
            className={`notes-live-preview-toggle${formattedPreviewOpen ? " is-active" : ""}`}
            aria-label={formattedPreviewOpen ? "Close formatted preview" : "Open formatted preview"}
            aria-pressed={formattedPreviewOpen}
            title={formattedPreviewOpen ? "Close formatted preview" : "Open formatted preview"}
            onClick={() => setFormattedPreviewOpen((open) => !open)}
          >{icon("vertical_split", 19)}</button>}
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

      {activeNote ? <div className={`notes-document-scroll${editorMode === "preview" ? " has-fast-scroll" : ""}`} id="notes-document-scroll" ref={documentScrollRef}>
        <article className={`notes-document${editorMode === "write" ? ` is-writing${formattedPreviewOpen ? "" : " is-formatted-preview-closed"}` : ""}`}>
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
            <div className={`notes-compose-grid${formattedPreviewOpen ? "" : " is-preview-closed"}`}>
              <div className="notes-source-pane">
                <div className="notes-pane-label"><span>Source</span><small>Keep typing—formatting updates live</small></div>
                <textarea
                  ref={editorRef}
                  className="notes-markdown-editor"
                  value={activeNote.content}
                  onChange={handleEditorChange}
                  onKeyDown={handleEditorKeyDown}
                  onPaste={handleEditorPaste}
                  onClick={(event) => refreshFloatingMenu(event.currentTarget)}
                  placeholder={'Start writing…\n\nType "/" for commands or "[[" to link a note.'}
                  spellCheck
                  aria-label="Markdown note content"
                />
              </div>
              {formattedPreviewOpen && <aside className="notes-live-preview has-fast-scroll" id="notes-live-preview-scroll" ref={livePreviewScrollRef} aria-label="Live formatted preview">
                <div className="notes-live-preview-heading"><small>Formatted preview</small></div>
                {activeNote.content.trim()
                  ? <NotesMarkdown content={activeNote.content} headingIdPrefix="notes-active" />
                  : <p className="notes-live-preview-empty">Your formulas, fractions, chemistry, and formatting will appear here as you type.</p>}
              </aside>}
            </div>
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={handleImageInput} />
          </div> : <NotesMarkdown content={activeNote.content} headingIdPrefix="notes-active" />}
        </article>
      </div> : <div className="notes-empty-editor">
        <div>{icon("edit_note", 34)}</div><h1>{notesLoaded ? "Choose a note" : "Opening your notes…"}</h1><p>Select a page from the sidebar or start something new.</p><button type="button" onClick={() => createNote()}>{icon("add", 18)} New note</button>
      </div>}
      {activeNote && (editorMode === "preview" || formattedPreviewOpen) && <NotesFastScroll
        headings={activeNoteHeadings}
        scrollContainerRef={editorMode === "preview" ? documentScrollRef : livePreviewScrollRef}
        scrollContainerId={editorMode === "preview" ? "notes-document-scroll" : "notes-live-preview-scroll"}
        linkedScrollContainerRef={editorMode === "write" ? documentScrollRef : undefined}
        linkedScrollContainerId={editorMode === "write" ? "notes-document-scroll" : undefined}
      />}
    </main>

    {imageUploadNotice && <div className={`notes-upload-notice${imageUploadNotice.error ? " is-error" : ""}`} role="status">{imageUploadNotice.message}</div>}

    {sidebarOpen && <button className="notes-sidebar-scrim" aria-label="Close notes navigation" onClick={() => setSidebarOpen(false)} />}

    {slashRange && <div className="notes-command-menu" style={{ left: menuAnchor.left, top: menuAnchor.top }}>
      <div className="notes-command-heading"><span>BLOCKS & FORMATTING</span><kbd>↑↓ Enter</kbd></div>
      <div className="notes-command-list">
        {filteredCommands.map((command, index) => <button
          type="button"
          key={command.id}
          className={index === menuIndex ? "is-active" : ""}
          onPointerDown={(event) => { event.preventDefault(); executeSlashCommand(command); }}
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
          onPointerDown={(event) => { event.preventDefault(); selectInternalLink(note); }}
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

          <section className="notes-settings-section notes-guide-section">
            <div className="notes-settings-heading"><div><h3>Formatting &amp; Media Guide</h3><p>Copy working examples for chemistry, math, subscripts, images, and slash commands.</p></div>{icon("menu_book", 23)}</div>
            <div className="notes-guide-grid">
              {FORMATTING_GUIDE.map((guide) => <article className="notes-guide-card" key={guide.id}>
                <header><span>{icon(guide.icon, 20)}</span><div><h4>{guide.title}</h4><p>{guide.description}</p></div></header>
                <div className="notes-guide-steps"><strong>How to use it</strong><p>{guide.steps}</p></div>
                <div className="notes-guide-code">
                  <pre><code>{guide.syntax}</code></pre>
                  <button type="button" onClick={() => void copyGuideSyntax(guide.id, guide.syntax)}>{icon(copiedGuideId === guide.id ? "check" : "content_copy", 16)}{copiedGuideId === guide.id ? "Copied" : "Copy"}</button>
                </div>
                <div className="notes-guide-preview">
                  <span>Preview</span>
                  {"commands" in guide
                    ? <div className="notes-guide-command-list">{guide.commands.map(([command, detail]) => <div key={command}><code>{command}</code><small>{detail}</small></div>)}</div>
                    : <NotesMarkdown content={("previewSyntax" in guide ? guide.previewSyntax : guide.syntax)} />}
                </div>
              </article>)}
            </div>
            <p className="notes-guide-footnote">Pasted images are compressed and synced through your account. PNG, JPEG, WebP, and GIF are supported up to 5 MB after processing. On Android, use <code>/image</code> whenever the keyboard does not expose an image from the clipboard. Image files remain available when their Markdown is removed, and are cleaned up when the note is deleted.</p>
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
