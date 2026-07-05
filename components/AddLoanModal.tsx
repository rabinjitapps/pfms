'use client';

import { useState, useEffect } from 'react';
import { Loan, LoanTenureUnit, LoanType } from '@/types';
import {
  calcInterestRate,
  calcEmiFromRate,
  calcInterestOnlyPayment,
  calcOpenLoanMonthlyInterest,
} from '@/lib/loanMath';
import styles from './AddLoanModal.module.css';

interface Props {
  existing: Loan | null;
  onClose: () => void;
  onSaved: (loan: Loan) => void;
}

export default function AddLoanModal({ existing, onClose, onSaved }: Props) {
  const [loanType, setLoanType] = useState<LoanType>('standard');
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [emiAmount, setEmiAmount] = useState(''); // standard only
  const [tenureValue, setTenureValue] = useState('');
  const [tenureUnit, setTenureUnit] = useState<LoanTenureUnit>('years');
  const [emiStartDate, setEmiStartDate] = useState('');

  // flexi-only fields
  const [interestRateInput, setInterestRateInput] = useState('');
  const [interestOnlyValue, setInterestOnlyValue] = useState('');
  const [interestOnlyUnit, setInterestOnlyUnit] = useState<LoanTenureUnit>('years');

  // monthly-only field — the rate is entered per month here, but stored
  // (and shown everywhere else) as its annual equivalent, like every other loan.
  const [monthlyRateInput, setMonthlyRateInput] = useState('');

  // open-only fields — no fixed tenure; rate is annual %, and repaid-till-now
  // is a one-time adjustment applied to the starting outstanding balance.
  const [openRateInput, setOpenRateInput] = useState('');
  const [repaidTillNow, setRepaidTillNow] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setLoanType(existing.loan_type ?? 'standard');
      setName(existing.name);
      setPrincipal(String(existing.principal));
      setEmiAmount(String(existing.emi_amount));
      setTenureValue(String(existing.tenure_value));
      setTenureUnit(existing.tenure_unit);
      setEmiStartDate(existing.emi_start_date);
      setInterestRateInput(existing.interest_rate ? String(existing.interest_rate) : '');
      setMonthlyRateInput(existing.interest_rate ? String(existing.interest_rate / 12) : '');
      setInterestOnlyValue(existing.interest_only_value ? String(existing.interest_only_value) : '');
      setInterestOnlyUnit(existing.interest_only_unit ?? 'years');
      if (existing.loan_type === 'open') {
        setOpenRateInput(existing.interest_rate ? String(existing.interest_rate) : '');
        const alreadyRepaid = existing.principal - (existing.outstanding_principal ?? existing.principal);
        setRepaidTillNow(alreadyRepaid > 0 ? String(Math.round(alreadyRepaid * 100) / 100) : '');
      }
    }
  }, [existing]);

  const principalNum = Number(principal);
  const emiNum = Number(emiAmount);
  const tenureNum = Number(tenureValue);
  const totalMonths = tenureUnit === 'years' ? tenureNum * 12 : tenureNum;

  const rateNum = Number(interestRateInput);
  const monthlyRateNum = Number(monthlyRateInput);
  const ioValueNum = Number(interestOnlyValue);

  // open-loan derived values
  const openRateNum = Number(openRateInput);
  const repaidTillNowNum = Number(repaidTillNow) || 0;
  const openOutstanding = principalNum > 0 ? Math.max(0, principalNum - repaidTillNowNum) : 0;
  const hasLedgerHistory = !!(existing?.loan_type === 'open' && existing.ledger && existing.ledger.length > 0);
  const interestOnlyMonths =
    loanType === 'flexi' && ioValueNum > 0
      ? interestOnlyUnit === 'years'
        ? Math.round(ioValueNum * 12)
        : Math.round(ioValueNum)
      : 0;
  const amortizingMonths = totalMonths - interestOnlyMonths;

  // ── Live preview ──
  let previewRate: number | null = null;
  let previewEmi: number | null = null;
  let previewInterestOnlyPayment: number | null = null;
  let totalPayable: number | null = null;
  let totalInterest: number | null = null;
  let previewOpenInterest: number | null = null;
  let previewOpenOutstanding: number | null = null;

  if (loanType === 'open') {
    if (principalNum > 0 && openRateNum > 0) {
      previewRate = openRateNum;
      previewOpenOutstanding = openOutstanding;
      previewOpenInterest = calcOpenLoanMonthlyInterest(openOutstanding, openRateNum);
    }
  } else if (loanType === 'standard') {
    previewRate =
      principalNum > 0 && emiNum > 0 && totalMonths > 0
        ? calcInterestRate(principalNum, emiNum, totalMonths)
        : null;
    previewEmi = emiNum > 0 ? emiNum : null;
    totalPayable = emiNum > 0 && totalMonths > 0 ? emiNum * totalMonths : null;
    totalInterest = totalPayable != null && principalNum > 0 ? totalPayable - principalNum : null;
  } else if (loanType === 'monthly') {
    if (principalNum > 0 && monthlyRateNum > 0 && totalMonths > 0) {
      previewRate = monthlyRateNum * 12;
      previewEmi = calcEmiFromRate(principalNum, previewRate, totalMonths);
      totalPayable = previewEmi * totalMonths;
      totalInterest = totalPayable - principalNum;
    }
  } else {
    if (principalNum > 0 && rateNum > 0 && totalMonths > 0 && amortizingMonths > 0) {
      previewRate = rateNum;
      previewEmi = calcEmiFromRate(principalNum, rateNum, amortizingMonths);
      previewInterestOnlyPayment = calcInterestOnlyPayment(principalNum, rateNum);
      totalPayable =
        previewInterestOnlyPayment * interestOnlyMonths + previewEmi * amortizingMonths;
      totalInterest = totalPayable - principalNum;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Loan name is required.'); return; }
    if (!principalNum || principalNum <= 0) { setError('Principal must be positive.'); return; }
    if (!emiStartDate) { setError('Start date is required.'); return; }

    if (loanType === 'open') {
      if (!openRateNum || openRateNum <= 0) { setError('Interest rate must be positive.'); return; }
      if (repaidTillNowNum < 0 || repaidTillNowNum >= principalNum) {
        setError('Repaid till now must be zero or positive, and less than the principal.');
        return;
      }
    } else {
      if (!tenureNum || tenureNum <= 0) { setError('Tenure must be positive.'); return; }
      if (loanType === 'standard') {
        if (!emiNum || emiNum <= 0) { setError('EMI amount must be positive.'); return; }
      } else if (loanType === 'monthly') {
        if (!monthlyRateNum || monthlyRateNum <= 0) {
          setError('Monthly interest rate must be positive.');
          return;
        }
      } else {
        if (!rateNum || rateNum <= 0) { setError('Interest rate must be positive.'); return; }
        if (ioValueNum < 0) { setError('Interest-only period cannot be negative.'); return; }
        if (interestOnlyMonths >= totalMonths) {
          setError('Interest-only period must be shorter than the total tenure.');
          return;
        }
      }
    }

    setSaving(true);
    try {
      const url = existing ? `/api/loans/${existing.id}` : '/api/loans';
      const method = existing ? 'PATCH' : 'POST';

      const payload: Record<string, unknown> = {
        name: name.trim(),
        loan_type: loanType,
        principal: principalNum,
        emi_start_date: emiStartDate,
      };

      if (loanType === 'open') {
        payload.interest_rate = openRateNum;
        if (!hasLedgerHistory) {
          payload.repaid_till_now = repaidTillNowNum;
        }
      } else {
        payload.tenure_value = tenureNum;
        payload.tenure_unit = tenureUnit;
        if (loanType === 'standard') {
          payload.emi_amount = emiNum;
        } else if (loanType === 'monthly') {
          payload.monthly_interest_rate = monthlyRateNum;
        } else {
          payload.interest_rate = rateNum;
          payload.interest_only_value = ioValueNum || 0;
          payload.interest_only_unit = interestOnlyUnit;
        }
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

          {/* Loan type selector */}
          <div className={styles.field}>
            <label className={styles.label}>Loan Type</label>
            <div className={styles.typeToggle}>
              <button
                type="button"
                className={loanType === 'standard' ? `${styles.typeBtn} ${styles.typeBtnActive}` : styles.typeBtn}
                onClick={() => setLoanType('standard')}
              >
                Standard EMI
              </button>
              <button
                type="button"
                className={loanType === 'flexi' ? `${styles.typeBtn} ${styles.typeBtnActive}` : styles.typeBtn}
                onClick={() => setLoanType('flexi')}
              >
                Flexi (Interest-only + EMI)
              </button>
              <button
                type="button"
                className={loanType === 'monthly' ? `${styles.typeBtn} ${styles.typeBtnActive}` : styles.typeBtn}
                onClick={() => setLoanType('monthly')}
              >
                Monthly Rate (e.g. Instamoney)
              </button>
              <button
                type="button"
                className={loanType === 'open' ? `${styles.typeBtn} ${styles.typeBtnActive}` : styles.typeBtn}
                onClick={() => setLoanType('open')}
              >
                Open-Ended (No Fixed Tenure)
              </button>
            </div>
            {loanType === 'flexi' && (
              <p className={styles.typeHint}>
                Pay interest only for an initial period, then the loan converts to a regular EMI for the rest of the tenure.
              </p>
            )}
            {loanType === 'monthly' && (
              <p className={styles.typeHint}>
                For lenders that quote a monthly rate (common with short-term/instant loan apps). Enter the
                monthly % and it's shown everywhere else as the equivalent annual rate, just like other loans.
              </p>
            )}
            {loanType === 'open' && (
              <p className={styles.typeHint}>
                No fixed repayment period — each month you record either an interest-only payment (auto-calculated
                on the current balance) or an EMI-style payment of your choosing that also chips away at the
                principal. Interest recalculates every month off whatever the outstanding balance is at the time.
              </p>
            )}
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
            {loanType === 'open' ? (
              <div className={styles.field}>
                <label className={styles.label}>Interest Rate (% p.a.)</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 12"
                  value={openRateInput}
                  onChange={(e) => setOpenRateInput(e.target.value)}
                  required
                />
              </div>
            ) : loanType === 'standard' ? (
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
            ) : loanType === 'monthly' ? (
              <div className={styles.field}>
                <label className={styles.label}>Interest Rate (% per month)</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 4.33"
                  value={monthlyRateInput}
                  onChange={(e) => setMonthlyRateInput(e.target.value)}
                  required
                />
              </div>
            ) : (
              <div className={styles.field}>
                <label className={styles.label}>Interest Rate (% p.a.)</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 9.5"
                  value={interestRateInput}
                  onChange={(e) => setInterestRateInput(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {loanType === 'open' ? (
            <div className={styles.field}>
              <label className={styles.label}>Repaid Till Now (₹)</label>
              <input
                className={styles.input}
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 50000"
                value={repaidTillNow}
                onChange={(e) => setRepaidTillNow(e.target.value)}
                disabled={hasLedgerHistory}
              />
              {hasLedgerHistory ? (
                <p className={styles.typeHint}>
                  This loan already has recorded payments, so its outstanding balance is now managed from the
                  ledger instead — edit it from the loan card.
                </p>
              ) : (
                <p className={styles.typeHint}>
                  One-time adjustment: how much of the principal has already been paid off before adding it here.
                  Leave blank or 0 if none.
                </p>
              )}
            </div>
          ) : (
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Total Tenure</label>
                <input
                  className={styles.input}
                  type="number"
                  min="1"
                  step="1"
                  placeholder={tenureUnit === 'years' ? 'e.g. 7' : 'e.g. 84'}
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
          )}

          {loanType === 'flexi' && (
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Interest-only Period</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="1"
                  placeholder={interestOnlyUnit === 'years' ? 'e.g. 2' : 'e.g. 24'}
                  value={interestOnlyValue}
                  onChange={(e) => setInterestOnlyValue(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Unit</label>
                <select
                  className={styles.select}
                  value={interestOnlyUnit}
                  onChange={(e) => setInterestOnlyUnit(e.target.value as LoanTenureUnit)}
                >
                  <option value="years">Years</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>{loanType === 'open' ? 'Loan Start Date' : 'EMI Start Date'}</label>
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
                <span className={styles.previewLabel}>
                  {loanType === 'standard'
                    ? 'Interest Rate (auto-calculated)'
                    : loanType === 'monthly'
                    ? 'Interest Rate (annual equivalent)'
                    : 'Interest Rate'}
                </span>
                <span className={styles.previewRate}>{previewRate.toFixed(2)}% p.a.</span>
              </div>

              {loanType === 'open' && previewOpenOutstanding !== null && (
                <>
                  <div className={styles.previewRow}>
                    <span className={styles.previewLabel}>Starting Outstanding Balance</span>
                    <span className={styles.previewValue}>
                      ₹{previewOpenOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className={styles.previewRow}>
                    <span className={styles.previewLabel}>This Month&apos;s Interest (if interest-only)</span>
                    <span className={styles.previewValue}>
                      ₹{(previewOpenInterest ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}/mo
                    </span>
                  </div>
                </>
              )}

              {loanType === 'monthly' && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Monthly Rate</span>
                  <span className={styles.previewValue}>{monthlyRateNum.toFixed(2)}% / mo</span>
                </div>
              )}

              {loanType === 'flexi' && previewInterestOnlyPayment !== null && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>
                    Interest-only payment ({interestOnlyMonths} {interestOnlyMonths === 1 ? 'month' : 'months'})
                  </span>
                  <span className={styles.previewValue}>
                    ₹{previewInterestOnlyPayment.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/mo
                  </span>
                </div>
              )}

              {previewEmi !== null && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>
                    {loanType === 'flexi'
                      ? `EMI thereafter (${amortizingMonths} ${amortizingMonths === 1 ? 'month' : 'months'})`
                      : 'EMI'}
                  </span>
                  <span className={styles.previewValue}>
                    ₹{previewEmi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/mo
                  </span>
                </div>
              )}

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
                  <span className={styles.previewLabel}>Total Tenure</span>
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
