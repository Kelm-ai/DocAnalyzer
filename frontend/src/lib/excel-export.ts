import ExcelJS from "exceljs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExcelColumn {
  header: string
  key: string
  /** Column width in characters. Defaults to 20. */
  width?: number
  /** Enable text wrapping for long-form content. */
  wrap?: boolean
}

export interface ExcelExportConfig {
  /** Sheet name shown on the tab. */
  sheetName: string
  /** Output filename (should end with .xlsx). */
  filename: string
  columns: ExcelColumn[]
  /** Row data — each object's keys must match column `key` values. */
  rows: Record<string, unknown>[]
  /** Optional column key whose values should be colour-coded by status. */
  statusKey?: string
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" }, // slate-800
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
}

const ZEBRA_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8FAFC" }, // slate-50
}

const BORDER_COLOR = "FFE2E8F0" // slate-200

const THIN_BORDER: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: BORDER_COLOR },
}

const CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
}

const STATUS_COLORS: Record<string, string> = {
  PASS: "FFE8F5E9",       // green-50
  FAIL: "FFFCE4EC",       // red-50
  FLAGGED: "FFFFF8E1",    // amber-50
  NOT_APPLICABLE: "FFF5F5F5", // gray-100
  ERROR: "FFFCE4EC",      // red-50
  PENDING: "FFEDE7F6",    // purple-50
}

const STATUS_FONT_COLORS: Record<string, string> = {
  PASS: "FF2E7D32",       // green-800
  FAIL: "FFC62828",       // red-800
  FLAGGED: "FFF57F17",    // amber-900
  NOT_APPLICABLE: "FF757575",
  ERROR: "FFC62828",
  PENDING: "FF6A1B9A",
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

export async function exportToExcel(config: ExcelExportConfig): Promise<void> {
  const { sheetName, filename, columns, rows, statusKey } = config

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "DocAnalyzer"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  // -- Columns ---------------------------------------------------------------
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 20,
  }))

  // -- Header styling --------------------------------------------------------
  const headerRow = sheet.getRow(1)
  headerRow.height = 28
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.border = CELL_BORDER
    cell.alignment = { vertical: "middle", horizontal: "left" }
  })

  // -- Auto-filter -----------------------------------------------------------
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }

  // -- Data rows -------------------------------------------------------------
  const wrapKeys = new Set(columns.filter((c) => c.wrap).map((c) => c.key))

  for (const rowData of rows) {
    const row = sheet.addRow(
      columns.reduce(
        (acc, col) => {
          acc[col.key] = rowData[col.key] ?? ""
          return acc
        },
        {} as Record<string, unknown>
      )
    )

    const isEvenRow = (row.number - 1) % 2 === 0 // -1 because header is row 1

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colDef = columns[colNumber - 1]
      cell.border = CELL_BORDER
      cell.alignment = {
        vertical: "top",
        wrapText: wrapKeys.has(colDef.key),
      }

      // Zebra striping
      if (isEvenRow) {
        cell.fill = ZEBRA_FILL
      }

      // Status colour override
      if (statusKey && colDef.key === statusKey) {
        const val = String(cell.value ?? "").toUpperCase()
        if (STATUS_COLORS[val]) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: STATUS_COLORS[val] },
          }
          cell.font = {
            bold: true,
            color: { argb: STATUS_FONT_COLORS[val] ?? "FF000000" },
          }
        }
      }
    })
  }

  // -- Write to file ---------------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
