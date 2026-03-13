import { FileText, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container flex h-14 items-center">
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center space-x-2">
          <img src="/sc-logo.png" alt="Suttons Creek" className="h-6 w-6 rounded" />
          <h1 className="text-lg font-light tracking-wide text-sc">Suttons Creek Compliance</h1>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Regulatory Document Assessment</span>
          </div>
        </div>
      </div>
    </header>
  )
}