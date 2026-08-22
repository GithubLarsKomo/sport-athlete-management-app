export function createDatabase(config) {
  let poolPromise;
  async function pool() {
    if (!poolPromise) {
      poolPromise = import('mariadb').then(({ default: mariadb }) => mariadb.createPool({
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
        connectionLimit: config.db.connectionLimit,
        bigIntAsNumber: true,
        insertIdAsNumber: true
      }));
    }
    return poolPromise;
  }
  return {
    async query(sql, params = []) {
      const p = await pool();
      return p.query(sql, params);
    },
    async transaction(fn) {
      const p = await pool();
      const conn = await p.getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
      } finally {
        conn.release();
      }
    },
    async close() {
      if (!poolPromise) return;
      const p = await poolPromise;
      await p.end();
    }
  };
}
