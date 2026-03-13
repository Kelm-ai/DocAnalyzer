import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { BookOpen } from "lucide-react"
import { Navigation } from "./Navigation"

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-0.5 bg-sc-gold" />
      <div className="border-b border-border bg-white">
        <div className="container mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <img src="/sc-logo.png" alt="Suttons Creek" className="h-8 w-8 rounded" />
              <span className="text-lg font-light tracking-wide text-sc">
                Suttons Creek Compliance
              </span>
            </Link>
            <Navigation />
          </div>
          <Link
            to="/docs"
            className="flex items-center space-x-1 text-sm text-muted-foreground hover:text-sc transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            <span>Work Instruction</span>
          </Link>
        </div>
      </div>
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
