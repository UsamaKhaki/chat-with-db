import { getCatalog } from "@/lib/ask-service";
import { toQueryError, userMessageFor } from "@/lib/sql/errors";

export interface SchemaResponse {
  schema: string;
  tables: {
    name: string;
    comment: string | null;
    columns: { name: string; type: string; references: string | null }[];
  }[];
}

/**
 * The tables and columns the read-only role can query, for the schema
 * panel. Same source as the validator's allow-list.
 */
export async function GET() {
  try {
    const catalog = await getCatalog();
    const body: SchemaResponse = {
      schema: catalog.schema,
      tables: catalog.tables.map((table) => ({
        name: table.name,
        comment: table.comment,
        columns: table.columns.map(({ name, type, references }) => ({
          name,
          type,
          references,
        })),
      })),
    };
    return Response.json(body);
  } catch (error) {
    const queryError = toQueryError(error);
    console.error(
      JSON.stringify({
        event: "schema_failure",
        code: queryError.code,
        detail: queryError.detail,
      }),
    );
    return Response.json(
      { message: userMessageFor(queryError.code) },
      { status: 503 },
    );
  }
}
