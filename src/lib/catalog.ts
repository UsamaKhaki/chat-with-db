import type { Pool } from "pg";

export const QUERY_SCHEMA = "shop";

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  comment: string | null;
  references: string | null;
}

export interface TableInfo {
  name: string;
  comment: string | null;
  columns: ColumnInfo[];
}

export interface SchemaCatalog {
  schema: string;
  tables: TableInfo[];
}

/**
 * Reads the schema as the read-only role sees it. information_schema only
 * lists objects the current role has privileges on, so this is also exactly
 * the set of tables the validator should allow.
 */
export async function loadCatalog(
  pool: Pool,
  schema = QUERY_SCHEMA,
): Promise<SchemaCatalog> {
  const { rows } = await pool.query<{
    table_name: string;
    table_comment: string | null;
    column_name: string;
    data_type: string;
    is_nullable: "YES" | "NO";
    column_comment: string | null;
    references: string | null;
  }>(
    `SELECT
       c.table_name,
       obj_description(format('%I.%I', c.table_schema, c.table_name)::regclass, 'pg_class') AS table_comment,
       c.column_name,
       c.data_type,
       c.is_nullable,
       col_description(format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position) AS column_comment,
       (
         -- pg_constraint rather than information_schema: the latter hides
         -- constraints on tables the current role does not own.
         SELECT target.relname || '.' || target_column.attname
         FROM pg_constraint con
         JOIN pg_class source ON source.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = source.relnamespace
         JOIN pg_attribute source_column
           ON source_column.attrelid = con.conrelid AND source_column.attnum = con.conkey[1]
         JOIN pg_class target ON target.oid = con.confrelid
         JOIN pg_attribute target_column
           ON target_column.attrelid = con.confrelid AND target_column.attnum = con.confkey[1]
         WHERE con.contype = 'f'
           AND ns.nspname = c.table_schema
           AND source.relname = c.table_name
           AND source_column.attname = c.column_name
         LIMIT 1
       ) AS references
     FROM information_schema.columns c
     WHERE c.table_schema = $1
     ORDER BY c.table_name, c.ordinal_position`,
    [schema],
  );

  const tables = new Map<string, TableInfo>();
  for (const row of rows) {
    let table = tables.get(row.table_name);
    if (!table) {
      table = { name: row.table_name, comment: row.table_comment, columns: [] };
      tables.set(row.table_name, table);
    }
    table.columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
      comment: row.column_comment,
      references: row.references,
    });
  }
  return { schema, tables: [...tables.values()] };
}

/** Compact text form used both in prompts and as the embedded document. */
export function describeTable(table: TableInfo): string {
  const lines = [
    `Table ${table.name}${table.comment ? `: ${table.comment}` : ""}`,
  ];
  for (const column of table.columns) {
    const notes = [
      column.nullable ? "nullable" : null,
      column.references ? `references ${column.references}` : null,
      column.comment,
    ].filter(Boolean);
    lines.push(
      `  - ${column.name} ${column.type}${notes.length ? ` (${notes.join("; ")})` : ""}`,
    );
  }
  return lines.join("\n");
}
