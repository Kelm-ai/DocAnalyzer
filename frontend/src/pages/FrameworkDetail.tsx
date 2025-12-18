import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, Copy, Save, ChevronDown, ChevronUp } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import type { ISORequirement } from "@/lib/types"
import { api, type Framework, type RequirementCreatePayload, APIError } from "@/lib/api"

const ADMIN_MODE = import.meta.env.VITE_ADMIN_MODE === 'true'

interface RequirementFormState {
  clause: string
  title: string
  requirement_text: string
  display_order: string
  evaluation_type: string
}

const initialFormState: RequirementFormState = {
  clause: "",
  title: "",
  requirement_text: "",
  display_order: "0",
  evaluation_type: "",
}

interface RequirementRowActionsProps {
  requirement: ISORequirement
  onEdit: (requirement: ISORequirement) => void
  onDuplicate: (requirement: ISORequirement) => void
  onDelete: (requirement: ISORequirement) => void
}

function RequirementRowActions({ requirement, onEdit, onDuplicate, onDelete }: RequirementRowActionsProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div className="relative flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 z-20 mt-2 w-40 rounded-md border border-gray-100 bg-white py-1 text-sm shadow-lg"
          role="menu"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
            onClick={() => { setOpen(false); onEdit(requirement); }}
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
            onClick={() => { setOpen(false); onDuplicate(requirement); }}
          >
            <Copy className="h-4 w-4" /> Duplicate
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
            onClick={() => { setOpen(false); onDelete(requirement); }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

const columnsFactory = (
  onEdit: (req: ISORequirement) => void,
  onDuplicate: (req: ISORequirement) => void,
  onDelete: (req: ISORequirement) => void
): ColumnDef<ISORequirement>[] => [
  {
    accessorKey: "clause",
    header: "Clause",
    cell: ({ row }) => (
      <span className="font-medium text-gray-900">{row.original.clause}</span>
    ),
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className="font-medium text-gray-900">{row.original.title}</div>
    ),
  },
  {
    accessorKey: "display_order",
    header: "Order",
    cell: ({ row }) => (
      <span className="text-sm text-gray-700">
        {Number.isFinite(row.original.display_order) ? row.original.display_order : "—"}
      </span>
    ),
  },
  ...(ADMIN_MODE
    ? [{
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }: { row: { original: ISORequirement } }) => (
          <RequirementRowActions
            requirement={row.original}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ),
      } satisfies ColumnDef<ISORequirement>]
    : []),
]

