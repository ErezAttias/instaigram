'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface ValidationIssue {
  type: string
  severity: 'warning' | 'error'
  description: string
  affectedPosts: string[]
}

interface ValidationReport {
  overallScore: number
  issues: ValidationIssue[]
  suggestions: string[]
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-warning'
  if (score >= 40) return 'text-accent'
  return 'text-danger'
}

function getScoreRing(score: number): string {
  if (score >= 80) return 'border-success/20'
  if (score >= 60) return 'border-warning/20'
  if (score >= 40) return 'border-accent/20'
  return 'border-danger/20'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-success-dim'
  if (score >= 60) return 'bg-warning-dim'
  if (score >= 40) return 'bg-accent-dim'
  return 'bg-danger-dim'
}

export default function ValidationPage() {
  const params = useParams()
  const channelId = params.id as string
  const [report, setReport] = useState<ValidationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch(`/api/channels/${channelId}/validation-report`)
        if (!res.ok) throw new Error('Failed to fetch validation report')
        const data = await res.json()
        setReport(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [channelId])

  if (loading) {
    return (
      <div className="max-w-3xl pt-8">
        <div className="skeleton h-4 w-24 mb-6" />
        <div className="skeleton h-8 w-48 mb-8" />
        <div className="skeleton h-48 w-full mb-8" />
        <div className="space-y-3">
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl pt-16 text-center">
        <p className="text-danger text-[15px]">{error}</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="max-w-3xl pt-16 text-center">
        <p className="text-muted text-[15px]">No report available</p>
      </div>
    )
  }

  const errorCount = report.issues.filter((i) => i.severity === 'error').length
  const warningCount = report.issues.filter((i) => i.severity === 'warning').length

  return (
    <div className="max-w-3xl animate-fade-up">
      <Link
        href={`/channels/${channelId}`}
        className="text-muted hover:text-foreground text-[13px] transition-colors duration-200 inline-flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 3.5L5 7l3.5 3.5" />
        </svg>
        Dashboard
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mt-4 mb-10">Validation report</h1>

      {/* Score */}
      <div className={`animate-fade-up stagger-1 border rounded-2xl p-10 text-center mb-10 ${getScoreRing(report.overallScore)} ${getScoreBg(report.overallScore)}`}>
        <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em] mb-3">Overall score</p>
        <p className={`text-7xl font-bold tracking-tight ${getScoreColor(report.overallScore)}`}>
          {report.overallScore}
        </p>
        <div className="flex items-center justify-center gap-5 mt-5">
          {errorCount > 0 && (
            <span className="text-[13px] text-danger font-mono">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
          {warningCount > 0 && (
            <span className="text-[13px] text-warning font-mono">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          )}
          {report.issues.length === 0 && (
            <span className="text-[13px] text-success font-mono">No issues found</span>
          )}
        </div>
      </div>

      {/* Issues */}
      {report.issues.length > 0 && (
        <div className="mb-10">
          <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em] mb-4">Issues</p>
          <div className="space-y-2.5">
            {report.issues.map((issue, i) => (
              <div
                key={i}
                className={`animate-fade-up border rounded-xl p-4 transition-colors duration-200 ${
                  issue.severity === 'error'
                    ? 'border-danger/15 bg-danger-dim'
                    : 'border-warning/15 bg-warning-dim'
                }`}
                style={{ animationDelay: `${(i + 2) * 60}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider shrink-0 mt-0.5 ${
                      issue.severity === 'error' ? 'text-danger bg-danger/15' : 'text-warning bg-warning/15'
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <div>
                    <p className="text-[14px] leading-relaxed">{issue.description}</p>
                    <p className="text-[11px] text-muted font-mono mt-1.5">
                      {issue.affectedPosts.length} post{issue.affectedPosts.length !== 1 ? 's' : ''} affected
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {report.suggestions.length > 0 && (
        <div className="animate-fade-up stagger-4">
          <p className="text-[10px] font-mono text-muted uppercase tracking-[0.15em] mb-4">Suggestions</p>
          <div className="bg-surface border border-border rounded-xl p-5">
            <ul className="space-y-3">
              {report.suggestions.map((suggestion, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
                  <span className="text-accent shrink-0 mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5.5 3.5L9 7l-3.5 3.5" />
                    </svg>
                  </span>
                  <span className="text-muted-light">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
