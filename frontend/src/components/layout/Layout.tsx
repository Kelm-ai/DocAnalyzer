import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { BookOpen } from "lucide-react"
import { Navigation } from "./Navigation"

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200">
        <div className="container mx-auto px-4 flex items-center justify-between h-14">
          <Navigation />
          <Link
            to="/docs"
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span>Docs</span>
          </Link>
        </div>
      </div>
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
