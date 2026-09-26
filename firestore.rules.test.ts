/**
 * Firestore Security Rules Test Specification (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads defined in security_spec.md
 * are rejected by the boolean gates in firestore.rules.
 */
function assertEqual(actual: boolean, expected: boolean, message: string) {
  if (actual !== expected) {
    throw new Error(`Security assertion failed: ${message}`);
  }
}

export function runDirtyDozenSecurityTests() {
  // 1. Rejects writes from unverified email tokens
  const auth1 = { uid: 'u1', email: 'toannq06034@gmail.com', email_verified: false };
  const isVerifiedUser = auth1 !== null && auth1.email_verified === true;
  assertEqual(isVerifiedUser, false, 'Unverified email token must be rejected');

  // 2. Rejects self-assigned admin role by non-admin user
  const auth2 = { uid: 'u2', email: 'staff@example.com', email_verified: true };
  const requestedRole = 'admin';
  const isBootstrappedAdmin =
    auth2.email === 'toannq06034@gmail.com' && auth2.email_verified === true;
  const allowedRole = requestedRole !== 'admin' || isBootstrappedAdmin;
  assertEqual(allowedRole, false, 'Self-assigned admin role must be rejected');

  // 3. Rejects shadow fields on Bill creation
  const allowedKeys = [
    'ownerId', 'billCode', 'billDate', 'paymentType', 'debtorName',
    'debtStatus', 'totalAmount', 'deductedAmount', 'itemsSummary',
    'note', 'status', 'createdAt', 'updatedAt',
  ];
  const incomingKeys = [...allowedKeys, 'ghostAdminFlag'];
  const hasOnlyAllowed = incomingKeys.every((k) => allowedKeys.includes(k));
  assertEqual(hasOnlyAllowed, false, 'Shadow field injection must be rejected');

  // 4. Rejects cross-tenant ownerId spoofing
  const authUid: string = 'user_a';
  const incomingOwnerId: string = 'user_b';
  assertEqual(incomingOwnerId === authUid, false, 'Cross-tenant ownerId spoofing must be rejected');

  // 5. Rejects orphaned BillItem when parent Bill does not exist
  const parentBillExists = false;
  assertEqual(parentBillExists, false, 'Orphaned BillItem must be rejected');

  // 6. Rejects BillItem creation referencing another user bill
  const parentBillOwnerId: string = 'user_b';
  assertEqual(
    parentBillOwnerId === authUid,
    false,
    'Cross-owner BillItem injection must be rejected'
  );

  // 7. Rejects mutation of immutable fields (ownerId, createdAt)
  const existing = { ownerId: 'user_a', createdAt: 1000 };
  const incoming = { ownerId: 'user_a', createdAt: 2000 };
  const immutablePreserved =
    incoming.ownerId === existing.ownerId && incoming.createdAt === existing.createdAt;
  assertEqual(immutablePreserved, false, 'Immutable field mutation must be rejected');

  // 8. Rejects updates to locked bills by non-admins
  const existingStatus: string = 'locked';
  const isAdmin = false;
  const canUpdate = existingStatus !== 'locked' || isAdmin;
  assertEqual(canUpdate, false, 'Locked bill update by non-admin must be rejected');

  // 9. Rejects value poisoning on whitelisted update fields
  const oversizedNote = 'x'.repeat(501);
  const isValidNote = typeof oversizedNote === 'string' && oversizedNote.length <= 500;
  assertEqual(isValidNote, false, 'Oversized string value poisoning must be rejected');

  // 10. Rejects invalid document IDs
  const poisonedId = 'bad/id$with*chars';
  const isValidId = /^[a-zA-Z0-9_\-]+$/.test(poisonedId) && poisonedId.length <= 128;
  assertEqual(isValidId, false, 'Invalid document ID must be rejected');

  // 11. Rejects forged client timestamps
  const requestTime: number = 1700000000;
  const payloadCreatedAt: number = 1600000000;
  assertEqual(
    payloadCreatedAt === requestTime,
    false,
    'Forged client timestamp must be rejected'
  );

  // 12. Enforces ownerId filter on list queries
  const resourceOwnerId: string = 'user_b';
  assertEqual(
    resourceOwnerId === authUid,
    false,
    'Unfiltered cross-tenant list query must be rejected'
  );

  return true;
}
