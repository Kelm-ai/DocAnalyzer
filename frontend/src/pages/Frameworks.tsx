import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2, Plus, CheckCircle, XCircle } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { api, type Framework, type FrameworkCreatePayload, APIError } from "@/lib/api"

// Feature flag: Set VITE_ADMIN_MODE=true to enable framework management
const ADMIN_MODE = import.meta.env.VITE_ADMIN_MODE === 'true'

interface FrameworkFormState {
  name: string
  slug: string
  description: string
  standard_reference: string
  system_prompt: string
  is_active: boolean
  display_order: string
}

const initialFormState: FrameworkFormState = {
  name: "",
  slug: "",
  description: "",
  standard_reference: "",
  system_prompt: "",
  is_active: true,
  display_order: "0",
}

// Generate slug from name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface FrameworkRowActionsProps {
  framework: Framework
  onEdit: (framework: Framework) => void
  onDelete: (framework: Framework) => void
}

function FrameworkRowActions({ framework, onEdit, onDelete }: FrameworkRowActionsProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className="rounded-full p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-8 w-40 rounded-md border border-gray-100 bg-white py-1 text-sm shadow-lg"
          role="menu"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onEdit(framework)
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDelete(framework)
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

const columnsFactory = (
  onEdit: (framework: Framework) => void,
  onDelete: (framework: Framework) => void
): ColumnDef<Framework>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="font-medium text-gray-900">{row.original.name}</div>
    ),
  },
  {
    accessorKey: "standard_reference",
    header: "Standard",
    cell: ({ row }) => (
      <span className="text-sm text-gray-700">
        {row.original.standard_reference || "—"}
      </span>
    ),
  },
  {
    accessorKey: "requirements_count",
    header: "Requirements",
    cell: ({ row }) => (
      <span className="text-sm text-gray-700">
        {row.original.requirements_count ?? 0}
      </span>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
        row.original.is_active
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-600"
      }`}>
        {row.original.is_active ? (
          <><CheckCircle className="h-3 w-3" /> Active</>
        ) : (
          <><XCircle className="h-3 w-3" /> Inactive</>
        )}
      </span>
    ),
  },
  ...(ADMIN_MODE
    ? [
        {
          id: "actions",
          header: "",
          enableSorting: false,
          cell: ({ row }: { row: { original: Framework } }) => (
            <FrameworkRowActions
              framework={row.original}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ),
        } satisfies ColumnDef<Framework>,
      ]
    : []),
]

export function Frameworks() {
  const navigate = useNavigate()
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formState, setFormState] = useState<FrameworkFormState>(initialFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [activeFrameworkId, setActiveFrameworkId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Framework | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadFrameworks = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await api.getFrameworks()
        if (isMounted) {
          setFrameworks(data)
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

    void loadFrameworks()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!successMessage) return
    const timer = window.setTimeout(() => setSuccessMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [successMessage])

  const handleFieldChange = (field: keyof FrameworkFormState, value: string | boolean) => {
    setFormState((prev) => {
      const updated = { ...prev, [field]: value }
      // Auto-generate slug from name if slug is empty or matches auto-generated
      if (field === "name" && (prev.slug === "" || prev.slug === generateSlug(prev.name))) {
        updated.slug = generateSlug(value as string)
      }
      return updated
    })
  }

  const resetForm = useCallback(() => {
    setFormState(initialFormState)
    setFormError(null)
  }, [])

  const handleModalClose = useCallback(() => {
    if (isSubmitting) return
    setIsModalOpen(false)
    setActiveFrameworkId(null)
    setModalMode("create")
    resetForm()
  }, [isSubmitting, resetForm])

  const handleModalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!formState.name.trim()) {
      setFormError("Name is required")
      return
    }
    if (!formState.slug.trim()) {
      setFormError("Slug is required")
      return
    }
    if (!formState.system_prompt.trim()) {
      setFormError("System prompt is required")
      return
    }

    const payload: FrameworkCreatePayload = {
      name: formState.name.trim(),
      slug: formState.slug.trim().toLowerCase(),
      description: formState.description.trim() || undefined,
      standard_reference: formState.standard_reference.trim() || undefined,
      system_prompt: formState.system_prompt.trim(),
      is_active: formState.is_active,
      display_order: parseInt(formState.display_order, 10) || 0,
    }

    try {
      setIsSubmitting(true)
      setFormError(null)

      if (modalMode === "create") {
        const created = await api.createFramework(payload)
        setFrameworks((prev) => [created, ...prev])
        setSuccessMessage("Framework created successfully")
      } else if (activeFrameworkId) {
        const updated = await api.updateFramework(activeFrameworkId, payload)
        setFrameworks((prev) =>
          prev.map((f) => (f.id === updated.id ? updated : f))
        )
        setSuccessMessage("Framework updated successfully")
      }

      handleModalClose()
    } catch (err) {
      if (err instanceof APIError && err.status === 409) {
        setFormError("A framework with this slug already exists")
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
    setActiveFrameworkId(null)
    resetForm()
    setIsModalOpen(true)
  }, [resetForm])

  const handleEdit = useCallback((framework: Framework) => {
    setSuccessMessage(null)
    setModalMode("edit")
    setActiveFrameworkId(framework.id)
    setFormState({
      name: framework.name,
      slug: framework.slug,
      description: framework.description ?? "",
      standard_reference: framework.standard_reference ?? "",
      system_prompt: framework.system_prompt,
      is_active: framework.is_active,
      display_order: String(framework.display_order),
    })
    setIsModalOpen(true)
  }, [])

  const handleDelete = useCallback((framework: Framework) => {
    setDeleteError(null)
    setDeleteConfirm(framework)
  }, [])

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return

    try {
      setIsDeleting(true)
      setDeleteError(null)
      await api.deleteFramework(deleteConfirm.id)
      setFrameworks((prev) => prev.filter((f) => f.id !== deleteConfirm.id))
      setSuccessMessage("Framework deleted successfully")
      setDeleteConfirm(null)
    } catch (err) {
      if (err instanceof APIError && err.status === 409) {
        setDeleteError("Cannot delete framework with existing evaluations. Deactivate it instead.")
      } else {
        setDeleteError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRowClick = useCallback((framework: Framework) => {
    navigate(`/frameworks/${framework.id}`)
  }, [navigate])

  const columns = useMemo(
    () => columnsFactory(handleEdit, handleDelete),
    [handleEdit, handleDelete]
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Frameworks</h2>
        <p className="mt-2 text-muted-foreground">
          Configure evaluation frameworks and their requirements
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-700">
          {successMessage}
        </div>
      )}

      <DataTable
        columns={columns}
        data={frameworks}
        filterPlaceholder="Filter frameworks..."
        initialSorting={[{ id: "name", desc: false }]}
        onRowClick={(row) => handleRowClick(row.original)}
        toolbarSlot={
          ADMIN_MODE ? (
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Framework
            </Button>
          ) : null
        }
      />

      {loading && (
        <div className="text-sm text-muted-foreground">Loading frameworks...</div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={handleModalClose}
        title={modalMode === "create" ? "Add Framework" : "Edit Framework"}
        description={
          modalMode === "create"
            ? "Create a new evaluation framework with custom requirements and system prompt."
            : "Update the framework configuration."
        }
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" onClick={handleModalClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form="framework-form" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Framework"}
            </Button>
          </>
        }
      >
        <form id="framework-form" onSubmit={handleModalSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="name">
                Name *
              </label>
              <Input
                id="name"
                value={formState.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                placeholder="e.g. Risk Management"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="slug">
                Slug *
              </label>
              <Input
                id="slug"
                value={formState.slug}
                onChange={(e) => handleFieldChange("slug", e.target.value)}
                placeholder="e.g. risk-management"
              />
              <span className="text-xs text-gray-500">URL-friendly identifier (lowercase, hyphens only)</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="standard_reference">
                Standard Reference
              </label>
              <Input
                id="standard_reference"
                value={formState.standard_reference}
                onChange={(e) => handleFieldChange("standard_reference", e.target.value)}
                placeholder="e.g. ISO 14971:2019"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="display_order">
                Display Order
              </label>
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
            <label className="text-sm font-medium text-gray-900" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              value={formState.description}
              onChange={(e) => handleFieldChange("description", e.target.value)}
              placeholder="Brief description of this evaluation framework"
              className="min-h-[80px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="system_prompt">
              System Prompt *
            </label>
            <textarea
              id="system_prompt"
              value={formState.system_prompt}
              onChange={(e) => handleFieldChange("system_prompt", e.target.value)}
              placeholder="The AI instruction prompt used during document evaluation..."
              className="min-h-[200px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-mono shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <span className="text-xs text-gray-500">
              This prompt instructs the AI how to evaluate documents against this framework's requirements.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formState.is_active}
              onChange={(e) => handleFieldChange("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label className="text-sm font-medium text-gray-900" htmlFor="is_active">
              Active (available for new evaluations)
            </label>
          </div>

          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => !isDeleting && setDeleteConfirm(null)}
        title="Delete Framework"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
        </p>
        {deleteError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {deleteError}
          </div>
        )}
      </Modal>
    </div>
  )
}
