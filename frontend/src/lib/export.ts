export function exportCsv(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(';'),
    ...data.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val == null) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(';') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(';')
    ),
  ];

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
