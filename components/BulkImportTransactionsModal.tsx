'use client';

import { useRef, useState } from 'react';
import { FundBulkImportResult } from '@/types';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function BulkImportTransactionsModal({ onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FundBulkImportResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    setResult(null);
    const file = e.target.files?.[0];
    setFileName(file ? file.name : '');
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Choose a filled-in template file first.');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/transactions/bulk', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Could not import this file.');
        return;
      }

      setResult(data);
      if (data.imported > 0) {
        onImported();
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Bulk import investments</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <p style={styles.body}>
          Add many BUY/SELL transactions across funds in one go. Download the template below,
          fill it in, then upload it here — funds that don&rsquo;t exist yet are created
          automatically.
        </p>

        <a href="/api/transactions/template" download style={styles.templateLink}>
          ⬇ Download Excel template
        </a>

        <label style={styles.dropZone}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={styles.fileInput}
          />
          {fileName ? (
            <span style={styles.fileName}>{fileName}</span>
          ) : (
            <span style={styles.dropHint}>Click to choose a filled-in .xlsx file</span>
          )}
        </label>

        {error && <p style={styles.error}>{error}</p>}

        {result && (
          <div style={styles.resultBox}>
            <p style={styles.resultSummary}>
              Imported {result.imported} transaction{result.imported === 1 ? '' : 's'}
              {result.skipped > 0
                ? `, skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'}`
                : ''}
              .
            </p>
            {result.createdFunds.length > 0 && (
              <p style={styles.resultDetail}>
                New funds created: {result.createdFunds.join(', ')}
              </p>
            )}
            {result.errors.length > 0 && (
              <div style={styles.errorList}>
                {result.errors.map((e, i) => (
                  <p key={i} style={styles.errorRow}>
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              style={styles.submitBtn}
              disabled={uploading || !fileName}
              onClick={handleUpload}
            >
              {uploading ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(28, 27, 25, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 100,
  },
  modal: {
    width: '100%',
    maxWidth: '520px',
    maxHeight: '85vh',
    overflowY: 'auto',
    background: 'var(--paper-raised)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
    padding: '28px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--ink)',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '22px',
    color: 'var(--ink-faint)',
    lineHeight: 1,
    padding: '4px',
  },
  body: {
    fontSize: '13.5px',
    color: 'var(--ink-soft)',
    lineHeight: 1.5,
    margin: '0 0 18px',
  },
  templateLink: {
    display: 'inline-block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--ledger-green)',
    border: '1px solid var(--ledger-green)',
    borderRadius: '3px',
    padding: '9px 14px',
    marginBottom: '18px',
  },
  dropZone: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '64px',
    border: '1px dashed var(--hairline)',
    borderRadius: '4px',
    background: 'var(--paper)',
    cursor: 'pointer',
    marginBottom: '14px',
    padding: '12px',
    textAlign: 'center',
  },
  fileInput: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
    cursor: 'pointer',
  },
  fileName: {
    fontSize: '14px',
    color: 'var(--ink)',
    fontWeight: 500,
  },
  dropHint: {
    fontSize: '13px',
    color: 'var(--ink-faint)',
  },
  error: {
    fontSize: '13px',
    color: 'var(--brick)',
    margin: '0 0 12px',
  },
  resultBox: {
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    padding: '14px',
    marginBottom: '4px',
    background: 'var(--paper)',
  },
  resultSummary: {
    fontSize: '14px',
    color: 'var(--ink)',
    fontWeight: 600,
    margin: '0 0 6px',
  },
  resultDetail: {
    fontSize: '12.5px',
    color: 'var(--ink-soft)',
    margin: '0 0 6px',
  },
  errorList: {
    maxHeight: '160px',
    overflowY: 'auto',
    marginTop: '8px',
    borderTop: '1px solid var(--hairline)',
    paddingTop: '8px',
  },
  errorRow: {
    fontSize: '12.5px',
    color: 'var(--brick)',
    margin: '0 0 4px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '18px',
  },
  cancelBtn: {
    padding: '10px 16px',
    background: 'none',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    fontSize: '14px',
    color: 'var(--ink-soft)',
  },
  submitBtn: {
    padding: '10px 18px',
    background: 'var(--brass)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--paper-raised)',
  },
};
