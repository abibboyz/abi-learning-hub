export type TrackSummary = {
  id: string;
  title: string;
  language: string;
  variant: string;
  runtime: string;
  api: "python" | "node";
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
};
