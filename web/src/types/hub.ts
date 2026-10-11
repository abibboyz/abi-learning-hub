export type TrackSummary = {
  id: string;
  title: string;
  language: string;
  variant: string;
  runtime: string;
  api: "python" | "node" | "playwright";
  /** Track kind picks the lab: SQL/ORM labs (default) or the Playwright lab. */
  kind?: "orm" | "playwright";
  description: string;
  order: number;
  icon?: string;
};

export type Column = {
  name: string;
  type: string;
  nullable?: boolean;
  default?: string | null;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  references?: { table: string; column: string };
};

export type SchemaTable = { name: string; columns: Column[] };
export type SchemaRel = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onDelete?: string;
  onUpdate?: string;
  type?: string;
};
export type Schema = { tables: SchemaTable[]; relationships: SchemaRel[] };

export type RefLink = { title: string; url: string };

export type Task = {
  id: string;
  order: number;
  title: string;
  summary?: string;
  description?: string;
  /** Why this task matters — cause→effect pedagogy */
  why?: string;
  objectives: string[];
  hints?: string[];
  pitfalls?: string[];
  mappingNotes?: string;
  teachAlong?: string[];
  references?: RefLink[];
  sqlEquivalent?: string;
  starterCode: string;
  requirements: unknown;
  animation?: { highlightTables?: string[]; highlightRels?: string[] };
  trackId?: string;
};

export type Lesson = {
  id: string;
  order: number;
  title: string;
  topic?: string;
  body?: string;
  summary?: string;
  why?: string;
  objectives?: string[];
  pitfalls?: string[];
  mappingNotes?: string;
  teachAlong?: string[];
  references?: RefLink[];
  example?: string | { language?: string; code?: string; sql?: string };
  exampleSql?: string;
  exampleLanguage?: string;
  exercise?: string | { prompt?: string; hint?: string };
};

export type ExecuteResult = {
  success: boolean;
  gate?: string;
  message?: string;
  schema?: Schema;
  validation?: { ok: boolean; errors: string[]; matched: string[]; message?: string };
  animation?: { highlightTables?: string[]; highlightRels?: string[] } | null;
  note?: string;
  sql?: string[];
  traceback?: string;
  teachAlong?: string[];
};

export type Manifest = TrackSummary & {
  prerequisites?: {
    title?: string;
    lockedByDefault?: boolean;
    install?: string;
    code?: string;
    setupCode?: string;
  };
  runtimePanels?: Record<string, { title: string; points: string[] }>;
  validationCatalog?: Array<{ id: string; title: string; example: string }>;
  taskIds?: string[];
  lessonIds?: string[];
  playwrightVersion?: string;
  languages?: string[];
  appUnderTest?: { name: string; pages?: string[]; api?: string[]; accounts?: Array<{ email: string; password: string; role?: string }>; notes?: string[] };
  references?: RefLink[];
};

// ---------------------------------------------------------------- Playwright track

export type PwSupportFile = { path: string; content: string; readOnly?: boolean };

export type PwTask = Task & {
  testFile?: string;
  starterCodeJs?: string;
  supportFiles?: PwSupportFile[];
  hints?: string[];
  gate?: { forbidCss?: boolean; minTests?: number; minRunTests?: number; preset?: string; mutants?: Array<{ bug: string; reason: string }> };
};

export type PwLesson = {
  id: string;
  order: number;
  title: string;
  topic?: string;
  summary?: string;
  why?: string;
  body?: string;
  objectives?: string[];
  pitfalls?: string[];
  teachAlong?: string[];
  references?: RefLink[];
  example?: { language?: string; code?: string };
  runnable?: boolean;
  lab?: { supportFiles?: PwSupportFile[]; preset?: string };
};

export type PwFinding = { rule: string; severity: "reject" | "error" | "warning"; message: string; line?: number; column?: number };
export type PwLog = { kind: string; text: string; at: number; status?: number; method?: string; url?: string; level?: string };
export type PwTestError = { message: string; line?: number; column?: number; file?: string; snippet?: string };
export type PwTestResult = {
  id: string;
  title: string;
  titlePath: string[];
  file: string;
  line?: number;
  project: string;
  status: "passed" | "failed" | "flaky" | "skipped" | "timedOut";
  runs: Array<{ status: string; duration: number; repeat: number; error?: PwTestError }>;
  durationMs: number;
  error?: PwTestError;
  screenshots: string[];
  trace?: string;
  log: PwLog[];
};

export type PwExecuteResult = {
  success: boolean;
  gate: string;
  message: string;
  reasons?: PwFinding[];
  warnings?: PwFinding[];
  run?: {
    runId: string;
    durationMs: number;
    timedOut: boolean;
    tests: PwTestResult[];
    mutants: Array<{ bug: string; status: "caught" | "missed" | "not-run"; tests: number }>;
    globalErrors: PwTestError[];
    output?: string;
  } | null;
  testFile?: string;
  language?: string;
  historyId?: number | null;
};
