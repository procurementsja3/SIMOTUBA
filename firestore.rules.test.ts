/**
 * Firestore Security Rules Verification Suite (Dirty Dozen Adversarial Cases)
 * Dapat dijalankan dengan Firebase Emulator (@firebase/rules-unit-testing).
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  actor: { uid: string; email: string; email_verified: boolean; role?: string } | null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SECURITY_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Unauthenticated Read on Coal Transactions',
    actor: null,
    operation: 'get',
    path: 'coal_transactions/TRX-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    name: 'Email Spoof Attack with email_verified=false',
    actor: { uid: 'spoof-uid', email: 'dannydeep1985@gmail.com', email_verified: false },
    operation: 'create',
    path: 'purchase_orders/PO-SPOOF',
    payload: { id: 'PO-SPOOF', poNumber: 'PO-001' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    name: 'Self-Assigned ADMIN Role on User Registration',
    actor: { uid: 'user-123', email: 'operator@example.com', email_verified: true },
    operation: 'create',
    path: 'users/user-123',
    payload: {
      uid: 'user-123',
      email: 'operator@example.com',
      displayName: 'Attacker',
      role: 'ADMIN',
      active: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    name: 'Privilege Escalation via User Role Update',
    actor: { uid: 'sec-1', email: 'sec@example.com', email_verified: true, role: 'SECURITY' },
    operation: 'update',
    path: 'users/sec-1',
    payload: { role: 'ADMIN', active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'Cross-User PII Read on /users/{otherUid}',
    actor: { uid: 'sec-1', email: 'sec@example.com', email_verified: true, role: 'SECURITY' },
    operation: 'get',
    path: 'users/user-other',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Shadow Field Injection on Purchase Order',
    actor: { uid: 'admin-1', email: 'dannydeep1985@gmail.com', email_verified: true, role: 'ADMIN' },
    operation: 'create',
    path: 'purchase_orders/PO-SHADOW',
    payload: {
      id: 'PO-SHADOW',
      poNumber: '4T260555',
      isGhostSuperFlag: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    name: 'Orphaned Transaction Referencing Non-Existent PO',
    actor: { uid: 'sec-1', email: 'sec@example.com', email_verified: true, role: 'SECURITY' },
    operation: 'create',
    path: 'coal_transactions/TRX-ORPHAN',
    payload: {
      id: 'TRX-ORPHAN',
      poId: 'PO-NON-EXISTENT',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    name: 'Invalid Weighbridge Outbound (tareWeight >= grossWeight)',
    actor: { uid: 'wb-out-1', email: 'wbout@example.com', email_verified: true, role: 'TIMBANG_KELUAR' },
    operation: 'update',
    path: 'coal_transactions/TRX-ACTIVE',
    payload: {
      grossWeight: 30000,
      tareWeight: 32000,
      nettoWeight: 0,
      status: 'GATE_OUT',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    name: 'Terminal State Bypass on COMPLETED Transaction by Non-Admin',
    actor: { uid: 'wb-out-1', email: 'wbout@example.com', email_verified: true, role: 'TIMBANG_KELUAR' },
    operation: 'update',
    path: 'coal_transactions/TRX-COMPLETED',
    payload: {
      tareWeight: 3500,
      status: 'COMPLETED',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    name: 'Audit Log Modification / Deletion or Impersonation',
    actor: { uid: 'sec-1', email: 'sec@example.com', email_verified: true, role: 'SECURITY' },
    operation: 'delete',
    path: 'audit_logs/LOG-001',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'Resource Poisoning with Malformed Overlong Document ID',
    actor: { uid: 'admin-1', email: 'dannydeep1985@gmail.com', email_verified: true, role: 'ADMIN' },
    operation: 'create',
    path: `purchase_orders/${'A'.repeat(200)}`,
    payload: { id: 'A'.repeat(200) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    name: 'Client-Spoofed Timestamp Not Matching request.time',
    actor: { uid: 'admin-1', email: 'dannydeep1985@gmail.com', email_verified: true, role: 'ADMIN' },
    operation: 'create',
    path: 'purchase_orders/PO-TIME-SPOOF',
    payload: {
      id: 'PO-TIME-SPOOF',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
];
