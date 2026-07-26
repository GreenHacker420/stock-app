import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "whatsapp_platform.db";

export type SqliteParams = SQLite.SQLiteBindParams;

export interface SqliteStatement {
  execute(params?: SqliteParams): Promise<void>;
  finalize(): Promise<void>;
}

export interface SqliteExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqliteParams): Promise<void>;
  first<T>(sql: string, params?: SqliteParams): Promise<T | null>;
  all<T>(sql: string, params?: SqliteParams): Promise<T[]>;
  prepare(sql: string): Promise<SqliteStatement>;
}

class ExpoSqliteExecutor implements SqliteExecutor {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  exec(sql: string) {
    return this.database.execAsync(sql);
  }

  async run(sql: string, params?: SqliteParams) {
    if (params === undefined) {
      await this.database.runAsync(sql);
      return;
    }
    await this.database.runAsync(sql, params);
  }

  first<T>(sql: string, params?: SqliteParams) {
    if (params === undefined) {
      return this.database.getFirstAsync<T>(sql);
    }
    return this.database.getFirstAsync<T>(sql, params);
  }

  all<T>(sql: string, params?: SqliteParams) {
    if (params === undefined) {
      return this.database.getAllAsync<T>(sql);
    }
    return this.database.getAllAsync<T>(sql, params);
  }

  async prepare(sql: string): Promise<SqliteStatement> {
    const statement = await this.database.prepareAsync(sql);
    return {
      execute: async (params) => {
        if (params === undefined) {
          await statement.executeAsync();
          return;
        }
        await statement.executeAsync(params);
      },
      finalize: () => statement.finalizeAsync(),
    };
  }
}

class SqliteClient {
  private databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  private getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = (async () => {
        const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
        await database.execAsync(`
          PRAGMA journal_mode = WAL;
          PRAGMA foreign_keys = ON;
        `);
        return database;
      })();
    }
    return this.databasePromise;
  }

  private enqueue<T>(task: () => Promise<T>) {
    const run = async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await task();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const retryable =
            /database is locked|cannot start a transaction|cannot rollback/i.test(message);
          if (!retryable || attempt >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 25 * (2 ** attempt)));
        }
      }
    };

    const result = this.operationQueue.then(run, run);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  read<T>(task: (database: SqliteExecutor) => Promise<T>) {
    return this.enqueue(async () => {
      const database = await this.getDatabase();
      return task(new ExpoSqliteExecutor(database));
    });
  }

  write<T>(task: (database: SqliteExecutor) => Promise<T>) {
    return this.read(task);
  }

  transaction<T>(task: (transaction: SqliteExecutor) => Promise<T>) {
    return this.enqueue(async () => {
      const database = await this.getDatabase();
      const transaction = new ExpoSqliteExecutor(database);
      await database.execAsync("BEGIN IMMEDIATE");
      try {
        const result = await task(transaction);
        await database.execAsync("COMMIT");
        return result;
      } catch (error) {
        try {
          await database.execAsync("ROLLBACK");
        } catch {
          // Preserve the operation error when rollback also fails.
        }
        throw error;
      }
    });
  }
}

export const sqliteClient = new SqliteClient();
