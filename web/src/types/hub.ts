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

export type Task = {
  id: string;
  order: number;
  title: string;
  summary?: string;
  description?: string;
  objectives: string[];
  hints?: string[];
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
  example?: string | { language?: string; code?: string; sql?: string };
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
