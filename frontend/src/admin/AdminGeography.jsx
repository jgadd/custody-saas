import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

/**
 * AdminGeography
 *
 * Super Admin page for managing the national Province -> District ->
 * Suburb reference data used throughout booking forms (Province of
 * Origin, station Province/District, Residential Suburb). Replaces
 * the earlier hardcoded JS list and per-station suburb field — this
 * is now real, editable data with CSV bulk import/export.
 */
export default function AdminGeography() {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // provinceId -> bool
  const [expandedDistrict, setExpandedDistrict] = useState({}); // districtId -> bool
  const [newProvince, setNewProvince] = useState('');
  const [newDistrict, setNewDistrict] = useState({}); // provinceId -> text
  const [newSuburb, setNewSuburb] = useState({}); // districtId -> text
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.get('/admin/geography').then(r => setTree(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleProvince = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const toggleDistrict = (id) => setExpandedDistrict(e => ({ ...e, [id]: !e[id] }));

  const addProvince = async () => {
    if (!newProvince.trim()) return;
    try {
      await api.post('/admin/geography/provinces', { name: newProvince.trim() });
      setNewProvince('');
      load();
    } catch (e) { setMsg(e.response?.data?.error || 'Failed to add province'); }
  };

  const deleteProvince = async (id, name) => {
    if (!confirm(`Delete "${name}" and all its districts/suburbs? This can't be undone.`)) return;
    await api.delete(`/admin/geography/provinces/${id}`);
    load();
  };

  const addDistrict = async (provinceId) => {
    const name = (newDistrict[provinceId] || '').trim();
    if (!name) return;
    try {
      await api.post('/admin/geography/districts', { name, provinceId });
      setNewDistrict(d => ({ ...d, [provinceId]: '' }));
      load();
    } catch (e) { setMsg(e.response?.data?.error || 'Failed to add district'); }
  };

  const deleteDistrict = async (id, name) => {
    if (!confirm(`Delete "${name}" and all its suburbs? This can't be undone.`)) return;
    await api.delete(`/admin/geography/districts/${id}`);
    load();
  };

  const addSuburb = async (districtId) => {
    const name = (newSuburb[districtId] || '').trim();
    if (!name) return;
    try {
      await api.post('/admin/geography/suburbs', { name, districtId });
      setNewSuburb(s => ({ ...s, [districtId]: '' }));
      load();
    } catch (e) { setMsg(e.response?.data?.error || 'Failed to add suburb'); }
  };

  const deleteSuburb = async (id) => {
    await api.delete(`/admin/geography/suburbs/${id}`);
    load();
  };

  const downloadTemplate = async () => {
    const res = await api.get('/admin/geography/csv-template', { responseType: 'blob' });
    downloadBlob(res.data, 'png-geography-template.csv');
  };

  const downloadExport = async () => {
    const res = await api.get('/admin/geography/export', { responseType: 'blob' });
    downloadBlob(res.data, 'png-geography-export.csv');
  };

  const downloadBlob = (data, filename) => {
    const url = window.URL.createObjectURL(new Blob([data]));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/admin/geography/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      load();
    } catch (err) {
      setImportResult({ errors: [err.response?.data?.error || 'Import failed'] });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalDistricts = tree.reduce((sum, p) => sum + p.districts.length, 0);
  const totalSuburbs = tree.reduce((sum, p) => sum + p.districts.reduce((s, d) => s + d.suburbs.length, 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1><i className="ti ti-map-2" /> PNG Geography</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {tree.length} provinces · {totalDistricts} districts · {totalSuburbs} suburbs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
            <i className="ti ti-download" /> CSV Template
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadExport}>
            <i className="ti ti-file-export" /> Export Current Data
          </button>
          <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
            <i className="ti ti-upload" /> {importing ? 'Importing...' : 'Import CSV'}
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelected} style={{ display: 'none' }} disabled={importing} />
          </label>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
        <i className="ti ti-info-circle" />
        CSV columns: <strong>Province, District, Suburb</strong>. Suburb may be left blank to register a district with no suburbs yet.
        Existing entries with matching names are reused, not duplicated — safe to re-import a corrected file.
      </div>

      {importResult && (
        <div className={`alert ${importResult.errors?.length ? 'alert-warn' : 'alert-success'}`} style={{ marginBottom: '1rem' }}>
          <div>
            {importResult.provincesCreated != null && (
              <div>
                <i className="ti ti-circle-check" /> Imported: {importResult.provincesCreated} new provinces,
                {' '}{importResult.districtsCreated} new districts, {importResult.suburbsCreated} new suburbs.
                {importResult.rowsSkipped > 0 && ` ${importResult.rowsSkipped} rows skipped.`}
              </div>
            )}
            {importResult.errors?.length > 0 && (
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                {importResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                {importResult.errors.length > 10 && <li>...and {importResult.errors.length - 10} more</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      {msg && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{msg}</div>}

      <div className="card">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <input
            value={newProvince}
            onChange={e => setNewProvince(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addProvince(); }}
            placeholder="Add a new province..."
            style={{ maxWidth: 320 }}
          />
          <button className="btn btn-primary btn-sm" onClick={addProvince}><i className="ti ti-plus" /> Add Province</button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : tree.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No provinces yet. Add one above, or import a CSV file.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tree.map(province => (
              <div key={province.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', cursor: 'pointer' }}
                  onClick={() => toggleProvince(province.id)}
                >
                  <i className={`ti ti-chevron-${expanded[province.id] ? 'down' : 'right'}`} />
                  <span style={{ fontWeight: 700, flex: 1 }}>{province.name}</span>
                  <span className="badge badge-gold">{province.districts.length} districts</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => { e.stopPropagation(); deleteProvince(province.id, province.name); }}
                  ><i className="ti ti-trash" /></button>
                </div>

                {expanded[province.id] && (
                  <div style={{ padding: '0 1rem 1rem 2.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <input
                        value={newDistrict[province.id] || ''}
                        onChange={e => setNewDistrict(d => ({ ...d, [province.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addDistrict(province.id); }}
                        placeholder="Add a district..."
                        style={{ maxWidth: 260, fontSize: '0.85rem' }}
                      />
                      <button className="btn btn-ghost btn-sm" onClick={() => addDistrict(province.id)}>+ Add</button>
                    </div>

                    {province.districts.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No districts yet.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {province.districts.map(district => (
                          <div key={district.id} style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--navy-700)' }}>
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}
                              onClick={() => toggleDistrict(district.id)}
                            >
                              <i className={`ti ti-chevron-${expandedDistrict[district.id] ? 'down' : 'right'}`} style={{ fontSize: '0.8rem' }} />
                              <span style={{ flex: 1 }}>{district.name}</span>
                              <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{district.suburbs.length} suburbs</span>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => { e.stopPropagation(); deleteDistrict(district.id, district.name); }}
                              ><i className="ti ti-trash" style={{ fontSize: '0.8rem' }} /></button>
                            </div>

                            {expandedDistrict[district.id] && (
                              <div style={{ padding: '0 0.75rem 0.75rem 2rem' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                  <input
                                    value={newSuburb[district.id] || ''}
                                    onChange={e => setNewSuburb(s => ({ ...s, [district.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') addSuburb(district.id); }}
                                    placeholder="Add a suburb..."
                                    style={{ maxWidth: 220, fontSize: '0.8rem' }}
                                  />
                                  <button className="btn btn-ghost btn-sm" onClick={() => addSuburb(district.id)}>+ Add</button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  {district.suburbs.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No suburbs yet.</span>}
                                  {district.suburbs.map(s => (
                                    <span key={s.id} className="badge badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                      {s.name}
                                      <button
                                        onClick={() => deleteSuburb(s.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}
                                        aria-label={`Remove ${s.name}`}
                                      >✕</button>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
