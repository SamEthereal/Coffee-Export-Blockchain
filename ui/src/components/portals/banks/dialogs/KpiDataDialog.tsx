import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
} from '@mui/material';
import {
  Description,
} from '@mui/icons-material';
import {
  PortalDialog,
  PortalField,
  GhostButton,
  PrimaryButton,
  StatusChip,
} from '@/components/shared/portal';
import BlockchainBadge from '@/components/blockchain/BlockchainBadge';
import { ForexAllocation, LetterOfCredit } from '@/types';

export interface KpiDataDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  type: 'forex' | 'lc' | 'swift' | null;
  data: any[];
  page: number;
  setPage: (page: number) => void;
  rowsPerPage: number;
  setRowsPerPage?: (rows: number) => void;
  showError: (title: string, message: string) => void;
  showSuccess: (title: string, message: string) => void;
  generateForexCSV: (data: any[]) => string;
  generateLCCSV: (data: any[]) => string;
  generateSwiftCSV: (data: any[]) => string;
  downloadCSV: (csv: string, filename: string) => void;
  onSelectForex?: (row: any) => void;
  onSelectLC?: (row: any) => void;
  onSelectSwift?: (row: any) => void;
}

export const KpiDataDialog: React.FC<KpiDataDialogProps> = ({
  open,
  onClose,
  title: kpiDataDialogTitle,
  type: kpiDataDialogType,
  data: kpiDataDialogData,
  page: kpiDialogPage,
  setPage: setKpiDialogPage,
  rowsPerPage: kpiDialogRowsPerPage,
  setRowsPerPage: setKpiDialogRowsPerPage = () => {},
  showError,
  showSuccess,
  generateForexCSV,
  generateLCCSV,
  generateSwiftCSV,
  downloadCSV,
  onSelectForex: setSelectedForex,
  onSelectLC: setSelectedLC,
  onSelectSwift: setSelectedSwiftMessage,
}) => {
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  return (
    <PortalDialog brand="BANKS" open={open} onClose={onClose} maxWidth="lg" title={kpiDataDialogTitle} actions={<>
          <GhostButton brand="BANKS" onClick={() => {
            onClose();
          }}>Close</GhostButton>
          <PrimaryButton brand="BANKS"
            startIcon={<Description />}
            onClick={() => {
              // Real client-side CSV export of the rows in this dialog
              // (same generate*/downloadCSV helpers the forex/SWIFT tabs use).
              if (!kpiDataDialogType || kpiDataDialogData.length === 0) {
                showError('Nothing to Export', 'There are no rows in this view to export.');
                return;
              }
              const csv = kpiDataDialogType === 'forex'
                ? generateForexCSV(kpiDataDialogData as ForexAllocation[])
                : kpiDataDialogType === 'lc'
                  ? generateLCCSV(kpiDataDialogData as LetterOfCredit[])
                  : generateSwiftCSV(kpiDataDialogData);
              const safeTitle = (kpiDataDialogTitle || kpiDataDialogType).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
              downloadCSV(csv, `${safeTitle || kpiDataDialogType}-export.csv`);
              showSuccess('Export Complete', `${kpiDataDialogData.length} row(s) exported to CSV.`);
            }}
          >
            Export CSV
          </PrimaryButton>
        </>}>

          {kpiDataDialogType === 'forex' && kpiDataDialogData.length > 0 && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Forex ID</strong></TableCell>
                      <TableCell><strong>LC Reference</strong></TableCell>
                      <TableCell><strong>Exporter</strong></TableCell>
                      <TableCell><strong>Buyer</strong></TableCell>
                      <TableCell><strong>Allocated Amount</strong></TableCell>
                      <TableCell><strong>Exchange Rate</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Expiry Date</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {kpiDataDialogData
                      .slice(kpiDialogPage * kpiDialogRowsPerPage, (kpiDialogPage + 1) * kpiDialogRowsPerPage)
                      .map((forex: ForexAllocation) => (
                        <TableRow key={forex.forexId}>
                          <TableCell>{forex.forexId}</TableCell>
                          <TableCell>{forex.lcId || 'N/A'}</TableCell>
                          <TableCell>{forex.exporterId || 'N/A'}</TableCell>
                          <TableCell>{forex.buyerName || forex.BuyerName || 'N/A'}</TableCell>
                          <TableCell><strong>${(forex.allocatedAmount || 0).toLocaleString()}</strong></TableCell>
                          <TableCell>{forex.exchangeRate > 0 ? `${forex.exchangeRate.toFixed(2)} ETB/USD` : 'Pending NBE rate'}</TableCell>
                          <TableCell>
                            <StatusChip 
                              label={forex.status || 'PENDING'} 
                              status={chipStatus(forex.status)}
                            />
                          </TableCell>
                          <TableCell>
                            {forex.expiryDate ? new Date(forex.expiryDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="black">Rows per page:</Typography>
                  <PortalField
                    select
                    size="small"
                    value={kpiDialogRowsPerPage}
                    onChange={(e: any) => {
                      setKpiDialogRowsPerPage(parseInt(e.target.value));
                      setKpiDialogPage(0);
                    }}
                    sx={{ width: 80 }}
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </PortalField>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="black">
                    Page {kpiDialogPage + 1} shows items {kpiDialogPage * kpiDialogRowsPerPage + 1}-{Math.min((kpiDialogPage + 1) * kpiDialogRowsPerPage, kpiDataDialogData.length)} of {kpiDataDialogData.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage === 0}
                      onClick={() => setKpiDialogPage(kpiDialogPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage >= Math.ceil(kpiDataDialogData.length / kpiDialogRowsPerPage) - 1}
                      onClick={() => setKpiDialogPage(kpiDialogPage + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
          
          {kpiDataDialogType === 'lc' && kpiDataDialogData.length > 0 && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>LC ID</strong></TableCell>
                      <TableCell><strong>Contract ID</strong></TableCell>
                      <TableCell><strong>Exporter</strong></TableCell>
                      <TableCell><strong>Buyer</strong></TableCell>
                      <TableCell><strong>Amount</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Expiry Date</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {kpiDataDialogData
                      .slice(kpiDialogPage * kpiDialogRowsPerPage, (kpiDialogPage + 1) * kpiDialogRowsPerPage)
                      .map((lc: LetterOfCredit) => (
                        <TableRow key={lc.lcId}>
                          <TableCell>{lc.lcId}</TableCell>
                          <TableCell>{lc.contractId}</TableCell>
                          <TableCell>{lc.exporterId}</TableCell>
                          <TableCell>{lc.buyerName || '—'}</TableCell>
                          <TableCell><strong>${lc.amount?.toLocaleString()} {lc.currency}</strong></TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <StatusChip label={lc.status} status={chipStatus(lc.status)} />
                              {lc.blockchainVerified && lc.txId && (
                                <BlockchainBadge 
                                  txId={lc.txId}
                                  entityType="LC"
                                  entityId={lc.lcId}
                                  verified={true}
                                  compact={true}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {lc.expiryDate ? new Date(lc.expiryDate).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="black">Rows per page:</Typography>
                  <PortalField
                    select
                    size="small"
                    value={kpiDialogRowsPerPage}
                    onChange={(e: any) => {
                      setKpiDialogRowsPerPage(parseInt(e.target.value));
                      setKpiDialogPage(0);
                    }}
                    sx={{ width: 80 }}
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </PortalField>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="black">
                    Page {kpiDialogPage + 1} shows items {kpiDialogPage * kpiDialogRowsPerPage + 1}-{Math.min((kpiDialogPage + 1) * kpiDialogRowsPerPage, kpiDataDialogData.length)} of {kpiDataDialogData.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage === 0}
                      onClick={() => setKpiDialogPage(kpiDialogPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage >= Math.ceil(kpiDataDialogData.length / kpiDialogRowsPerPage) - 1}
                      onClick={() => setKpiDialogPage(kpiDialogPage + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
          
          {kpiDataDialogType === 'swift' && kpiDataDialogData.length > 0 && (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                    <TableCell><strong>Message ID</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>SWIFT Reference</strong></TableCell>
                    <TableCell><strong>Sender BIC</strong></TableCell>
                    <TableCell><strong>Receiver BIC</strong></TableCell>
                    <TableCell><strong>Amount</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                  </TableHead>
                  <TableBody>
                    {kpiDataDialogData
                      .slice(kpiDialogPage * kpiDialogRowsPerPage, (kpiDialogPage + 1) * kpiDialogRowsPerPage)
                      .map((swift: any) => (
                        <TableRow key={swift.messageId}>
                          <TableCell>{swift.messageId}</TableCell>
                          <TableCell><Chip label={swift.messageType} size="small" color="primary" /></TableCell>
                          <TableCell>{swift.swiftReference || 'N/A'}</TableCell>
                          <TableCell>{swift.senderBic || 'N/A'}</TableCell>
                          <TableCell>{swift.receiverBic || 'N/A'}</TableCell>
                          <TableCell><strong>${(swift.amount || 0).toLocaleString()} {swift.currency}</strong></TableCell>
                          <TableCell>
                            <StatusChip 
                              label={swift.status || 'PENDING'} 
                              status={chipStatus(swift.status)}
                            />
                          </TableCell>
                          <TableCell>
                            {swift.sentDate ? new Date(swift.sentDate).toLocaleDateString() : 
                             swift.createdAt ? new Date(swift.createdAt).toLocaleDateString() : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="black">Rows per page:</Typography>
                  <PortalField
                    select
                    size="small"
                    value={kpiDialogRowsPerPage}
                    onChange={(e: any) => {
                      setKpiDialogRowsPerPage(parseInt(e.target.value));
                      setKpiDialogPage(0);
                    }}
                    sx={{ width: 80 }}
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={25}>25</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </PortalField>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" color="black">
                    Page {kpiDialogPage + 1} shows items {kpiDialogPage * kpiDialogRowsPerPage + 1}-{Math.min((kpiDialogPage + 1) * kpiDialogRowsPerPage, kpiDataDialogData.length)} of {kpiDataDialogData.length}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage === 0}
                      onClick={() => setKpiDialogPage(kpiDialogPage - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={kpiDialogPage >= Math.ceil(kpiDataDialogData.length / kpiDialogRowsPerPage) - 1}
                      onClick={() => setKpiDialogPage(kpiDialogPage + 1)}
                    >
                      Next
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}

          {kpiDataDialogData.length === 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              No data available for this selection.
            </Alert>
          )}
        
      </PortalDialog>
  );
};

export default KpiDataDialog;
