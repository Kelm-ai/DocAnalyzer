import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table"
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

type ColumnMeta = {
  headerClassName?: string
  cellClassName?: string
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  toolbarSlot?: React.ReactNode
  filterColumn?: string
  filterPlaceholder?: string
  initialPageSize?: number
  initialSorting?: SortingState
  onRowClick?: (row: Row<TData>) => void
  rowClassName?: (row: Row<TData>) => string | undefined
  isRowClickable?: (row: Row<TData>) => boolean
  tableContainerClassName?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbarSlot,
  filterColumn = "title",
  filterPlaceholder = "Filter...",
  initialPageSize = 10,
  initialSorting = [],
  onRowClick,
  rowClassName,
  isRowClickable,
  tableContainerClassName,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    initialState: {
      pagination: {
        pageSize: initialPageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        {table.getColumn(filterColumn) ? (
          <Input
            placeholder={filterPlaceholder}
            value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn(filterColumn)?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        ) : <div />}
        {toolbarSlot ? <div className="sm:ml-auto">{toolbarSlot}</div> : null}
      </div>
      <div className={cn("rounded-md border", tableContainerClassName)}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className={cn((header.column.columnDef.meta as ColumnMeta | undefined)?.headerClassName)}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            "flex items-center text-left",
                            header.column.getCanSort() ? "cursor-pointer select-none" : undefined
                          )}
                          onClick={
                            header.column.getCanSort()
                              ? header.column.getToggleSortingHandler()
                              : undefined
                          }
                        >
                          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() ? (
                              header.column.getIsSorted() === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 text-slate-400" />
                              )
                            ) : null}
                          </span>
                        </div>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={
                    onRowClick && (isRowClickable ? isRowClickable(row) : true)
                      ? () => onRowClick(row)
                      : undefined
                  }
                  className={cn(
                    onRowClick && (isRowClickable ? isRowClickable(row) : true)
                      ? "cursor-pointer"
                      : undefined,
                    rowClassName?.(row)
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn((cell.column.columnDef.meta as ColumnMeta | undefined)?.cellClassName)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
