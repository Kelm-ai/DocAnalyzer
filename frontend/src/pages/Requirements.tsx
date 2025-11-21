import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import type { ISORequirement } from "@/lib/types"
import { api, type RequirementCreatePayload, APIError } from "@/lib/api"

const TITLE_COPY_SUFFIX_REGEX = /\s+\(Copy(?: \d+)?\)$/i
const CLAUSE_COPY_SUFFIX_REGEX = /-copy(?:-\d+)?$/i

const buildCopyValue = (value: string, existingValues: string[]): string => {
  const base = value.replace(TITLE_COPY_SUFFIX_REGEX, "") || value
  const used = new Set(existingValues)
  let attempt = `${base} (Copy)`
  let counter = 2

  while (used.has(attempt)) {
    attempt = `${base} (Copy ${counter})`
    counter += 1
  }

  return attempt
}

const buildCopyClause = (value: string, existingValues: string[]): string => {
  const base = value.replace(CLAUSE_COPY_SUFFIX_REGEX, "") || value
  const used = new Set(existingValues)
  let attempt = `${base}-copy`
  let counter = 2

  while (used.has(attempt)) {
    attempt = `${base}-copy-${counter}`
    counter += 1
  }

  return attempt
}

interface RequirementFormState {
  clause: string
  title: string
  display_order: string
  evaluation_type: string
}

const initialFormState: RequirementFormState = {
  clause: "",
  title: "",
  display_order: "0",
  evaluation_type: "",
}

interface RequirementTableActions {
  onEdit: (requirement: ISORequirement) => void
  onDuplicate: (requirement: ISORequirement) => void
  onDelete: (requirement: ISORequirement) => void
}

