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
} from '@mui/material';
import {
  SendOutlined,
  Description,
  MessageOutlined,
  Visibility,
} from '@mui/icons-material';
import {
  PortalCard,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  StatusChip,
} from '@/components/shared/portal';

export interface SwiftMessagesTabProps {
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  amountMin: string;
  setAmountMin: (s: string) => void;
  amountMax: string;
  setAmountMax: (s: string) => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  rowsPerPage: number;
  handleChangeRowsPerPage: (n: number) => void;
  handleChangePage: (p: number) => void;
  filteredMessages: any[];
  paginatedMessages: any[];
  onComposeNew: () => void;
  generateSwiftCSV: (msgs: any[]) => string;
  downloadCSV: (csv: string, filename: string) => void;
  onViewDetails: (msg: any) => void;
  handleSwiftLifecycleAction: (msg: any, action: string) => Promise<void>;
}

export const SwiftMessagesTab: React.FC<SwiftMessagesTabProps> = ({
  searchTerm,
  setSearchTerm,
  filterStatus,
  setFilterStatus,
  amountMin,
  setAmountMin,
  amountMax,
  setAmountMax,
  currentPage,
  setCurrentPage,
  rowsPerPage,
  handleChangeRowsPerPage,
  handleChangePage,
  filteredMessages,
  paginatedMessages,
  onComposeNew,
  generateSwiftCSV,
  downloadCSV,
  onViewDetails,
  handleSwiftLifecycleAction,
}) => {
  const chipStatus = (status?: string | null) => (status || 'PENDING') as any;

  return (
    <PortalCard brand="BANKS" title="SWIFT Message Management">
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<SendOutlined />}
          onClick={() => {
            setSearchTerm('');
            setFilterStatus('ALL');
            setCurrentPage(0);
          }}
        >
          Reset Filters
        </Button>
        <PrimaryButton brand="BANKS"
          size="small"
          startIcon={<Description />}
          onClick={onComposeNew}
        >
          Compose / New SWIFT Message
        </PrimaryButton>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Manage and review all SWIFT messages linked to LCs and payments. Search, filter, and paginate directly in the SWIFT tab.
      </Alert>

      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search SWIFT messages..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(0);
          }}
          sx={{ minWidth: 300 }}
          InputProps={{
            startAdornment: <MessageOutlined sx={{ mr: 1, color: 'black' }} />,
          }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setCurrentPage(0);
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ALL">All Status</MenuItem>
          <MenuItem value="DRAFT">Draft</MenuItem>
          <MenuItem value="NBE_APPROVED">NBE Approved</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="SENT">Sent</MenuItem>
          <MenuItem value="RECEIVED">Received</MenuItem>
          <MenuItem value="PROCESSING">Processing</MenuItem>
          <MenuItem value="SETTLED">Settled</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
        </TextField>
        <TextField
          size="small"
          placeholder="Min amount"
          value={amountMin}
          onChange={(e) => {
            setAmountMin(e.target.value);
            setCurrentPage(0);
          }}
          sx={{ width: 140 }}
        />
        <TextField
          size="small"
          placeholder="Max amount"
          value={amountMax}
          onChange={(e) => {
            setAmountMax(e.target.value);
            setCurrentPage(0);
          }}
          sx={{ width: 140 }}
        />
        <SecondaryButton brand="BANKS"
          size="small"
          startIcon={<Description />}
          onClick={() => {
            const csv = generateSwiftCSV(filteredMessages);
            downloadCSV(csv, 'SWIFT-Messages.csv');
          }}
        >
          Export CSV
        </SecondaryButton>
      </Box>

      {filteredMessages.length === 0 ? (
        <Alert severity="warning">No SWIFT messages available for the selected filters.</Alert>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '15%' }}><strong>Message ID</strong></TableCell>
                <TableCell sx={{ width: '8%' }}><strong>Type</strong></TableCell>
                <TableCell sx={{ width: '15%' }}><strong>SWIFT Reference</strong></TableCell>
                <TableCell sx={{ width: '10%' }}><strong>Sender BIC</strong></TableCell>
                <TableCell sx={{ width: '10%' }}><strong>Receiver BIC</strong></TableCell>
                <TableCell sx={{ width: '12%' }}><strong>Amount</strong></TableCell>
                <TableCell sx={{ width: '10%' }}><strong>Status</strong></TableCell>
                <TableCell sx={{ width: '8%' }}><strong>Date</strong></TableCell>
                <TableCell align="right" sx={{ width: '12%' }}><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedMessages.map((msg: any) => (
                <TableRow key={msg.messageId}>
                  <TableCell>{msg.messageId}</TableCell>
                  <TableCell>{msg.messageType}</TableCell>
                  <TableCell>{msg.swiftReference || 'N/A'}</TableCell>
                  <TableCell>{msg.senderBic || 'N/A'}</TableCell>
                  <TableCell>{msg.receiverBic || 'N/A'}</TableCell>
                  <TableCell><strong>${(msg.amount || 0).toLocaleString()} {msg.currency || 'USD'}</strong></TableCell>
                  <TableCell><StatusChip label={msg.status || 'N/A'} status={chipStatus(msg.status)} /></TableCell>
                  <TableCell>{msg.sentDate ? new Date(msg.sentDate).toLocaleDateString() : msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <SecondaryButton brand="BANKS"
                        size="small"
                        startIcon={<Visibility />}
                        onClick={() => onViewDetails(msg)}
                      >
                        View Details
                      </SecondaryButton>
                      {(msg.status === 'DRAFT' || msg.status === 'NBE_APPROVED') && (
                        <PrimaryButton brand="BANKS"
                          size="small"
                          loadingLabel="Approving…"
                          ledgerWrite
                          onClick={() => handleSwiftLifecycleAction(msg, 'approve')}
                        >
                          Approve
                        </PrimaryButton>
                      )}
                      {msg.status === 'APPROVED' && (
                        <PrimaryButton brand="BANKS"
                          size="small"
                          startIcon={<SendOutlined />}
                          loadingLabel="Sending…"
                          ledgerWrite
                          onClick={() => handleSwiftLifecycleAction(msg, 'send')}
                        >
                          Send
                        </PrimaryButton>
                      )}
                      {msg.status === 'SENT' && (
                        <PrimaryButton brand="BANKS"
                          size="small"
                          loadingLabel="Receiving…"
                          ledgerWrite
                          onClick={() => handleSwiftLifecycleAction(msg, 'receive')}
                        >
                          Receive
                        </PrimaryButton>
                      )}
                      {msg.status === 'RECEIVED' && (
                        <PrimaryButton brand="BANKS"
                          size="small"
                          loadingLabel="Processing…"
                          ledgerWrite
                          onClick={() => handleSwiftLifecycleAction(msg, 'process')}
                        >
                          Process
                        </PrimaryButton>
                      )}
                      {msg.status === 'PROCESSING' && (
                        <PrimaryButton brand="BANKS"
                          size="small"
                          loadingLabel="Settling…"
                          ledgerWrite
                          onClick={() => handleSwiftLifecycleAction(msg, 'settle')}
                        >
                          Settle
                        </PrimaryButton>
                      )}
                      {!['SETTLED', 'REJECTED', 'CANCELLED', 'FAILED'].includes(msg.status) && (
                        <DangerButton brand="BANKS"
                          size="small"
                          color="error"
                          loadingLabel="Rejecting…"
                          ledgerWrite
                          onClick={() => handleSwiftLifecycleAction(msg, 'reject')}
                        >
                          Reject
                        </DangerButton>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {filteredMessages.length > 0 && (
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
              Page {currentPage + 1} shows items {currentPage * rowsPerPage + 1}-{Math.min((currentPage + 1) * rowsPerPage, filteredMessages.length)} of {filteredMessages.length}
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
                disabled={currentPage >= Math.ceil(filteredMessages.length / rowsPerPage) - 1}
                onClick={() => handleChangePage(currentPage + 1)}
              >
                Next
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </PortalCard>
  );
};

export default SwiftMessagesTab;
