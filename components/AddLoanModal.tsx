'use client';

import { useState, useEffect } from 'react';
import { Loan, LoanTenureUnit } from '@/types';
import styles from './AddLoanModal.module.css';

// Newton-Raphson EMI interest calculator (mirrors server-side)
function calcInterestRate(principal: number, emi: number, totalMonths: number): number {
  if (emi <= 0 || totalMonths <= 0 || principal <= 0) return 0;
  if (emi * totalMonths <= principal) return 0;
  let r = 0.01;
  for (let i = 0; i < 100; i++) {
    const pow = Math.pow(1 + r, totalMonths);
    const f = (principal * r * pow) / (pow - 1) - emi;
    const df =
      (principal * pow * (1 + r * totalMonths - pow + r * totalMonths * (pow - 1))) /
      Math.pow(pow - 1, 2);
    const rNew = r - f / df;
    if (Math.abs(rNew - r) < 1e-10) { r = rNew; break; }
    r = rNew;
  }
  return Math.round(r * 12 * 10000) / 100;
}

interface Props {
  existing: Loan | null;
  onClose: () => void;
  onSaved: (loan: Loan) => void;
}

export default function AddLoanModal({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [emiAmount, setEmiAmount] = useState('');
  const [tenureValue, setTenureValue] = useState('');
  const [tenureUnit, setTenureUnit] = useState<LoanTenureUnit>('years');
  const [emiStartDate, setEmiStartDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setPrincipal(String(existing.principal));
      setEmiAmount(String(existing.emi_amount));
      setTenureValue(String(existing.tenure_value));
      setTenureUnit(existing.tenure_unit);
      setEmiStartDate(existing.emi_start_date);
    }
  }, [existing]);

  const principalNum = Number(principal);
  const emiNum = Number(emiAmount);
  const tenureNum = Number(tenureValue);
  const totalMonths = tenureUnit === 'years' ? tenureNum * 12 : tenureNum;
  const previewRate =
    principalNum > 0 && emiNum > 0 && totalMonths > 0
      ? calcInterestRate(principalNum, emiNum, totalMonths)
      : null;
  const totalPayable = emiNum > 0 && totalMonths > 0 ? emiNum * totalMonths : null;
  const totalInterest =
    totalPayable != null && principalNum > 0 ? totalPayable - principalNum : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Loan name is required.'); return; }
    if (!principalNum || principalNum <= 0) { setError('Principal must be positive.'); return; }
    if (!emiNum || emiNum <= 0) { setError('EMI amount must be positive.'); return; }
    if (!tenureNum || tenureNum <= 0) { setError('Tenure must be positive.'); return; }
    if (!emiStartDate) { setError('EMI start date is required.'); return; }

    setSaving(true);
    try {
      const url = existing ? `/api/loans/${existing.id}` : '/api/loans';
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          principal: principalNum,
          emi_amount: emiNum,
          tenure_value: tenureNum,
          tenure_unit: tenureUnit,
          emi_start_date: emiStartDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save loan.');
        return;
      }

      onSaved(data.loan);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{existing ? 'Edit Loan' : 'Add Loan'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="none" width={18} height={18}>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Loan Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. Home Loan – HDFC"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Principal Amount (₹)</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 2500000"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>EMI Amount (₹ / month)</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 22000"
                value={emiAmount}
                onChange={(e) => setEmiAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Tenure</label>
              <input
                className={styles.input}
                type="number"
                min="1"
                step="1"
                placeholder={tenureUnit === 'years' ? 'e.g. 20' : 'e.g. 240'}
                value={tenureValue}
                onChange={(e) => setTenureValue(e.target.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Unit</label>
              <select
                className={styles.select}
                value={tenureUnit}
                onChange={(e) => setTenureUnit(e.target.value as LoanTenureUnit)}
              >
                <option value="years">Years</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>EMI Start Date</label>
            <input
              className={styles.input}
              type="date"
              value={emiStartDate}
              onChange={(e) => setEmiStartDate(e.target.value)}
              required
            />
          </div>

          {/* Live preview */}
          {previewRate !== null && (
            <div className={styles.previewCard}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Interest Rate (auto-calculated)</span>
                <span className={styles.previewRate}>{previewRate.toFixed(2)}% p.a.</span>
              </div>
              {totalPayable !== null && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Total Payable</span>
                  <span className={styles.previewValue}>
                    ₹{totalPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
              {totalInterest !== null && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Total Interest</span>
                  <span className={styles.previewInterest}>
                    ₹{totalInterest.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
              {totalMonths > 0 && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Total EMIs</span>
                  <span className={styles.previewValue}>{totalMonths} months</span>
                </div>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : existing ? 'Update Loan' : 'Add Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
