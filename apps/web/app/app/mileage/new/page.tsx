"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

interface Job {
  id: string;
  title: string;
}

export default function NewMileagePage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [form, setForm] = useState({
    trip_date: new Date().toISOString().slice(0, 10),
    miles: "",
    purpose: "",
    notes: "",
    job_id: "",
  });

  useEffect(() => {
    fetch("/api/v1/jobs?limit=200")
      .then(r => r.json())
      .then(d => setJobs(d.data ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const miles = parseFloat(form.miles);
    if (isNaN(miles) || miles <= 0) { setError("Enter a positive mileage amount"); return; }
    if (!form.purpose.trim()) { setError("Purpose is required"); return; }
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/v1/mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_date: form.trip_date,
          miles,
          purpose: form.purpose.trim(),
          notes: form.notes.trim() || null,
          job_id: form.job_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Failed to log trip"); return; }
      router.push("/app/mileage");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href={"/app/mileage" as Route} className="back-link">← Mileage</Link>
          <h1 className="page-title">Log Trip</h1>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <form onSubmit={handleSubmit} className="p7-form-stack">
          {error && <p className="error-inline" role="alert">{error}</p>}

          <div className="form-group">
            <label htmlFor="trip-date">Date</label>
            <input
              id="trip-date"
              type="date"
              value={form.trip_date}
              onChange={e => setForm(f => ({ ...f, trip_date: e.target.value }))}
              required
              disabled={pending}
            />
          </div>

          <div className="form-group">
            <label htmlFor="trip-miles">Miles</label>
            <input
              id="trip-miles"
              type="number"
              step="0.1"
              min="0.1"
              value={form.miles}
              onChange={e => setForm(f => ({ ...f, miles: e.target.value }))}
              placeholder="e.g. 24.5"
              required
              disabled={pending}
            />
          </div>

          <div className="form-group">
            <label htmlFor="trip-purpose">Purpose</label>
            <input
              id="trip-purpose"
              type="text"
              value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              placeholder="e.g. Site visit to client property"
              required
              disabled={pending}
              maxLength={500}
            />
          </div>

          <div className="form-group">
            <label htmlFor="trip-job">Job (optional)</label>
            <select
              id="trip-job"
              value={form.job_id}
              onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}
              disabled={pending}
            >
              <option value="">None</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="trip-notes">Notes (optional)</label>
            <input
              id="trip-notes"
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional details"
              disabled={pending}
              maxLength={1000}
            />
          </div>

          <div className="p7-form-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Logging…" : "Log Trip"}
            </button>
            <Link href={"/app/mileage" as Route} className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
