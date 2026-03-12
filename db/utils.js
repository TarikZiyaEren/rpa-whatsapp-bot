function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapExecRows(result) {
  try {
    if (!result) {
      console.warn("[DB][UTIL] mapExecRows: result undefined");
      return [];
    }

    if (!Array.isArray(result) || result.length === 0) {
      return [];
    }

    const table = result[0];

    if (!table.columns || !table.values) {
      console.warn("[DB][UTIL] mapExecRows: columns veya values yok", table);
      return [];
    }

    const cols = table.columns;
    const rows = table.values;

    return rows.map((row) =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    );
  } catch (err) {
    console.error("[DB][UTIL] mapExecRows hatası:", err.message);
    console.error(err.stack);
    return [];
  }
}

module.exports = {
  uid,
  mapExecRows,
};