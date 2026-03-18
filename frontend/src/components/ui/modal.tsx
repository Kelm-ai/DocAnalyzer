import { useEffect } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface ModalProps {
  open: boolean
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  size?: "sm" | "md" | "lg"
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (typeof window === "undefined" || !open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(90, 74, 63, 0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full rounded-2xl bg-background shadow-[0_20px_60px_rgba(90,74,63,0.15),0_4px_16px_rgba(90,74,63,0.06)]",
          "max-h-[90vh] overflow-y-auto",
          sizeClasses[size]
        )}
      >
        <div className="flex justify-between border-b border-border px-6 py-4">
          <div>
            {title ? <h2 className="text-lg font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
            aria-label="Close"
          >
            <span aria-hidden>&times;</span>
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-3 border-t border-border px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
