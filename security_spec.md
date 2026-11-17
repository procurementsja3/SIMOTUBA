# Security Specification — SIMOTUBA (Firestore & RBAC)

## 1. Data Invariants
1. **Identity & Email Verification**: Seluruh operasi baca/tulis Firestore mewajibkan `request.auth != null && request.auth.token.email_verified == true`.
2. **Prevent Self-Assigned Roles**: Pengguna baru non-admin yang mendaftar ke `/users/{userId}` hanya boleh membuat dokumen dengan `role == 'VIEWER'` dan `active == false`. Hanya `isAdmin()` yang dapat mengubah `role` atau mengaktifkan (`active: true`) akun.
3. **PII Isolation**: Dokumen `/users/{userId}` (berisi `email`) hanya dapat dibaca oleh pemilik (`request.auth.uid == userId`) atau `isAdmin()`. Daftar seluruh pengguna (`allow list` pada `/users`) hanya diizinkan bagi Admin.
4. **Parent Consistency (Anti-Orphan)**:
   - Setiap `/arrival_schedules/{scheduleId}` wajib memiliki `poId` yang dokumen induknya ada di `/purchase_orders/{poId}` (`exists(...)`).
   - Setiap `/coal_transactions/{txId}` wajib memiliki `poId` yang dokumen induknya ada di `/purchase_orders/{poId}` (`exists(...)`).
5. **Immutable Audit & Ownership Fields**:
   - `id`, `createdBy`, dan `createdAt` tidak pernah boleh diubah setelah dokumen dibuat.
   - `/audit_logs/{logId}` bersifat *append-only* (`allow update, delete: if false`), dan `actorUid` wajib sama dengan `request.auth.uid`.
6. **Temporal Integrity**: `createdAt == request.time` saat create; `updatedAt == request.time` saat update; `timestamp == request.time` pada `audit_logs`.
7. **Terminal State Locking**: Transaksi dengan status `COMPLETED` atau `REJECTED` terkunci dari perubahan tahap operasional oleh operator biasa; hanya `ADMIN` yang dapat melakukan koreksi historis atau `QC_LAB` yang dapat melengkapi kolom uji lab independen (`sampleId`, `labResults`, `qcStatus`, dll.).
8. **Strict Weight Integrity**: `grossWeight >= 0`, `tareWeight >= 0`, `nettoWeight >= 0`, `suratJalanWeight >= 0`. Jika `grossWeight > 0 && tareWeight > 0`, maka `tareWeight < grossWeight`.
9. **No Blanket Reads & No Cost-Exploding List Rules**: Seluruh aturan `allow list` mengevaluasi `resource.data` secara langsung tanpa memanggil `get()` atau `exists()`.
10. **Strict Key & Size Allowlisting**: Seluruh dokumen mewajibkan `data.keys().hasAll(...) && data.keys().hasOnly(...)` saat create serta batas panjang `.size()` pada setiap string dan bounded list (`allowedUids.size() <= 25`).

## 2. The "Dirty Dozen" Adversarial Payloads (Harus Menghasilkan `PERMISSION_DENIED`)
1. **Unauthenticated Read/Write**: Membaca/menulis `/coal_transactions/TRX-1` dengan `auth: null`.
2. **Unverified Email Spoof**: Login dengan `email: "dannydeep1985@gmail.com"` namun `email_verified: false`.
3. **Self-Privilege Escalation (Create User)**: User biasa membuat `/users/uid_attacker` dengan `{ role: "ADMIN", active: true }`.
4. **Role Tampering (Update User)**: User aktif dengan role `SECURITY` mengubah kolom `role` dirinya sendiri menjadi `"ADMIN"`.
5. **Cross-User PII Scraping**: User non-admin mencoba `get` `/users/uid_lain` atau `list` seluruh `/users`.
6. **Shadow Field Injection (Ghost Field)**: Operator membuat `/purchase_orders/PO-1` dengan menambahkan field gelap `{ isVerifiedSuper: true }`.
7. **Orphaned Transaction**: Operator `SECURITY` membuat `/coal_transactions/TRX-ORPHAN` dengan `poId: "PO-TIDAK-ADA"`.
8. **Illegal Weight Math (Tare >= Gross)**: Operator `TIMBANG_KELUAR` menyimpan `tareWeight: 35000` saat `grossWeight: 30000`.
9. **Terminal State Bypass**: Operator `TIMBANG_KELUAR` mencoba mengubah `tareWeight` pada transaksi berstatus `"COMPLETED"`.
10. **Audit Log Tampering / Impersonation**: Operator mencoba mengubah/menghapus `/audit_logs/LOG-1` atau membuat log dengan `actorUid` milik orang lain.
11. **Resource Poisoning (ID & String Overflow)**: Mengirim ID dokumen sepanjang 500 karakter atau mengandung karakter ilegal (`../../etc/passwd`).
12. **Client-Spoofed Timestamp**: Membuat dokumen dengan `createdAt` mundur ke masa lalu (string manual) bukan `request.time`.
