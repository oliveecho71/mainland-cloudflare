import { getCloudflareContext } from "@opennextjs/cloudflare";

type Value = string | number | bigint | boolean | null | ArrayBuffer | Uint8Array;
type Row = Record<string, unknown>;
type D1 = D1Database;

class BoundStatement {
  constructor(readonly statement: D1PreparedStatement) {}
  first<T extends Row = Row>() { return this.statement.first<T>(); }
  all<T extends Row = Row>() { return this.statement.all<T>(); }
  async run() {
    const result = await this.statement.run();
    return { meta: { changes: Number(result.meta.changes || 0) } };
  }
}

class DatabaseAdapter {
  constructor(private readonly database: D1) {}
  prepare(sql: string) {
    return {
      bind: (...values: Value[]) => new BoundStatement(this.database.prepare(sql).bind(...values)),
      first: <T extends Row = Row>() => this.database.prepare(sql).first<T>(),
      all: <T extends Row = Row>() => this.database.prepare(sql).all<T>(),
      run: async () => {
        const result = await this.database.prepare(sql).run();
        return { meta: { changes: Number(result.meta.changes || 0) } };
      },
    };
  }
  async batch(statements: BoundStatement[]) {
    const results = await this.database.batch(statements.map(item => item.statement));
    return results.map(result => ({ meta: { changes: Number(result.meta.changes || 0) } }));
  }
}

export async function getDb(): Promise<DatabaseAdapter> {
  const { env } = await getCloudflareContext({ async: true });
  const database = (env as CloudflareEnv).DB;
  if (!database) throw new Error("Cloudflare D1 binding DB is missing. Check wrangler.jsonc.");
  return new DatabaseAdapter(database);
}