const columnsFactory = ({ onEdit, onDuplicate, onDelete }: RequirementTableActions): ColumnDef<ISORequirement>[] => [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className="font-medium text-gray-900">{row.original.title}</div>
    ),
  },
  {
    accessorKey: "clause",
    header: "Clause Number",
    cell: ({ row }) => (
      <span className="font-medium text-gray-900">{row.original.clause}</span>
    ),
  },
  {
    accessorKey: "display_order",
    header: "Order",
    cell: ({ row }) => (
      <span className="text-sm text-gray-700">
        {Number.isFinite(row.original.display_order)
          ? row.original.display_order
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "evaluation_type",
    header: "Evaluation Type",
    cell: ({ row }) => (
      <span className="text-sm text-gray-700">
        {row.original.evaluation_type || "—"}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    meta: {
      headerClassName: "w-[48px]",
      cellClassName: "w-[48px] text-right",
    },
    cell: ({ row }) => (
      <RequirementRowActions
        requirement={row.original}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    ),
  },
]

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
    if (!open) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
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
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Open actions</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="absolute right-0 z-20 mt-2 w-40 rounded-md border border-gray-100 bg-white py-1 text-sm shadow-lg"
          role="menu"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 transition hover:bg-gray-100"
            onClick={() => {
              setOpen(false)
              onEdit(requirement)
            }}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-700 transition hover:bg-gray-100"
            onClick={() => {
              setOpen(false)
              onDuplicate(requirement)
            }}
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 transition hover:bg-red-50"
            onClick={() => {
              setOpen(false)
              onDelete(requirement)
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

interface ConfirmationDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  isConfirming: boolean
  errorMessage?: string | null
}

function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  isConfirming,
  errorMessage,
}: ConfirmationDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Please wait..." : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700">{description}</p>
      {errorMessage ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </Modal>
  )
}

export function Requirements() {
  const [requirements, setRequirements] = useState<ISORequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formState, setFormState] = useState<RequirementFormState>(initialFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null)
  const [confirmationState, setConfirmationState] = useState<{
    type: "duplicate" | "delete"
    requirement: ISORequirement
  } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadRequirements = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await api.getRequirements()
        if (isMounted) {
          setRequirements(data)
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

    void loadRequirements()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!successMessage) {
      return
    }

    const timer = window.setTimeout(() => setSuccessMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [successMessage])

  const handleFieldChange = (
    field: keyof RequirementFormState,
    value: string
  ) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = useCallback(() => {
    setFormState(initialFormState)
    setFormError(null)
  }, [])

  const handleModalClose = useCallback(() => {
    if (isSubmitting) {
      return
    }
    setIsModalOpen(false)
    setActiveRequirementId(null)
    setModalMode("create")
    resetForm()
  }, [isSubmitting, resetForm])

  const handleModalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!formState.title.trim()) {
      setFormError("Title is required")
      return
    }

    if (!formState.clause.trim()) {
      setFormError("Clause is required")
      return
    }

    const parsedOrder = Number.parseInt(formState.display_order.trim() || "0", 10)
    if (Number.isNaN(parsedOrder) || parsedOrder < 0) {
      setFormError("Order must be a non-negative number")
      return
    }

    const payload: RequirementCreatePayload = {
      clause: formState.clause.trim(),
      title: formState.title.trim(),
      display_order: parsedOrder,
      evaluation_type: formState.evaluation_type.trim() || undefined,
    }

    try {
      setIsSubmitting(true)
      setFormError(null)

      if (modalMode === "create") {
        const created = await api.createRequirement(payload)
        setRequirements((prev) => [created, ...prev])
        setSuccessMessage("Requirement added successfully")
      } else if (activeRequirementId) {
        const updated = await api.updateRequirement(activeRequirementId, payload)
        setRequirements((prev) =>
          prev.map((requirement) => (requirement.id === updated.id ? updated : requirement))
        )
        setSuccessMessage("Requirement updated successfully")
      }

      setIsModalOpen(false)
      setActiveRequirementId(null)
      setModalMode("create")
      resetForm()
  } catch (err) {
    if (err instanceof APIError && (err.status === 409 || err.status === 500)) {
      const rawDetail = typeof err.details === "string" ? err.details : undefined
      const duplicateDetected = Boolean(
        rawDetail && rawDetail.toLowerCase().includes("duplicate")
      )
      if (duplicateDetected || err.status === 409) {
        setFormError("A requirement with the same clause or title already exists. Please adjust and try again.")
      } else {
        setFormError(err.message || "Failed to save requirement")
      }
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

  const handleEdit = useCallback((requirement: ISORequirement) => {
    setSuccessMessage(null)
    setModalMode("edit")
    setActiveRequirementId(requirement.id)
    setFormState({
      clause: requirement.clause,
      title: requirement.title,
      display_order: String(requirement.display_order ?? 0),
      evaluation_type: requirement.evaluation_type ?? "",
    })
    setIsModalOpen(true)
  }, [])

  const handleDuplicate = useCallback((requirement: ISORequirement) => {
    setConfirmError(null)
    setConfirmationState({ type: "duplicate", requirement })
  }, [])

  const handleDelete = useCallback((requirement: ISORequirement) => {
    setConfirmError(null)
    setConfirmationState({ type: "delete", requirement })
  }, [])

  const handleConfirmAction = async () => {
    if (!confirmationState) {
      return
    }

    try {
      setIsConfirming(true)
      setConfirmError(null)

      if (confirmationState.type === "duplicate") {
        const requirement = confirmationState.requirement
        const copyClause = buildCopyClause(
          requirement.clause,
          requirements.map((item) => item.clause)
        )
        const copyTitle = buildCopyValue(
          requirement.title,
          requirements.map((item) => item.title)
        )

        setModalMode("create")
        setActiveRequirementId(null)
        setFormState({
          clause: copyClause,
          title: copyTitle,
          display_order: String(requirement.display_order ?? 0),
          evaluation_type: requirement.evaluation_type ?? "",
        })
        setIsModalOpen(true)
        setConfirmationState(null)
        return
      } else {
        const requirement = confirmationState.requirement
        await api.deleteRequirement(requirement.id)
        setRequirements((prev) => prev.filter((item) => item.id !== requirement.id))
        setSuccessMessage("Requirement deleted successfully")
      }

      setConfirmationState(null)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsConfirming(false)
    }
  }

  const columns = useMemo(
    () =>
      columnsFactory({
        onEdit: handleEdit,
        onDuplicate: handleDuplicate,
        onDelete: handleDelete,
      }),
    [handleEdit, handleDuplicate, handleDelete]
  )

  const confirmationDialog = confirmationState
    ? {
        open: true,
        title: confirmationState.type === "duplicate" ? "Duplicate requirement" : "Delete requirement",
        description:
          confirmationState.type === "duplicate"
            ? `Create a new requirement using "${confirmationState.requirement.title}" as a template?`
            : `This action cannot be undone. Delete "${confirmationState.requirement.title}"?`,
        confirmLabel: confirmationState.type === "duplicate" ? "Duplicate" : "Delete",
      }
    : { open: false, title: "", description: "", confirmLabel: "" }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Requirements</h2>
        <p className="mt-2 text-muted-foreground">
          Browse and manage ISO requirements served by the compliance API
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-700">
          {successMessage}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={requirements}
        filterPlaceholder="Filter requirements..."
        toolbarSlot={
          <Button onClick={handleOpenCreate}>
            Add new requirement
          </Button>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading requirements…</div>
      ) : null}

      <Modal
        open={isModalOpen}
        onClose={handleModalClose}
        title={modalMode === "create" ? "Add requirement" : "Edit requirement"}
        description={
          modalMode === "create"
            ? "Provide the requirement details to add it to the library."
            : "Update the selected requirement."
        }
      
        footer={
          <>
            <Button type="button" variant="outline" onClick={handleModalClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form="requirement-form" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save requirement"}
            </Button>
          </>
        }
      >
        <form id="requirement-form" onSubmit={handleModalSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="clause">
                Clause
              </label>
              <Input
                id="clause"
                value={formState.clause}
                onChange={(event) => handleFieldChange("clause", event.target.value)}
                placeholder="e.g. 4.1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="display_order">
                Order
              </label>
              <Input
                id="display_order"
                type="number"
                min={0}
                step={1}
                value={formState.display_order}
                onChange={(event) => handleFieldChange("display_order", event.target.value)}
                placeholder="e.g. 1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="evaluation_type">
                Evaluation Type
              </label>
             <Input
                id="evaluation_type"
                value={formState.evaluation_type}
                onChange={(event) => handleFieldChange("evaluation_type", event.target.value)}
                placeholder="e.g. Manual, Automated"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-900" htmlFor="title">
              Title
            </label>
            <Input
              id="title"
              value={formState.title}
              onChange={(event) => handleFieldChange("title", event.target.value)}
              placeholder="Short title for the requirement"
            />
          </div>

          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
        </form>
      </Modal>

      <ConfirmationDialog
        open={confirmationDialog.open}
        title={confirmationDialog.title}
        description={confirmationDialog.description}
        confirmLabel={confirmationDialog.confirmLabel}
        onConfirm={handleConfirmAction}
        onCancel={() => {
          if (isConfirming) {
            return
          }
          setConfirmationState(null)
        }}
        isConfirming={isConfirming}
        errorMessage={confirmError}
      />
    </div>
  )
}
