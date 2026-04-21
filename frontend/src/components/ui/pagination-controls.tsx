import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { PaginationControls, getPaginationRange } from '@/hooks/usePagination'
import { ChevronFirst, ChevronLast } from 'lucide-react'

interface PaginationControlsProps {
  pagination: PaginationControls
  total: number
  showPageSizeSelector?: boolean
  pageSizeOptions?: number[]
  className?: string
}

export function PaginationControlsComponent({
  pagination,
  total,
  showPageSizeSelector = true,
  pageSizeOptions = [5, 10, 20, 50],
  className,
}: PaginationControlsProps) {
  const {
    page,
    pageSize,
    goToPage,
    goToFirstPage,
    setPageSize,
  } = pagination

  // Prefer server `total` so page counts stay in sync with "Showing X to Y" when the hook is created before data loads.
  const effectiveTotalPages = Math.max(1, Math.ceil((total || 0) / pageSize))
  const hasNextPage = page < effectiveTotalPages
  const hasPreviousPage = page > 1

  const paginationRange = getPaginationRange(page, effectiveTotalPages)
  
  const startItem = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total)
  const endItem = total === 0 ? 0 : Math.min(page * pageSize, total)

  if (effectiveTotalPages <= 1 && !showPageSizeSelector) {
    return null
  }

  return (
    <div className={`flex items-center justify-between space-x-2 ${className}`}>
      {/* Results info */}
      <div className="flex items-center space-x-2">
        <p className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {total} results
        </p>
        
        {showPageSizeSelector && (
          <div className="flex items-center space-x-2">
            <p className="text-sm text-muted-foreground">Show</p>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">per page</p>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {effectiveTotalPages > 1 && (
        <div className="flex items-center space-x-2">
          <Pagination>
            <PaginationContent>
              {/* First page button */}
              <PaginationItem>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToFirstPage}
                  disabled={!hasPreviousPage}
                  aria-label="Go to first page"
                >
                  <ChevronFirst className="h-4 w-4" />
                </Button>
              </PaginationItem>

              {/* Previous page button */}
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  className={!hasPreviousPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>

              {/* Page numbers */}
              {paginationRange.map((pageNumber, index) => (
                <PaginationItem key={index}>
                  {pageNumber === '...' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      onClick={() => goToPage(Math.max(1, Math.min(Number(pageNumber), effectiveTotalPages)))}
                      isActive={pageNumber === page}
                      className="cursor-pointer"
                    >
                      {pageNumber}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}

              {/* Next page button */}
              <PaginationItem>
                <PaginationNext
                  onClick={() => {
                    if (hasNextPage) goToPage(Math.min(page + 1, effectiveTotalPages))
                  }}
                  className={!hasNextPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>

              {/* Last page button */}
              <PaginationItem>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => goToPage(effectiveTotalPages)}
                  disabled={!hasNextPage}
                  aria-label="Go to last page"
                >
                  <ChevronLast className="h-4 w-4" />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
