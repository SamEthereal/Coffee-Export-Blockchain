import React from 'react';
import {
  Box,
  Typography,
  Alert,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Chip,
} from '@mui/material';
import {
  Assignment,
  Visibility,
  Payment,
  CheckCircle,
} from '@mui/icons-material';
import {
  PortalCard,
  PrimaryButton,
  SecondaryButton,
  StatusChip,
} from '@/components/shared/portal';

export interface PaymentReleaseTabProps {
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  setAmountMin: (a: string) => void;
  setAmountMax: (a: string) => void;
  paymentReleaseFilter: string;
  setPaymentReleaseFilter: (f: string) => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  rowsPerPage: number;
  handleChangeRowsPerPage: (n: number) => void;
  handleChangePage: (p: number) => void;
  filteredLCs: any[];
  paginatedLCs: any[];
  onViewAuditTrail: (entityType: string, entityId: string) => void;
  onViewLCDetails: (lc: any) => void;
  onConfirmPaymentRelease: (lc: any) => void;
}

export const PaymentReleaseTab: React.FC<PaymentReleaseTabProps> = ({
  searchTerm,
  setSearchTerm,
  setAmountMin,
  setAmountMax,
  paymentReleaseFilter,
  setPaymentReleaseFilter,
  currentPage,
  setCurrentPage,
  rowsPerPage,
  handleChangeRowsPerPage,
  handleChangePage,
  filteredLCs,
  paginatedLCs,
  onViewAuditTrail,
  onViewLCDetails,
  onConfirmPaymentRelease,
}) => {
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  return (
    <PortalCard brand="BANKS" title="Payment Release">
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          Release payments for LCs where documents have been verified and accepted.
        </Typography>
      </Alert>

      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search payment releases..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(0);
          }}
          sx={{ minWidth: 280 }}
        />
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            setSearchTerm('');
            setAmountMin('');
            setAmountMax('');
            setPaymentReleaseFilter('READY_FOR_PAYMENT');
            setCurrentPage(0);
          }}
        >
          Clear Filters
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" color="black">
          Showing {paginatedLCs.length} of {filteredLCs.length}
        </Typography>
      </Box>

      {filteredLCs.length === 0 ? (
        <Alert severity="warning">
          No LCs ready for payment release for the selected filter.
        </Alert>
      ) : (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {paymentReleaseFilter === 'RELEASED_TODAY' ? 'Payments Released Today' : paymentReleaseFilter === 'TOTAL_RELEASED' ? 'Total Released Payments' : 'LCs Ready for Payment Release'} ({filteredLCs.length})
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '15%' }}><strong>LC ID</strong></TableCell>
                  <TableCell sx={{ width: '20%' }}><strong>Exporter</strong></TableCell>
                  <TableCell sx={{ width: '15%' }}><strong>Amount</strong></TableCell>
                  <TableCell sx={{ width: '12%' }}><strong>Status</strong></TableCell>
                  <TableCell sx={{ width: '13%' }}><strong>Verified Date</strong></TableCell>
                  <TableCell align="right" sx={{ width: '25%' }}><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedLCs.map((lc) => (
                  <TableRow key={lc.lcId}>
                    <TableCell>{lc.lcId}</TableCell>
                    <TableCell>{lc.exporterId}</TableCell>
                    <TableCell>
                      <strong>${lc.amount?.toLocaleString()} {lc.currency}</strong>
                    </TableCell>
                    <TableCell>
                      <StatusChip label={lc.status} status={chipStatus(lc.status)} />
                    </TableCell>
                    <TableCell>
                      {lc.requestDate ? new Date(lc.requestDate).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <SecondaryButton brand="BANKS"
                          size="small"
                          startIcon={<Assignment />}
                          onClick={() => onViewAuditTrail('LC', lc.lcId)}
                        >
                          Audit Trail
                        </SecondaryButton>
                        <SecondaryButton brand="BANKS"
                          size="small"
                          startIcon={<Visibility />}
                          onClick={() => onViewLCDetails(lc)}
                        >
                          View Details
                        </SecondaryButton>
                        {lc.status === 'UTILIZED' ? (
                          <PrimaryButton brand="BANKS"
                            size="small"
                            startIcon={<Payment />}
                            loadingLabel="Releasing…"
                            ledgerWrite
                            onClick={() => onConfirmPaymentRelease(lc)}
                          >
                            Release Payment
                          </PrimaryButton>
                        ) : lc.status === 'PAYMENT_RELEASED' ? (
                          <Chip 
                            icon={<CheckCircle />} 
                            label="Payment Released" 
                            color="success" 
                            size="small" 
                          />
                        ) : null}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {filteredLCs.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="black">Rows per page:</Typography>
                <TextField
                  select
                  size="small"
                  value={rowsPerPage}
                  onChange={(e) => handleChangeRowsPerPage(parseInt(e.target.value))}
                  sx={{ width: 80 }}
                >
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={25}>25</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" color="black">
                  Page {currentPage + 1} shows items {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, filteredLCs.length)} of {filteredLCs.length}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={currentPage === 0}
                    onClick={() => handleChangePage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={currentPage >= Math.ceil(filteredLCs.length / rowsPerPage) - 1}
                    onClick={() => handleChangePage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </PortalCard>
  );
};

export default PaymentReleaseTab;
