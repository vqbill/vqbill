# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Global Default-Deny**: Any path not explicitly matched is denied for all reads and writes.
2. **Verified Identity Invariant**: All write operations require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **Ownership Invariant**: Every `Product`, `Bill`, `BillItem`, and `Deduction` document must have an `ownerId` matching `request.auth.uid` on creation, and `ownerId` + `createdAt` are strictly immutable on update.
4. **Relational Integrity (Master Gate)**:
   - A `BillItem` cannot be created unless its referenced `bills/{billId}` document exists and is owned by `request.auth.uid`.
   - A `Deduction` cannot be created unless its referenced `bills/{billId}` document exists and is owned by `request.auth.uid`.
5. **Terminal State Locking**: Once a `Bill` transitions to `status == 'locked'`, non-admin users cannot modify the bill.
6. **Privilege Escalation Prevention**: Users cannot self-assign `role == 'admin'` on `/users/{userId}` creation unless they are the bootstrapped admin (`toannq06034@gmail.com` with `email_verified == true`) or already registered in `/admins/{userId}`. Users cannot mutate `role` or `uid` on profile updates unless `isAdmin()`.
7. **Query Enforcer (Secure List)**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` (or `resource.data.uid == request.auth.uid` for `/users`) without executing costly `get()` or `exists()` lookups inside `list`.
8. **Strict Schema & Boundary Enforcement**: Every string field enforces `.size()` limits and regex patterns matching `firebase-blueprint.json`. Every `create` enforces `hasAll` and `hasOnly` keys. Every `update` wraps logic with `isValid[Entity](incoming())` and restricts changed keys via `affectedKeys().hasOnly(...)`.

---

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Spoof**:
   - Auth: `{ uid: "attacker1", token: { email: "toannq06034@gmail.com", email_verified: false } }`
   - Action: `create` on `/bills/bill_1`
   - Expected: `PERMISSION_DENIED`
2. **Self-Assigned Admin Escalation**:
   - Auth: `{ uid: "user1", token: { email: "user1@example.com", email_verified: true } }`
   - Payload to `/users/user1`: `{ uid: "user1", username: "hacker", displayName: "Hacker", role: "admin", createdAt: SERVER_TIME, updatedAt: SERVER_TIME }`
   - Expected: `PERMISSION_DENIED`
3. **Shadow Field Injection on Bill Creation**:
   - Auth: Verified `user1`
   - Payload to `/bills/bill_1`: Valid bill fields + `{ isApprovedBySystem: true }`
   - Expected: `PERMISSION_DENIED` (`hasOnly` check blocks unknown keys)
4. **Cross-Tenant Ownership Spoofing**:
   - Auth: Verified `user1`
   - Payload to `/bills/bill_1`: `{ ownerId: "victim_uid", ... }`
   - Expected: `PERMISSION_DENIED`
5. **Orphaned BillItem Creation (Missing Parent Bill)**:
   - Auth: Verified `user1`
   - Payload to `/bill_items/item_1`: `{ ownerId: "user1", billId: "non_existent_bill", ... }`
   - Expected: `PERMISSION_DENIED` (`exists()` check fails)
6. **Cross-Owner BillItem Injection**:
   - Auth: Verified `user1`
   - Payload to `/bill_items/item_1`: `{ ownerId: "user1", billId: "victim_bill_id", ... }`
   - Expected: `PERMISSION_DENIED` (`get(parent).data.ownerId == request.auth.uid` fails)
7. **Immortal Field Mutation (`ownerId` / `createdAt`)**:
   - Auth: Verified `user1`
   - Action: `update` on `/bills/bill_1` changing `createdAt` or `ownerId`
   - Expected: `PERMISSION_DENIED`
8. **Terminal State Bypass (`status == 'locked'`)**:
   - Auth: Verified `user1` (non-admin)
   - Action: `update` on `/bills/locked_bill_1` where `existing().status == 'locked'`
   - Expected: `PERMISSION_DENIED`
9. **Value Poisoning on Update (Invalid Type/Length on Whitelisted Field)**:
   - Auth: Verified `user1`
   - Action: `update` on `/bills/bill_1` setting `note` to a 5,000-character string or boolean
   - Expected: `PERMISSION_DENIED` (`isValidBill(incoming())` blocks oversized/wrong-type value)
10. **Path ID Poisoning**:
    - Auth: Verified `user1`
    - Action: `create` on `/bills/invalid$id!with*spaces`
    - Expected: `PERMISSION_DENIED` (`isValidId` regex guard fails)
11. **Client Forged Timestamp**:
    - Auth: Verified `user1`
    - Action: `create` on `/products/prod_1` with `createdAt: Timestamp.fromMillis(1000000)` instead of `request.time`
    - Expected: `PERMISSION_DENIED`
12. **Unfiltered List Query Scraping**:
    - Auth: Verified `user1`
    - Action: `list` on `/bills` without `where('ownerId', '==', 'user1')`
    - Expected: `PERMISSION_DENIED`
