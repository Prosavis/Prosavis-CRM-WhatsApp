import React from 'react';
import {
  Paper,
  Table,
  TableContainer,
  TablePagination,
  useMediaQuery,
  useTheme,
} from '@mui/material';

interface MetricsDataTableProps {
  children: React.ReactNode;
  ariaLabel: string;
  count?: number;
  page?: number;
  rowsPerPage?: number;
  rowsPerPageOptions?: number[];
  onPageChange?: (page: number) => void;
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  maxHeight?: number;
  outlined?: boolean;
}

const MetricsDataTable: React.FC<MetricsDataTableProps> = ({
  children,
  ariaLabel,
  count,
  page = 0,
  rowsPerPage = 25,
  rowsPerPageOptions = [25, 50, 100],
  onPageChange,
  onRowsPerPageChange,
  maxHeight = 520,
  outlined = false,
}) => {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const paginated = typeof count === 'number' && Boolean(onPageChange);

  return (
    <>
      <TableContainer
        component={outlined ? Paper : 'div'}
        variant={outlined ? 'outlined' : undefined}
        aria-label={ariaLabel}
        sx={{
          maxHeight,
          overflowX: 'auto',
          '& .MuiTableCell-root': {
            px: compact ? 1 : 2,
            py: compact ? 0.75 : 1,
            whiteSpace: compact ? 'nowrap' : 'normal',
          },
        }}
      >
        <Table size="small" stickyHeader aria-label={ariaLabel}>
          {children}
        </Table>
      </TableContainer>
      {paginated ? (
        <TablePagination
          component="div"
          count={count}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_event, nextPage) => onPageChange?.(nextPage)}
          onRowsPerPageChange={
            onRowsPerPageChange
              ? (event) => onRowsPerPageChange(Number.parseInt(event.target.value, 10))
              : undefined
          }
          rowsPerPageOptions={onRowsPerPageChange ? rowsPerPageOptions : [rowsPerPage]}
          labelRowsPerPage="Filas"
        />
      ) : null}
    </>
  );
};

export default MetricsDataTable;
