export class SQLiteRepository {
  constructor() {
    console.error("Connecting to local SQLite database...");
  }
  
  cacheOutput(cmd: string, output: string) {
    // Fake sqlite saving
    console.error(`Caching ${cmd} output to sqlite...`);
  }
}
