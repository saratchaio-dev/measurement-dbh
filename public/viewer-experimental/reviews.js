// Review persistence and CSV use the same normalized action field.
export const STORAGE_KEY = 'td008-experimental-review-decisions-v1';
const actions = new Set(['KEEP', 'REJECT', 'EDIT', 'UNREVIEWED']);
export function normalizeDecision(row) {
  const action = row.decision || row.action || ({'เอาต้นนี้':'KEEP','ไม่เอาต้นนี้':'REJECT','แก้ไขแล้ว':'EDIT'}[row.label]);
  if (!actions.has(action)) throw Error(`${row.tree_id}: ไม่มีคำตัดสินที่อ่านได้`);
  if (row.action && row.decision && row.action !== row.decision) throw Error(`${row.tree_id}: คำตัดสินขัดแย้งกัน`);
  return {...row, action, decision: action};
}
export function csvText(rows) {
  const fields = ['tree_id','decision','pom_m','diameter_cm','note','source_status','source_algorithm','updated_at'];
  const normalized = rows.map(normalizeDecision).filter(r=>r.action!=='UNREVIEWED').sort((a,b)=>a.tree_id.localeCompare(b.tree_id));
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [fields, ...normalized.map(r=>fields.map(k=>r[k]))].map(r=>r.map(cell).join(',')).join('\r\n') + '\r\n';
}
export async function syncReviews(records) {
  const response = await fetch('/api/reviews', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records})});
  if (!response.ok) throw Error(`บันทึกลงเครื่องไม่สำเร็จ (${response.status})`);
  return (await response.json()).records.map(normalizeDecision);
}
