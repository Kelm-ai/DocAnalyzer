import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download, Calendar, Send } from "lucide-react"

export function Reports() {
  const reports = [
    {
      id: "1",
      name: "Risk_Management_Plan_v2.0_Report",
      date: "2024-11-09",
      type: "Full Compliance Report",
      score: 71.4
    },
    {
      id: "2",
      name: "Clinical_Evaluation_Report_Summary",
      date: "2024-11-08",
      type: "Executive Summary",
      score: 85.2
    },
    {
      id: "3",
      name: "Q3_2024_Compliance_Review",
      date: "2024-10-01",
      type: "Quarterly Review",
      score: 78.9
    }
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Compliance Reports</h2>
        <p className="text-muted-foreground mt-2">
          Generate and manage ISO 14971 compliance reports
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">This quarter</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">78.5%</div>
            <p className="text-xs text-muted-foreground">+5.2% from last quarter</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Next Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Dec 15</div>
            <p className="text-xs text-muted-foreground">Annual audit</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate New Report</CardTitle>
          <CardDescription>
            Create customized compliance reports for different stakeholders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-6 text-center">
                <FileText className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Full Report</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Comprehensive compliance analysis
                </p>
                <Button size="sm" className="w-full">Generate</Button>
              </CardContent>
            </Card>
            
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-6 text-center">
                <Send className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Executive Summary</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  High-level overview for management
                </p>
                <Button size="sm" className="w-full">Generate</Button>
              </CardContent>
            </Card>
            
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardContent className="p-6 text-center">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Audit Package</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Complete documentation for auditors
                </p>
                <Button size="sm" className="w-full">Generate</Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
          <CardDescription>
            Previously generated compliance reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reports.map(report => (
              <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{report.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {report.type} • {report.date}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="font-semibold">{report.score}%</p>
                    <p className="text-xs text-muted-foreground">Score</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}