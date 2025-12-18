import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import {
  Upload,
  FileSearch,
  Layers,
} from "lucide-react"

const navItems = [
  {
    title: "Upload",
    href: "/",
    icon: Upload,
    description: "Upload documents for evaluation"
  },
  {
    title: "Frameworks",
    href: "/frameworks",
    icon: Layers,
    description: "Manage evaluation frameworks"
  },
  {
    title: "Evaluations",
    href: "/evaluations",
    icon: FileSearch,
    description: "View ongoing evaluations"
  }
]

interface NavigationProps {
  className?: string
  onClick?: () => void
}

export function Navigation({ className, onClick }: NavigationProps) {
  const location = useLocation()

  return (
    <nav className={cn("flex space-x-6 lg:space-x-8", className)}>
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = location.pathname === item.href
        
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center space-x-2 text-sm font-medium transition-colors hover:text-blue-600",
              isActive
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.title}</span>
          </Link>
        )
      })}
    </nav>
  )
}