export function FrameworkDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [framework, setFramework] = useState<Framework | null>(null)
  const [requirements, setRequirements] = useState<ISORequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // System prompt editing
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState("")
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)
  const [promptDirty, setPromptDirty] = useState(false)

  // Requirement form state
  const [formState, setFormState] = useState<RequirementFormState>(initialFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ISORequirement | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    let isMounted = true

    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const [fw, reqs] = await Promise.all([
          api.getFramework(id),
          api.getRequirements(id),
        ])
        if (isMounted) {
          setFramework(fw)
          setEditedPrompt(fw.system_prompt)
          setRequirements(reqs)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => { isMounted = false }
  }, [id])

  useEffect(() => {
    if (!successMessage) return
    const timer = window.setTimeout(() => setSuccessMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [successMessage])

  useEffect(() => {
    if (framework) {
      setPromptDirty(editedPrompt !== framework.system_prompt)
    }
  }, [editedPrompt, framework])

  const handleSavePrompt = async () => {
    if (!framework || !id) return
    try {
      setIsSavingPrompt(true)
      const updated = await api.updateFramework(id, { system_prompt: editedPrompt })
      setFramework(updated)
      setSuccessMessage("System prompt saved successfully")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingPrompt(false)
    }
  }

  const handleFieldChange = (field: keyof RequirementFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = useCallback(() => {
    setFormState(initialFormState)
    setFormError(null)
  }, [])

  const handleModalClose = useCallback(() => {
    if (isSubmitting) return
    setIsModalOpen(false)
    setActiveRequirementId(null)
    setModalMode("create")
    resetForm()
  }, [isSubmitting, resetForm])

  const handleModalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id) return

    if (!formState.title.trim()) {
      setFormError("Title is required")
      return
    }
    if (!formState.clause.trim()) {
      setFormError("Clause is required")
      return
    }

    const payload: RequirementCreatePayload = {
      clause: formState.clause.trim(),
      title: formState.title.trim(),
      requirement_text: formState.requirement_text.trim() || undefined,
      display_order: parseInt(formState.display_order, 10) || 0,
      evaluation_type: formState.evaluation_type.trim() || undefined,
      framework_id: id,
    }

    try {
      setIsSubmitting(true)
      setFormError(null)

      if (modalMode === "create") {
        const created = await api.createRequirement(payload)
        setRequirements((prev) => [...prev, created].sort((a, b) => a.display_order - b.display_order))
        setSuccessMessage("Requirement added successfully")
      } else if (activeRequirementId) {
        const updated = await api.updateRequirement(activeRequirementId, payload)
        setRequirements((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        )
        setSuccessMessage("Requirement updated successfully")
      }

      handleModalClose()
    } catch (err) {
      if (err instanceof APIError && (err.status === 409 || err.status === 500)) {
        setFormError("A requirement with the same clause or title may already exist.")
      } else {
        setFormError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenCreate = useCallback(() => {
    setSuccessMessage(null)
    setModalMode("create")
    setActiveRequirementId(null)
    resetForm()
    setIsModalOpen(true)
  }, [resetForm])

  const handleEdit = useCallback((req: ISORequirement) => {
    setSuccessMessage(null)
    setModalMode("edit")
    setActiveRequirementId(req.id)
    setFormState({
      clause: req.clause,
      title: req.title,
      requirement_text: req.requirement_text ?? "",
      display_order: String(req.display_order ?? 0),
      evaluation_type: req.evaluation_type ?? "",
    })
    setIsModalOpen(true)
  }, [])

  const handleDuplicate = useCallback((req: ISORequirement) => {
    setSuccessMessage(null)
    setModalMode("create")
    setActiveRequirementId(null)
    setFormState({
      clause: `${req.clause}-copy`,
      title: `${req.title} (Copy)`,
      requirement_text: req.requirement_text ?? "",
      display_order: String(req.display_order ?? 0),
      evaluation_type: req.evaluation_type ?? "",
    })
    setIsModalOpen(true)
  }, [])

  const handleDelete = useCallback((req: ISORequirement) => {
    setDeleteError(null)
    setDeleteConfirm(req)
  }, [])

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    try {
      setIsDeleting(true)
      setDeleteError(null)
      await api.deleteRequirement(deleteConfirm.id)
      setRequirements((prev) => prev.filter((r) => r.id !== deleteConfirm.id))
      setSuccessMessage("Requirement deleted successfully")
      setDeleteConfirm(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = useMemo(
    () => columnsFactory(handleEdit, handleDuplicate, handleDelete),
    [handleEdit, handleDuplicate, handleDelete]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading framework...</div>
      </div>
    )
  }

  if (error && !framework) {
    return (
      <div className="space-y-4">
        <Link to="/frameworks" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back to Frameworks
        </Link>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    )
  }

  if (!framework) {
    return (
      <div className="space-y-4">
        <Link to="/frameworks" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back to Frameworks
        </Link>
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-yellow-700">Framework not found</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/frameworks" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      <div>
        <h2 className="text-3xl font-bold tracking-tight">{framework.name}</h2>
        {framework.standard_reference && (
          <p className="mt-1 text-lg text-muted-foreground">{framework.standard_reference}</p>
        )}
        {framework.description && (
          <p className="mt-2 text-muted-foreground">{framework.description}</p>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-700">{successMessage}</div>
      )}

      {/* System Prompt Section */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setPromptExpanded(!promptExpanded)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
        >
          <span className="font-medium text-gray-900">System Prompt</span>
          {promptExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
        </button>
        {promptExpanded && (
          <div className="border-t border-gray-200 p-4 space-y-3">
            <textarea
              value={editedPrompt}
              onChange={(e) => ADMIN_MODE && setEditedPrompt(e.target.value)}
              readOnly={!ADMIN_MODE}
              className={`w-full min-h-[300px] rounded-md border border-gray-200 px-3 py-2 text-sm font-mono shadow-sm transition ${
                ADMIN_MODE
                  ? "bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  : "bg-gray-50 text-gray-700 cursor-default"
              }`}
              placeholder="Enter the system prompt that will instruct the AI during evaluations..."
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                This prompt instructs the AI how to evaluate documents against this framework's requirements.
              </span>
              {ADMIN_MODE && (
                <Button
                  onClick={handleSavePrompt}
                  disabled={!promptDirty || isSavingPrompt}
                  size="sm"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSavingPrompt ? "Saving..." : "Save Prompt"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Requirements Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Requirements ({requirements.length})</h3>
          {ADMIN_MODE && (
            <Button onClick={handleOpenCreate}>Add Requirement</Button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={requirements}
          filterPlaceholder="Filter requirements..."
          initialSorting={[{ id: "display_order", desc: false }]}
        />
      </div>

      {/* Requirement Modal */}
      <Modal
        open={isModalOpen}
        onClose={handleModalClose}
        title={modalMode === "create" ? "Add Requirement" : "Edit Requirement"}
        footer={
          <>
            <Button type="button" variant="outline" onClick={handleModalClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form="requirement-form" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <form id="requirement-form" onSubmit={handleModalSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="clause">Clause *</label>
              <Input
                id="clause"
                value={formState.clause}
                onChange={(e) => handleFieldChange("clause", e.target.value)}
                placeholder="e.g. 4.1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="display_order">Order</label>
              <Input
                id="display_order"
                type="number"
                min={0}
                value={formState.display_order}
                onChange={(e) => handleFieldChange("display_order", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="title">Title *</label>
            <Input
              id="title"
              value={formState.title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              placeholder="Short title for the requirement"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="requirement_text">Requirement Text</label>
            <textarea
              id="requirement_text"
              value={formState.requirement_text}
              onChange={(e) => handleFieldChange("requirement_text", e.target.value)}
              placeholder="Detailed description of the requirement"
              className="min-h-[120px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
          )}
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => !isDeleting && setDeleteConfirm(null)}
        title="Delete Requirement"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Are you sure you want to delete "{deleteConfirm?.title}"? This action cannot be undone.
        </p>
        {deleteError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{deleteError}</div>
        )}
      </Modal>
    </div>
  )
}
