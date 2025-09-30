import type { ReactNode } from "react"
import { Navigation } from "./Navigation"

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200">
        <div className="container mx-auto px-4">
          <Navigation className="h-14 flex items-center" />
        </div>
      </div>
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
