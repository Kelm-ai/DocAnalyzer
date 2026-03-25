import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useParams } from "react-router-dom"
import * as XLSX from "xlsx"
import { Document, Page, pdfjs } from "react-pdf"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

import { api } from "@/lib/api"
import type { ComplianceReport, EvaluationDocument, Framework } from "@/lib/api"
import {
  CONFIDENCE_NOTES,
  feedbackToReviewState,
  mapRequirementToResultsV2ViewModel,
  STATUS_ORDER,
  type CitationReference,
  type NarrativeItem,
  type RequirementDetailViewModel,
  type ResultsV2ReviewState,
  type ResultsV2Status,
  type SourceGroup,
} from "@/lib/results-v2"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

type FeedbackEntry = {
  isHelpful: boolean | null
  comment: string
  isSaving: boolean
  error: string | null
}

type ActiveCitationState = {
  source: CitationReference
  sources: CitationReference[]
  index: number
}

function createDefaultFeedbackEntry(): FeedbackEntry {
  return {
    isHelpful: null,
    comment: "",
    isSaving: false,
    error: null,
  }
}

function formatSourceLabel(source: CitationReference, index: number): string {
  if (typeof source.label === "string" && source.label.trim().length > 0) {
    return source.label.trim()
  }
  const pageNumber = parseCitationPageNumber(source.page_number)
  if (pageNumber != null) {
    return `p.${pageNumber}`
  }
  return `Evidence ${index + 1}`
}

function parseCitationPageNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === "string") {
    const match = value.match(/\d+/)
    if (!match) {
      return null
    }
    const parsed = Number.parseInt(match[0], 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return null
}

function normalizeDocumentName(value?: string | null): string {
  return (value ?? "").trim().toLowerCase()
}

function normalizeCitationText(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > 0 ? normalized : null
}

function getCitationHighlightText(source: CitationReference): string | null {
  const excerpt = normalizeCitationText(source.excerpt)
  if (excerpt) {
    return excerpt
  }

  const supports = normalizeCitationText(source.supports)
  if (supports) {
    return supports
  }

  const section = normalizeCitationText(source.section_title)
  if (section) {
    return section
  }

  return normalizeCitationText(source.location)
}

function getCitationSearchText(source: CitationReference): string | null {
  const highlightText = getCitationHighlightText(source)
  if (!highlightText) {
    return null
  }
  return highlightText.length > 180 ? `${highlightText.slice(0, 177)}...` : highlightText
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const HIGHLIGHT_STOP_WORDS = new Set([
  "about", "after", "again", "along", "also", "although", "among", "because", "before", "being",
  "below", "between", "document", "during", "every", "first", "found", "from", "further", "having",
  "highlight", "however", "including", "into", "location", "page", "section", "should", "since",
  "source", "supports", "than", "that", "their", "there", "these", "this", "those", "through",
  "under", "using", "where", "which", "while", "with", "within",
])

function tokenizeForPassageMatch(text: string | null): string[] {
  if (!text) {
    return []
  }
  return text
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function getHighlightPhrases(text: string | null): string[] {
  if (!text) {
    return []
  }

  const normalized = text
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()

  if (normalized.length < 12) {
    return []
  }

  const candidates: string[] = []
  if (normalized.length <= 180) {
    candidates.push(normalized)
  }

  const sentenceMatch = normalized.match(/^(.{20,240}?[.!?;:])(?:\s|$)/)
  if (sentenceMatch?.[1]) {
    candidates.push(sentenceMatch[1].trim())
  }

  const quotedPhrases = Array.from(normalized.matchAll(/["']([^"']{12,200})["']/g))
    .map((match) => match[1].trim())
    .slice(0, 2)
  candidates.push(...quotedPhrases)

  const seen = new Set<string>()
  const phrases: string[] = []
  for (const candidate of candidates) {
    const compact = candidate.replace(/\s+/g, " ").trim()
    const key = compact.toLowerCase()
    if (!compact || seen.has(key)) {
      continue
    }
    if (compact.length < 12 || compact.split(" ").length < 2) {
      continue
    }
    seen.add(key)
    phrases.push(compact)
    if (phrases.length >= 3) {
      break
    }
  }

  return phrases
}

function getHeadingHighlightPhrases(sectionTitle: string | null): string[] {
  if (!sectionTitle) {
    return []
  }

  const normalized = sectionTitle
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()

  if (normalized.length < 3) {
    return []
  }

  const candidates = [normalized]
  const splitByColon = normalized.split(/[:\-–—]/).map((part) => part.trim()).filter(Boolean)
  candidates.push(...splitByColon)
  const withoutSectionLabel = normalized.replace(/^(section|clause|sec)\s+/i, "").trim()
  if (withoutSectionLabel && withoutSectionLabel !== normalized) {
    candidates.push(withoutSectionLabel)
  }
  const withoutLeadingNumber = withoutSectionLabel
    .replace(/^\d+(?:\.\d+)*[a-z]?\s*[:.)-]?\s*/i, "")
    .trim()
  if (withoutLeadingNumber && withoutLeadingNumber !== withoutSectionLabel) {
    candidates.push(withoutLeadingNumber)
  }
  const sectionIdMatches = normalized.match(/\b\d+(?:\.\d+){1,5}[a-z]?\b/gi) ?? []
  candidates.push(...sectionIdMatches)

  const seen = new Set<string>()
  const phrases: string[] = []
  for (const candidate of candidates) {
    const compact = candidate.replace(/\s+/g, " ").trim()
    const key = compact.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    const tokenCount = tokenizeForPassageMatch(compact).length
    const isSectionId = /^\d+(?:\.\d+){1,5}[a-z]?$/i.test(compact)
    if (isSectionId || (compact.length >= 6 && tokenCount >= 1)) {
      phrases.push(compact)
    }
    if (phrases.length >= 6) {
      break
    }
  }

  return phrases
}

function getPassageChunks(text: string | null): { chunks: string[]; tokenSet: Set<string> } | null {
  if (!text) {
    return null
  }

  const tokens = tokenizeForPassageMatch(text)
  if (tokens.length < 3) {
    return null
  }

  const chunkLengths = tokens.length >= 14
    ? [6, 5, 4]
    : tokens.length >= 10
      ? [5, 4, 3]
      : tokens.length >= 7
        ? [4, 3]
        : [3]

  const chunks: string[] = []
  const seenChunks = new Set<string>()

  for (const chunkLength of chunkLengths) {
    if (chunkLength > tokens.length) {
      continue
    }
    for (let index = 0; index <= tokens.length - chunkLength; index += 1) {
      const slice = tokens.slice(index, index + chunkLength)
      const meaningfulTokens = slice.filter((token) => !HIGHLIGHT_STOP_WORDS.has(token))
      if (meaningfulTokens.length < Math.max(2, Math.ceil(chunkLength * 0.5))) {
        continue
      }

      const chunk = slice.join(" ")
      if (seenChunks.has(chunk)) {
        continue
      }
      seenChunks.add(chunk)
      chunks.push(chunk)

      if (chunks.length >= 28) {
        break
      }
    }
    if (chunks.length >= 28) {
      break
    }
  }

  if (chunks.length === 0) {
    return null
  }

  const tokenSet = new Set(
    tokens.filter((token) => token.length >= 4 && !HIGHLIGHT_STOP_WORDS.has(token))
  )
  return { chunks, tokenSet }
}

function resolveCitationDocument(
  source: CitationReference,
  documents: EvaluationDocument[]
): EvaluationDocument | null {
  if (documents.length === 0) {
    return null
  }

  const citationName = normalizeDocumentName(source.document_name)
  if (citationName) {
    const exactMatch = documents.find((document) => normalizeDocumentName(document.file_name) === citationName)
    if (exactMatch) {
      return exactMatch
    }

    const looseMatch = documents.find((document) => {
      const fileName = normalizeDocumentName(document.file_name)
      return fileName.includes(citationName) || citationName.includes(fileName)
    })
    if (looseMatch) {
      return looseMatch
    }
  }

  if (documents.length === 1) {
    return documents[0]
  }

  return documents.find((document) => document.document_role === "primary") ?? documents[0]
}

function isDocumentPreviewAvailable(document: EvaluationDocument | null): boolean {
  return Boolean(document && !document.storage_deleted_at)
}

const PDF_PAGE_WINDOW_RADIUS = 5

function SourceViewerModal({
  evaluationId,
  source,
  document,
  citationIndex,
  citationCount,
  canGoToPrevCitation,
  canGoToNextCitation,
  onPrevCitation,
  onNextCitation,
  onClose,
}: {
  evaluationId: string
  source: CitationReference
  document: EvaluationDocument | null
  citationIndex: number
  citationCount: number
  canGoToPrevCitation: boolean
  canGoToNextCitation: boolean
  onPrevCitation: () => void
  onNextCitation: () => void
  onClose: () => void
}) {
  const previewAvailable = isDocumentPreviewAvailable(document)
  const highlightText = getCitationHighlightText(source)
  const searchHint = getCitationSearchText(source)
  const citationPageNumber = parseCitationPageNumber(source.page_number)
  const pdfUrl = previewAvailable && document
    ? api.getEvaluationDocumentContentUrl(evaluationId, document.id)
    : null
  const initialPage = citationPageNumber ?? 1
  const [activePage, setActivePage] = useState(initialPage)
  const [visiblePage, setVisiblePage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const lastStrongMatchIndexRef = useRef<number | null>(null)
  const pdfScrollRef = useRef<HTMLDivElement | null>(null)
  const pageAnchorsRef = useRef<Record<number, HTMLDivElement | null>>({})
  const nextScrollBehaviorRef = useRef<ScrollBehavior>("auto")

  useEffect(() => {
    pageAnchorsRef.current = {}
    setTotalPages(null)
    setPdfError(null)
  }, [document?.id])

  useEffect(() => {
    nextScrollBehaviorRef.current = "auto"
    setActivePage(initialPage)
    setVisiblePage(initialPage)
  }, [highlightText, initialPage])

  const clampedPage = useMemo(() => {
    if (!totalPages) {
      return Math.max(1, activePage)
    }
    return Math.min(Math.max(1, activePage), totalPages)
  }, [activePage, totalPages])
  const currentDisplayPage = useMemo(() => {
    if (!totalPages) {
      return Math.max(1, visiblePage)
    }
    return Math.min(Math.max(1, visiblePage), totalPages)
  }, [visiblePage, totalPages])

  const highlightPhraseRegexes = useMemo(() => {
    return getHighlightPhrases(highlightText).map((phrase) => {
      const escapedPhrase = escapeRegExp(escapeHtml(phrase)).replace(/\s+/g, "\\s+")
      return new RegExp(`(${escapedPhrase})`, "gi")
    })
  }, [highlightText])

  const headingPhraseRegexes = useMemo(() => {
    return getHeadingHighlightPhrases(normalizeCitationText(source.section_title)).map((phrase) => {
      if (/^\d+(?:\.\d+){1,5}[a-z]?$/i.test(phrase)) {
        const parts = phrase.match(/\d+|[a-z]+/gi) ?? [phrase]
        const flexiblePattern = parts.join("(?:\\s*[.\\-]\\s*|\\s+)")
        return new RegExp(`(${flexiblePattern})`, "gi")
      }
      const escapedPhrase = escapeRegExp(escapeHtml(phrase)).replace(/\s+/g, "\\s+")
      return new RegExp(`(${escapedPhrase})`, "gi")
    })
  }, [source.section_title])

  const passageChunks = useMemo(() => getPassageChunks(highlightText), [highlightText])

  useEffect(() => {
    lastStrongMatchIndexRef.current = null
  }, [pdfUrl, clampedPage, highlightText])

  const renderHighlightedText = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) => {
      let rendered = escapeHtml(str ?? "")
      let headingMatched = false
      let phraseMatched = false

      for (const headingRegex of headingPhraseRegexes) {
        const next = rendered.replace(
          headingRegex,
          '<mark class="rv2-pdf-highlight rv2-pdf-highlight-heading">$1</mark>'
        )
        if (next !== rendered) {
          headingMatched = true
          rendered = next
        }
      }

      for (const phraseRegex of highlightPhraseRegexes) {
        const next = rendered.replace(phraseRegex, '<mark class="rv2-pdf-highlight">$1</mark>')
        if (next !== rendered) {
          phraseMatched = true
          rendered = next
        }
      }

      if (headingMatched || phraseMatched || !passageChunks) {
        return rendered
      }

      const lineTokens = tokenizeForPassageMatch(str)
      if (lineTokens.length === 0) {
        return rendered
      }

      const normalizedLine = ` ${lineTokens.join(" ")} `
      const strongChunkMatch = passageChunks.chunks.some((chunk) => normalizedLine.includes(` ${chunk} `))
      const overlapCount = lineTokens.filter((token) => passageChunks.tokenSet.has(token)).length
      const overlapRatio = overlapCount / lineTokens.length

      const previousStrongIndex = lastStrongMatchIndexRef.current
      const isNearStrongLine = previousStrongIndex != null && Math.abs(itemIndex - previousStrongIndex) <= 1
      const nearStrongContinuation = isNearStrongLine && overlapCount >= 2 && overlapRatio >= 0.45

      if (strongChunkMatch || nearStrongContinuation) {
        lastStrongMatchIndexRef.current = itemIndex
        return `<mark class="rv2-pdf-highlight">${rendered}</mark>`
      }

      return rendered
    },
    [headingPhraseRegexes, highlightPhraseRegexes, passageChunks]
  )

  const externalViewerUrl = previewAvailable && document
    ? api.getEvaluationDocumentContentUrl(evaluationId, document.id, {
        page: currentDisplayPage,
        search: searchHint,
      })
    : null

  const canGoToPrevPage = currentDisplayPage > 1
  const canGoToNextPage = totalPages != null && currentDisplayPage < totalPages
  const pagesToRender = useMemo(() => {
    if (totalPages && totalPages > 0) {
      const centerPage = Math.min(Math.max(1, currentDisplayPage), totalPages)
      const startPage = Math.max(1, centerPage - PDF_PAGE_WINDOW_RADIUS)
      const endPage = Math.min(totalPages, centerPage + PDF_PAGE_WINDOW_RADIUS)
      return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index)
    }
    return [clampedPage]
  }, [clampedPage, currentDisplayPage, totalPages])

  const scrollToPage = useCallback((pageNumber: number, behavior: ScrollBehavior) => {
    const container = pdfScrollRef.current
    const target = pageAnchorsRef.current[pageNumber]
    if (!container || !target) {
      return
    }
    const top = Math.max(target.offsetTop - 12, 0)
    container.scrollTo({ top, behavior })
  }, [])

  const handlePdfScroll = useCallback(() => {
    const container = pdfScrollRef.current
    const pageEntries = Object.entries(pageAnchorsRef.current)
    if (!container || pageEntries.length === 0) {
      return
    }

    const containerTop = container.getBoundingClientRect().top
    let closestPage = 1
    let closestDistance = Number.POSITIVE_INFINITY

    for (const [pageValue, node] of pageEntries) {
      if (!node) {
        continue
      }
      const pageNumber = Number.parseInt(pageValue, 10)
      if (!Number.isFinite(pageNumber)) {
        continue
      }
      const distance = Math.abs(node.getBoundingClientRect().top - containerTop - 12)
      if (distance < closestDistance) {
        closestDistance = distance
        closestPage = pageNumber
      }
    }

    setVisiblePage((prev) => (prev === closestPage ? prev : closestPage))
  }, [])

  useEffect(() => {
    if (!pdfUrl || activePage < 1) {
      return
    }

    const behavior = nextScrollBehaviorRef.current
    scrollToPage(activePage, behavior)
    nextScrollBehaviorRef.current = "smooth"
    setVisiblePage(activePage)
  }, [activePage, pdfUrl, scrollToPage, totalPages])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
      />
      <div
        className="relative grid h-[88vh] w-full max-w-[1320px] min-w-0 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close citation preview"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/95 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <aside className="rv2-scroll border-b border-border bg-[#fcfaf6] px-5 py-5 lg:border-b-0 lg:border-r">
          <div className="mb-4 pr-10">
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Citation preview</div>
              <div className="text-sm font-semibold text-foreground">{source.document_name || document?.file_name || "Source document"}</div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevCitation}
                disabled={!canGoToPrevCitation}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Prev citation
              </button>
              <span className="text-xs text-muted-foreground">{citationIndex + 1} / {citationCount}</span>
              <button
                type="button"
                onClick={onNextCitation}
                disabled={!canGoToNextCitation}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next citation
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-[#eadfce] bg-white px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rv2-modal-cite-ref">{formatSourceLabel(source, citationIndex)}</span>
                {citationPageNumber != null ? (
                  <span className="rv2-modal-cite-page">Page {citationPageNumber}</span>
                ) : null}
                {source.evidence_type ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                    {source.evidence_type.replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
              {source.section_title ? (
                <div className="mb-2 text-xs font-medium text-foreground">{source.section_title}</div>
              ) : null}
              {source.supports ? (
                <div className="mb-2 text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                  Supports: <span className="normal-case tracking-normal text-foreground">{source.supports}</span>
                </div>
              ) : null}
              {source.excerpt ? <p className="rv2-modal-cite-text">{source.excerpt}</p> : null}
            </div>

            {!document ? (
              <div className="rounded-xl border border-status-flagged/20 bg-status-flagged-bg px-4 py-3 text-sm text-status-flagged">
                The cited document could not be matched to an uploaded PDF for this evaluation.
              </div>
            ) : !previewAvailable ? (
              <div className="rounded-xl border border-status-flagged/20 bg-status-flagged-bg px-4 py-3 text-sm text-status-flagged">
                This source PDF was cleaned up from storage, so the citation can no longer open its original page preview.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-[#f3efe8]">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-background/90 py-3 pl-4 pr-14">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{document?.file_name || "Document preview unavailable"}</div>
              <div className="text-xs text-muted-foreground">
                {citationPageNumber != null ? `Page ${currentDisplayPage}` : "Referenced section"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pdfUrl ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2 py-1.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      nextScrollBehaviorRef.current = "smooth"
                      setActivePage(Math.max(1, currentDisplayPage - 1))
                    }}
                    disabled={!canGoToPrevPage}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[64px] text-center text-xs text-muted-foreground">
                    {totalPages ? `${currentDisplayPage} / ${totalPages}` : `${currentDisplayPage}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      nextScrollBehaviorRef.current = "smooth"
                      setActivePage(currentDisplayPage + 1)
                    }}
                    disabled={!canGoToNextPage}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
              {externalViewerUrl ? (
                <a
                  href={externalViewerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  aria-label="Open in new tab"
                  title="Open in new tab"
                >
                  Open in new tab
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 p-3">
            {pdfUrl ? (
              <div
                ref={pdfScrollRef}
                onScroll={handlePdfScroll}
                className="rv2-pdf-shell relative h-full overflow-auto rounded-xl border border-border bg-white"
              >
                <Document
                  key={pdfUrl}
                  file={pdfUrl}
                  loading={
                    <div className="flex h-full min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading PDF preview...
                    </div>
                  }
                  onLoadSuccess={(loadedPdf: { numPages: number }) => {
                    setTotalPages(loadedPdf.numPages)
                    setActivePage((prev) => Math.min(Math.max(1, prev), loadedPdf.numPages))
                    setPdfError(null)
                    if (citationPageNumber == null) {
                      return
                    }
                    nextScrollBehaviorRef.current = "auto"
                  }}
                  onLoadError={(error) => {
                    setPdfError(error instanceof Error ? error.message : "Unable to load PDF preview")
                  }}
                  error={
                    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">
                      Unable to render this PDF preview in-app. You can still open it in a new tab.
                    </div>
                  }
                  noData={
                    <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">
                      No PDF file is available for preview.
                    </div>
                  }
                  className="rv2-react-pdf"
                >
                  <div className="rv2-pdf-pages">
                    {pagesToRender.map((pageNumber) => (
                      <div
                        key={`${pdfUrl}-page-${pageNumber}`}
                        ref={(node) => {
                          pageAnchorsRef.current[pageNumber] = node
                        }}
                        className="rv2-pdf-page-anchor"
                      >
                        <Page
                          pageNumber={pageNumber}
                          renderAnnotationLayer
                          renderTextLayer
                          customTextRenderer={pageNumber === initialPage ? renderHighlightedText : undefined}
                          loading={
                            <div className="flex h-full min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Rendering page...
                            </div>
                          }
                        />
                      </div>
                    ))}
                  </div>
                </Document>
                {pdfError ? (
                  <div className="border-t border-border bg-status-flagged-bg px-4 py-2 text-xs text-status-flagged">
                    {pdfError}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">
                No preview is available for this citation yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SourceChip({
  source,
  index,
  onHover,
  onLeave,
  onClick,
}: {
  source: CitationReference
  index: number
  onHover?: (pill: HTMLElement, source: CitationReference) => void
  onLeave?: () => void
  onClick?: () => void
}) {
  return (
    <span
      className="rv2-citation-pill"
      onMouseEnter={(e) => onHover?.(e.currentTarget, source)}
      onMouseLeave={() => onLeave?.()}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      {formatSourceLabel(source, index)}
    </span>
  )
}

function StatementContent({
  item,
  compact = false,
  maxPills = 2,
  onShowTooltip,
  onHideTooltip,
  onOpenSource,
}: {
  item: NarrativeItem
  compact?: boolean
  maxPills?: number
  onShowTooltip?: (pill: HTMLElement, source: CitationReference) => void
  onHideTooltip?: () => void
  onOpenSource?: (source: CitationReference, context?: { sources: CitationReference[]; index: number }) => void
}) {
  const visibleCitations = item.citations.slice(0, maxPills)
  const remainingCount = item.citations.length - visibleCitations.length

  return (
    <div className="space-y-2">
      <div className={cn("leading-relaxed text-foreground", compact ? "text-[13px]" : "text-sm")}>{item.text}</div>
      {item.citations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleCitations.map((source, index) => (
            <SourceChip
              key={`${item.id}-source-${index}`}
              source={source}
              index={index}
              onHover={onShowTooltip}
              onLeave={onHideTooltip}
              onClick={() => onOpenSource?.(source, { sources: item.citations, index })}
            />
          ))}
          {remainingCount > 0 ? (
            <span
              className="rv2-citation-pill rv2-citation-more"
              onClick={(e) => {
                e.stopPropagation()
                onOpenSource?.(item.citations[0], { sources: item.citations, index: 0 })
              }}
              onMouseEnter={(e) => {
                onShowTooltip?.(e.currentTarget, {
                  label: `${item.citations.length} sources`,
                  location: "",
                  excerpt: `${item.citations.length} source citations back this statement. Click to see all in the detail view.`,
                })
              }}
              onMouseLeave={() => onHideTooltip?.()}
            >
              +{remainingCount} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ── Presentational helpers ──────────────────────── */

function StatusDot({ status, label }: { status: ResultsV2Status; label: string }) {
  const dotColor: Record<ResultsV2Status, string> = {
    PASS: "bg-status-pass",
    FAIL: "bg-status-fail",
    FLAGGED: "bg-status-flagged",
    NOT_APPLICABLE: "bg-status-na",
    ERROR: "bg-status-fail",
  }
  const textColor: Record<ResultsV2Status, string> = {
    PASS: "text-status-pass",
    FAIL: "text-status-fail",
    FLAGGED: "text-status-flagged",
    NOT_APPLICABLE: "text-status-na",
    ERROR: "text-status-fail",
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", textColor[status])}>
      <span className={cn("rv2-status-dot", dotColor[status])} />
      {label}
    </span>
  )
}

function ConfidenceBar({ level }: { level: "low" | "medium" | "high" }) {
  const config = {
    high: { width: "100%", fill: "bg-status-pass", text: "text-status-pass" },
    medium: { width: "60%", fill: "bg-status-flagged", text: "text-status-flagged" },
    low: { width: "30%", fill: "bg-status-na", text: "text-status-na" },
  }[level]
  return (
    <div className="flex items-center gap-2">
      <div className="rv2-confidence-track">
        <div className={cn("rv2-confidence-fill", config.fill)} style={{ width: config.width }} />
      </div>
      <span className={cn("text-xs capitalize whitespace-nowrap", config.text)}>{level}</span>
    </div>
  )
}

function ReviewBadge({ state, label }: { state: ResultsV2ReviewState; label: string }) {
  return (
    <span
      className={cn("rv2-review-badge", {
        "bg-muted text-muted-foreground": state === "pending",
        "bg-status-pass-bg text-status-pass": state === "approved",
        "bg-status-fail-bg text-status-fail": state === "rejected",
      })}
    >
      {label}
    </span>
  )
}

function NarrativeItemView({
  item,
  compact = false,
  onShowTooltip,
  onHideTooltip,
  onOpenSource,
}: {
  item: NarrativeItem
  compact?: boolean
  onShowTooltip?: (pill: HTMLElement, source: CitationReference) => void
  onHideTooltip?: () => void
  onOpenSource?: (source: CitationReference, context?: { sources: CitationReference[]; index: number }) => void
}) {
  return (
    <div className={cn("space-y-1.5 leading-relaxed", compact ? "text-[13px]" : "text-sm")}>
      {item.label ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {item.label}
        </div>
      ) : null}
      <StatementContent
        item={item}
        compact={compact}
        onShowTooltip={onShowTooltip}
        onHideTooltip={onHideTooltip}
        onOpenSource={onOpenSource}
      />
    </div>
  )
}

function SourcesSection({
  groups,
  totalSources,
  focusedStatementId,
  sectionRef,
  onOpenSource,
}: {
  groups: SourceGroup[]
  totalSources: number
  focusedStatementId: string | null
  sectionRef: { current: HTMLElement | null }
  onOpenSource?: (source: CitationReference, context?: { sources: CitationReference[]; index: number }) => void
}) {
  if (groups.length === 0) {
    return null
  }

  return (
    <section ref={sectionRef} className="space-y-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Supporting Evidence ({totalSources})
      </h3>
      <div className="space-y-3">
        {groups.map((group) => (
          <section
            key={group.id}
            className={cn(
              "rv2-modal-citations-block",
              focusedStatementId && group.statementId === focusedStatementId
                ? "ring-1 ring-sc/20"
                : ""
            )}
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {group.label}
            </h4>
            <div className="rv2-modal-citations-grid">
              {group.sources.map((source, index) => (
                <button
                  key={`${group.id}-source-${index}`}
                  type="button"
                  className="rv2-modal-cite-card text-left"
                  onClick={() => onOpenSource?.(source, { sources: group.sources, index })}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="rv2-modal-cite-ref">
                      {formatSourceLabel(source, index)}
                    </span>
                    {source.page_number != null ? (
                      <span className="rv2-modal-cite-page">p. {source.page_number}</span>
                    ) : source.location ? (
                      <span className="rv2-modal-cite-page">{source.location}</span>
                    ) : null}
                  </div>
                  {source.document_name ? (
                    <div className="mt-1 text-[10px] text-muted-foreground">{source.document_name}</div>
                  ) : null}
                  <p className="rv2-modal-cite-text">{source.excerpt}</p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

export function ResultsV2() {
  const { evaluationId } = useParams<{ evaluationId: string }>()

  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [framework, setFramework] = useState<Framework | null>(null)
  const [documents, setDocuments] = useState<EvaluationDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackEntry>>({})
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | ResultsV2Status>("all")
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "low" | "medium" | "high">("all")
  const [clauseFilter, setClauseFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(null)
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null)
  const [activeCitationState, setActiveCitationState] = useState<ActiveCitationState | null>(null)
  const [focusedSourceTarget, setFocusedSourceTarget] = useState<{ requirementId: string; statementId: string } | null>(null)
  const [scrollSourcesOnOpen, setScrollSourcesOnOpen] = useState(false)
  const [draftComment, setDraftComment] = useState("")
  const sourcesSectionRef = useRef<HTMLElement | null>(null)

  /* ── Citation tooltip state ───────────────────── */
  const [tooltip, setTooltip] = useState<{ visible: boolean; top: number; left: number; source: CitationReference | null }>({
    visible: false, top: 0, left: 0, source: null,
  })
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showCitationTooltip = useCallback((pill: HTMLElement, source: CitationReference) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    setTooltip({ visible: true, top: -9999, left: -9999, source })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = tooltipRef.current
        if (!el) return
        const rect = pill.getBoundingClientRect()
        const tw = el.offsetWidth
        const th = el.offsetHeight
        const gap = 14
        const edge = 8
        const canFitAbove = rect.top >= th + gap + edge
        const canFitBelow = rect.bottom + th + gap <= window.innerHeight - edge

        let top = canFitAbove ? rect.top - th - gap : rect.bottom + gap
        if (!canFitAbove && !canFitBelow) {
          top = Math.max(edge, rect.top - th - gap)
        }

        let left = rect.left + rect.width / 2 - tw / 2
        if (left < edge) left = edge
        if (left + tw > window.innerWidth - edge) left = window.innerWidth - tw - edge

        setTooltip({ visible: true, top, left, source })
      })
    })
  }, [])

  const hideCitationTooltip = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip((prev) => ({ ...prev, visible: false }))
    }, 120)
  }, [])

  useEffect(() => {
    if (!activeCitationState) {
      return
    }
    setTooltip((prev) => ({ ...prev, visible: false }))
  }, [activeCitationState])

  useEffect(() => {
    if (!evaluationId) {
      setError("No evaluation ID provided")
      setLoading(false)
      return
    }

    const loadReport = async () => {
      try {
        setLoading(true)
        setDocuments([])
        const [reportData, evaluationStatus] = await Promise.all([
          api.getComplianceReport(evaluationId),
          api.getEvaluationStatus(evaluationId),
        ])
        setReport(reportData)
        setError(null)

        try {
          const documentsData = await api.getEvaluationDocuments(evaluationId)
          setDocuments(documentsData)
        } catch (documentsError) {
          console.error("Failed to load evaluation documents", documentsError)
          setDocuments([])
        }

        if (evaluationStatus.framework_id) {
          try {
            const frameworkData = await api.getFramework(evaluationStatus.framework_id)
            setFramework(frameworkData)
          } catch (frameworkError) {
            console.error("Failed to load framework", frameworkError)
          }
        }
      } catch (loadError) {
        console.error("Failed to load compliance report", loadError)
        setError("Failed to load compliance report")
        setDocuments([])
      } finally {
        setLoading(false)
      }
    }

    void loadReport()
  }, [evaluationId])

  useEffect(() => {
    if (!evaluationId) {
      return
    }

    const loadFeedback = async () => {
      try {
        setFeedbackLoading(true)
        const feedback = await api.getRequirementFeedback(evaluationId)
        const mapped = Array.isArray(feedback)
          ? feedback.reduce<Record<string, FeedbackEntry>>((acc, record) => {
              acc[record.requirement_id] = {
                isHelpful: record.is_helpful,
                comment: record.comment ?? "",
                isSaving: false,
                error: null,
              }
              return acc
            }, {})
          : {}

        if (!Array.isArray(feedback)) {
          setFeedbackError("Could not load human feedback. Displaying default values.")
        } else {
          setFeedbackError(null)
        }

        setFeedbackMap(mapped)
      } catch (loadError) {
        console.error("Failed to load feedback", loadError)
        setFeedbackError("Could not load human feedback. Displaying default values.")
        setFeedbackMap({})
      } finally {
        setFeedbackLoading(false)
      }
    }

    void loadFeedback()
  }, [evaluationId])

  const rows = useMemo<RequirementDetailViewModel[]>(() => {
    if (!report) {
      return []
    }

    return report.requirements
      .map((requirement) =>
        mapRequirementToResultsV2ViewModel(
          requirement,
          feedbackToReviewState(feedbackMap[requirement.requirement_id]?.isHelpful),
          report.requirement_presentations?.[requirement.requirement_id]
        )
      )
      .sort((left, right) => {
        const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
        if (statusDiff !== 0) {
          return statusDiff
        }

        const clauseLeft = left.clause ?? ""
        const clauseRight = right.clause ?? ""
        const clauseDiff = clauseLeft.localeCompare(clauseRight, undefined, {
          numeric: true,
          sensitivity: "base",
        })
        if (clauseDiff !== 0) {
          return clauseDiff
        }

        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      })
  }, [feedbackMap, report])

  const clauseOptions = useMemo(() => {
    return [...new Set(rows.map((row) => row.clause).filter(Boolean) as string[])].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
    )
  }, [rows])

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false
      }
      if (confidenceFilter !== "all" && row.confidenceLevel !== confidenceFilter) {
        return false
      }
      if (clauseFilter !== "all" && row.clause !== clauseFilter) {
        return false
      }
      if (normalizedSearch && !row.searchText.includes(normalizedSearch)) {
        return false
      }
      return true
    })
  }, [clauseFilter, confidenceFilter, rows, searchQuery, statusFilter])

  const activeRow = useMemo(() => {
    return filteredRows.find((row) => row.requirementId === activeRequirementId) ?? null
  }, [activeRequirementId, filteredRows])

  const activeFeedbackEntry = activeRow
    ? feedbackMap[activeRow.requirementId] ?? createDefaultFeedbackEntry()
    : createDefaultFeedbackEntry()

  useEffect(() => {
    if (!activeRow) {
      setDraftComment("")
      return
    }
    setDraftComment(activeFeedbackEntry.comment)
  }, [activeFeedbackEntry.comment, activeRow])

  useEffect(() => {
    if (activeRequirementId && !filteredRows.some((row) => row.requirementId === activeRequirementId)) {
      setActiveRequirementId(null)
    }
    if (expandedRequirementId && !filteredRows.some((row) => row.requirementId === expandedRequirementId)) {
      setExpandedRequirementId(null)
    }
  }, [activeRequirementId, expandedRequirementId, filteredRows])

  useEffect(() => {
    if (!activeRow) {
      setFocusedSourceTarget(null)
      setScrollSourcesOnOpen(false)
      return
    }

    if (
      focusedSourceTarget &&
      (focusedSourceTarget.requirementId !== activeRow.requirementId ||
        !activeRow.sourceGroups.some((group) => group.statementId === focusedSourceTarget.statementId))
    ) {
      setFocusedSourceTarget(null)
    }

    if (!scrollSourcesOnOpen || !sourcesSectionRef.current) {
      return
    }

    sourcesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    setScrollSourcesOnOpen(false)
  }, [activeRow, focusedSourceTarget, scrollSourcesOnOpen])

  useEffect(() => {
    if (!activeRow) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeCitationState) {
        return
      }
      const currentIndex = filteredRows.findIndex((row) => row.requirementId === activeRow.requirementId)

      if (event.key === "Escape") {
        setActiveRequirementId(null)
        return
      }
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        setActiveRequirementId(filteredRows[currentIndex - 1].requirementId)
      }
      if (event.key === "ArrowRight" && currentIndex < filteredRows.length - 1) {
        setActiveRequirementId(filteredRows[currentIndex + 1].requirementId)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeCitationState, activeRow, filteredRows])

  const summaryCounts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc[row.status] += 1
        return acc
      },
      {
        PASS: 0,
        FAIL: 0,
        FLAGGED: 0,
        NOT_APPLICABLE: 0,
        ERROR: 0,
      } as Record<ResultsV2Status, number>
    )
  }, [rows])

  const reviewedCount = useMemo(() => {
    return Object.values(feedbackMap).filter((entry) => entry.isHelpful !== null).length
  }, [feedbackMap])

  const handleVote = useCallback(
    async (requirementId: string, vote: "up" | "down") => {
      if (!evaluationId) {
        return
      }

      let nextHelpful: boolean | null = null
      let commentToSend: string | null = null

      setFeedbackMap((prev) => {
        const current = prev[requirementId] ?? createDefaultFeedbackEntry()
        const desired = vote === "up"
        nextHelpful = current.isHelpful === desired ? null : desired
        commentToSend = current.comment.trim().length > 0 ? current.comment : null

        return {
          ...prev,
          [requirementId]: {
            ...current,
            isHelpful: nextHelpful,
            isSaving: true,
            error: null,
          },
        }
      })

      try {
        await api.upsertRequirementFeedback(evaluationId, {
          requirement_id: requirementId,
          is_helpful: nextHelpful,
          comment: commentToSend,
        })

        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: null,
          },
        }))
      } catch (saveError) {
        console.error("Failed to save feedback", saveError)
        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: "Failed to save review. Try again.",
          },
        }))
      }
    },
    [evaluationId]
  )

  const saveComment = useCallback(
    async (requirementId: string, comment: string) => {
      if (!evaluationId) {
        return
      }

      const current = feedbackMap[requirementId] ?? createDefaultFeedbackEntry()

      setFeedbackMap((prev) => ({
        ...prev,
        [requirementId]: {
          ...current,
          comment,
          isSaving: true,
          error: null,
        },
      }))

      try {
        await api.upsertRequirementFeedback(evaluationId, {
          requirement_id: requirementId,
          is_helpful: current.isHelpful,
          comment: comment.trim().length > 0 ? comment : null,
        })

        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: null,
          },
        }))
      } catch (saveError) {
        console.error("Failed to save comment", saveError)
        setFeedbackMap((prev) => ({
          ...prev,
          [requirementId]: {
            ...(prev[requirementId] ?? createDefaultFeedbackEntry()),
            isSaving: false,
            error: "Failed to save note. Try again.",
          },
        }))
      }
    },
    [evaluationId, feedbackMap]
  )


  const handleExport = useCallback(() => {
    if (!report || rows.length === 0) {
      return
    }

    const exportRows = rows.map((row) => ({
      "Requirement ID": row.requirementId,
      Clause: row.clause ?? "",
      Title: row.title,
      Status: row.status,
      Confidence: row.confidenceLevel,
      Review: row.reviewLabel,
      "Assessment Summary": row.rationale,
      "Inline Finding": row.inlineFinding.text,
      "Inline Evidence": row.inlineEvidence?.text ?? "",
      "Inline Caveat": row.inlineCaveat?.text ?? "",
      "Modal Summary": row.modalSummary,
      "Modal Evidence": row.modalEvidence.map((item) => `${item.label ?? "Detail"}: ${item.text}`).join(" | "),
      "Total Sources": row.totalSources,
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Evaluation Results V2")

    const timestamp = new Date().toISOString().split("T")[0]
    XLSX.writeFile(workbook, `evaluation-v2-${evaluationId}-${timestamp}.xlsx`)
  }, [evaluationId, report, rows])

  const activeCitation = activeCitationState?.source ?? null
  const activeCitationDocument = useMemo(
    () => (activeCitation ? resolveCitationDocument(activeCitation, documents) : null),
    [activeCitation, documents]
  )

  const openCitationPreview = useCallback(
    (source: CitationReference, context?: { sources: CitationReference[]; index: number }) => {
      const candidates = context?.sources?.length ? context.sources : [source]
      const sourceIndex = context
        ? Math.max(0, Math.min(context.index, candidates.length - 1))
        : candidates.findIndex((candidate) => candidate === source)
      const index = sourceIndex >= 0 ? sourceIndex : 0
      setActiveCitationState({
        source: candidates[index] ?? source,
        sources: candidates,
        index,
      })
    },
    []
  )

  const goToPrevCitation = useCallback(() => {
    setActiveCitationState((current) => {
      if (!current || current.index <= 0) {
        return current
      }
      const nextIndex = current.index - 1
      return {
        source: current.sources[nextIndex],
        sources: current.sources,
        index: nextIndex,
      }
    })
  }, [])

  const goToNextCitation = useCallback(() => {
    setActiveCitationState((current) => {
      if (!current || current.index >= current.sources.length - 1) {
        return current
      }
      const nextIndex = current.index + 1
      return {
        source: current.sources[nextIndex],
        sources: current.sources,
        index: nextIndex,
      }
    })
  }, [])

  useEffect(() => {
    if (!activeCitationState) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveCitationState(null)
        return
      }
      if (event.key === "ArrowUp" || (event.key === "ArrowLeft" && event.altKey)) {
        goToPrevCitation()
      }
      if (event.key === "ArrowDown" || (event.key === "ArrowRight" && event.altKey)) {
        goToNextCitation()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeCitationState, goToNextCitation, goToPrevCitation])

  useEffect(() => {
    const hasBlockingModal = Boolean(activeRequirementId || activeCitationState)
    if (!hasBlockingModal) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const previousOverscrollBehavior = document.body.style.overscrollBehavior
    document.body.style.overflow = "hidden"
    document.body.style.overscrollBehavior = "none"

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscrollBehavior
    }
  }, [activeCitationState, activeRequirementId])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading evaluation results...</span>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <span className="text-sm">{error ?? "Report not found"}</span>
      </div>
    )
  }

  const totalRequirements = rows.length
  const overallScore = Number.isFinite(report.overall_score) ? report.overall_score : 0
  const filteredIndex = activeRow
    ? filteredRows.findIndex((row) => row.requirementId === activeRow.requirementId)
    : -1
  const canGoPrev = filteredIndex > 0
  const canGoNext = filteredIndex >= 0 && filteredIndex < filteredRows.length - 1
  const activeSourceGroups = activeRow?.sourceGroups ?? []

  return (
    <div className="results-v2 space-y-6">
      {/* ── DIV 1: Header + stat breakdown ── */}
      <div className="space-y-5 rounded-xl border border-border/60 bg-background p-6" style={{ boxShadow: '0 1px 4px rgba(90, 74, 63, 0.08)' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{framework?.name ?? 'Compliance Report'}</p>
            <h1 className="relative pb-2 text-lg font-semibold tracking-tight text-foreground after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-10 after:rounded-sm after:bg-sc-gold-dark">
              {report.document_name}
            </h1>
            {framework?.standard_reference ? (
              <p className="text-xs text-muted-foreground">{framework.standard_reference}</p>
            ) : null}
          </div>
          <div className="space-y-1 text-left lg:text-right">
            <div className="text-3xl font-semibold leading-none text-foreground">
              {overallScore.toFixed(1)}%
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Overall score
            </div>
          </div>
        </div>

        {/* Compliance overview panel */}
        <div className="space-y-5 pt-4 border-t border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Compliance overview
            </span>
            <span className="text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">{totalRequirements}</span> requirements assessed
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="flex h-full w-full">
              <div
                className="bg-status-fail"
                style={{ width: `${totalRequirements ? (summaryCounts.FAIL / totalRequirements) * 100 : 0}%` }}
              />
              <div
                className="bg-status-flagged"
                style={{ width: `${totalRequirements ? (summaryCounts.FLAGGED / totalRequirements) * 100 : 0}%` }}
              />
              <div
                className="bg-status-pass"
                style={{ width: `${totalRequirements ? (summaryCounts.PASS / totalRequirements) * 100 : 0}%` }}
              />
              <div
                className="bg-status-na"
                style={{ width: `${totalRequirements ? (summaryCounts.NOT_APPLICABLE / totalRequirements) * 100 : 0}%` }}
              />
              <div
                className="bg-muted-foreground/20"
                style={{ width: `${totalRequirements ? (summaryCounts.ERROR / totalRequirements) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Stat items with left color accent bars */}
          <div className="flex flex-wrap gap-y-3 md:flex-nowrap">
            {(
              [
                ["Fail", summaryCounts.FAIL, "bg-status-fail"],
                ["Flagged", summaryCounts.FLAGGED, "bg-status-flagged"],
                ["Pass", summaryCounts.PASS, "bg-status-pass"],
                ["N/A", summaryCounts.NOT_APPLICABLE, "bg-status-na"],
              ] as const
            ).map(([label, value, colorClass], index, arr) => (
              <div
                key={label}
                className={cn(
                  "flex flex-1 items-center gap-2.5 px-4",
                  index < arr.length - 1 && "md:border-r md:border-border",
                  index === 0 && "pl-0",
                  index === arr.length - 1 && "pr-0"
                )}
              >
                <div className={cn("h-7 w-[3px] shrink-0 rounded-sm", colorClass)} />
                <div className="flex flex-col">
                  <span className="text-xl font-bold leading-tight text-foreground">{value}</span>
                  <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DIV 2: Filter bar ── */}
      <div className="rounded-xl border border-border/60 bg-background p-5" style={{ boxShadow: '0 1px 4px rgba(90, 74, 63, 0.08)' }}>
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
          <div className="relative xl:min-w-[240px] xl:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setExpandedRequirementId(null)
              }}
              placeholder="Search requirements..."
              className="h-9 pl-9 text-[13px]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as "all" | ResultsV2Status)
              setExpandedRequirementId(null)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="FAIL">Fail</option>
            <option value="FLAGGED">Flagged</option>
            <option value="PASS">Pass</option>
            <option value="NOT_APPLICABLE">N/A</option>
            <option value="ERROR">Error</option>
          </select>
          <select
            value={clauseFilter}
            onChange={(event) => {
              setClauseFilter(event.target.value)
              setExpandedRequirementId(null)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
          >
            <option value="all">All clauses</option>
            {clauseOptions.map((clause) => (
              <option key={clause} value={clause}>
                Clause {clause}
              </option>
            ))}
          </select>
          <select
            value={confidenceFilter}
            onChange={(event) => {
              setConfidenceFilter(event.target.value as "all" | "low" | "medium" | "high")
              setExpandedRequirementId(null)
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-[13px] text-foreground"
          >
            <option value="all">All confidence</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div className="flex items-center gap-3 xl:ml-auto">
            <span className="text-[13px] text-muted-foreground">
              Showing {filteredRows.length} of {totalRequirements}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={rows.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>
        {feedbackLoading ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading review feedback...</span>
          </div>
        ) : null}
        {feedbackError ? (
          <div className="mt-3 rounded-md border border-status-flagged/20 bg-status-flagged-bg px-3 py-2 text-xs text-status-flagged">
            {feedbackError}
          </div>
        ) : null}
      </div>

      {/* ── DIV 3: Table ── */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-background" style={{ boxShadow: '0 1px 4px rgba(90, 74, 63, 0.08)' }}>
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse bg-background">
              <thead className="bg-muted/60">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Clause</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                      No requirements match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const feedbackEntry = feedbackMap[row.requirementId] ?? createDefaultFeedbackEntry()
                    const isExpanded = expandedRequirementId === row.requirementId

                    return [
                      <tr
                        key={`${row.requirementId}-row`}
                        className="cursor-pointer border-t border-border/40 transition-colors hover:bg-accent/50"
                        onClick={() =>
                          setExpandedRequirementId((current) =>
                            current === row.requirementId ? null : row.requirementId
                          )
                        }
                      >
                        <td className="px-4 py-3 align-middle">
                          <StatusDot status={row.status} label={row.statusLabel} />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="space-y-0.5">
                            <div className="text-[13px] font-medium text-foreground">{row.title}</div>
                            <div className="text-[13px] leading-snug text-muted-foreground">{row.tableFinding}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle text-[13px] text-foreground">
                          {row.clause ?? "\u2014"}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <ConfidenceBar level={row.confidenceLevel} />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <ReviewBadge state={row.reviewState} label={row.reviewLabel} />
                            {feedbackEntry.isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : null}
                          </div>
                        </td>
                      </tr>,
                      isExpanded ? (
                        <tr
                          key={`${row.requirementId}-detail`}
                          className="border-t border-border/40"
                        >
                          <td colSpan={5} className="p-0">
                            <div className="rv2-expansion m-4 bg-muted/30 p-5">
                              <div className="space-y-4">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                                  <div className="space-y-3">
                                    <NarrativeItemView
                                      item={row.inlineFinding}
                                      compact
                                      onShowTooltip={showCitationTooltip}
                                      onHideTooltip={hideCitationTooltip}
                                      onOpenSource={openCitationPreview}
                                    />
                                    {row.inlineCaveat ? (
                                      <NarrativeItemView
                                        item={row.inlineCaveat}
                                        compact
                                        onShowTooltip={showCitationTooltip}
                                        onHideTooltip={hideCitationTooltip}
                                        onOpenSource={openCitationPreview}
                                      />
                                    ) : null}
                                  </div>
                                  <div className="flex flex-col gap-2 lg:min-w-[200px]">
                                    <Button
                                      type="button"
                                      className="justify-center bg-sc text-white hover:bg-sc-dark"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void handleVote(row.requirementId, "up")
                                      }}
                                    >
                                      <ThumbsUp className="mr-2 h-4 w-4" />
                                      Approve
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="justify-center border-destructive/30 text-destructive hover:bg-status-fail-bg"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void handleVote(row.requirementId, "down")
                                      }}
                                    >
                                      <ThumbsDown className="mr-2 h-4 w-4" />
                                      Reject
                                    </Button>
                                    <button
                                      type="button"
                                      className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-sc-dark transition-colors hover:text-sc-deep hover:underline"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setActiveRequirementId(row.requirementId)
                                      }}
                                    >
                                      View all details
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {feedbackEntry.error ? (
                                  <div className="text-xs text-destructive">{feedbackEntry.error}</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ]
                  })
                )}
              </tbody>
            </table>
          </div>

        {/* Footer */}
        <div className="px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-border/40">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-sc-gold-dark" />
            <span>
              {reviewedCount} of {totalRequirements} reviewed
            </span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {activeCitation && evaluationId ? (
        <SourceViewerModal
          evaluationId={evaluationId}
          source={activeCitation}
          document={activeCitationDocument}
          citationIndex={activeCitationState?.index ?? 0}
          citationCount={activeCitationState?.sources.length ?? 1}
          canGoToPrevCitation={(activeCitationState?.index ?? 0) > 0}
          canGoToNextCitation={(activeCitationState?.index ?? 0) < ((activeCitationState?.sources.length ?? 1) - 1)}
          onPrevCitation={goToPrevCitation}
          onNextCitation={goToNextCitation}
          onClose={() => setActiveCitationState(null)}
        />
      ) : null}

      {/* ── Detail modal ── */}
      {activeRow ? (
        <div className={cn("rv2-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-6", activeCitationState ? "pointer-events-none" : "")}>
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={() => setActiveRequirementId(null)}
          />
          <div className="rv2-modal-card relative flex max-h-[85vh] w-full max-w-[900px] flex-col overflow-hidden border border-border bg-background">
            {/* Modal header */}
            <div className="sticky top-0 z-10 border-b border-border bg-background px-8 py-6" style={{ borderRadius: '16px 16px 0 0' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div>
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60">
                      {activeRow.requirementId}
                    </div>
                    <h2 className="text-xl font-semibold leading-snug text-foreground">{activeRow.title}</h2>
                  </div>
                  {/* Labeled meta items with dividers */}
                  <div className="flex flex-wrap items-center gap-3.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Status</span>
                      <StatusDot status={activeRow.status} label={activeRow.statusLabel} />
                    </div>
                    {activeRow.clause ? (
                      <>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Clause</span>
                          <span className="font-mono text-xs text-foreground">{activeRow.clause}</span>
                        </div>
                      </>
                    ) : null}
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Confidence</span>
                      <ConfidenceBar level={activeRow.confidenceLevel} />
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Review</span>
                      <ReviewBadge state={activeRow.reviewState} label={activeRow.reviewLabel} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRequirementId(null)}
                  aria-label="Close details"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal body + sidebar */}
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="rv2-scroll min-h-0 overflow-y-auto px-8 py-6">
                <div className="space-y-6">
                  {activeRow.modalSummary !== activeRow.inlineFinding.text ? (
                    <section className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        Summary
                      </h3>
                      <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground">
                        {activeRow.modalSummary}
                      </div>
                    </section>
                  ) : null}
                  <section className="space-y-3">
                    <div className="space-y-3">
                      <NarrativeItemView
                        item={activeRow.inlineFinding}
                        onShowTooltip={showCitationTooltip}
                        onHideTooltip={hideCitationTooltip}
                        onOpenSource={openCitationPreview}
                      />
                      {activeRow.inlineCaveat ? (
                        <NarrativeItemView
                          item={activeRow.inlineCaveat}
                          onShowTooltip={showCitationTooltip}
                          onHideTooltip={hideCitationTooltip}
                          onOpenSource={openCitationPreview}
                        />
                      ) : null}
                    </div>
                  </section>
                  <SourcesSection
                    groups={activeSourceGroups}
                    totalSources={activeRow.totalSources}
                    focusedStatementId={
                      focusedSourceTarget?.requirementId === activeRow.requirementId
                        ? focusedSourceTarget.statementId
                        : null
                    }
                    sectionRef={sourcesSectionRef}
                    onOpenSource={openCitationPreview}
                  />
                </div>
              </div>

              <aside className="rv2-scroll flex min-h-0 flex-col border-t border-border bg-muted/30 lg:border-l lg:border-t-0">
                <div className="space-y-5 overflow-y-auto px-5 py-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Review</h3>
                      {activeFeedbackEntry.isSaving ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving...
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1 bg-sc text-white hover:bg-sc-dark"
                        onClick={() => void handleVote(activeRow.requirementId, "up")}
                      >
                        <ThumbsUp className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-status-fail-bg"
                        onClick={() => void handleVote(activeRow.requirementId, "down")}
                      >
                        <ThumbsDown className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                    {activeFeedbackEntry.error ? (
                      <div className="text-xs text-destructive">{activeFeedbackEntry.error}</div>
                    ) : null}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Reviewer note</h3>
                    </div>
                    <textarea
                      value={draftComment}
                      onChange={(event) => setDraftComment(event.target.value)}
                      className="min-h-[120px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-sc focus:outline-none focus:ring-2 focus:ring-sc/15"
                      placeholder="Add reviewer context or decision notes..."
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => void saveComment(activeRow.requirementId, draftComment)}
                    >
                      Save note
                    </Button>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Confidence note</h3>
                    <div className="rounded-lg border border-border bg-background p-3 text-[13px] italic leading-relaxed text-muted-foreground">
                      {CONFIDENCE_NOTES[activeRow.confidenceLevel]}
                    </div>
                  </section>
                </div>
              </aside>
            </div>

            {/* Modal footer */}
            <div className="flex flex-col gap-3 border-t border-border px-8 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {filteredIndex + 1} of {filteredRows.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    canGoPrev
                      ? setActiveRequirementId(filteredRows[filteredIndex - 1].requirementId)
                      : undefined
                  }
                  disabled={!canGoPrev}
                  className="flex items-center gap-1 rounded-md border border-border bg-muted px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:cursor-default disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() =>
                    canGoNext
                      ? setActiveRequirementId(filteredRows[filteredIndex + 1].requirementId)
                      : undefined
                  }
                  disabled={!canGoNext}
                  className="flex items-center gap-1 rounded-md border border-border bg-muted px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:cursor-default disabled:opacity-40"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Citation tooltip — singleton portal */}
      {createPortal(
        <div
          ref={tooltipRef}
          className={`rv2-cite-tooltip${tooltip.visible ? " visible" : ""}`}
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.source ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="rv2-cite-tooltip-source">
                  {formatSourceLabel(tooltip.source, 0)}
                </span>
                {tooltip.source.page_number != null ? (
                  <span className="rv2-cite-tooltip-page">p. {tooltip.source.page_number}</span>
                ) : tooltip.source.location ? (
                  <span className="rv2-cite-tooltip-page">{tooltip.source.location}</span>
                ) : null}
              </div>
              {tooltip.source.document_name ? (
                <div className="rv2-cite-tooltip-page mb-1">{tooltip.source.document_name}</div>
              ) : null}
              {tooltip.source.excerpt ? (
                <p className="rv2-cite-tooltip-text">{tooltip.source.excerpt}</p>
              ) : null}
              <div className="rv2-cite-tooltip-hint">Click to preview the cited PDF</div>
            </>
          ) : null}
        </div>,
        document.body
      )}
    </div>
  )
}
