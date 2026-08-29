# CSV Invoice Import Feature - Implementation Guide

**Status:** Historical
**Last Reviewed:** 2026-08-24

## Overview
This implementation adds a merchant-friendly CSV invoice upload flow to the web dashboard, allowing users to bulk import invoices with comprehensive validation feedback and detailed import outcome reporting.

## Features Implemented

### 1. **CSV Upload Dialog Component** (`CSVUploadDialog.tsx`)
A modal dialog that provides:
- **Drag-and-drop file upload area** - Users can drag CSV files into a designated area
- **File picker** - Fallback button to select files through the system file dialog
- **File validation**:
  - Validates file extension (.csv only)
  - Enforces 2MB file size limit
  - Provides user-friendly error messages
- **CSV format requirements display** - Shows required columns inline for user reference
- **Upload progress indicator** - Loading state during file upload
- **File information preview** - Shows selected file name and size before upload

**Key Implementation Details:**
- Uses React hooks (`useState`, `useRef`) for state management
- Axios multipart form data for file upload
- Leverages existing `apiClient` with error handling via `extractApiErrorMessage`
- Supports both drag-and-drop and file input methods
- Dark mode compatible styling with Tailwind CSS

### 2. **Import Results Display Component** (`ImportResultsDisplay.tsx`)
A comprehensive results modal showing:
- **Summary Statistics**:
  - Created count (green)
  - Success rate percentage
  - Skipped count (yellow)
  - Failed count (red)
  
- **Expandable Result Sections**:
  - **Successfully Created**: List of invoices with row numbers, invoice numbers, and IDs
  - **Validation Errors (Skipped)**: Rows that failed validation (e.g., invalid email, invalid amount)
  - **Database Errors (Failed)**: Rows that passed validation but failed DB write (e.g., duplicate invoice number)

- **Export Capabilities**:
  - Download errors as CSV for offline review
  - Download full results as JSON for integration/archival
  
- **Clear Categorization**:
  - Different color coding for different outcome types
  - Detailed field and message information for each error
  - Context box explaining each category

**Key Implementation Details:**
- Collapsible sections using state management
- Color-coded alerts (green, blue, yellow, red) for visual hierarchy
- Export functionality using Blob and URL APIs
- Scrollable content area for large result sets
- Row-level detail display for easy error identification

### 3. **Invoices Page Integration** (`page.tsx`)
The main invoices listing page now includes:
- **Import CSV Button** - Added to the header toolbar alongside existing actions
  - Uses Upload icon from lucide-react
  - Styled consistently with other action buttons
  - Opens the upload dialog on click

- **State Management**:
  - `showUploadDialog`: Controls visibility of upload modal
  - `importResults`: Stores import results for display
  
- **Handler Functions**:
  - `handleImportComplete`: Processes import results and refetches invoice list
  
- **Component Integration**:
  - `CSVUploadDialog` component for upload flow
  - `ImportResultsDisplay` component for results feedback

## Technical Architecture

### API Integration
The feature connects to the existing backend endpoint:
```
POST /invoices/import
```
- **Authentication**: Requires Bearer token (handled by interceptor)
- **Request**: Multipart form data with "file" field
- **Response**: `ImportSummaryDto` containing:
  ```typescript
  {
    totalRows: number;
    createdCount: number;
    failedCount: number;
    skippedCount: number;
    created: Array<{row, id, invoiceNumber}>;
    failed: Array<{row, field, message}>;
    skipped: Array<{row, field, message}>;
  }
  ```

### CSV Format Requirements
Users must provide a CSV file with these headers (in any order):
- `invoiceNumber` - Unique invoice identifier
- `clientName` - Customer name
- `clientEmail` - Customer email address
- `description` - Invoice description
- `amount` - Invoice amount (numeric)
- `asset_code` - Blockchain asset code (e.g., "XLM", "USDC")
- `asset_issuer` - Blockchain asset issuer address (if applicable)

### Error Handling Categories
1. **Validation Errors (Skipped)**:
   - Invalid email format
   - Invalid amount (non-numeric)
   - Missing required fields
   - Duplicate invoice numbers within the same import

2. **Database Errors (Failed)**:
   - Constraint violations (e.g., duplicate invoice number in database)
   - Database write failures
   - Unique constraint conflicts

3. **Processing Success**:
   - Valid rows that successfully created new invoices

## User Flow

1. **Initiate Upload**:
   - User clicks "Import CSV" button in invoices page header
   - Upload dialog modal appears

2. **Select File**:
   - User drags CSV file into the drop zone OR
   - User clicks "Select File" button and chooses file
   - File validation runs (extension, size)

3. **Upload & Process**:
   - User clicks "Upload" button
   - File is sent to backend
   - User sees loading state

4. **View Results**:
   - Results modal displays with summary statistics
   - User can expand each section to see details:
     - Successfully created invoices
     - Validation errors with row numbers and messages
     - Database errors with context
   
5. **Export Results** (Optional):
   - User can download error list as CSV
   - User can download full results as JSON
   - User closes the modal

6. **Invoice List Updates**:
   - Successfully imported invoices appear in the list
   - User can immediately see and manage new invoices

## Styling & Design

### Design Principles
- **Consistent with existing UI**: Uses same color scheme, component patterns, and Tailwind spacing
- **Dark mode support**: All components include dark mode variants
- **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation support
- **Responsive**: Works on mobile, tablet, and desktop

