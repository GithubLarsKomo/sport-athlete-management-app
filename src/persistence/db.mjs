function postgresParameters(statement) {
  let index = 0;
  let result = '';
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < statement.length; i += 1) {
    const char = statement[i];
    const next = statement[i + 1];

    if (lineComment) {
      result += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      result += char;
      if (char === '*' && next === '/') {
        result += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (!single && !double && char === '-' && next === '-') {
      result += '--';
      i += 1;
      lineComment = true;
      continue;
    }
    if (!single && !double && char === '/' && next === '*') {
      result += '/*';
      i += 1;
      blockComment = true;
      continue;
    }
    if (!double && char === "'") {
      result += char;
      if (single && next === "'") {
        result += next;
        i += 1;
      } else {
        single = !single;
      }
      continue;
    }
    if (!single && char === '"') {
      result += char;
      if (double && next === '"') {
        result += next;
        i += 1;
      } else {
        double = !double;
      }
      continue;
    }
    if (!single && !double && char === '?') {
      index += 1;
      result += `$${index}`;
      continue;
    }
    result += char;
  }
  return result;
}

export function toPostgresQuery(statement) {
  return postgresParameters(statement);
}

function queryClient(sql) {
  return {
    async query(statement, params = []) {
      return sql.unsafe(postgresParameters(statement), params);
    }
  };
}

export function createDatabase(config) {
  let sqlPromise;

  async function pool() {
    if (!sqlPromise) {
      sqlPromise = import('postgres').then(({ default: postgres }) => postgres(config.db.url, {
        max: config.db.poolMax,
        connect_timeout: 10,
        idle_timeout: 20,
        max_lifetime: 60 * 60,
        prepare: true
      }));
    }
    return sqlPromise;
  }

  return {
    async query(statement, params = []) {
      const sql = await pool();
      return queryClient(sql).query(statement, params);
    },
    async transaction(fn) {
      const sql = await pool();
      return sql.begin(async tx => fn(queryClient(tx)));
    },
    async close() {
      if (!sqlPromise) return;
      const sql = await sqlPromise;
      await sql.end({ timeout: 5 });
    }
  };
}