### Color Coding
- **Green** (#10b981): Success, created invoices
- **Blue** (#3b82f6): Primary actions, success rate
- **Yellow** (#f59e0b): Warnings, validation errors
- **Red** (#ef4444): Errors, failed imports

### Component Library
- Uses existing Tailwind CSS configuration
- Icons from lucide-react (consistent with app)
- Modal backdrop with semi-transparent overlay
- Scrollable content areas for long result lists

## Error Messages & Feedback

### User-Facing Errors
1. **File Type Error**: "Please select a .csv file"
2. **File Size Error**: "File size must be less than 2MB"
3. **No File Selected**: "Please select a file"
4. **Upload Failed**: Server error message from API

### Backend Validation Feedback
Each error row includes:
- **Row Number**: The line in the CSV (accounting for header)
- **Field Name**: Which field caused the error (if applicable)
- **Error Message**: Human-readable explanation
  - "Invalid email address"
  - "Invalid amount - must be numeric"
  - "Duplicate invoiceNumber within this CSV"
  - "unique constraint violated"

## Integration Points

### Dependencies
- **React**: Hooks, components, state management
- **Next.js**: Routing, page structure
- **Axios**: HTTP client via existing `apiClient`
- **Lucide React**: Icons (Upload, X, AlertCircle, CheckCircle, etc.)
- **Tailwind CSS**: Styling

### Files Modified
1. `web/components/CSVUploadDialog.tsx` - NEW
2. `web/components/ImportResultsDisplay.tsx` - NEW
3. `web/app/invoices/page.tsx` - MODIFIED
   - Added imports for new components
   - Added state for upload dialog and results
   - Added handler for import completion
   - Added "Import CSV" button to header
   - Integrated CSVUploadDialog and ImportResultsDisplay components

## Performance Considerations

1. **File Upload**:
   - 2MB file size limit prevents excessive data transfer
   - Multipart form data is handled efficiently by Axios
   - Rate limiting (3 imports per hour) enforced by backend

2. **Results Display**:
   - Collapsible sections prevent rendering all errors at once
   - Scrollable container prevents page overflow
   - Result arrays are only expanded when user clicks section

3. **List Refetch**:
   - Automatic refetch after successful import shows newly created invoices
   - Uses existing infinite query pattern for consistency

## Testing Recommendations

### Unit Tests
- CSV validation (file type, size)
- Error message display
- Export functionality
- State management

### Integration Tests
- Upload flow end-to-end
- Results display with various scenarios
  - All successful imports
  - All failed imports
  - Mixed success/failure
- Dialog open/close behavior
- Refetch on completion

### E2E Tests
- User uploads valid CSV
- User uploads invalid CSV
- User exports results
- Successfully created invoices appear in list

### Test CSV Files
```csv
invoiceNumber,clientName,clientEmail,description,amount,asset_code,asset_issuer
INV-001,Acme Corp,acme@example.com,Widget order,100,XLM,
INV-002,Beta LLC,beta@example.com,Service fees,250,USDC,GBBD47UZQ6YSZVHWT4MZFJ62FKZSHKK6CPGX5IQGXO2A5QKFUIYCR5Q
```

## Future Enhancements

1. **Template Download**: Provide a sample CSV template for users
2. **Bulk Actions**: Handle large imports with progress bars and chunking
3. **Duplicate Handling**: Options to skip or overwrite duplicates
4. **Scheduled Imports**: Allow recurring CSV imports at set intervals
5. **Import History**: Track and display past import activities
6. **Webhook Notifications**: Notify external systems of import completion
7. **Data Mapping**: Allow users to customize CSV column mapping

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Full support (responsive design)

## Accessibility

- Keyboard navigation supported
- ARIA labels on buttons and interactive elements
- Focus management in modals
- Error messages announced to screen readers
- Color contrast meets WCAG AA standards

## Security Considerations

1. **File Upload**:
   - File type validation on client and server
   - File size limit prevents DoS
   - Multipart upload is secure (no arbitrary code execution)

2. **API Security**:
   - Bearer token authentication required
   - Merchant scope enforcement on backend
   - Rate limiting prevents abuse

3. **Data Handling**:
   - No sensitive data stored in browser state
   - Downloaded files are generated on-demand
   - No user data cached unnecessarily

## Deployment Notes

1. **No database migrations required** - Uses existing invoice schema
2. **No environment variables needed** - Uses existing API_URL configuration
3. **Backward compatible** - No breaking changes to existing invoices page
4. **Progressive enhancement** - Feature works independently, doesn't break existing functionality
5. **No additional dependencies** - Uses existing project dependencies

## Support & Troubleshooting

### Common Issues

**Issue**: "Upload button is disabled"
- **Solution**: Ensure a file is selected. Check browser console for validation errors.

**Issue**: "CSV file is empty"
- **Solution**: Backend response. Ensure CSV has at least headers and one data row.

**Issue**: "Unable to parse CSV file"
- **Solution**: Check CSV format. Ensure proper comma delimiting and no special characters in field names.

**Issue**: "Only .csv files are accepted"
- **Solution**: Use proper .csv file extension. Some spreadsheet programs save as .xlsx by default.

**Issue**: "File size must be less than 2MB"
- **Solution**: Split large import into smaller files or reduce data per row.

---

## Summary

This implementation provides a complete, user-friendly CSV import solution for the Invoisio invoice management system. It seamlessly integrates with the existing web app architecture, provides clear feedback on import outcomes, and empowers merchants to bulk-manage their invoices without requiring raw API access.
